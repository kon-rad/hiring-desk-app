import { getAddress, isAddress, verifyMessage, type Address, type Hex } from 'viem'
import type { MarketplaceRole } from '../src/types/marketplace'

export interface Session { id: string; address: Address; role: MarketplaceRole; expiresAt: number }
interface Challenge { address: Address; role: MarketplaceRole; nonce: string; message: string; expiresAt: number; used: boolean }

const SESSION_COOKIE = 'cybazaar_session'
const roles = new Set<MarketplaceRole>(['client', 'agent'])
const token = () => crypto.randomUUID().replaceAll('-', '')

export function normalizeWallet(value: unknown): Address {
  if (typeof value !== 'string' || !isAddress(value)) throw new Error('Invalid wallet address')
  return getAddress(value)
}

export class AuthService {
  private challenges = new Map<string, Challenge>()
  private sessions = new Map<string, Session>()
  constructor(private now: () => number = Date.now, private secureCookies = false) {}

  challenge(input: { address?: unknown; role?: unknown }) {
    const address = normalizeWallet(input.address)
    if (!roles.has(input.role as MarketplaceRole)) throw new Error('Role must be client or agent')
    const role = input.role as MarketplaceRole
    const nonce = token()
    const expiresAt = this.now() + 5 * 60_000
    const message = ['Cybazaar authentication', `Address: ${address}`, `Role: ${role}`, `Nonce: ${nonce}`, `Expires at: ${new Date(expiresAt).toISOString()}`].join('\n')
    this.challenges.set(nonce, { address, role, nonce, message, expiresAt, used: false })
    return { address, role, nonce, message, expiresAt }
  }

  async verify(input: { address?: unknown; role?: unknown; nonce?: unknown; signature?: unknown }) {
    const address = normalizeWallet(input.address)
    const role = input.role as MarketplaceRole
    const nonce = typeof input.nonce === 'string' ? input.nonce : ''
    const signature = typeof input.signature === 'string' ? input.signature as Hex : '0x'
    const challenge = this.challenges.get(nonce)
    if (!challenge || challenge.used || challenge.expiresAt <= this.now()) throw new Error('Challenge is invalid, expired, or already used')
    // Consume before the asynchronous signature check. Failed attempts cannot race or be replayed.
    challenge.used = true
    if (challenge.address !== address || challenge.role !== role || !roles.has(role)) throw new Error('Challenge binding mismatch')
    if (!await verifyMessage({ address, message: challenge.message, signature })) throw new Error('Invalid wallet signature')
    const id = token()
    const session: Session = { id, address, role, expiresAt: this.now() + 15 * 60_000 }
    this.sessions.set(id, session)
    return { session, cookie: `${SESSION_COOKIE}=${id}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=900${this.secureCookies ? '; Secure' : ''}` }
  }

  fromRequest(request: Request): Session | null {
    const raw = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1)
    if (!raw) return null
    const session = this.sessions.get(raw)
    if (!session || session.expiresAt <= this.now()) { if (session) this.sessions.delete(raw); return null }
    return session
  }

  logout(request: Request): string {
    const session = this.fromRequest(request)
    if (session) this.sessions.delete(session.id)
    return `${SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${this.secureCookies ? '; Secure' : ''}`
  }
}
