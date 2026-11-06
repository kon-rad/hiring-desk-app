/**
 * Payment ledger contract plus two small implementations. Generated in Arc Studio.
 *
 * The Hiring Desk owns the job lifecycle, so its database is the real ledger: back this
 * interface with a table that has UNIQUE(job_key) for open/confirmed rows and UNIQUE(tx_hash).
 * The built-in key-value ledger (memory or browser storage) only protects one browser and
 * is not a substitute for server-side uniqueness.
 */

import type { Address, Hash } from 'viem'
import { SettlementError } from './errors'

export type LedgerStatus = 'submitted' | 'confirmed' | 'failed'

export interface LedgerEntry {
  jobKey: string
  chainId: number
  txHash: Hash
  sender: Address
  status: LedgerStatus
  updatedAt: number
}

export interface SettlementLedger {
  get(jobKey: string): Promise<LedgerEntry | undefined>
  /** Which job (if any) a transaction hash is already bound to. Blocks replay of one payment across jobs. */
  getByTxHash(txHash: Hash): Promise<LedgerEntry | undefined>
  /**
   * Binds a freshly submitted tx to a job. Must reject with ALREADY_PAID when the job already has
   * a submitted or confirmed entry, and with DUPLICATE_TRANSACTION when the hash belongs to another job.
   */
  markSubmitted(entry: Omit<LedgerEntry, 'status' | 'updatedAt'>): Promise<void>
  markConfirmed(jobKey: string, txHash: Hash): Promise<void>
  markFailed(jobKey: string, txHash: Hash): Promise<void>
}

/** Minimal synchronous key-value store (a Map wrapper or `window.localStorage`). */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
}

export function createKeyValueLedger(store: KeyValueStore, namespace = 'hiring-desk:settlement'): SettlementLedger {
  const read = (): Record<string, LedgerEntry> => {
    try {
      const raw = store.getItem(namespace)
      return raw ? (JSON.parse(raw) as Record<string, LedgerEntry>) : {}
    } catch {
      return {}
    }
  }
  const write = (state: Record<string, LedgerEntry>): void => store.setItem(namespace, JSON.stringify(state))
  const hashOwner = (state: Record<string, LedgerEntry>, txHash: Hash): LedgerEntry | undefined =>
    Object.values(state).find((e) => e.txHash.toLowerCase() === txHash.toLowerCase())

  return {
    get: (jobKey) => Promise.resolve(read()[jobKey]),
    getByTxHash: (txHash) => Promise.resolve(hashOwner(read(), txHash)),
    markSubmitted(entry) {
      const state = read()
      const existing = state[entry.jobKey]
      if (existing && existing.status !== 'failed') {
        return Promise.reject(new SettlementError('ALREADY_PAID', 'This job already has a payment in progress or completed.'))
      }
      const owner = hashOwner(state, entry.txHash)
      if (owner && owner.jobKey !== entry.jobKey) {
        return Promise.reject(new SettlementError('DUPLICATE_TRANSACTION', 'This transaction is already recorded for a different job.'))
      }
      state[entry.jobKey] = { ...entry, status: 'submitted', updatedAt: Date.now() }
      write(state)
      return Promise.resolve()
    },
    markConfirmed(jobKey, txHash) {
      const state = read()
      const entry = state[jobKey]
      if (entry && entry.txHash.toLowerCase() === txHash.toLowerCase()) {
        state[jobKey] = { ...entry, status: 'confirmed', updatedAt: Date.now() }
        write(state)
      }
      return Promise.resolve()
    },
    markFailed(jobKey, txHash) {
      const state = read()
      const entry = state[jobKey]
      if (entry && entry.txHash.toLowerCase() === txHash.toLowerCase() && entry.status === 'submitted') {
        state[jobKey] = { ...entry, status: 'failed', updatedAt: Date.now() }
        write(state)
      }
      return Promise.resolve()
    },
  }
}
