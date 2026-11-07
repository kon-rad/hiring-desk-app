import { resolveApiBase, type DeskEnv } from './hiring-desk-api'
import { validatePublicationIntent, type PublicationIntent } from './lifecycle-wallet'
export interface JobDraft { brief: string; skill: string; budgetAtomic: string; deadline: number }
export interface PublicItem { ref: string; record: Record<string, unknown>; creator: string; finalized: boolean }
export type ReadResult<T> = { state: 'ready'; value: T } | { state: 'unavailable'; message: string }
/** Chain integration supplies these operations. No speculative HTTP prepare/submit endpoints. */
export interface PublicationAdapter {
  prepare(action: PublicationIntent['action'], input: JobDraft | { jobRef: string; offerRef: string }, signer: string): Promise<PublicationIntent>
  submit(intentRef: string, txHash: string): Promise<void>
  reconcile(intentRef: string): Promise<{ state: 'pending' | 'confirmed' | 'failed'; message: string }>
}
export function validateIntentForRequest(intent: PublicationIntent, action: PublicationIntent['action'], input: JobDraft | { jobRef: string; offerRef: string }, signer: string): void {
  validatePublicationIntent(intent)
  if (intent.signer.toLowerCase() !== signer.toLowerCase() || intent.action !== action ||
      (action === 'accept-offer' && (intent.jobRef !== (input as { jobRef: string }).jobRef || intent.offerRef !== (input as { offerRef: string }).offerRef)) ||
      (action === 'post-job' && ['brief', 'skill', 'budgetAtomic', 'deadline'].some(key => intent.payload[key] !== (input as unknown as Record<string, unknown>)[key]))) throw new Error('Prepared transaction does not match the reviewed client action, offer or normalized draft.')
}
export function validDraft(draft: JobDraft): boolean {
  return draft.brief.trim().length > 0 && draft.brief.length <= 8000 && draft.skill.trim().length > 0 && /^(?:[1-9][0-9]*)$/.test(draft.budgetAtomic) && draft.budgetAtomic.length <= 78 && Number.isSafeInteger(draft.deadline) && draft.deadline * 1000 > Date.now()
}
function item(value: unknown): value is PublicItem {
  if (!value || typeof value !== 'object') return false
  const v = value as PublicItem
  return typeof v.ref === 'string' && typeof v.creator === 'string' && typeof v.finalized === 'boolean' && !!v.record && typeof v.record === 'object' && !Array.isArray(v.record) && v.record.version === 'desk/v1'
}
export function createLifecycleReader(env: DeskEnv = import.meta.env, fetcher: typeof fetch = fetch) {
  async function read(path: string): Promise<ReadResult<unknown>> {
    const base = resolveApiBase(env)
    if (!base.ok) return { state: 'unavailable', message: base.message }
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetcher(`${base.url.replace(/\/$/, '')}/${path}`, { credentials: 'omit', headers: { Accept: 'application/json' }, signal: controller.signal, cache: 'no-store' })
      if (!response.ok) throw new Error('Public Hiring Desk is unavailable. Retry when the service is ready.')
      const body = await response.json()
      if (!body || typeof body !== 'object' || !('value' in body)) throw new Error('Public Hiring Desk returned an unsupported response.')
      return { state: 'ready', value: body.value }
    } catch (error) { return { state: 'unavailable', message: error instanceof Error ? error.message : 'Public reader unavailable.' } }
    finally { clearTimeout(timer) }
  }
  async function observations(path: string): Promise<ReadResult<PublicItem[]>> {
    const result = await read(path)
    if (result.state === 'unavailable') return result
    if (!Array.isArray(result.value) || result.value.length > 1000 || !result.value.every(item)) return { state: 'unavailable', message: 'Public records failed validation.' }
    return { state: 'ready', value: result.value }
  }
  return {
    jobs: async (): Promise<ReadResult<PublicItem[]>> => {
      const result = await observations('jobs')
      return result.state === 'ready' && result.value.some(item => item.record.type !== 'job') ? { state: 'unavailable', message: 'Expected public job records.' } : result
    },
    offers: async (ref: string): Promise<ReadResult<PublicItem[]>> => {
      const result = await observations(`jobs/${encodeURIComponent(ref)}/offers`)
      return result.state === 'ready' && result.value.some(item => item.record.type !== 'offer' || item.record.jobRef !== ref || typeof item.record.provider !== 'string' || item.record.provider.toLowerCase() !== item.creator.toLowerCase()) ? { state: 'unavailable', message: 'Offer authority or job binding failed validation.' } : result
    },
    inspect: (ref: string) => read(`jobs/${encodeURIComponent(ref)}`),
  }
}
