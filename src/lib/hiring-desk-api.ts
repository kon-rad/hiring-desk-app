/**
 * Typed client for the PUBLIC Hiring Desk (Argo) API. Generated in Arc Studio.
 *
 * Public client only: no credentials, no cookies, no operator routes, no secrets.
 *
 *   GET  {base}/jobs/:ref/payment
 *   POST {base}/jobs/:ref/payments/verify      body: { txHash }
 *   POST {base}/jobs/:ref/payments/reconcile   body: { txHash }
 *
 * The base URL comes from VITE_HIRING_DESK_API_URL. Argo decides recipient, amount, chain and
 * token; this client validates what comes back and never sends those values to the server.
 */

import { isAddress } from 'viem'
import { formatBaseUnits, normalizeRequest, toBaseUnits } from '@/settlement'
import {
  PAYMENT_INTERFACE_ID,
  type Hex,
  type NotPayableReason,
  type PaymentStatus,
  type PublicPaymentReceipt,
  type PublicPaymentTerms,
  type UnavailableReason,
} from '@/types/desk'

export const HIRING_DESK_ENV_VAR = 'VITE_HIRING_DESK_API_URL'
const REQUEST_TIMEOUT_MS = 15_000
const TX_HASH = /^0x[0-9a-fA-F]{64}$/
const BASE_UNITS = /^\d{1,78}$/

export interface DeskEnv {
  VITE_HIRING_DESK_API_URL?: string
  PROD?: boolean
}

type BaseUrlResult = { ok: true; url: string } | { ok: false; reason: 'config_missing' | 'config_insecure'; message: string }

/** Reads and validates the API base URL. HTTPS is required in production builds. */
export function resolveApiBase(env: DeskEnv = import.meta.env): BaseUrlResult {
  const raw = env.VITE_HIRING_DESK_API_URL?.trim()
  if (!raw) {
    return { ok: false, reason: 'config_missing', message: `${HIRING_DESK_ENV_VAR} is not set. Set it to the public Argo API base URL in your Vercel project settings.` }
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'config_missing', message: `${HIRING_DESK_ENV_VAR} is not a valid URL.` }
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !env.PROD)) {
    return { ok: false, reason: 'config_insecure', message: `${HIRING_DESK_ENV_VAR} must use https in production.` }
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'config_insecure', message: `${HIRING_DESK_ENV_VAR} must not contain credentials.` }
  }
  return { ok: true, url: raw.replace(/\/+$/, '') }
}

const unavailable = (reason: UnavailableReason, message: string): PaymentStatus => ({ state: 'unavailable', reason, message })
const invalid = (what: string): PaymentStatus => unavailable('invalid_response', `The Hiring Desk sent a response this app cannot trust (${what}).`)

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const hash = (v: unknown): Hex | null => (typeof v === 'string' && TX_HASH.test(v) ? (v as Hex) : null)

/** Validates server terms with the same rules used at payment time. Returns null if anything is off. */
export function parseTerms(raw: unknown): PublicPaymentTerms | null {
  if (!isObject(raw)) return null
  const jobKey = str(raw.jobKey)
  const jobReference = str(raw.jobReference)
  const deliverableUrl = str(raw.deliverableUrl)
  const recipientName = str(raw.recipientName)
  const recipientAddress = str(raw.recipientAddress)
  const tokenAddress = str(raw.tokenAddress)
  const amountBaseUnits = str(raw.amountBaseUnits)
  const amountDisplay = str(raw.amountDisplay)
  const clientAddress = raw.clientAddress === undefined || raw.clientAddress === null ? undefined : str(raw.clientAddress)
  if (!jobKey || !jobReference || deliverableUrl === null || !recipientName || !recipientAddress || !tokenAddress || !amountBaseUnits || !amountDisplay) return null
  if (raw.interfaceId !== PAYMENT_INTERFACE_ID || typeof raw.chainId !== 'number') return null
  if (!BASE_UNITS.test(amountBaseUnits)) return null
  if (clientAddress !== undefined && (clientAddress === null || !isAddress(clientAddress, { strict: true }))) return null

  try {
    // Chain, token allow-list, checksums, zero address, positive amount, jobKey shape.
    const { request } = normalizeRequest({
      chainId: raw.chainId,
      tokenAddress: tokenAddress as Hex,
      recipientAddress: recipientAddress as Hex,
      amountBaseUnits: BigInt(amountBaseUnits),
      jobKey,
    })
    // The display string is informational; it must agree exactly with the base units.
    if (toBaseUnits(request.chainId, amountDisplay) !== request.amountBaseUnits) return null
    return {
      jobKey: request.jobKey,
      jobReference,
      deliverableUrl,
      recipientName,
      recipientAddress: request.recipientAddress,
      ...(clientAddress ? { clientAddress: clientAddress } : {}),
      chainId: 5042002,
      tokenAddress: request.tokenAddress,
      amountBaseUnits: request.amountBaseUnits.toString(),
      amountDisplay: formatBaseUnits(request.chainId, request.amountBaseUnits),
      interfaceId: PAYMENT_INTERFACE_ID,
    }
  } catch {
    return null
  }
}

function parseReceipt(raw: unknown): PublicPaymentReceipt | null {
  if (!isObject(raw)) return null
  const txHash = hash(raw.txHash)
  const amountBaseUnits = str(raw.amountBaseUnits)
  const sender = str(raw.sender)
  const recipient = str(raw.recipient)
  const tokenAddress = str(raw.tokenAddress)
  if (!txHash || !amountBaseUnits || !BASE_UNITS.test(amountBaseUnits) || typeof raw.chainId !== 'number') return null
  if (!sender || !recipient || !tokenAddress || !isAddress(sender) || !isAddress(recipient) || !isAddress(tokenAddress)) return null
  return {
    txHash,
    sender: sender,
    recipient: recipient,
    tokenAddress: tokenAddress,
    chainId: raw.chainId,
    amountBaseUnits,
    ...(str(raw.blockNumber) ? { blockNumber: str(raw.blockNumber) as string } : {}),
  }
}

const NOT_PAYABLE: readonly NotPayableReason[] = ['expired', 'not_accepted', 'cancelled', 'unknown']

/** Turns an untrusted JSON body into a PaymentStatus, or null if the shape is unknown. */
export function parseStatusBody(body: unknown): PaymentStatus | null {
  if (!isObject(body)) return null
  const termsRaw = body.terms
  const terms = termsRaw === undefined || termsRaw === null ? null : parseTerms(termsRaw)
  if (termsRaw !== undefined && termsRaw !== null && !terms) return null

  switch (body.state) {
    case 'payable':
      return terms ? { state: 'payable', terms } : null
    case 'pending': {
      const txHash = hash(body.txHash)
      if (!txHash) return null
      return {
        state: 'pending',
        terms,
        txHash,
        confirmations: typeof body.confirmations === 'number' ? body.confirmations : null,
        warning: str(body.warning),
      }
    }
    case 'confirmed': {
      const receipt = parseReceipt(body.receipt)
      return receipt ? { state: 'confirmed', terms, receipt } : null
    }
    case 'failed':
      return {
        state: 'failed',
        terms,
        txHash: hash(body.txHash),
        code: str(body.code) ?? 'VERIFICATION_FAILED',
        message: str(body.message) ?? 'The Hiring Desk could not verify this payment.',
        retryable: body.retryable === true,
      }
    case 'duplicate':
      return { state: 'duplicate', txHash: hash(body.txHash), message: str(body.message) ?? 'This transaction or job is already recorded.' }
    case 'not_payable': {
      const reason = NOT_PAYABLE.find((r) => r === body.reason) ?? 'unknown'
      return { state: 'not_payable', reason, message: str(body.message) ?? 'This job cannot be paid right now.' }
    }
    default:
      return null
  }
}

export interface HiringDeskClient {
  /** Loads payment state and terms. The source of truth on every page load. */
  getPaymentState(jobRef: string): Promise<PaymentStatus>
  /** Sends ONLY the transaction hash. Argo reloads job, payer, recipient and amount itself. */
  verifyPayment(jobRef: string, txHash: Hex): Promise<PaymentStatus>
  /** Asks Argo to re-check a previously reported hash. */
  reconcilePayment(jobRef: string, txHash: Hex): Promise<PaymentStatus>
}

export interface HiringDeskClientOptions {
  env?: DeskEnv
  fetch?: typeof fetch
  timeoutMs?: number
}

export function createHiringDeskClient(options: HiringDeskClientOptions = {}): HiringDeskClient {
  const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS

  async function call(jobRef: string, path: string, body?: { txHash: Hex }): Promise<PaymentStatus> {
    const base = resolveApiBase(options.env)
    if (!base.ok) return unavailable(base.reason, base.message)
    if (!jobRef || jobRef.length > 128) return unavailable('not_found', 'No job reference was provided.')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await doFetch(`${base.url}/jobs/${encodeURIComponent(jobRef)}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify({ txHash: body.txHash }) : undefined,
        credentials: 'omit',
        mode: 'cors',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      })

      let json: unknown = null
      try {
        json = await response.json()
      } catch {
        json = null
      }

      const parsed = parseStatusBody(json)
      if (parsed && (response.ok || response.status === 409 || response.status === 422)) return parsed
      if (response.status === 404) return unavailable('not_found', 'This job was not found.')
      if (response.status === 409) return { state: 'duplicate', txHash: null, message: 'This transaction or job is already recorded.' }
      if (response.status === 429) return unavailable('rate_limited', 'The Hiring Desk is rate limiting requests. Try again shortly.')
      if (response.ok) return invalid('unexpected body')
      return unavailable('server_error', `The Hiring Desk returned an error (${response.status}).`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return unavailable('timeout', 'The Hiring Desk took too long to respond.')
      return unavailable('network', 'Could not reach the Hiring Desk. Check your connection and try again.')
    } finally {
      clearTimeout(timer)
    }
  }

  const checkHash = (txHash: unknown): PaymentStatus | null => (hash(txHash) ? null : invalid('transaction hash'))

  return {
    getPaymentState: (jobRef) => call(jobRef, '/payment'),
    verifyPayment: (jobRef, txHash) => Promise.resolve(checkHash(txHash)).then((bad) => bad ?? call(jobRef, '/payments/verify', { txHash })),
    reconcilePayment: (jobRef, txHash) => Promise.resolve(checkHash(txHash)).then((bad) => bad ?? call(jobRef, '/payments/reconcile', { txHash })),
  }
}
