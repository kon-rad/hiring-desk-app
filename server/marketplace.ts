import { getAddress, isAddress, type Address, type Hash } from 'viem'
import { BASE_MAINNET_CONFIG, formatBaseUnits } from '../src/settlement'
import { PAYMENT_INTERFACE_ID } from '../src/types/desk'
import type { AgentProfile, JobRequest, JobResult, PaymentTerms } from '../src/types/marketplace'
import type { Session } from './auth'

const clean = (value: unknown, max: number, label: string): string => {
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
  const text = value.trim()
  if (!text || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error(`${label} is invalid`)
  return text
}
const address = (value: unknown, label: string): Address => {
  if (typeof value !== 'string' || !isAddress(value)) throw new Error(`${label} is invalid`)
  return getAddress(value)
}
const own = (session: Session, role: Session['role']) => { if (session.role !== role) throw Object.assign(new Error(`${role} role required`), { status: 403 }) }
const denied = (message: string) => Object.assign(new Error(message), { status: 403 })
const conflict = (message: string) => Object.assign(new Error(message), { status: 409 })

function parameters(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('parameters must be an object')
  const encoded = JSON.stringify(value)
  if (encoded.length > 16_000 || /"(?:__proto__|prototype|constructor)"\s*:/.test(encoded)) throw new Error('parameters are unsafe or too large')
  return JSON.parse(encoded) as Record<string, unknown>
}
function artifactUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined
  const raw = clean(value, 2048, 'artifactUrl')
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('artifactUrl must be a valid HTTPS URL') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('artifactUrl must be a credential-free HTTPS URL')
  return url.href
}

export type PaymentCheck =
  | { status: 'confirmed'; txHash: Hash; blockNumber: string; explorerUrl: string }
  | { status: 'pending'; txHash: Hash; confirmations: number; requiredConfirmations: number; warning: string | null }
  | { status: 'failed'; txHash: Hash | null; code: string; message: string; retryable: boolean }

export interface PaymentVerifierInput { jobId: string; txHash: Hash; sender: Address; recipient: Address; amountBaseUnits: bigint }
export type PaymentVerifier = (input: PaymentVerifierInput) => Promise<PaymentCheck>

/** Explicit local-development store. It is never selected implicitly in production. */
export class MemoryMarketplace {
  readonly agents = new Map<string, AgentProfile>()
  readonly jobs = new Map<string, JobRequest>()
  private txOwners = new Map<string, string>()
  constructor(private now: () => number = Date.now) {}

  putProfile(session: Session, input: Record<string, unknown>): AgentProfile {
    own(session, 'agent')
    const skillsRaw = input.skills
    if (!Array.isArray(skillsRaw) || skillsRaw.length < 1 || skillsRaw.length > 20) throw new Error('skills must contain 1-20 values')
    const profile: AgentProfile = {
      address: session.address, role: 'agent', displayName: clean(input.displayName, 80, 'displayName'), bio: clean(input.bio, 2000, 'bio'),
      skills: [...new Set(skillsRaw.map(v => clean(v, 80, 'skill').toLowerCase()))], payoutAddress: address(input.payoutAddress, 'payoutAddress'),
    }
    this.agents.set(session.address.toLowerCase(), profile)
    return profile
  }

  listAgents(query = ''): AgentProfile[] {
    const q = query.trim().toLowerCase().slice(0, 100)
    return [...this.agents.values()].filter(a => !q || `${a.displayName} ${a.bio} ${a.skills.join(' ')}`.toLowerCase().includes(q))
  }
  agent(value: string): AgentProfile | null { try { return this.agents.get(getAddress(value).toLowerCase()) ?? null } catch { return null } }

  createJob(session: Session, input: Record<string, unknown>): JobRequest {
    own(session, 'client')
    const budget = typeof input.budgetBaseUnits === 'string' ? input.budgetBaseUnits : ''
    if (!/^[1-9][0-9]{0,77}$/.test(budget)) throw new Error('budgetBaseUnits must be a positive integer string')
    const deadline = input.deadline
    if (!Number.isSafeInteger(deadline) || (deadline as number) * 1000 <= this.now()) throw new Error('deadline must be a future Unix timestamp')
    const id = crypto.randomUUID()
    const job: JobRequest = { id, clientAddress: session.address, agentAddress: null, skill: clean(input.skill, 80, 'skill').toLowerCase(), title: clean(input.title, 120, 'title'), description: clean(input.description, 8000, 'description'), budgetBaseUnits: budget, deadline: deadline as number, parameters: parameters(input.parameters), state: 'open', result: null, review: null, paymentTxHash: null, createdAt: this.now() }
    this.jobs.set(id, job)
    return job
  }

  publicJobs(query = ''): JobRequest[] {
    const q = query.trim().toLowerCase().slice(0, 100)
    return [...this.jobs.values()].filter(j => ['open', 'hired'].includes(j.state) && (!q || `${j.skill} ${j.title} ${j.description}`.toLowerCase().includes(q))).map(j => ({ ...j, parameters: {}, result: null }))
  }
  getJob(session: Session, id: string): JobRequest {
    const job = this.jobs.get(id)
    if (!job) throw Object.assign(new Error('Job not found'), { status: 404 })
    if (job.clientAddress !== session.address && job.agentAddress !== session.address) throw denied('Job ownership required')
    return job
  }
  /** The agent can inspect its submission; the client receives it only after verified payment. */
  visibleJob(session: Session, id: string): JobRequest {
    const job = this.getJob(session, id)
    return session.role === 'client' && job.state !== 'paid' ? { ...job, result: null } : job
  }
  hire(session: Session, id: string, input: Record<string, unknown>): JobRequest {
    own(session, 'client'); const job = this.getJob(session, id)
    if (job.state !== 'open') throw conflict('Only an open job can be hired')
    const agent = this.agent(String(input.agentAddress ?? ''))
    if (!agent) throw new Error('Agent profile not found')
    job.agentAddress = agent.address; job.state = 'hired'; return job
  }
  claim(session: Session, id: string): JobRequest {
    own(session, 'agent'); const job = this.getJob(session, id)
    if (job.agentAddress !== session.address) throw denied('Only the selected agent can accept this job')
    if (job.state !== 'hired') throw conflict('Only a hired job can be accepted')
    job.state = 'accepted'; return job
  }
  submit(session: Session, id: string, input: Record<string, unknown>): JobRequest {
    own(session, 'agent'); const job = this.getJob(session, id)
    if (job.state !== 'accepted') throw conflict('Only an accepted job can receive a result')
    if (this.now() > job.deadline * 1000) throw conflict('Job deadline has passed')
    const contentType = input.contentType
    if (contentType !== 'text/plain' && contentType !== 'application/json') throw new Error('Unsupported result contentType')
    const content = clean(input.content, 20_000, 'content')
    if (contentType === 'application/json') { try { JSON.parse(content) } catch { throw new Error('JSON result content is invalid') } }
    const result: JobResult = { contentType, content, artifactUrl: artifactUrl(input.artifactUrl), submittedAt: this.now() }
    job.result = result; job.state = 'submitted'; return job
  }
  review(session: Session, id: string, input: Record<string, unknown>): JobRequest {
    own(session, 'client'); const job = this.getJob(session, id)
    if (job.state !== 'submitted') throw conflict('A submitted result is required before review')
    if (!Number.isInteger(input.rating) || Number(input.rating) < 1 || Number(input.rating) > 5) throw new Error('rating must be an integer from 1 to 5')
    job.review = { rating: Number(input.rating), comment: clean(input.comment, 2000, 'comment'), createdAt: this.now() }; job.state = 'reviewed'; return job
  }
  terms(session: Session, id: string): PaymentTerms {
    own(session, 'client'); const job = this.getJob(session, id)
    if (!['submitted', 'reviewed', 'paid'].includes(job.state) || !job.agentAddress) throw conflict('Job is not payable')
    const agent = this.agent(job.agentAddress)
    if (!agent) throw conflict('Agent payout profile is unavailable')
    return { jobKey: job.id, jobReference: job.id, deliverableUrl: job.state === 'paid' ? job.result?.artifactUrl ?? '' : '', recipientName: agent.displayName, recipientAddress: agent.payoutAddress, clientAddress: job.clientAddress, chainId: 8453, tokenAddress: BASE_MAINNET_CONFIG.token.address, amountBaseUnits: job.budgetBaseUnits, amountDisplay: formatBaseUnits(8453, BigInt(job.budgetBaseUnits)), interfaceId: PAYMENT_INTERFACE_ID }
  }
  async verifyPayment(session: Session, id: string, txHash: Hash, verifier: PaymentVerifier): Promise<PaymentCheck> {
    const terms = this.terms(session, id)
    const job = this.getJob(session, id)
    if (job.paymentTxHash && job.paymentTxHash.toLowerCase() !== txHash.toLowerCase()) throw conflict('Job already has a different payment transaction')
    const owner = this.txOwners.get(txHash.toLowerCase())
    if (owner && owner !== id) throw conflict('Transaction is already bound to another job')
    // Reserve before RPC work. Pending and mismatched hashes remain bound for safe reconciliation.
    this.txOwners.set(txHash.toLowerCase(), id); job.paymentTxHash = txHash
    const result = await verifier({ jobId: id, txHash, sender: terms.clientAddress, recipient: terms.recipientAddress, amountBaseUnits: BigInt(terms.amountBaseUnits) })
    if (result.status === 'confirmed') job.state = 'paid'
    if (result.status === 'failed' && result.code === 'REVERTED') { this.txOwners.delete(txHash.toLowerCase()); job.paymentTxHash = null }
    return result
  }
}
