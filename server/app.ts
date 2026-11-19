import type { Hash } from 'viem'
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

/** Production facade: fixed upstream, route allow-list, bounded bodies, no fixture fallback. */
export function createHandler(upstream: string, requestFetch: typeof fetch = fetch) {
  const base = new URL(upstream)
  if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') throw new Error('HIRING_DESK_UPSTREAM must use HTTPS')
  if (base.username || base.password || base.search || base.hash) throw new Error('Invalid upstream URL')
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ service: 'cybazaar-gateway', status: 'ok', durableAuthority: 'HIRING_DESK_UPSTREAM', chainId: 8453 })
    if (!url.pathname.startsWith('/api/')) return json({ error: 'Route not found' }, 404)
    const path = url.pathname.slice(4)
    const allowed = /^(?:\/auth\/(?:challenge|verify|session|logout)|\/profile|\/agents(?:\/[^/]+)?|\/jobs(?:\/[^/]+(?:\/(?:hire|claim|result|reviews|payment|payments\/(?:verify|reconcile)))?)?)$/.test(path)
    if (!allowed || !['GET', 'POST', 'PUT'].includes(request.method)) return json({ error: 'Route not found' }, 404)
    let body: string | undefined
    if (request.method !== 'GET') {
      try {
        const parsed = await readJson(request, path.includes('/payments/') ? 256 : 32_000)
        if (path.includes('/payments/') && (Object.keys(parsed).length !== 1 || typeof parsed.txHash !== 'string' || !TX_HASH.test(parsed.txHash))) throw Object.assign(new Error('Expected only a valid txHash'), { status: 400 })
        body = JSON.stringify(parsed)
      } catch (error) { const e = error as Error & { status?: number }; return json({ error: e.message }, e.status ?? 400) }
    }
    try {
      const headers = new Headers({ accept: 'application/json' }); if (body) headers.set('content-type', 'application/json')
      const cookie = request.headers.get('cookie')
      if (cookie && (path.startsWith('/auth/') || path === '/profile' || path.startsWith('/jobs'))) headers.set('cookie', cookie)
      const response = await requestFetch(`${base.href.replace(/\/$/, '')}${path}${url.search}`, { method: request.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(10_000) })
      const responseHeaders: HeadersInit = {}; const setCookie = response.headers.get('set-cookie'); if (setCookie) responseHeaders['set-cookie'] = setCookie
      return json(hideUnpaidDelivery(path, await response.json()), response.status, responseHeaders)
    } catch { return json({ error: 'Hiring Desk upstream unavailable' }, 502) }
  }
}
