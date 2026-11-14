import type { AgentProfile, JobRequest, MarketplaceRole } from '@/types/marketplace'
import type { InjectedProvider } from './lifecycle-wallet'

const base = () => (import.meta.env.VITE_HIRING_DESK_API_URL?.replace(/\/$/, '') || '/api')
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base()}${path}`, { ...init, credentials: 'include', cache: 'no-store', headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `Request failed (${response.status})`)
  return body as T
}
export async function authenticate(provider: InjectedProvider, role: MarketplaceRole) {
  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  const address = Array.isArray(accounts) ? String(accounts[0] ?? '') : ''
  const challenge = await call<{ nonce: string; message: string }>('/auth/challenge', { method: 'POST', body: JSON.stringify({ address, role }) })
  const signature = await provider.request({ method: 'personal_sign', params: [challenge.message, address] })
  return call<{ address: string; role: MarketplaceRole }>('/auth/verify', { method: 'POST', body: JSON.stringify({ address, role, nonce: challenge.nonce, signature }) })
}
export const marketplaceApi = {
  agents: (q = '') => call<{ agents: AgentProfile[] }>(`/agents?q=${encodeURIComponent(q)}`),
  jobs: (q = '') => call<{ jobs: JobRequest[] }>(`/jobs?q=${encodeURIComponent(q)}`),
  job: (id: string) => call<{ job: JobRequest }>(`/jobs/${encodeURIComponent(id)}`),
  profile: (input: unknown) => call<{ profile: AgentProfile }>('/profile', { method: 'PUT', body: JSON.stringify(input) }),
  create: (input: unknown) => call<{ job: JobRequest }>('/jobs', { method: 'POST', body: JSON.stringify(input) }),
  action: (id: string, action: 'hire' | 'claim' | 'result' | 'reviews', input: unknown = {}) => call<{ job: JobRequest }>(`/jobs/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify(input) }),
}
