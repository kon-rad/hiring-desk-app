import { describe, expect, test } from 'bun:test'
import { privateKeyToAccount } from 'viem/accounts'
import { AuthService } from '../server/auth'
import { createHandler, createMvpHandler } from '../server/app'
import { MemoryMarketplace } from '../server/marketplace'

const client = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const agent = privateKeyToAccount(`0x${'22'.repeat(32)}`)
const other = privateKeyToAccount(`0x${'33'.repeat(32)}`)
const HASH = `0x${'ab'.repeat(32)}` as const

async function login(handler: (r: Request) => Promise<Response>, account: typeof client, role: 'client' | 'agent') {
  const challengeResponse = await handler(new Request('http://local/api/auth/challenge', { method: 'POST', body: JSON.stringify({ address: account.address, role }) }))
  const challenge = await challengeResponse.json() as { nonce: string; message: string }
  const signature = await account.signMessage({ message: challenge.message })
  const response = await handler(new Request('http://local/api/auth/verify', { method: 'POST', body: JSON.stringify({ address: account.address, role, nonce: challenge.nonce, signature }) }))
  expect(response.status).toBe(200)
  return response.headers.get('set-cookie')!.split(';')[0]
}
const req = (handler: (r: Request) => Promise<Response>, path: string, method = 'GET', cookie?: string, body?: unknown) => handler(new Request(`http://local/api${path}`, { method, headers: cookie ? { cookie } : {}, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))

describe('wallet authentication', () => {
  test('normalizes address, binds role, rejects replay and expiry, and sets a short HttpOnly cookie', async () => {
    let now = 1_700_000_000_000
    const auth = new AuthService(() => now)
    const challenge = auth.challenge({ address: client.address.toLowerCase(), role: 'client' })
    const signature = await client.signMessage({ message: challenge.message })
    const verified = await auth.verify({ ...challenge, signature })
    expect(verified.session.address).toBe(client.address)
    expect(verified.cookie).toContain('HttpOnly')
    expect(verified.cookie).toContain('SameSite=Lax')
    await expect(auth.verify({ ...challenge, signature })).rejects.toThrow('used')
    const expired = auth.challenge({ address: client.address, role: 'client' }); now += 301_000
    await expect(auth.verify({ ...expired, signature: await client.signMessage({ message: expired.message }) })).rejects.toThrow('expired')
  })
})

describe('authenticated marketplace lifecycle', () => {
  test('enforces roles, ownership, transitions, validation and server-derived payment terms', async () => {
    let paymentInput: unknown
    const handler = createMvpHandler({ marketplace: new MemoryMarketplace(() => 1_700_000_000_000), verifyPayment: async input => { paymentInput = input; return { status: 'confirmed', txHash: input.txHash, blockNumber: '10', explorerUrl: `https://basescan.org/tx/${input.txHash}` } } })
    const agentCookie = await login(handler, agent, 'agent')
    const clientCookie = await login(handler, client, 'client')
    const otherCookie = await login(handler, other, 'client')
    expect((await req(handler, '/profile', 'PUT', clientCookie, { displayName: 'x' })).status).toBe(403)
    expect((await req(handler, '/profile', 'PUT', agentCookie, { displayName: 'Atlas', bio: 'Research agent', skills: ['research'], payoutAddress: agent.address })).status).toBe(200)
    const created = await req(handler, '/jobs', 'POST', clientCookie, { skill: 'research', title: 'Market report', description: 'Summarize public sources.', budgetBaseUnits: '25000000', deadline: 1_800_000_000, parameters: { region: 'EU' } })
    expect(created.status).toBe(201)
    const job = (await created.json() as { job: { id: string } }).job
    expect((await req(handler, `/jobs/${job.id}`, 'GET', otherCookie)).status).toBe(403)
    expect((await req(handler, `/jobs/${job.id}/hire`, 'POST', clientCookie, { agentAddress: agent.address })).status).toBe(200)
    expect((await req(handler, `/jobs/${job.id}/claim`, 'POST', clientCookie, {})).status).toBe(403)
    expect((await req(handler, `/jobs/${job.id}/claim`, 'POST', agentCookie, {})).status).toBe(200)
    expect((await req(handler, `/jobs/${job.id}/result`, 'POST', agentCookie, { contentType: 'text/html', content: '<script>x</script>' })).status).toBe(400)
    expect((await req(handler, `/jobs/${job.id}/result`, 'POST', agentCookie, { contentType: 'text/plain', content: 'Completed report', artifactUrl: 'https://example.test/report.json' })).status).toBe(200)
    expect((await req(handler, `/jobs/${job.id}/reviews`, 'POST', clientCookie, { rating: 5, comment: 'Useful result' })).status).toBe(200)
    const payment = await req(handler, `/jobs/${job.id}/payments/verify`, 'POST', clientCookie, { txHash: HASH })
    expect(payment.status).toBe(200)
    expect(paymentInput).toEqual(expect.objectContaining({ jobId: job.id, txHash: HASH, sender: client.address, recipient: agent.address, amountBaseUnits: 25_000_000n }))
    const body = await payment.json() as { state: string; terms: { chainId: number; tokenAddress: string; amountBaseUnits: string } }
    expect(body.state).toBe('confirmed'); expect(body.terms.chainId).toBe(8453); expect(body.terms.amountBaseUnits).toBe('25000000')
  })
})

describe('upstream facade', () => {
  test('fails closed and only forwards txHash across the payment boundary', async () => {
    let calls = 0
    const handler = createHandler('https://example.com/public', (async (_url, init) => { calls++; expect(JSON.parse(String(init?.body))).toEqual({ txHash: HASH }); return Response.json({ state: 'pending' }) }) as typeof fetch)
    expect((await req(handler, '/operator')).status).toBe(404)
    expect((await req(handler, '/jobs/1/payments/verify', 'POST', undefined, { txHash: HASH, amount: '1' })).status).toBe(400)
    expect((await req(handler, '/jobs/1/payments/verify', 'POST', undefined, { txHash: HASH })).status).toBe(200)
    expect(calls).toBe(1)
    const down = createHandler('https://example.com/public', (async () => { throw new Error('offline') }) as typeof fetch)
    expect((await req(down, '/jobs')).status).toBe(502)
  })
})
