import { useCallback, useEffect, useRef, useState } from 'react'
import { authenticate } from '@/lib/marketplace-api'
import type { InjectedProvider } from '@/lib/lifecycle-wallet'
import { marketV4, paymentAction, swarmDownloadUrl, toMarketSettlement } from '@/lib/market-v4'
import { clearPayment, pendingPayment, rememberPayment } from '@/lib/market-pending'
import type { MarketJob, MarketTerms } from '@/types/market-v4'
import { SettlementFlow } from '@/components/settlement/SettlementFlow'

const labels = { triage: 'Awaiting operator approval', active: 'Work in progress', review: 'Operator reviewing the private file', released: 'Summary released', paid: 'Paid', cancelled: 'Cancelled' }
export function MarketJobSummary({ job }: { job: MarketJob }) {
  const steps = ['triage', 'active', 'review', 'released', 'paid'] as const
  return <section className="cyba-job-overview"><p className="cyba-eyebrow">Commission / {job.id}</p><h2>{job.title}</h2><p className="cyba-state">{labels[job.status]}</p><ol className="cyba-spine" aria-label="Commission progress">{steps.map((state, i) => <li key={state} data-complete={job.status !== 'cancelled' && steps.indexOf(job.status as typeof state) >= i}><span className="cyba-spine-dot"/><span>{labels[state]}</span></li>)}</ol>{job.summary && ['released', 'paid'].includes(job.status) ? <><h3>Reviewed summary</h3><p className="cyba-prewrap">{job.summary}</p><p className="cyba-muted cyba-mono">Reviewed SHA-256: {job.artifactSha256}</p></> : <p>The operator approves the request and reviews the private MP4 before releasing a summary.</p>}</section>
}
export function MarketJobPage({ jobRef }: { jobRef: string }) {
  const [job, setJob] = useState<MarketJob | null>(null)
  const [terms, setTerms] = useState<MarketTerms | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<string | null>(() => typeof window === 'undefined' ? null : pendingPayment(sessionStorage, jobRef))
  const generation = useRef(0)
  const active = useRef(true)
  const load = useCallback(async (hash?: string) => {
    const epoch = ++generation.current; setBusy(true); setError('')
    try {
      let next = await marketV4.job(jobRef)
      const hint = hash ?? next.paymentTx ?? next.pendingPaymentTx ?? pendingPayment(sessionStorage, jobRef)
      if (hint && next.status !== 'cancelled' && !(next.status === 'paid' && next.downloadRef)) next = await marketV4.payment(jobRef, hint)
      let nextTerms: MarketTerms | null = null
      if (next.status === 'released' && !next.paymentTx && !next.pendingPaymentTx && !hint) {
        const response = await marketV4.terms(jobRef); next = response.job; nextTerms = response.terms
      }
      if (!active.current || epoch !== generation.current) return
      setJob(next); setTerms(nextTerms)
      if (next.status === 'paid' && next.downloadRef) { clearPayment(sessionStorage, jobRef); setPending(null) }
      else if (hint) setPending(hint)
    } catch (e) {
      // A definitive engine rejection can clear a browser hint only after a fresh
      // server read confirms that no pending/verified receipt remains reserved.
      if ((e as { status?: number }).status === 409) {
        try {
          const current = await marketV4.job(jobRef)
          if (current.status === 'released' && !current.pendingPaymentTx && !current.paymentTx && !current.deliveryPending && active.current && epoch === generation.current) {
            clearPayment(sessionStorage, jobRef); setPending(null); setJob(current)
          }
        } catch { /* Keep the uncertain hash and suppress a second Pay action. */ }
      }
      if (active.current && epoch === generation.current) { setError(e instanceof Error ? e.message : 'Commission unavailable'); setTerms(null) }
    }
    finally { if (active.current && epoch === generation.current) setBusy(false) }
  }, [jobRef])
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; generation.current++ } }, [load])
  useEffect(() => {
    if (!job || (!pending && !job.paymentTx && !job.pendingPaymentTx && !job.deliveryPending)) return
    const timer = setInterval(() => void load(), 5000)
    return () => clearInterval(timer)
  }, [job, pending, load])
  async function signIn() {
    try { setError(''); const provider = (window as Window & { ethereum?: InjectedProvider }).ethereum; if (!provider) throw new Error('Connect an EIP-1193 wallet first.'); await authenticate(provider, 'client'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed') }
  }
  const action = job ? paymentAction(job, pending) : 'wait'
  const download = job && action === 'download' ? swarmDownloadUrl(job.downloadRef!) : null
  return <div className="cyba-job-page">{job ? <MarketJobSummary job={job}/> : <section className="cyba-job-overview"><h2>Commission</h2><p>{busy ? 'Loading commission…' : 'Sign in with the wallet that owns this commission.'}</p></section>}<aside className="cyba-payment-rail" aria-label="Payment and next action"><p className="cyba-eyebrow">Next action</p>{error && <p role="alert" className="cyba-error">{error}</p>}
    {!job || error ? <button className="cyba-button" onClick={() => void signIn()}>Sign in and refresh</button> : null}
    {action === 'pay' && terms && !error ? <SettlementFlow key={JSON.stringify(terms)} job={toMarketSettlement(terms)} mode="external" onTransactionSubmitted={hash => { setPending(hash); setTerms(null); try { rememberPayment(sessionStorage, jobRef, hash) } catch { setError('Keep this transaction hash before leaving: ' + hash) } void load(hash) }}/> : null}
    {action === 'wait' && job ? <p role="status">Payment becomes available after the operator releases the reviewed summary. The file stays private.</p> : null}
    {action === 'cancelled' ? <p role="status">This commission is cancelled. No payment is requested.</p> : null}
    {(action === 'reconcile' || action === 'delivery-pending') ? <div role="status"><h3>{job?.paymentTx ? 'Payment recorded, delivery pending' : 'Checking submitted payment'}</h3><p>Do not pay again. Verification and delivery resume from the server record.</p>{(pending || job?.paymentTx) && <p className="cyba-mono">{job?.paymentTx ?? pending}</p>}</div> : null}
    {download && job ? <div><h3>Verified delivery</h3><p>The server verified payment and the file hash before unlocking this reference.</p><a className="cyba-button" href={download} target="_blank" rel="noopener noreferrer">Download reviewed MP4</a><p className="cyba-mono">{job.downloadRef}</p>{job.paymentTx && <a href={`https://basescan.org/tx/${job.paymentTx}`} target="_blank" rel="noopener noreferrer">View verified Base payment</a>}{job.evidenceRefs?.map(ref => <p className="cyba-mono" key={ref}>{ref}</p>)}</div> : null}
    <button className="cyba-button cyba-button-outline" disabled={busy} onClick={() => void load()}>{busy ? 'Refreshing…' : 'Refresh server status'}</button>
  </aside></div>
}
