import type { MarketJob, MarketProfile, MarketTerms } from '@/types/market-v4'
import { BASE_MAINNET_CONFIG } from '@/settlement/config'
import type { SettlementJob } from '@/components/settlement/types'

const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid market response')
  return v as Record<string, unknown>
}
const statuses = new Set(['triage', 'active', 'review', 'released', 'paid', 'cancelled'])
export function readMarketJob(value: unknown): MarketJob {
  const v = object(value)
  if (typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(v.id) || typeof v.providerId !== 'string' || typeof v.title !== 'string' || !/^[1-9][0-9]*$/.test(String(v.priceAtomic)) || !statuses.has(String(v.status))) throw new Error('Invalid job response')
  if (v.downloadRef !== undefined && (v.status !== 'paid' || typeof v.downloadRef !== 'string' || !/^swarm:\/\/[0-9a-f]{64}$/.test(v.downloadRef))) throw new Error('Unexpected delivery reference')
  if (v.pendingPaymentTx !== undefined && (typeof v.pendingPaymentTx !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(v.pendingPaymentTx))) throw new Error('Invalid pending payment reference')
  if (v.paymentTx !== undefined && (typeof v.paymentTx !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(v.paymentTx))) throw new Error('Invalid payment reference')
  return v as unknown as MarketJob
}
export function readMarketTerms(value: unknown, job: MarketJob): MarketTerms {
  const t = object(value)
  if (t.chainId !== 8453 || typeof t.tokenAddress !== 'string' || t.tokenAddress.toLowerCase() !== BASE_MAINNET_CONFIG.token.address.toLowerCase() || t.jobId !== job.id || t.amountAtomic !== job.priceAtomic || !/^0x[0-9a-fA-F]{40}$/.test(String(t.sender)) || !/^0x[0-9a-fA-F]{40}$/.test(String(t.recipient))) throw new Error('Payment terms do not match this Base USDC commission')
  return t as unknown as MarketTerms
}
export function toMarketSettlement(terms: MarketTerms): SettlementJob {
  return { jobKey: terms.jobId, jobReference: terms.jobId, chainId: 8453, tokenAddress: terms.tokenAddress, recipientAddress: terms.recipient, clientAddress: terms.sender, amountBaseUnits: BigInt(terms.amountAtomic), recipientName: 'Service provider', deliverableUrl: '' }
}
export function paymentAction(job: MarketJob, pendingHash?: string | null): 'wait' | 'pay' | 'reconcile' | 'download' | 'delivery-pending' | 'cancelled' {
  if (job.status === 'cancelled') return 'cancelled'
  if (job.status === 'paid' && job.downloadRef) return 'download'
  if (job.paymentTx || job.pendingPaymentTx || job.deliveryPending || pendingHash) return 'reconcile'
  return job.status === 'released' ? 'pay' : job.status === 'paid' ? 'delivery-pending' : 'wait'
}
export function swarmDownloadUrl(ref: string): string | null {
  const match = /^swarm:\/\/([0-9a-f]{64})$/.exec(ref)
  return match ? `https://gateway.ethswarm.org/bzz/${match[1]}/` : null
}
export function createMarketClient(requestFetch: typeof fetch = fetch, apiBase = '/api') {
  async function call(path: string, init: RequestInit = {}) {
    const r = await requestFetch(apiBase.replace(/\/$/, '') + path, { ...init, credentials: 'include', cache: 'no-store', headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } })
    const body = await r.json().catch(() => null)
    if (!r.ok) { const e = object(body).error; throw Object.assign(new Error(typeof e === 'string' ? e : 'Market request failed'), { status: r.status }) }
    return object(body)
  }
  return {
    async profiles(): Promise<MarketProfile[]> {
      const b = await call('/agents')
      if (!Array.isArray(b.agents)) throw new Error('Invalid service list')
      return b.agents.map(value => {
        const p = object(value)
        if (typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.serviceTitle !== 'string' || typeof p.description !== 'string' || typeof p.priceAtomic !== 'string' || !/^[1-9][0-9]*$/.test(p.priceAtomic) || typeof p.identityBound !== 'boolean' || !/^0x[0-9a-fA-F]{40}$/.test(String(p.payoutWallet)) || typeof p.ensName !== 'string' || typeof p.agentId !== 'string') throw new Error('The service endpoint does not supply the v4 identity and fixed-price contract')
        return p as unknown as MarketProfile
      })
    },
    async session() { return call('/auth/session') as Promise<{ address: string; role: string }> },
    async job(id: string) { const b = await call(`/jobs/${encodeURIComponent(id)}`); return readMarketJob(b.job) },
    async create(input: { providerId: string; title: string; brief: string; requestKey: string }) { const b = await call('/jobs', { method: 'POST', body: JSON.stringify(input) }); return readMarketJob(b.job) },
    async terms(id: string) { const b = await call(`/jobs/${encodeURIComponent(id)}/payment-terms`); const job = readMarketJob(b.job); return { job, terms: readMarketTerms(b.terms, job) } },
    async payment(id: string, txHash: string) { if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error('Invalid transaction hash'); const b = await call(`/jobs/${encodeURIComponent(id)}/payment`, { method: 'POST', body: JSON.stringify({ txHash }) }); return readMarketJob(b.job) },
  }
}
export const marketV4 = createMarketClient(fetch, import.meta.env?.VITE_HIRING_DESK_API_URL || '/api')
