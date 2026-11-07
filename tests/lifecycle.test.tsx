import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HiringBoard } from '@/components/lifecycle/HiringBoard'
import { LifecycleWallet, validatePublicationIntent, type InjectedProvider, type PublicationIntent } from '@/lib/lifecycle-wallet'
import { createLifecycleReader, validDraft, validateIntentForRequest } from '@/lib/lifecycle-api'
import { readPendingPublication, writePendingPublication, reconcilePendingPublication } from '@/lib/lifecycle-pending'
import { readJobRef } from '@/lib/route'
const signer = '0x0000000000000000000000000000000000000001'
function intent(): PublicationIntent { return { version: 'desk-wallet/v1', nonce: 'nonce-one', payload: { brief: 'Public draft' }, intentRef: 'intent-one', action: 'post-job', signer, chainId: '0x123', jobRef: 'arkiv:291/job', payloadDigest: `sha256:${'ab'.repeat(32)}`, expiresAt: Math.floor(Date.now() / 1000) + 3600, transaction: { from: signer, to: '0x0000000000000000000000000000000000000002', data: '0x1234', value: '0x0' } } }
function provider(account = signer, chain = '0x123') {
  const calls: string[] = []; const events = new Map<string, (...args: unknown[]) => void>()
  const p: InjectedProvider = { request: async ({ method }) => { calls.push(method); if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account]; if (method === 'eth_chainId') return chain; return `0x${'ab'.repeat(32)}` }, on: (e, cb) => { events.set(e, cb) }, removeListener: e => { events.delete(e) } }
  return { p, calls, events }
}
describe('public lifecycle wallet boundary', () => {
  test('does not request wallet permission before explicit connection', async () => { const p = provider(); const wallet = new LifecycleWallet(p.p); expect(p.calls).toEqual([]); expect(await wallet.connect()).toBe(signer); expect(p.calls).toEqual(['eth_requestAccounts']); wallet.dispose(); expect(p.events.size).toBe(0) })
  test('submits reviewed exact transaction once and returns pending, never confirmed', async () => { const p = provider(); const wallet = new LifecycleWallet(p.p); const i = intent(); wallet.review(i); const result = await wallet.submit(i); expect(result.state).toBe('pending'); expect(p.calls).toEqual(['eth_accounts', 'eth_chainId', 'eth_sendTransaction']); await expect(wallet.submit(i)).rejects.toMatchObject({ code: 'stale-intent' }) })
  test('wrong account and wrong network never send', async () => { for (const [account, chain, code] of [['0x0000000000000000000000000000000000000003', '0x123', 'wrong-account'], [signer, '0x1', 'wrong-chain']]) { const p = provider(account, chain); const wallet = new LifecycleWallet(p.p); const i = intent(); wallet.review(i); await expect(wallet.submit(i)).rejects.toMatchObject({ code }); expect(p.calls).not.toContain('eth_sendTransaction') } })
  test('account, chain and disconnect invalidate reviewed intents', async () => { for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) { const p = provider(); const wallet = new LifecycleWallet(p.p); const i = intent(); wallet.review(i); p.events.get(event)?.(); await expect(wallet.submit(i)).rejects.toMatchObject({ code: 'stale-intent' }); expect(p.calls).toEqual([]) } })
  test('mutation after review and expired intent cannot sign', async () => { const wallet = new LifecycleWallet(provider().p); const i = intent(); wallet.review(i); i.transaction.to = signer; await expect(wallet.submit(i)).rejects.toMatchObject({ code: 'stale-intent' }); expect(() => validatePublicationIntent({ ...intent(), expiresAt: 1 })).toThrow('expired') })
  test('user rejection remains rejected and cannot silently retry', async () => { const p = provider(); const request = p.p.request; p.p.request = args => args.method === 'eth_sendTransaction' ? Promise.reject({ code: 4001 }) : request(args); const wallet = new LifecycleWallet(p.p); const i = intent(); wallet.review(i); await expect(wallet.submit(i)).rejects.toMatchObject({ code: 'rejected' }); await expect(wallet.submit(i)).rejects.toMatchObject({ code: 'stale-intent' }) })
  test('network change while checking chain invalidates before send', async () => { const p = provider(); const request = p.p.request; p.p.request = args => { if (args.method === 'eth_chainId') p.events.get('chainChanged')?.(); return request(args) }; const wallet = new LifecycleWallet(p.p); const i = intent(); wallet.review(i); await expect(wallet.submit(i)).rejects.toMatchObject({ code: 'stale-intent' }); expect(p.calls).not.toContain('eth_sendTransaction') })
  test('rejects malformed calldata, value, signer and digest', () => { for (const i of [{ ...intent(), payloadDigest: 'local' }, { ...intent(), transaction: { ...intent().transaction, data: '0x1' as const } }, { ...intent(), transaction: { ...intent().transaction, value: '0x00' as const } }, { ...intent(), signer: 'not-wallet' }]) expect(() => validatePublicationIntent(i)).toThrow() })
})
describe('public lifecycle reader and UI', () => {
  test('uses only known public reads without credentials; refresh reads server again', async () => { const calls: { url: string; init: RequestInit }[] = []; const reader = createLifecycleReader({ VITE_HIRING_DESK_API_URL: 'https://api.example/api/desk/public', PROD: true }, (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ value: [] })) }) as typeof fetch); await reader.jobs(); await reader.offers('arkiv:291/job'); await reader.jobs(); expect(calls.map(c => c.url)).toEqual(['https://api.example/api/desk/public/jobs', 'https://api.example/api/desk/public/jobs/arkiv%3A291%2Fjob/offers', 'https://api.example/api/desk/public/jobs']); expect(calls.every(c => c.init.credentials === 'omit' && c.init.cache === 'no-store')).toBe(true) })
  test('RPC/API outage and malformed public records remain unavailable', async () => { for (const fetcher of [async () => { throw new Error('offline') }, async () => new Response(JSON.stringify({ value: [{ record: { version: 'fixture' } }] }))]) { const result = await createLifecycleReader({ VITE_HIRING_DESK_API_URL: 'https://api.example' }, fetcher as typeof fetch).jobs(); expect(result.state).toBe('unavailable') } })
  test('rejects offers for another job or wallet creator', async () => {
    for (const record of [{ type: 'offer', version: 'desk/v1', jobRef: 'other', provider: signer }, { type: 'offer', version: 'desk/v1', jobRef: 'arkiv:291/job', provider: signer }]) {
      const reader = createLifecycleReader({ VITE_HIRING_DESK_API_URL: 'https://api.example' }, (async () => new Response(JSON.stringify({ value: [{ ref: 'offer', creator: '0x0000000000000000000000000000000000000009', finalized: true, record }] }))) as typeof fetch)
      expect((await reader.offers('arkiv:291/job')).state).toBe('unavailable')
    }
  })
  test('validates exact integer budgets and future deadlines', () => { const d = { brief: 'public task', skill: 'research', budgetAtomic: '1000000', deadline: Math.floor(Date.now() / 1000) + 3600 }; expect(validDraft(d)).toBe(true); for (const amount of ['1.2', '-1', '0', '01', '1e6']) expect(validDraft({ ...d, budgetAtomic: amount })).toBe(false); expect(validDraft({ ...d, deadline: 1 })).toBe(false) })
  test('home has useful workflow and explicit unavailable publication/feedback, with no invented success', () => { const html = renderToStaticMarkup(<HiringBoard />); expect(html).toContain('Public jobs'); expect(html).toContain('Post a job'); expect(html).toContain('Wallet publication is unavailable'); expect(html).toContain('feedback are unavailable'); expect(html).not.toContain('Job successfully posted') })
  test('canonical Arkiv refs survive encoded links; rejects traversal and nested paths', () => { expect(readJobRef({ pathname: '/pay/arkiv%3A291%2Fjob', search: '' })).toBe('arkiv:291/job'); expect(readJobRef({ pathname: '/pay/..%2Fjob', search: '' })).toBeNull(); expect(readJobRef({ pathname: '/pay/a%2Fb%2Fc', search: '' })).toBeNull() })
})

describe('publication recovery and exact offer review', () => {
  test('saves only a non-secret hint and retries registration before independent reconciliation after reload', async () => {
    let data: string | null = null
    const storage = { getItem: () => data, setItem: (_key: string, value: string) => { data = value }, removeItem: () => { data = null } }
    const pending = { intentRef: 'intent-one', txHash: `0x${'ab'.repeat(32)}`, action: 'post-job' as const, jobRef: 'arkiv:291/job' }
    writePendingPublication(pending, storage)
    const restored = readPendingPublication(storage)
    expect(restored).toEqual(pending)
    expect(JSON.parse(data!)).not.toHaveProperty('state')
    const calls: string[] = []
    const adapter = { prepare: async () => intent(), submit: async (ref: string, hash: string) => { calls.push(`register:${ref}:${hash}`) }, reconcile: async (ref: string) => { calls.push(`read:${ref}`); return { state: 'pending' as const, message: 'Waiting for independent finality' } } }
    expect((await reconcilePendingPublication(adapter, restored!)).state).toBe('pending')
    expect(calls).toEqual([`register:${pending.intentRef}:${pending.txHash}`, `read:${pending.intentRef}`])
    writePendingPublication(null, storage); expect(readPendingPublication(storage)).toBeNull()
  })
  test('malformed or poisoned storage cannot assert confirmation', () => {
    const storage = { getItem: () => JSON.stringify({ state: 'confirmed', intentRef: 'fake', txHash: 'fake' }), setItem() {}, removeItem() {} }
    expect(readPendingPublication(storage)).toBeNull()
  })
  test('cannot substitute a different offer hidden behind the same job', () => {
    const i = { ...intent(), action: 'accept-offer' as const, offerRef: 'offer-other', offerDigest: `sha256:${'cd'.repeat(32)}` }
    expect(() => validateIntentForRequest(i, 'accept-offer', { jobRef: i.jobRef, offerRef: 'offer-reviewed' }, signer)).toThrow('does not match')
    expect(() => validatePublicationIntent({ ...i, nonce: '' })).toThrow()
    expect(() => validatePublicationIntent({ ...i, offerDigest: undefined })).toThrow()
  })
})
