/** Minimal public API gateway. Payment authority remains in Argo. */
export function createHandler(upstream: string, requestFetch: typeof fetch = fetch) {
  const base = new URL(upstream)
  if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') {
    throw new Error('HIRING_DESK_UPSTREAM must use HTTPS')
  }
  if (base.username || base.password || base.search || base.hash) throw new Error('Invalid upstream URL')
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ service: 'hiring-desk-gateway', status: 'ok', paymentAuthority: 'Argo' })
    }
    const path = url.pathname.slice(4)
    const read = request.method === 'GET' && /^\/jobs(?:\/[^/]+(?:\/(?:payment|offers))?)?$/.test(path)
    const write = request.method === 'POST' && /^\/jobs\/[^/]+\/payments\/(?:verify|reconcile)$/.test(path)
    if (!url.pathname.startsWith('/api/') || (!read && !write)) return json({ error: 'Route not found' }, 404)
    let body: string | undefined
    if (write) {
      // Read a bounded stream, even when Content-Length is absent or forged.
      const reader = request.body?.getReader()
      let size = 0
      const chunks: Uint8Array[] = []
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.length
          if (size > 256) { await reader.cancel(); return json({ error: 'Body too large' }, 413) }
          chunks.push(value)
        }
      }
      try {
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
        const input = JSON.parse(new TextDecoder().decode(bytes))
        if (!input || Object.keys(input).length !== 1 || !/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) throw new Error()
        body = JSON.stringify({ txHash: input.txHash })
      } catch { return json({ error: 'Expected only a valid txHash' }, 400) }
    }
    try {
      const response = await requestFetch(`${base.href.replace(/\/$/, '')}${path}${url.search}`, {
        method: request.method,
        headers: { accept: 'application/json', ...(write ? { 'content-type': 'application/json' } : {}) },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
      // Forward JSON only, never upstream cookies, credentials or arbitrary headers.
      return json(await response.json(), response.status)
    } catch { return json({ error: 'Argo API unavailable' }, 502) }
  }
}
