/**
 * Framework-free state machine for the production payment page. Generated in Arc Studio.
 *
 * Argo is the only source of truth. The controller never reads browser storage, never decides
 * that a job is paid, and only ever sends a transaction hash to Argo.
 */

import type { HiringDeskClient } from '@/lib/hiring-desk-api'
import type { Hex, NotPayableReason, PaymentStatus, PublicPaymentReceipt, PublicPaymentTerms, UnavailableReason } from '@/types/desk'

export type DeskView =
  | { kind: 'loading' }
  | { kind: 'unavailable'; reason: UnavailableReason; message: string }
  | { kind: 'not_payable'; reason: NotPayableReason; message: string }
  | { kind: 'payable'; terms: PublicPaymentTerms }
  /** Hash is known; Argo has not confirmed it yet. */
  | { kind: 'verifying'; terms: PublicPaymentTerms; txHash: Hex; checking: boolean; warning: string | null }
  | { kind: 'confirmed'; terms: PublicPaymentTerms; receipt: PublicPaymentReceipt }
  | { kind: 'failed'; terms: PublicPaymentTerms; txHash: Hex | null; code: string; message: string; retryable: boolean }
  | { kind: 'duplicate'; terms: PublicPaymentTerms | null; txHash: Hex | null; message: string }

export interface DeskControllerOptions {
  client: HiringDeskClient
  jobRef: string
  /** Delay between automatic checks while Argo reports pending. 0 disables polling. */
  pollIntervalMs?: number
  maxPolls?: number
  /** Called when Argo reports a failed payment that may be retried, so the host can clear local resume hints. */
  onRetryable?: (terms: PublicPaymentTerms) => void
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** Argo's receipt must agree with Argo's own terms. A mismatch is never shown as paid. */
export function receiptMatchesTerms(receipt: PublicPaymentReceipt, terms: PublicPaymentTerms): boolean {
  return (
    receipt.chainId === terms.chainId &&
    same(receipt.tokenAddress, terms.tokenAddress) &&
    same(receipt.recipient, terms.recipientAddress) &&
    receipt.amountBaseUnits === terms.amountBaseUnits &&
    (!terms.clientAddress || same(receipt.sender, terms.clientAddress))
  )
}

export interface DeskController {
  getView(): DeskView
  subscribe(listener: () => void): () => void
  /** Allows updates again (React StrictMode re-mounts effects). Pair with dispose(). */
  start(): void
  load(): Promise<void>
  /** The wallet submitted a transaction. Reports the hash to Argo and adopts Argo's answer. */
  onTransactionSubmitted(txHash: Hex): Promise<void>
  /** Re-checks the pending hash with Argo. */
  checkAgain(): Promise<void>
  /** After a retryable failure: return to the review screen with Argo's terms. */
  retry(): void
  dispose(): void
}

export function createDeskController(options: DeskControllerOptions): DeskController {
  const { client, jobRef } = options
  const pollIntervalMs = options.pollIntervalMs ?? 4000
  const maxPolls = options.maxPolls ?? 60

  let view: DeskView = { kind: 'loading' }
  let terms: PublicPaymentTerms | null = null
  let polls = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const listeners = new Set<() => void>()

  const set = (next: DeskView): void => {
    if (disposed) return
    view = next
    listeners.forEach((l) => l())
  }

  const stopPolling = (): void => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  function schedulePoll(): void {
    stopPolling()
    if (disposed || pollIntervalMs <= 0 || polls >= maxPolls) return
    timer = setTimeout(() => void checkAgain(), pollIntervalMs)
  }

  /** Applies an Argo answer. `fallbackHash` keeps the user's hash visible if Argo is unreachable. */
  function apply(result: PaymentStatus, fallbackHash: Hex | null): void {
    if ('terms' in result && result.terms) terms = result.terms
    switch (result.state) {
      case 'payable':
        stopPolling()
        set({ kind: 'payable', terms: result.terms })
        return
      case 'pending': {
        if (!terms) {
          set({ kind: 'unavailable', reason: 'invalid_response', message: 'The Hiring Desk reported a pending payment without payment terms.' })
          return
        }
        set({ kind: 'verifying', terms, txHash: result.txHash, checking: false, warning: result.warning })
        schedulePoll()
        return
      }
      case 'confirmed': {
        stopPolling()
        if (!terms || !receiptMatchesTerms(result.receipt, terms)) {
          set({ kind: 'unavailable', reason: 'invalid_response', message: 'The Hiring Desk receipt does not match the payment terms, so it is not shown as paid.' })
          return
        }
        set({ kind: 'confirmed', terms, receipt: result.receipt })
        return
      }
      case 'failed': {
        stopPolling()
        if (!terms) {
          set({ kind: 'unavailable', reason: 'invalid_response', message: result.message })
          return
        }
        if (result.retryable) options.onRetryable?.(terms)
        set({ kind: 'failed', terms, txHash: result.txHash ?? fallbackHash, code: result.code, message: result.message, retryable: result.retryable })
        return
      }
      case 'duplicate':
        stopPolling()
        set({ kind: 'duplicate', terms, txHash: result.txHash ?? fallbackHash, message: result.message })
        return
      case 'not_payable':
        stopPolling()
        set({ kind: 'not_payable', reason: result.reason, message: result.message })
        return
      case 'unavailable':
        // Never drop a submitted hash because Argo could not be reached.
        if (fallbackHash && terms) {
          set({ kind: 'verifying', terms, txHash: fallbackHash, checking: false, warning: `${result.message} Your transaction was submitted. Check again shortly.` })
          schedulePoll()
        } else {
          stopPolling()
          set({ kind: 'unavailable', reason: result.reason, message: result.message })
        }
    }
  }

  async function load(): Promise<void> {
    set({ kind: 'loading' })
    polls = 0
    apply(await client.getPaymentState(jobRef), null)
  }

  async function onTransactionSubmitted(txHash: Hex): Promise<void> {
    if (!terms) return
    set({ kind: 'verifying', terms, txHash, checking: true, warning: null })
    apply(await client.verifyPayment(jobRef, txHash), txHash)
    if (view.kind === 'duplicate') {
      // Show Argo's own record rather than guessing which transaction owns the job.
      const dup = view
      const refreshed = await client.getPaymentState(jobRef)
      if (refreshed.state === 'confirmed' || refreshed.state === 'pending') apply(refreshed, null)
      else set(dup)
    }
  }

  async function checkAgain(): Promise<void> {
    if (view.kind !== 'verifying') return
    stopPolling()
    const { txHash } = view
    polls += 1
    set({ ...view, checking: true })
    apply(await client.reconcilePayment(jobRef, txHash), txHash)
  }

  return {
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    load,
    onTransactionSubmitted,
    checkAgain,
    retry() {
      if (view.kind === 'failed' && view.retryable) set({ kind: 'payable', terms: view.terms })
    },
    start() {
      disposed = false
    },
    dispose() {
      disposed = true
      stopPolling()
    },
  }
}
