import type { Hash } from 'viem'
import { envelopeHeaders } from './engine-envelope'
import { AuthService, type Session } from './auth'
import { MemoryMarketplace, type PaymentVerifier } from './marketplace'

const TX_HASH = /^0x[0-9a-fA-F]{64}$/
const noStore = { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' }
const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), { status, headers: { ...noStore, ...headers } })

/** Never pass an unpaid result or download reference from an older upstream contract. */
export function hideUnpaidDelivery(path: string, body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  const data = body as Record<string, unknown>
  if (path === '/jobs' && Array.isArray(data.jobs)) {
    data.jobs = data.jobs.map(item => stripDelivery(item))
    return data
  }
  if (!/^\/jobs\/[^/]+(?:\/(?:hire|claim|result|reviews|payment|payments\/(?:verify|reconcile)))?$/.test(path)) return body
  // The upstream owns these durable states. A submitted hash alone never unlocks a link.
  const paidJob = data.job && typeof data.job === 'object' && !Array.isArray(data.job) && (data.job as Record<string, unknown>).state === 'paid'
  return data.state === 'confirmed' || paidJob ? data : stripDelivery(data)
}

function stripDelivery(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDelivery)
  if (!value || typeof value !== 'object') return value
  const source = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(source)) {
    if (key === 'result') { out[key] = null; continue }
    if (['delivery', 'observations', 'publicRef', 'publicDestination', 'artifactUrl', 'downloadUrl', 'fileUrl', 'swarmRef'].includes(key)) continue
    if (key === 'deliverableUrl') { out[key] = ''; continue }
    out[key] = stripDelivery(item)
  }
  return out
}

async function readJson(request: Request, max = 32_000): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader(); let size = 0; const chunks: Uint8Array[] = []
  if (reader) for (;;) {
    const { done, value } = await reader.read(); if (done) break
    size += value.length
    if (size > max) { await reader.cancel(); throw Object.assign(new Error('Body too large'), { status: 413 }) }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value as Record<string, unknown>
  } catch { throw Object.assign(new Error('Expected a JSON object'), { status: 400 }) }
}

function requireSession(auth: AuthService, request: Request, role?: Session['role']): Session {
  const session = auth.fromRequest(request)
  if (!session) throw Object.assign(new Error('Authentication required'), { status: 401 })
  if (role && session.role !== role) throw Object.assign(new Error(`${role} role required`), { status: 403 })
  return session
}

export interface MvpHandlerOptions { auth?: AuthService; marketplace?: MemoryMarketplace; verifyPayment: PaymentVerifier }

/** Complete local MVP handler. Callers must opt into MemoryMarketplace explicitly. */
export function createMvpHandler(options: MvpHandlerOptions) {
  const auth = options.auth ?? new AuthService()
  const market = options.marketplace ?? new MemoryMarketplace()
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/api/health' && request.method === 'GET') return json({ service: 'cybazaar', status: 'ok', storage: 'memory-development-only', chainId: 8453 })
      if (url.pathname === '/api/auth/challenge' && request.method === 'POST') return json(auth.challenge(await readJson(request)))
      if (url.pathname === '/api/auth/verify' && request.method === 'POST') {
        const result = await auth.verify(await readJson(request))
        return json({ address: result.session.address, role: result.session.role, expiresAt: result.session.expiresAt }, 200, { 'set-cookie': result.cookie })
      }
      if (url.pathname === '/api/auth/session' && request.method === 'GET') {
        const session = requireSession(auth, request)
        return json({ address: session.address, role: session.role, expiresAt: session.expiresAt })
      }
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': auth.logout(request) })
      if (url.pathname === '/api/agents' && request.method === 'GET') return json({ agents: market.listAgents(url.searchParams.get('q') ?? '') })
      if (url.pathname === '/api/profile' && request.method === 'PUT') return json({ profile: market.putProfile(requireSession(auth, request, 'agent'), await readJson(request)) })
      const agentMatch = /^\/api\/agents\/([^/]+)$/.exec(url.pathname)
      if (agentMatch && request.method === 'GET') {
        const profile = market.agent(decodeURIComponent(agentMatch[1]))
        return profile ? json({ profile }) : json({ error: 'Agent not found' }, 404)
      }
      if (url.pathname === '/api/jobs' && request.method === 'GET') return json({ jobs: market.publicJobs(url.searchParams.get('q') ?? '') })
      if (url.pathname === '/api/jobs' && request.method === 'POST') return json({ job: market.createJob(requireSession(auth, request, 'client'), await readJson(request)) }, 201)
      const jobMatch = /^\/api\/jobs\/([^/]+)$/.exec(url.pathname)
      if (jobMatch && request.method === 'GET') return json({ job: market.visibleJob(requireSession(auth, request), decodeURIComponent(jobMatch[1])) })
      const actionMatch = /^\/api\/jobs\/([^/]+)\/(hire|claim|result|reviews)$/.exec(url.pathname)
      if (actionMatch && request.method === 'POST') {
        const session = requireSession(auth, request); const id = decodeURIComponent(actionMatch[1]); const body = actionMatch[2] === 'claim' ? {} : await readJson(request)
        const job = actionMatch[2] === 'hire' ? market.hire(session, id, body) : actionMatch[2] === 'claim' ? market.claim(session, id) : actionMatch[2] === 'result' ? market.submit(session, id, body) : market.review(session, id, body)
        return json({ job: market.visibleJob(session, id) })
      }
      const paymentMatch = /^\/api\/jobs\/([^/]+)\/payment$/.exec(url.pathname)
      if (paymentMatch && request.method === 'GET') {
        const session = requireSession(auth, request, 'client'); const id = decodeURIComponent(paymentMatch[1]); const terms = market.terms(session, id); const job = market.getJob(session, id)
        return job.state === 'paid'
          ? json({ state: 'confirmed', terms, receipt: { txHash: job.paymentTxHash, sender: terms.clientAddress, recipient: terms.recipientAddress, tokenAddress: terms.tokenAddress, chainId: terms.chainId, amountBaseUnits: terms.amountBaseUnits } })
          : job.paymentTxHash
            ? json({ state: 'pending', terms, txHash: job.paymentTxHash, confirmations: null, warning: null })
            : json({ state: 'payable', terms })
      }
      const verifyMatch = /^\/api\/jobs\/([^/]+)\/payments\/(verify|reconcile)$/.exec(url.pathname)
      if (verifyMatch && request.method === 'POST') {
        const session = requireSession(auth, request, 'client'); const body = await readJson(request, 256)
        if (Object.keys(body).length !== 1 || typeof body.txHash !== 'string' || !TX_HASH.test(body.txHash)) throw Object.assign(new Error('Expected only a valid txHash'), { status: 400 })
        const id = decodeURIComponent(verifyMatch[1]); const terms = market.terms(session, id)
        const outcome = await market.verifyPayment(session, id, body.txHash as Hash, options.verifyPayment)
        if (outcome.status === 'confirmed') return json({ state: 'confirmed', terms: market.terms(session, id), receipt: { txHash: outcome.txHash, sender: terms.clientAddress, recipient: terms.recipientAddress, tokenAddress: terms.tokenAddress, chainId: terms.chainId, amountBaseUnits: terms.amountBaseUnits, blockNumber: outcome.blockNumber, explorerUrl: outcome.explorerUrl } })
        if (outcome.status === 'pending') return json({ state: 'pending', terms, ...outcome })
        return json({ state: 'failed', terms, ...outcome }, 422)
      }
      return json({ error: 'Route not found' }, 404)
    } catch (error) {
      const e = error as Error & { status?: number }
      return json({ error: e.message || 'Request failed' }, e.status && e.status >= 400 && e.status < 600 ? e.status : 400)
    }
  }
}

export interface HandlerOptions {
  secret: string
  auth?: AuthService
  requestFetch?: typeof fetch
  now?: () => number
}

const marketStatuses = new Set(['triage', 'active', 'review', 'released', 'paid', 'cancelled'])
function projectJob(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid market job')
  const j = value as Record<string, unknown>
  if (!marketStatuses.has(String(j.status)) || typeof j.id !== 'string') throw new Error('Invalid market job')
  const out: Record<string, unknown> = {}
  for (const key of ['id', 'providerId', 'title', 'priceAtomic', 'status', 'summary', 'artifactSha256', 'deliveryPending', 'paymentTx', 'pendingPaymentTx']) if (key in j) out[key] = j[key]
  if (!['released', 'paid'].includes(String(j.status))) { out.summary = null; out.artifactSha256 = null }
  if (j.status === 'paid' && typeof j.downloadRef === 'string' && /^swarm:\/\/[0-9a-f]{64}$/.test(j.downloadRef)) out.downloadRef = j.downloadRef
  if (j.status === 'paid' && Array.isArray(j.evidenceRefs)) out.evidenceRefs = j.evidenceRefs.filter(r => typeof r === 'string' && /^arkiv:/.test(r))
  return out
}
function projectResponse(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid upstream response')
  const v = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  if ('job' in v) out.job = projectJob(v.job)
  if (Array.isArray(v.jobs)) out.jobs = v.jobs.map(projectJob)
  if (Array.isArray(v.agents)) out.agents = v.agents.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid service')
    const a = raw as Record<string, unknown>; const profile: Record<string, unknown> = {}
    for (const key of ['id', 'name', 'serviceTitle', 'description', 'priceAtomic', 'payoutWallet', 'ensName', 'agentId', 'identityBound']) profile[key] = a[key]
    return profile
  })
  if (v.terms && typeof v.terms === 'object') {
    const terms = v.terms as Record<string, unknown>; out.terms = Object.fromEntries(['chainId', 'tokenAddress', 'sender', 'recipient', 'amountAtomic', 'jobId'].map(k => [k, terms[k]]))
  }
  if (!Object.keys(out).length) throw new Error('Unsupported upstream response')
  return out
}
function enforceSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) throw Object.assign(new Error('Cross-origin request denied'), { status: 403 })
}

/** Production v4 facade. Wallet sessions stay local; the engine receives a signed, fixed-route request. */
export function createHandler(upstream: string, options: HandlerOptions) {
  const base = new URL(upstream)
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new Error('HIRING_DESK_UPSTREAM must use HTTPS or loopback HTTP')
  if (base.username || base.password || base.search || base.hash || base.pathname.replace(/\/$/, '') !== '/api/desk/market') throw new Error('HIRING_DESK_UPSTREAM must end in /api/desk/market')
  if (Buffer.byteLength(options.secret) < 32) throw new Error('CYBA_ENVELOPE_SECRET must contain at least 32 bytes')
  const auth = options.auth ?? new AuthService(Date.now, true)
  const requestFetch = options.requestFetch ?? fetch
  const now = options.now ?? Date.now
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/api/health' && request.method === 'GET') return json({ service: 'cybazaar-gateway', status: 'ok', storage: 'engine-postgres', upstreamHealth: 'not-probed', chainId: 8453 })
      if (!url.pathname.startsWith('/api/')) return json({ error: 'Route not found' }, 404)
      const path = url.pathname.slice(4)
      if (request.method !== 'GET') enforceSameOrigin(request)
      // Challenges, cookies and sessions never leave the gateway.
      if (path === '/auth/challenge' && request.method === 'POST') {
        try { return json(auth.challenge(await readJson(request))) }
        catch (error) { const e = error as Error & { status?: number }; return json({ error: e.message }, e.status ?? 400) }
      }
      if (path === '/auth/verify' && request.method === 'POST') {
        let result: Awaited<ReturnType<AuthService['verify']>>
        try { result = await auth.verify(await readJson(request)) }
        catch (error) { const e = error as Error & { status?: number }; return json({ error: e.message }, e.status ?? 401) }
        return json({ address: result.session.address, role: result.session.role, expiresAt: result.session.expiresAt }, 200, { 'set-cookie': result.cookie })
      }
      if (path === '/auth/session' && request.method === 'GET') {
        const session = requireSession(auth, request)
        return json({ address: session.address, role: session.role, expiresAt: session.expiresAt })
      }
      if (path === '/auth/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': auth.logout(request) })
      const publicAgents = path === '/agents' && request.method === 'GET'
      const list = path === '/jobs' && ['GET', 'POST'].includes(request.method)
      const detail = /^\/jobs\/[a-zA-Z0-9_-]+$/.test(path) && request.method === 'GET'
      const terms = /^\/jobs\/[a-zA-Z0-9_-]+\/payment-terms$/.test(path) && request.method === 'GET'
      const payment = /^\/jobs\/[a-zA-Z0-9_-]+\/payment$/.test(path) && request.method === 'POST'
      if (!publicAgents && !list && !detail && !terms && !payment) return json({ error: 'Route not found' }, 404)
      if ([...url.searchParams.keys()].some(key => key !== 'q') || (url.search && !publicAgents)) return json({ error: 'Unsupported query' }, 400)
      const session = publicAgents ? null : requireSession(auth, request, 'client')
      let body = ''
      if (request.method === 'POST') {
        const parsed = await readJson(request, payment ? 256 : 32_000)
        const keys = Object.keys(parsed)
        if (payment) {
          if (keys.length !== 1 || typeof parsed.txHash !== 'string' || !TX_HASH.test(parsed.txHash)) return json({ error: 'Expected only a valid txHash' }, 400)
        } else if (keys.some(k => !['providerId', 'title', 'brief', 'requestKey'].includes(k))) return json({ error: 'Unexpected job field' }, 400)
        body = JSON.stringify(parsed)
      }
      const target = new URL(base.href.replace(/\/$/, '') + path + url.search)
      const headers = session ? envelopeHeaders({ method: request.method, path: target.pathname + target.search, body, wallet: session.address, timestamp: now() }, options.secret) : new Headers({ accept: 'application/json' })
      const response = await requestFetch(target.href, { method: request.method, headers, ...(body ? { body } : {}), redirect: 'error', signal: AbortSignal.timeout(10_000) })
      const parsed = await readJson(response as unknown as Request, 128_000)
      if (!response.ok) {
        const error = parsed.error
        const message = typeof error === 'string' ? error : error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string' ? (error as Record<string, unknown>).message : 'Engine request failed'
        return json({ error: message }, response.status)
      }
      return json(projectResponse(parsed), response.status)
    } catch (error) {
      const e = error as Error & { status?: number }
      if (e.status) return json({ error: e.message }, e.status)
      return json({ error: 'Hiring Desk upstream unavailable' }, 502)
    }
  }
}
