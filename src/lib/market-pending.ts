/** A hash hint prevents duplicate payment after an uncertain request. It never determines paid state. */
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const key = (id: string) => `cybazaar-pending:${id}`
export function pendingPayment(storage: StorageLike, id: string): string | null {
  try { const hash = storage.getItem(key(id)); return hash && /^0x[0-9a-fA-F]{64}$/.test(hash) ? hash : null } catch { return null }
}
export function rememberPayment(storage: StorageLike, id: string, hash: string): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Invalid transaction hash')
  storage.setItem(key(id), hash)
}
export function clearPayment(storage: StorageLike, id: string): void { try { storage.removeItem(key(id)) } catch { /* Server state remains authoritative. */ } }
