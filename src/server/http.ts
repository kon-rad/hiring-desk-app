import { cookies, headers } from 'next/headers'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getAddress, verifyMessage, type Address } from 'viem'
import { db, query } from './db'

const COOKIE = 'cybazaar_session'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export type Principal = { address: Address }
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
export const apiError = (message: string, status = 400) => json({ error: { message } }, status)
export class HttpError extends Error { constructor(message:string,public readonly status:number){super(message)} }
export function normalizeAddress(value: unknown): Address { if (typeof value !== 'string') throw new Error('Wallet address required'); return getAddress(value) }
export async function originForRequest() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const protocol = h.get('x-forwarded-proto')?.split(',')[0] ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  const expected = process.env.CYBA_PUBLIC_ORIGIN ?? `${protocol}://${host}`
  const supplied = h.get('origin')
  if (supplied && new URL(supplied).origin !== new URL(expected).origin) throw new Error('Request origin is not allowed')
  return new URL(expected).origin
}

export async function createChallenge(value: unknown) {
  const address = normalizeAddress(value)
  const origin = await originForRequest()
  const nonce = randomBytes(24).toString('hex')
  const recent=await query('SELECT count(*)::int AS count FROM cyba_auth_challenges WHERE address=$1 AND created_at>now()-interval \'5 minutes\'',[address.toLowerCase()])
  if(Number(recent.rows[0]?.count??0)>=10)throw new HttpError('Too many sign-in attempts. Try again in a few minutes.',429)
  const issuedAt = new Date()
  const expires = new Date(Date.now() + 300_000)
  const message = `Cybazaar wants you to sign in with your Ethereum account:\n${address}\n\nSign in to Cybazaar. This signature does not authorize a transaction.\n\nURI: ${origin}\nVersion: 1\nChain ID: 8453\nNonce: ${nonce}\nIssued At: ${issuedAt.toISOString()}\nExpiration Time: ${expires.toISOString()}`
  await query('INSERT INTO cyba_auth_challenges(address,nonce_hash,message,origin,expires_at) VALUES($1,$2,$3,$4,$5)', [address.toLowerCase(), hash(nonce), message, origin, expires])
  return { address, nonce, message, expiresAt: expires.toISOString() }
}

export async function verifyChallenge(input: { address?: unknown; nonce?: unknown; signature?: unknown; clientMode?: unknown }) {
  const address = normalizeAddress(input.address)
  if (typeof input.nonce !== 'string' || typeof input.signature !== 'string') throw new Error('Address, nonce, and signature are required')
  const origin = await originForRequest()
  const client = await db.connect()
  let sessionToken = ''
  try {
    await client.query('BEGIN')
    const result = await client.query('SELECT id,message,origin,expires_at,consumed_at FROM cyba_auth_challenges WHERE address=$1 AND nonce_hash=$2 FOR UPDATE', [address.toLowerCase(), hash(input.nonce)])
    const row = result.rows[0]
    if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now() || row.origin !== origin) throw new Error('Challenge expired or invalid')
    await client.query('UPDATE cyba_auth_challenges SET consumed_at=now() WHERE id=$1', [row.id])
    if (!await verifyMessage({ address, message: row.message, signature: input.signature as `0x${string}` })) throw new Error('Wallet signature is invalid')
    await client.query('INSERT INTO cyba_accounts(wallet) VALUES($1) ON CONFLICT(wallet) DO UPDATE SET last_seen_at=now()', [address.toLowerCase()])
    sessionToken = randomBytes(32).toString('base64url')
    await client.query("INSERT INTO cyba_sessions(token_hash,wallet,expires_at) VALUES($1,$2,now()+interval '7 days')", [hash(sessionToken), address.toLowerCase()])
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
  ;(await cookies()).set(COOKIE, sessionToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 604800 })
  return { address, ...(input.clientMode === true ? { accessToken: sessionToken } : {}) }
}

export async function requirePrincipal(): Promise<Principal | null> {
  const token = (await cookies()).get(COOKIE)?.value ?? (await headers()).get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null
  const found = await query('SELECT wallet FROM cyba_sessions WHERE token_hash=$1 AND expires_at>now()', [hash(token)])
  return found.rowCount ? { address: getAddress(String(found.rows[0].wallet)) } : null
}
export async function logout() {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (token) await query('DELETE FROM cyba_sessions WHERE token_hash=$1', [hash(token)])
  store.set(COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
}
export async function integrationForRequest(request: Request) {
  const expected = process.env.CYBA_ARGO_INTEGRATION_SECRET ?? ''
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!expected || !supplied) return null
  const a = Buffer.from(hash(expected)), b = Buffer.from(hash(supplied))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const integration = await query<{id:string}>('SELECT id FROM cyba_integrations WHERE secret_hash=$1 AND enabled=true AND revoked_at IS NULL LIMIT 1', [hash(supplied)])
  return integration.rows[0]?.id ?? null
}
