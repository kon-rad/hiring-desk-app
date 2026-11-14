import { describe, expect, test } from 'bun:test'
import { createHandler } from '../server/app'

describe('public API gateway', () => {
  test('health works and unknown/operator routes are blocked', async () => {
    const handler = createHandler('https://example.com/api/desk/public', (() => { throw new Error('must not fetch') }) as typeof fetch)
    expect((await handler(new Request('http://localhost/api/health'))).status).toBe(200)
    expect((await handler(new Request('http://localhost/api/operator'))).status).toBe(404)
  })
  test('forwards encoded refs and upstream failure status without cookies', async () => {
    const handler = createHandler('https://example.com/public', (async (url, init) => {
      expect(String(url)).toBe('https://example.com/public/jobs/arkiv%2F123/payment')
      expect(new Headers(init?.headers).has('cookie')).toBe(false)
      return Response.json({ state: 'not_payable' }, { status: 422, headers: { 'set-cookie': 'secret=x' } })
    }) as typeof fetch)
    const response = await handler(new Request('http://localhost/api/jobs/arkiv%2F123/payment', { headers: { cookie: 'session=x' } }))
    expect(response.status).toBe(422)
    expect(response.headers.has('set-cookie')).toBe(false)
  })
  test('only transaction hashes can cross the payment boundary', async () => {
    let calls = 0
    const handler = createHandler('https://example.com/public', (async (_url, init) => {
      calls++
      expect(JSON.parse(String(init?.body))).toEqual({ txHash: `0x${'a'.repeat(64)}` })
      return Response.json({ state: 'pending' })
    }) as typeof fetch)
    const post = (body: unknown) => handler(new Request('http://localhost/api/jobs/123/payments/verify', { method: 'POST', body: JSON.stringify(body) }))
    expect((await post({ txHash: `0x${'a'.repeat(64)}`, amount: '1' })).status).toBe(400)
    expect((await post({ txHash: 'x'.repeat(300) })).status).toBe(413)
    expect((await post({ txHash: `0x${'a'.repeat(64)}` })).status).toBe(200)
    expect(calls).toBe(1)
  })
  test('upstream outage cannot produce a confirmed payment', async () => {
    const handler = createHandler('https://example.com/public', (async () => { throw new Error('offline') }) as typeof fetch)
    expect((await handler(new Request('http://localhost/api/jobs/123/payment'))).status).toBe(502)
  })
})
