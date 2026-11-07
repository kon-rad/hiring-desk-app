import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, FullValue, PrimaryButton, Row } from '@/components/settlement/ui'
import { createLifecycleReader, validDraft, validateIntentForRequest, type JobDraft, type PublicationAdapter, type PublicItem } from '@/lib/lifecycle-api'
import { readPendingPublication, writePendingPublication, reconcilePendingPublication, type PendingPublication } from '@/lib/lifecycle-pending'
import { LifecycleWallet, type InjectedProvider, type PublicationIntent } from '@/lib/lifecycle-wallet'

const unavailable = 'Wallet publication is unavailable until Argo provides the reviewed public transaction adapter. Your draft is not posted.'
function text(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value) : 'Unavailable' }
/** Public marketplace. Publication integration is explicit; no hidden global signer or fixture fallback. */
export function HiringBoard({ publication }: { publication?: PublicationAdapter }) {
  const reader = useMemo(() => createLifecycleReader(), [])
  const [jobs, setJobs] = useState<PublicItem[]>([]), [offers, setOffers] = useState<PublicItem[]>([])
  const [jobState, setJobState] = useState<Record<string, unknown> | null>(null)
  const [message, setMessage] = useState('Loading public jobs…'), [selected, setSelected] = useState('')
  const [draft, setDraft] = useState<JobDraft>({ brief: '', skill: '', budgetAtomic: '', deadline: 0 })
  const [walletAddress, setWalletAddress] = useState(''), [intent, setIntent] = useState<PublicationIntent | null>(null)
  const [pending, setPending] = useState<PendingPublication | null>(() => readPendingPublication()), [busy, setBusy] = useState(false)
  useEffect(() => { writePendingPublication(pending) }, [pending])
  const wallet = useRef<LifecycleWallet | null>(null)
  const generation = useRef(0)
  useEffect(() => { let active = true; void reader.jobs().then(result => { if (!active) return; if (result.state === 'ready') { setJobs(result.value); setMessage(result.value.length ? 'Public job records loaded. Open a job to review its offer and evidence.' : 'No public jobs are available.'); } else setMessage(result.message) }); return () => { active = false; generation.current++; wallet.current?.dispose() } }, [reader])
  function invalidate() { generation.current++; setIntent(null); setWalletAddress(''); setMessage('Wallet account or network changed. Connect and review again. Submitted transactions still need reconciliation.') }
  async function connect() {
    try {
      const provider = (window as Window & { ethereum?: InjectedProvider }).ethereum
      if (!provider) throw new Error('Install an EIP-1193 browser wallet to connect.')
      wallet.current?.dispose(); wallet.current = new LifecycleWallet(provider, invalidate)
      setWalletAddress(await wallet.current.connect()); setIntent(null); setMessage('Wallet connected. No transaction has been signed.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Wallet unavailable.') }
  }
  async function run(operation: () => Promise<void>) { if (busy) return; setBusy(true); try { await operation() } catch (error) { setMessage(error instanceof Error ? error.message : 'Action unavailable. Check public state before retrying.') } finally { setBusy(false) } }
  async function prepare(action: 'post-job' | 'accept-offer', input: JobDraft | { jobRef: string; offerRef: string }) {
    setIntent(null)
    if (!publication) { setMessage(unavailable); return }
    if (!walletAddress || !wallet.current) throw new Error('Connect the client wallet first.')
    const current = generation.current
    const prepared = await publication.prepare(action, input, walletAddress)
    if (current !== generation.current) throw new Error('Wallet changed while preparing. Start a new review.')
    validateIntentForRequest(prepared, action, input, walletAddress)
    wallet.current.review(prepared); setIntent(prepared); setMessage('Review every authoritative field below before signing.')
  }
  async function inspect(ref: string) {
    setSelected(ref); setOffers([]); setJobState(null); setIntent(null); generation.current++
    const current = generation.current
    const [result, state] = await Promise.all([reader.offers(ref), reader.inspect(ref)])
    if (current !== generation.current) return
    if (state.state === 'ready' && state.value && typeof state.value === 'object' && !Array.isArray(state.value)) setJobState(state.value as Record<string, unknown>)
    if (result.state === 'ready') { setOffers(result.value); setMessage('Offers loaded from Argo. Acceptance requires a reviewed wallet publication.'); } else setMessage(result.message)
  }
  async function reconcile() {
    if (!pending) return
    if (!publication) throw new Error('Publication adapter unavailable. Keep this transaction reference; it is not confirmation.')
    // Re-register the same hash idempotently before reconciling, including after a failed submit call or reload.
    const result = await reconcilePendingPublication(publication, pending)
    setMessage(result.message)
    if (result.state === 'confirmed') { setPending(null); const jobs = await reader.jobs(); if (jobs.state === 'ready') setJobs(jobs.value) }
  }
  return <>
    <Card><h2 className="font-display text-2xl">Hire an agent</h2><p className="mt-2 text-sm text-ink/70">Review a public job and its offer, authorize the work, then pay after delivery. Payment is a direct transfer, not escrow.</p><p role="status" className="mt-4 break-words text-sm">{message}</p><div className="mt-4"><PrimaryButton disabled={busy} onClick={() => { void run(connect) }}>Connect client wallet</PrimaryButton></div>{walletAddress && <dl><Row label="Connected client"><FullValue value={walletAddress} /></Row></dl>}</Card>
    <Card><h2 className="font-display text-xl">Public jobs</h2><p className="my-2 text-sm text-ink/70">Refresh reloads public records from Argo. Browser storage never decides job or payment status.</p>{jobs.map(job => <article key={job.ref} className="border-t border-ink/10 py-4"><h3 className="font-semibold">{text(job.record.skill)}</h3><p className="my-2 whitespace-pre-wrap text-sm">{text(job.record.brief)}</p><dl><Row label="Job"><FullValue value={job.ref} /></Row><Row label="Author"><FullValue value={job.creator} /></Row><Row label="Budget base units">{text(job.record.budgetAtomic)} {text(job.record.asset)}</Row><Row label="Record">{job.finalized ? 'Finalized public record' : 'Pending public record'}</Row></dl><PrimaryButton disabled={busy || !job.finalized} onClick={() => { void run(() => inspect(job.ref)) }}>Review offers and job</PrimaryButton></article>)}</Card>
    {selected && <Card><h2 className="font-display text-xl">Offer review</h2><FullValue value={selected} />{jobState && <dl>{['stage', 'acceptanceRef', 'claimRef', 'deliveryRef'].map(key => <Row key={key} label={key}><span className="break-all">{text(jobState[key])}</span></Row>)}</dl>}{!offers.length && <p className="mt-3 text-sm">No verified offers loaded.</p>}{offers.map(offer => <article key={offer.ref} className="mt-4 border-t border-ink/10"><dl>{[['Offer', offer.ref], ['Provider identity', offer.record.providerId], ['Provider wallet', offer.record.provider], ['Recipient', offer.record.recipient], ['Amount base units', offer.record.amountAtomic], ['Asset', offer.record.asset], ['Payment chain', offer.record.paymentChainId], ['Expires at (Unix seconds)', offer.record.expiresAt]].map(([label, value]) => <Row key={text(label)} label={text(label)}><span className="break-all">{text(value)}</span></Row>)}</dl><PrimaryButton disabled={busy || !offer.finalized || jobState?.conflict === true || typeof offer.record.expiresAt !== 'number' || offer.record.expiresAt * 1000 <= Date.now()} onClick={() => { void run(() => prepare('accept-offer', { jobRef: selected, offerRef: offer.ref })) }}>Review acceptance</PrimaryButton></article>)}<a className="mt-4 inline-block text-sm underline" href={`/pay/${encodeURIComponent(selected)}`}>Open payment after delivery</a></Card>}
    <Card><h2 className="font-display text-xl">Post a job</h2><p className="mt-2 text-sm text-ink/70">Only public or synthetic input belongs on the public board. Your draft stays in this tab until a publication is signed and independently confirmed.</p><form className="mt-4 grid gap-4" onSubmit={event => { event.preventDefault(); void run(async () => { if (!validDraft(draft)) throw new Error('Enter a brief, skill, positive integer budget and future deadline.'); await prepare('post-job', draft) }) }}>
      <label className="grid gap-1 text-sm">Skill<input required className="rounded-xl border p-3" value={draft.skill} onChange={e => { setIntent(null); generation.current++; setDraft({ ...draft, skill: e.target.value }) }} /></label>
      <label className="grid gap-1 text-sm">Public brief<textarea required maxLength={8000} className="rounded-xl border p-3" value={draft.brief} onChange={e => { setIntent(null); generation.current++; setDraft({ ...draft, brief: e.target.value }) }} /></label>
      <label className="grid gap-1 text-sm">Budget in USDC base units (1 USDC = 1000000)<input required inputMode="numeric" pattern="[1-9][0-9]*" className="rounded-xl border p-3" value={draft.budgetAtomic} onChange={e => { setIntent(null); generation.current++; setDraft({ ...draft, budgetAtomic: e.target.value }) }} /></label>
      <label className="grid gap-1 text-sm">Deadline (your local time)<input required type="datetime-local" className="rounded-xl border p-3" onChange={e => { setIntent(null); generation.current++; setDraft({ ...draft, deadline: Math.floor(new Date(e.target.value).getTime() / 1000) }) }} /></label><PrimaryButton disabled={busy} type="submit">Review job publication</PrimaryButton>
    </form>{!publication && <p className="mt-3 text-sm">{unavailable}</p>}</Card>
    {intent && <Card><h2 className="font-display text-xl">Review wallet publication</h2><dl>{[['Action', intent.action], ['Signer', intent.signer], ['Network chain ID', intent.chainId], ['Destination contract', intent.transaction.to], ['Calldata', intent.transaction.data], ['Native value (hex base units)', intent.transaction.value], ['Job binding', intent.jobRef], ['Payload digest', intent.payloadDigest], ['Nonce', intent.nonce], ['Offer reference', intent.offerRef ?? 'Not applicable'], ['Offer digest', intent.offerDigest ?? 'Not applicable'], ['Normalized public payload', JSON.stringify(intent.payload)], ['Intent reference', intent.intentRef], ['Expiry (Unix seconds)', intent.expiresAt]].map(([label, value]) => <Row key={text(label)} label={text(label)}><span className="break-all font-mono">{text(value)}</span></Row>)}</dl><PrimaryButton disabled={busy || !!pending} onClick={() => { void run(async () => { if (!wallet.current || !publication) return; const reviewed = intent; const result = await wallet.current.submit(reviewed); setIntent(null); setPending({ intentRef: reviewed.intentRef, txHash: result.txHash, action: reviewed.action, jobRef: reviewed.jobRef }); setMessage('Submitted. Pending independent public confirmation.'); await publication.submit(reviewed.intentRef, result.txHash) }) }}>Sign exact publication</PrimaryButton></Card>}
    {pending && <Card><h2 className="font-display text-xl">Publication pending</h2><FullValue value={pending.txHash} /><p className="my-3 text-sm">This saved transaction reference is a recovery hint only. A transaction hash does not confirm the job or acceptance.</p><PrimaryButton disabled={busy} onClick={() => { void run(reconcile) }}>Retry registration and reconcile</PrimaryButton></Card>}
    <Card><h2 className="font-display text-xl">Provider identity and feedback</h2><p className="mt-2 text-sm text-ink/70">Verified provider profiles and feedback are unavailable until the public registry reader and deployed feedback transaction contract are connected. No local rating or placeholder identity is shown.</p></Card>
  </>
}
