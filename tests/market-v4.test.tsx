import { describe, expect, test } from 'bun:test'
import fixture from './fixtures/engine-envelope.json'
import { renderToStaticMarkup } from 'react-dom/server'
import { privateKeyToAccount } from 'viem/accounts'
import { createHandler } from '../server/app'
import { AuthService } from '../server/auth'
import { canonicalEnvelope, signEngineRequest } from '../server/engine-envelope'
import { createMarketClient, paymentAction, readMarketJob, readMarketTerms, swarmDownloadUrl, toMarketSettlement } from '../src/lib/market-v4'
import { rememberPayment, pendingPayment, clearPayment } from '../src/lib/market-pending'
import { MarketJobSummary } from '../src/components/desk/MarketJobPage'
import type { MarketJob } from '../src/types/market-v4'
import { BASE_MAINNET_CONFIG } from '../src/settlement/config'
const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const hash = `0x${'ab'.repeat(32)}`
const ref = `swarm://${'cd'.repeat(32)}`
const secret = 'fixture-secret-fixture-secret-32bytes'
const initial: MarketJob = { id: 'job-fixture', providerId: 'provider-fixture', title: 'Commission fixture', priceAtomic: '1000000', status: 'triage', summary: null, artifactSha256: null }
async function login(handler: (request: Request) => Promise<Response>) {
  const req = (path: string, body: unknown) => handler(new Request(`https://example.test/api/auth/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.test' }, body: JSON.stringify(body) }))
  const challenge = await (await req('challenge', { address: account.address, role: 'client' })).json() as any
  const response = await req('verify', { ...challenge, signature: await account.signMessage({ message: challenge.message }) })
  expect(response.status).toBe(200)
  expect(response.headers.get('set-cookie')).toContain('; Secure')
  return response.headers.get('set-cookie')!.split(';')[0]
}
function request(handler: (r: Request) => Promise<Response>, path: string, cookie?: string, body?: unknown, origin = 'https://example.test') {
  return handler(new Request(`https://example.test/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { cookie } : {}), origin, 'content-type': 'application/json', 'x-cyba-wallet': '0x0000000000000000000000000000000000000002' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))
}
describe('v4 wallet gateway contract', () => {
  test('matches the shared engine canonical fixture exactly', () => {
    expect(canonicalEnvelope(fixture.input)).toBe(fixture.canonical)
    expect(signEngineRequest(fixture.input, fixture.secret)).toBe(fixture.signature)
  })
  test('keeps auth local, signs exact canonical bytes and rejects forged wallets and private routes', async () => {
    let calls = 0
    const handler = createHandler('https://upstream.example/api/desk/market', { secret, now: () => 1_700_000_000_000, requestFetch: (async (url, init) => {
      calls++
      const target = new URL(String(url)); const h = new Headers(init?.headers)
      expect(target.pathname).toBe('/api/desk/market/jobs')
      expect(h.get('x-cyba-wallet')).toBe(account.address.toLowerCase())
      expect(h.has('cookie')).toBe(false)
      const signature = signEngineRequest({ method: init!.method!, path: target.pathname, body: String(init?.body ?? ''), wallet: account.address, timestamp: 1_700_000_000_000 }, secret)
      expect(h.get('x-cyba-signature')).toBe(signature)
      return Response.json({ job: { ...initial, artifactPath: '/private.mp4', downloadRef: ref } })
    }) as typeof fetch })
    const cookie = await login(handler)
    expect(calls).toBe(0)
    const body = { providerId: initial.providerId, title: initial.title, brief: 'Public fixture brief', requestKey: 'fixture-request' }
    expect((await request(handler, '/jobs', cookie, { ...body, clientAddress: 'forged' })).status).toBe(400)
    expect((await request(handler, '/jobs', undefined, body)).status).toBe(401)
    expect((await request(handler, '/jobs', cookie, body, 'https://evil.example')).status).toBe(403)
    expect((await request(handler, '/jobs/x/claim', cookie, {})).status).toBe(404)
    const response = await request(handler, '/jobs', cookie, body)
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).not.toContain('private.mp4'); expect(text).not.toContain(ref)
    expect(calls).toBe(1)
    expect((await request(handler, '/auth/session', cookie)).status).toBe(200)
    expect(calls).toBe(1)
  })
  test('rejects exhausted challenges and invalid local auth without calling upstream', async () => {
    let calls = 0
    const handler = createHandler('https://upstream.example/api/desk/market', { secret, requestFetch: (async () => { calls++; return Response.json({ jobs: [] }) }) as typeof fetch })
    expect((await request(handler, '/auth/challenge', undefined, { address: 'invalid', role: 'client' })).status).toBe(400)
    for (let n = 0; n < 5; n++) expect((await request(handler, '/auth/challenge', undefined, { address: account.address, role: 'client' })).status).toBe(200)
    expect((await request(handler, '/auth/challenge', undefined, { address: account.address, role: 'client' })).status).toBe(429)
    expect((await request(handler, '/auth/verify', undefined, { address: account.address, role: 'client', nonce: 'unknown', signature: '0x' })).status).toBe(401)
    expect(calls).toBe(0)
  })
  test('preserves upstream ownership denial, never falls back to memory, and does not forward auth cookies', async () => {
    const handler = createHandler('https://upstream.example/api/desk/market', { secret, requestFetch: (async () => Response.json({ error: { code: 'forbidden', message: 'This wallet does not own this job' } }, { status: 403 })) as typeof fetch })
    const cookie = await login(handler)
    const denied = await request(handler, '/jobs/another-wallet', cookie)
    expect(denied.status).toBe(403)
    expect(await denied.text()).toContain('does not own')
    const down = createHandler('https://upstream.example/api/desk/market', { secret, requestFetch: (async () => { throw new Error('offline') }) as typeof fetch })
    expect((await request(down, '/agents')).status).toBe(502)
    expect((await request(down, '/jobs', cookie)).status).toBe(401)
  })
  test('forwards only txHash and preserves 202 pending response without unlocking', async () => {
    const handler = createHandler('https://upstream.example/api/desk/market', { secret, requestFetch: (async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ txHash: hash })
      return Response.json({ job: { ...initial, status: 'released', pendingPaymentTx: hash, downloadRef: ref, artifactPath: 'private' } }, { status: 202 })
    }) as typeof fetch })
    const cookie = await login(handler)
    expect((await request(handler, '/jobs/job-fixture/payment', cookie, { txHash: hash, amount: '1' })).status).toBe(400)
    const response = await request(handler, '/jobs/job-fixture/payment', cookie, { txHash: hash })
    expect(response.status).toBe(202)
    const value = await response.json() as any
    expect(value.job.pendingPaymentTx).toBe(hash); expect(value.job.downloadRef).toBeUndefined(); expect(value.job.artifactPath).toBeUndefined()
  })
})
describe('v4 client payment and delivery states', () => {
  test('rejects premature references and wrong/stale authoritative terms', () => {
    expect(() => readMarketJob({ ...initial, downloadRef: ref })).toThrow('Unexpected')
    const released = { ...initial, status: 'released' as const, summary: 'Reviewed public summary', artifactSha256: 'ef'.repeat(32) }
    const terms = { chainId: 8453, tokenAddress: BASE_MAINNET_CONFIG.token.address, sender: account.address, recipient: '0x0000000000000000000000000000000000000002', amountAtomic: initial.priceAtomic, jobId: initial.id }
    expect(toMarketSettlement(readMarketTerms(terms, released)).deliverableUrl).toBe('')
    for (const changed of [{ chainId: 1 }, { amountAtomic: '2' }, { jobId: 'different' }, { tokenAddress: '0x0000000000000000000000000000000000000000' }]) expect(() => readMarketTerms({ ...terms, ...changed }, released)).toThrow('terms')
    expect(paymentAction(released)).toBe('pay')
    expect(paymentAction({ ...released, pendingPaymentTx: hash })).toBe('reconcile')
    expect(paymentAction({ ...released, paymentTx: hash, deliveryPending: true })).toBe('reconcile')
    expect(paymentAction({ ...released, status: 'paid', paymentTx: hash, downloadRef: ref })).toBe('download')
    expect(paymentAction({ ...released, status: 'paid' })).toBe('delivery-pending')
    expect(paymentAction({ ...released, status: 'cancelled' })).toBe('cancelled')
    for (const status of ['triage', 'active', 'review'] as const) expect(paymentAction({ ...initial, status })).toBe('wait')
  })
  test('does not treat a legacy memory profile as a configured v4 service', async () => {
    const client = createMarketClient((async () => Response.json({ agents: [{ address: account.address, displayName: 'Legacy fixture' }] })) as typeof fetch)
    await expect(client.profiles()).rejects.toThrow('v4 identity')
  })
  test('reload hints request reconciliation, never decide paid or produce a second payment', () => {
    const map = new Map<string, string>(); const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) }, removeItem: (k: string) => { map.delete(k) } }
    rememberPayment(storage, initial.id, hash)
    expect(pendingPayment(storage, initial.id)).toBe(hash)
    expect(paymentAction({ ...initial, status: 'released' }, pendingPayment(storage, initial.id))).toBe('reconcile')
    expect(paymentAction(initial, hash)).not.toBe('download')
    clearPayment(storage, initial.id); expect(pendingPayment(storage, initial.id)).toBeNull()
  })
  test('re-fetches server state and sends only the submitted hash during retries', async () => {
    let n = 0
    const client = createMarketClient((async (_url, init) => {
      n++
      if (init?.method === 'POST') expect(JSON.parse(String(init.body))).toEqual({ txHash: hash })
      return Response.json({ job: n < 3 ? { ...initial, status: 'released', pendingPaymentTx: hash } : { ...initial, status: 'paid', paymentTx: hash, downloadRef: ref } })
    }) as typeof fetch)
    expect((await client.job(initial.id)).pendingPaymentTx).toBe(hash)
    expect((await client.payment(initial.id, hash)).status).toBe('released')
    expect((await client.payment(initial.id, hash)).downloadRef).toBe(ref)
    expect(swarmDownloadUrl('https://evil.example')).toBeNull()
    expect(swarmDownloadUrl(ref)).toContain('/bzz/')
  })
  test('renders private review and released summary honestly across all states', () => {
    for (const status of ['triage', 'active', 'review', 'released', 'paid', 'cancelled'] as const) {
      const markup = renderToStaticMarkup(<MarketJobSummary job={{ ...initial, status, summary: status === 'released' || status === 'paid' ? 'Reviewed summary fixture' : null }}/> )
      expect(markup).toContain('Commission fixture')
      expect(markup).not.toContain('swarm://')
      if (status === 'released' || status === 'paid') expect(markup).toContain('Reviewed summary fixture')
    }
  })
})
