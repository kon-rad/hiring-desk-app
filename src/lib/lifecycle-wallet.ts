/** EIP-1193 boundary for reviewed public publications. Contains no chain-specific encoding. */
export interface InjectedProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, handler: (...args: unknown[]) => void): void
  removeListener?(event: string, handler: (...args: unknown[]) => void): void
}
export interface PublicationIntent {
  version: 'desk-wallet/v1'; intentRef: string; action: 'post-job' | 'accept-offer' | 'feedback'
  nonce: string; payload: Record<string, unknown>; offerRef?: string; offerDigest?: string
  signer: string; chainId: `0x${string}`; jobRef: string; payloadDigest: string; expiresAt: number
  transaction: { from: string; to: string; data: `0x${string}`; value: `0x${string}` }
}
export class WalletFailure extends Error {
  constructor(public code: 'unavailable' | 'wrong-account' | 'wrong-chain' | 'stale-intent' | 'expired' | 'rejected' | 'invalid-intent', message: string) { super(message) }
}
const address = /^0x[0-9a-fA-F]{40}$/
const quantity = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/
export function validatePublicationIntent(intent: PublicationIntent, now = Date.now()): void {
  if (!intent || !intent.transaction) throw new WalletFailure('invalid-intent', 'Publication review is missing its transaction.')
  if (!intent.nonce || !intent.payload || typeof intent.payload !== 'object' || Array.isArray(intent.payload) || JSON.stringify(intent.payload).length > 16000 || (intent.action === 'accept-offer' && (!intent.offerRef || !/^sha256:[a-f0-9]{64}$/.test(intent.offerDigest ?? '')))) throw new WalletFailure('invalid-intent', 'Publication lacks its normalized payload, nonce or offer binding.')
  if (intent.version !== 'desk-wallet/v1' || !intent.intentRef || !intent.jobRef || !['post-job', 'accept-offer', 'feedback'].includes(intent.action) || !address.test(intent.signer) || !quantity.test(intent.chainId) || BigInt(intent.chainId) === 0n || !/^sha256:[a-f0-9]{64}$/.test(intent.payloadDigest) || !address.test(intent.transaction.to) || intent.transaction.from.toLowerCase() !== intent.signer.toLowerCase() || !/^0x(?:[a-fA-F0-9]{2})+$/.test(intent.transaction.data) || !quantity.test(intent.transaction.value)) throw new WalletFailure('invalid-intent', 'Publication review is incomplete or malformed.')
  if (!Number.isSafeInteger(intent.expiresAt) || intent.expiresAt * 1000 <= now) throw new WalletFailure('expired', 'Publication intent expired. Prepare it again.')
}
export class LifecycleWallet {
  private revision = 0
  private reviewed = new WeakMap<PublicationIntent, { revision: number; snapshot: string }>()
  private changed = () => { this.revision++; this.onChange() }
  constructor(private provider: InjectedProvider, private onChange: () => void = () => {}) {
    provider.on?.('accountsChanged', this.changed); provider.on?.('chainChanged', this.changed); provider.on?.('disconnect', this.changed)
  }
  dispose() { for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) this.provider.removeListener?.(event, this.changed) }
  async connect(): Promise<string> {
    const accounts = await this.request('eth_requestAccounts')
    if (!Array.isArray(accounts) || !address.test(accounts[0])) throw new WalletFailure('unavailable', 'No wallet account is available.')
    return accounts[0]
  }
  review(intent: PublicationIntent): void { validatePublicationIntent(intent); this.reviewed.set(intent, { revision: this.revision, snapshot: JSON.stringify(intent) }) }
  private assertCurrent(intent: PublicationIntent) {
    validatePublicationIntent(intent)
    const review = this.reviewed.get(intent)
    if (!review || review.revision !== this.revision || review.snapshot !== JSON.stringify(intent)) throw new WalletFailure('stale-intent', 'Wallet or terms changed. Prepare and review again.')
  }
  async submit(intent: PublicationIntent): Promise<{ state: 'pending'; txHash: string }> {
    this.assertCurrent(intent)
    const accounts = await this.request('eth_accounts')
    if (!Array.isArray(accounts) || String(accounts[0]).toLowerCase() !== intent.signer.toLowerCase()) throw new WalletFailure('wrong-account', 'Connect the exact client account shown in this review.')
    const chain = await this.request('eth_chainId')
    if (typeof chain !== 'string' || !quantity.test(chain) || BigInt(chain) !== BigInt(intent.chainId)) throw new WalletFailure('wrong-chain', 'Select the reviewed publication network in your wallet.')
    this.assertCurrent(intent)
    // Consume once before asking the wallet. A failure requires a fresh review, preventing double clicks.
    this.reviewed.delete(intent)
    const txHash = await this.request('eth_sendTransaction', [{ ...intent.transaction, chainId: intent.chainId }])
    if (typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new WalletFailure('unavailable', 'Wallet returned no usable transaction hash. Reconcile before retrying.')
    // Even if the wallet changes while its prompt is open, retain the submitted hash for reconciliation.
    return { state: 'pending', txHash }
  }
  private async request(method: string, params?: unknown[]) {
    try { return await this.provider.request({ method, ...(params ? { params } : {}) }) }
    catch (error) { if ((error as { code?: number })?.code === 4001) throw new WalletFailure('rejected', 'Signature rejected. Nothing is confirmed.'); throw new WalletFailure('unavailable', 'Wallet unavailable. Check public state before retrying.') }
  }
}
