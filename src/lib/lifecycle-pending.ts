import type { PublicationAdapter } from './lifecycle-api'
/** Non-secret recovery hint only. Always re-register/reconcile through authoritative public services. */
export interface PendingPublication { intentRef: string; txHash: string; action: 'post-job' | 'accept-offer' | 'feedback'; jobRef: string }
const KEY = 'desk-publication-pending/v1'
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
function browserStorage(): StorageLike | undefined { try { return typeof window === 'undefined' ? undefined : window.sessionStorage } catch { return undefined } }
export function readPendingPublication(storage = browserStorage()): PendingPublication | null {
  try {
    const raw = storage?.getItem(KEY); if (!raw) return null
    const v = JSON.parse(raw)
    return v && typeof v.intentRef === 'string' && v.intentRef.length > 0 && v.intentRef.length <= 300 && /^0x[0-9a-fA-F]{64}$/.test(v.txHash) && ['post-job', 'accept-offer', 'feedback'].includes(v.action) && typeof v.jobRef === 'string' && v.jobRef.length > 0 && v.jobRef.length <= 500 ? { intentRef: v.intentRef, txHash: v.txHash, action: v.action, jobRef: v.jobRef } : null
  } catch { return null }
}
export function writePendingPublication(value: PendingPublication | null, storage = browserStorage()): void {
  try { if (value) storage?.setItem(KEY, JSON.stringify(value)); else storage?.removeItem(KEY) } catch { /* Signing outcome remains pending even when storage is unavailable. */ }
}

/** Retry the exact saved reference idempotently; only the independent adapter can return confirmed. */
export async function reconcilePendingPublication(adapter: PublicationAdapter, pending: PendingPublication) {
  await adapter.submit(pending.intentRef, pending.txHash)
  return adapter.reconcile(pending.intentRef)
}
