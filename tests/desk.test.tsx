/**
 * Tests for the Argo integration: API client, payment controller, review rendering and routing.
 * Generated in Arc Studio. Run: bun run test
 */
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { getAddress } from 'viem'
import { ReviewDetails } from '@/components/settlement/ReviewDetails'
import { createDeskController, receiptMatchesTerms, type DeskView } from '@/lib/desk-payment-controller'
import { toSettlementJob } from '@/lib/desk-job'
import { createHiringDeskClient, parseTerms, resolveApiBase, type HiringDeskClient } from '@/lib/hiring-desk-api'
import { readJobRef } from '@/lib/route'
import { createKeyValueLedger, createMemoryStore } from '@/settlement'
import { PAYMENT_INTERFACE_ID, type Hex, type PaymentStatus, type PublicPaymentTerms } from '@/types/desk'

const USDC = '0x3600000000000000000000000000000000000000' as Hex
const recipient = getAddress('0x00000000000000000000000000000000000000b2')
const client = getAddress('0x00000000000000000000000000000000000000a1')
const attacker = getAddress('0x00000000000000000000000000000000000000c3')
const HASH = ('0x' + '11'.repeat(32)) as Hex
const HASH2 = ('0x' + '22'.repeat(32)) as Hex
const ENV = { VITE_HIRING_DESK_API_URL: 'https://argo.test/api/', PROD: true }

const terms: PublicPaymentTerms = {
  jobKey: 'job-1042',
  jobReference: 'JOB-1042',
  deliverableUrl: 'https://deliverables.test/job-1042',
  recipientName: 'Atlas Agent',
  recipientAddress: recipient,
  clientAddress: client,
  chainId: 5042002,
  tokenAddress: USDC,
  amountBaseUnits: '25500000',
  amountDisplay: '25.5',
  interfaceId: PAYMENT_INTERFACE_ID,
}
const receipt = { txHash: HASH, sender: client, recipient, tokenAddress: USDC, chainId: 5042002, amountBaseUnits: '25500000', blockNumber: '99' }

interface Call { url: string; init: RequestInit }
function fakeFetch(responses: Array<{ status?: number; body: unknown }>, calls: Call[] = []): typeof fetch {
  let i = 0
  return ((url: string, init: RequestInit) => {
    calls.push({ url, init })
    const r = responses[Math.min(i++, responses.length - 1)] as { status?: number; body: unknown }
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status ?? 200 }))
  }) as unknown as typeof fetch
}

describe('API client configuration', () => {
  test('missing VITE_HIRING_DESK_API_URL gives a clear configuration error and sends nothing', async () => {
    const calls: Call[] = []
    const api = createHiringDeskClient({ env: {}, fetch: fakeFetch([{ body: {} }], calls) })
    const result = await api.getPaymentState('JOB-1')
    expect(result.state).toBe('unavailable')
    expect(result.state === 'unavailable' && result.reason).toBe('config_missing')
    expect(result.state === 'unavailable' && result.message).toContain('VITE_HIRING_DESK_API_URL')
    expect(calls.length).toBe(0)
  })
  test('http is rejected in production and allowed in development', () => {
    expect(resolveApiBase({ VITE_HIRING_DESK_API_URL: 'http://argo.test', PROD: true }).ok).toBe(false)
    expect(resolveApiBase({ VITE_HIRING_DESK_API_URL: 'http://localhost:8787', PROD: false }).ok).toBe(true)
    expect(resolveApiBase({ VITE_HIRING_DESK_API_URL: 'https://user:pw@argo.test', PROD: true }).ok).toBe(false)
  })
})

describe('API client requests', () => {
  test('loads terms with a credential-free GET and validates them', async () => {
    const calls: Call[] = []
    const api = createHiringDeskClient({ env: ENV, fetch: fakeFetch([{ body: { state: 'payable', terms } }], calls) })
    const result = await api.getPaymentState('JOB-1042')
    expect(result.state === 'payable' && result.terms.amountBaseUnits).toBe('25500000')
    expect(calls[0]?.url).toBe('https://argo.test/api/jobs/JOB-1042/payment')
    expect(calls[0]?.init.method).toBe('GET')
    expect(calls[0]?.init.credentials).toBe('omit')
    expect(calls[0]?.init.body).toBeUndefined()
  })
  test('verify and reconcile send ONLY the transaction hash', async () => {
    const calls: Call[] = []
    const api = createHiringDeskClient({ env: ENV, fetch: fakeFetch([{ body: { state: 'pending', txHash: HASH, terms } }], calls) })
    await api.verifyPayment('JOB-1042', HASH)
    await api.reconcilePayment('JOB-1042', HASH)
    expect(calls[0]?.url).toBe('https://argo.test/api/jobs/JOB-1042/payments/verify')
    expect(calls[1]?.url).toBe('https://argo.test/api/jobs/JOB-1042/payments/reconcile')
    for (const c of calls) {
      expect(c.init.method).toBe('POST')
      expect(c.init.credentials).toBe('omit')
      expect(JSON.parse(String(c.init.body))).toEqual({ txHash: HASH })
    }
  })
  test('rejects a malformed hash without calling the server', async () => {
    const calls: Call[] = []
    const api = createHiringDeskClient({ env: ENV, fetch: fakeFetch([{ body: {} }], calls) })
    const result = await api.verifyPayment('JOB-1', '0x1234' as Hex)
    expect(result.state).toBe('unavailable')
    expect(calls.length).toBe(0)
  })
  test('maps pending, confirmed, failed, duplicate and unavailable responses', async () => {
    const run = async (status: number, body: unknown): Promise<PaymentStatus> =>
      createHiringDeskClient({ env: ENV, fetch: fakeFetch([{ status, body }]) }).verifyPayment('J', HASH)
    expect((await run(200, { state: 'pending', txHash: HASH, terms })).state).toBe('pending')
    expect((await run(200, { state: 'confirmed', receipt, terms })).state).toBe('confirmed')
    expect((await run(200, { state: 'failed', code: 'WRONG_RECIPIENT', message: 'x', retryable: false, txHash: HASH })).state).toBe('failed')
    expect((await run(409, { state: 'duplicate', message: 'dup' })).state).toBe('duplicate')
    expect((await run(409, { error: 'conflict' })).state).toBe('duplicate')
    const down = await run(503, { error: 'x' })
    expect(down.state === 'unavailable' && down.reason).toBe('server_error')
    const throws = await createHiringDeskClient({ env: ENV, fetch: (() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch }).getPaymentState('J')
    expect(throws.state === 'unavailable' && throws.reason).toBe('network')
  })
  test('refuses terms for another chain, another token, a bad amount or a mismatched display', () => {
    expect(parseTerms({ ...terms, chainId: 1 })).toBeNull()
    expect(parseTerms({ ...terms, tokenAddress: attacker })).toBeNull()
    expect(parseTerms({ ...terms, amountBaseUnits: '25.5' })).toBeNull()
    expect(parseTerms({ ...terms, amountBaseUnits: '0' })).toBeNull()
    expect(parseTerms({ ...terms, amountDisplay: '25.4' })).toBeNull()
    expect(parseTerms({ ...terms, interfaceId: 'other' })).toBeNull()
    expect(parseTerms(terms)?.amountBaseUnits).toBe('25500000')
  })
})

describe('server terms are authoritative', () => {
  test('the exact server amount and recipient reach the payment module and the review screen', () => {
    const job = toSettlementJob(terms)
    expect(job.amountBaseUnits).toBe(25_500_000n)
    expect(job.recipientAddress).toBe(recipient)
    const html = renderToStaticMarkup(<ReviewDetails job={job} walletAddress={client} balance={30_000_000n} />)
    expect(html).toContain('25.50')
    expect(html).toContain(recipient)
    expect(html).toContain('Atlas Agent')
    expect(html).toContain('JOB-1042')
    expect(html).toContain('https://deliverables.test/job-1042')
    expect(html).toContain('Arc Testnet')
    expect(html).toContain('5042002')
    expect(html).toContain(USDC)
    expect(html).toContain(client)
  })
  test('user-entered recipient or amount in the URL cannot override the terms', () => {
    const loc = { pathname: '/jobs/JOB-1042', search: `?recipient=${attacker}&amount=1&chainId=1&token=${attacker}&wallet=${attacker}` }
    expect(readJobRef(loc)).toBe('JOB-1042')
    // toSettlementJob accepts only the server terms: there is no second argument to override them.
    expect(toSettlementJob.length).toBe(1)
    expect(toSettlementJob(terms).recipientAddress).not.toBe(attacker)
  })
  test('job reference routing', () => {
    expect(readJobRef({ pathname: '/jobs/JOB-9', search: '' })).toBe('JOB-9')
    expect(readJobRef({ pathname: '/pay/abc.1', search: '' })).toBe('abc.1')
    expect(readJobRef({ pathname: '/', search: '?job=JOB-7' })).toBe('JOB-7')
    expect(readJobRef({ pathname: '/', search: '' })).toBeNull()
    expect(readJobRef({ pathname: '/jobs/../../x', search: '' })).toBeNull()
    expect(readJobRef({ pathname: '/jobs/%E0%A4%A', search: '' })).toBeNull()
  })
  test('a receipt that disagrees with the terms is never treated as paid', () => {
    expect(receiptMatchesTerms(receipt, terms)).toBe(true)
    expect(receiptMatchesTerms({ ...receipt, recipient: attacker }, terms)).toBe(false)
    expect(receiptMatchesTerms({ ...receipt, amountBaseUnits: '1' }, terms)).toBe(false)
    expect(receiptMatchesTerms({ ...receipt, sender: attacker }, terms)).toBe(false)
  })
})

function fakeClient(script: { get?: PaymentStatus[]; verify?: PaymentStatus[]; reconcile?: PaymentStatus[] }, log: string[] = []): HiringDeskClient {
  const next = (list: PaymentStatus[] | undefined, name: string, extra = ''): Promise<PaymentStatus> => {
    log.push(name + extra)
    const r = list?.shift() ?? { state: 'unavailable', reason: 'server_error', message: 'unscripted' }
    return Promise.resolve(r)
  }
  return {
    getPaymentState: () => next(script.get, 'GET'),
    verifyPayment: (_ref, h) => next(script.verify, 'VERIFY', `:${h}`),
    reconcilePayment: (_ref, h) => next(script.reconcile, 'RECONCILE', `:${h}`),
  }
}
const make = (c: HiringDeskClient, extra: Partial<Parameters<typeof createDeskController>[0]> = {}) =>
  createDeskController({ client: c, jobRef: 'JOB-1042', pollIntervalMs: 0, ...extra })
const kind = (v: DeskView): string => v.kind

describe('payment controller', () => {
  test('loads payable terms, then reports only the hash and stays pending until Argo confirms', async () => {
    const log: string[] = []
    const ctrl = make(fakeClient({
      get: [{ state: 'payable', terms }],
      verify: [{ state: 'pending', terms: null, txHash: HASH, confirmations: 0, warning: null }],
      reconcile: [{ state: 'confirmed', terms: null, receipt }],
    }, log))
    await ctrl.load()
    expect(kind(ctrl.getView())).toBe('payable')
    await ctrl.onTransactionSubmitted(HASH)
    expect(kind(ctrl.getView())).toBe('verifying')
    expect(log).toEqual(['GET', `VERIFY:${HASH}`])
    await ctrl.checkAgain()
    const v = ctrl.getView()
    expect(v.kind === 'confirmed' && v.receipt.txHash).toBe(HASH)
  })
  test('a wallet submission alone never produces a paid view', async () => {
    const ctrl = make(fakeClient({ get: [{ state: 'payable', terms }], verify: [{ state: 'unavailable', reason: 'network', message: 'offline' }] }))
    await ctrl.load()
    await ctrl.onTransactionSubmitted(HASH)
    const v = ctrl.getView()
    expect(v.kind).toBe('verifying')
    expect(v.kind === 'verifying' && v.txHash).toBe(HASH)
    expect(v.kind === 'verifying' && v.warning).toContain('offline')
  })
  test('failed verification is shown with Argo reason, and a retryable failure clears the local hint', async () => {
    const cleared: string[] = []
    const ctrl = make(
      fakeClient({ get: [{ state: 'payable', terms }], verify: [{ state: 'failed', terms: null, txHash: HASH, code: 'REVERTED', message: 'Reverted', retryable: true }] }),
      { onRetryable: (t) => cleared.push(t.jobKey) },
    )
    await ctrl.load()
    await ctrl.onTransactionSubmitted(HASH)
    const v = ctrl.getView()
    expect(v.kind === 'failed' && v.code).toBe('REVERTED')
    expect(cleared).toEqual(['job-1042'])
    ctrl.retry()
    expect(kind(ctrl.getView())).toBe('payable')
  })
  test('a non-retryable failure cannot be retried', async () => {
    const ctrl = make(fakeClient({ get: [{ state: 'payable', terms }], verify: [{ state: 'failed', terms: null, txHash: HASH, code: 'WRONG_RECIPIENT', message: 'x', retryable: false }] }))
    await ctrl.load()
    await ctrl.onTransactionSubmitted(HASH)
    ctrl.retry()
    expect(kind(ctrl.getView())).toBe('failed')
  })
  test('duplicate response is surfaced, then Argo is asked for its own record', async () => {
    const log: string[] = []
    const ctrl = make(fakeClient({
      get: [{ state: 'payable', terms }, { state: 'confirmed', terms, receipt: { ...receipt, txHash: HASH2 } }],
      verify: [{ state: 'duplicate', txHash: HASH, message: 'Already recorded' }],
    }, log))
    await ctrl.load()
    await ctrl.onTransactionSubmitted(HASH)
    const v = ctrl.getView()
    expect(v.kind === 'confirmed' && v.receipt.txHash).toBe(HASH2)
    expect(log).toEqual(['GET', `VERIFY:${HASH}`, 'GET'])
  })
  test('duplicate with no better record stays visible', async () => {
    const ctrl = make(fakeClient({ get: [{ state: 'payable', terms }, { state: 'payable', terms }], verify: [{ state: 'duplicate', txHash: HASH, message: 'Already recorded' }] }))
    await ctrl.load()
    await ctrl.onTransactionSubmitted(HASH)
    expect(kind(ctrl.getView())).toBe('duplicate')
  })
  test('a receipt that contradicts the terms is rejected, not shown as paid', async () => {
    const ctrl = make(fakeClient({ get: [{ state: 'payable', terms }], verify: [{ state: 'confirmed', terms: null, receipt: { ...receipt, recipient: attacker } }] }))
    await ctrl.load()
    await ctrl.onTransactionSubmitted(HASH)
    expect(kind(ctrl.getView())).toBe('unavailable')
  })
  test('reload recovers state from Argo only: pending, confirmed, already paid, not payable', async () => {
    const pending = make(fakeClient({ get: [{ state: 'pending', terms, txHash: HASH, confirmations: 0, warning: null }], reconcile: [{ state: 'confirmed', terms: null, receipt }] }))
    await pending.load()
    const p = pending.getView()
    expect(p.kind === 'verifying' && p.txHash).toBe(HASH)
    await pending.checkAgain()
    expect(kind(pending.getView())).toBe('confirmed')

    const paid = make(fakeClient({ get: [{ state: 'confirmed', terms, receipt }] }))
    await paid.load()
    expect(kind(paid.getView())).toBe('confirmed')

    const expired = make(fakeClient({ get: [{ state: 'not_payable', reason: 'expired', message: 'Expired' }] }))
    await expired.load()
    expect(kind(expired.getView())).toBe('not_payable')
  })
  test('browser storage never decides payment state', async () => {
    const ledger = createKeyValueLedger(createMemoryStore())
    await ledger.markSubmitted({ jobKey: 'job-1042', chainId: 5042002, txHash: HASH, sender: client })
    await ledger.markConfirmed('job-1042', HASH)
    expect((await ledger.get('job-1042'))?.status).toBe('confirmed')
    const ctrl = make(fakeClient({ get: [{ state: 'payable', terms }] }))
    await ctrl.load()
    expect(kind(ctrl.getView())).toBe('payable')
  })
  test('Argo outage on load is reported as unavailable', async () => {
    const ctrl = make(fakeClient({ get: [{ state: 'unavailable', reason: 'timeout', message: 'slow' }] }))
    await ctrl.load()
    expect(kind(ctrl.getView())).toBe('unavailable')
  })
})
