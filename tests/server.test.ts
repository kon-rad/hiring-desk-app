import { describe, expect, test } from 'bun:test'
import { privateKeyToAccount } from 'viem/accounts'
import { AuthService } from '../server/auth'
import { createHandler, createMvpHandler, hideUnpaidDelivery } from '../server/app'
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
    const submitted = await req(handler, `/jobs/${job.id}/result`, 'POST', agentCookie, { contentType: 'text/plain', content: 'Completed report', artifactUrl: 'https://example.test/report.json' })
    expect(submitted.status).toBe(200)
    expect(JSON.stringify(await submitted.json())).toContain('Completed report')
    const unpaidJob = await req(handler, `/jobs/${job.id}`, 'GET', clientCookie)
    const unpaidBody = await unpaidJob.text()
    expect(unpaidBody).not.toContain('Completed report')
    expect(unpaidBody).not.toContain('report.json')
    const unpaidPayment = await req(handler, `/jobs/${job.id}/payment`, 'GET', clientCookie)
    expect((await unpaidPayment.json() as { terms: { deliverableUrl: string } }).terms.deliverableUrl).toBe('')
    expect((await req(handler, `/jobs/${job.id}/reviews`, 'POST', clientCookie, { rating: 5, comment: 'Useful result' })).status).toBe(200)
    const payment = await req(handler, `/jobs/${job.id}/payments/verify`, 'POST', clientCookie, { txHash: HASH })
    expect(payment.status).toBe(200)
    expect(paymentInput).toEqual(expect.objectContaining({ jobId: job.id, txHash: HASH, sender: client.address, recipient: agent.address, amountBaseUnits: 25_000_000n }))
    const body = await payment.json() as { state: string; terms: { chainId: number; tokenAddress: string; amountBaseUnits: string } }
    expect(body.state).toBe('confirmed'); expect(body.terms.chainId).toBe(8453); expect(body.terms.amountBaseUnits).toBe('25000000')
    expect((body.terms as { deliverableUrl: string }).deliverableUrl).toBe('https://example.test/report.json')
    expect(JSON.stringify(await (await req(handler, `/jobs/${job.id}`, 'GET', clientCookie)).json())).toContain('Completed report')
  })
})

describe('upstream facade', () => {
  test('redacts old upstream unpaid delivery fields without changing confirmed receipts', () => {
    const url = 'https://example.test/secret.mp4'
    expect(hideUnpaidDelivery('/jobs/1', { job: { state: 'submitted', result: { content: 'secret', artifactUrl: url } } })).toEqual({ job: { state: 'submitted', result: null } })
    expect(hideUnpaidDelivery('/jobs/1/payment', { state: 'payable', terms: { deliverableUrl: url } })).toEqual({ state: 'payable', terms: { deliverableUrl: '' } })
    expect(hideUnpaidDelivery('/jobs/1/payment', { state: 'confirmed', terms: { deliverableUrl: url } })).toEqual({ state: 'confirmed', terms: { deliverableUrl: url } })
    expect(hideUnpaidDelivery('/jobs/1', { job: { state: 'paid', result: { content: 'secret', artifactUrl: url } } })).toEqual({ job: { state: 'paid', result: { content: 'secret', artifactUrl: url } } })
    expect(hideUnpaidDelivery('/jobs/1', { state: { stage: 'delivered', delivery: { publicRef: 'swarm://secret' } }, observations: [{ record: { publicRef: 'swarm://secret' } }] })).toEqual({ state: { stage: 'delivered' } })
    expect(hideUnpaidDelivery('/jobs', { jobs: [{ publicState: { delivery: { publicRef: 'swarm://secret' } } }] })).toEqual({ jobs: [{ publicState: {} }] })
  })
  test('production requires a signed v4 route and a local wallet session', async () => {
    const handler = createHandler('https://example.test/api/desk/market', { secret: 'fixture-secret-fixture-secret-32bytes', requestFetch: (async () => Response.json({ jobs: [] })) as typeof fetch })
    expect((await req(handler, '/jobs/one')).status).toBe(401)
    expect((await req(handler, '/operator')).status).toBe(404)
    expect(() => createHandler('https://example.test/api/desk/public', { secret: 'fixture-secret-fixture-secret-32bytes' })).toThrow('market')
    expect(() => createHandler('https://example.test/api/desk/market', { secret: 'short' })).toThrow('32 bytes')
    for (const upstream of ['ftp://localhost/api/desk/market', 'file://localhost/api/desk/market', 'http://example.test/api/desk/market']) expect(() => createHandler(upstream, { secret: 'fixture-secret-fixture-secret-32bytes' })).toThrow('HTTPS')
    expect(() => createHandler('http://127.0.0.1/api/desk/market', { secret: 'fixture-secret-fixture-secret-32bytes' })).not.toThrow()
  })
})
