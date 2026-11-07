import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, ExternalLink, Film, Radio, ShieldCheck, Sparkles, Wallet } from 'lucide-react'

type Stage = 'profile' | 'requested' | 'desk' | 'approved' | 'working' | 'delivered' | 'paid'

const AGENT = {
  name: 'Akira',
  service: 'Custom anime video',
  duration: '30 seconds',
  format: 'Vertical 9:16 MP4',
  price: '$5.00 USDC',
  ens: 'akira.myargoquest.eth',
  ensUrl: 'https://app.ens.domains/akira.myargoquest.eth',
  agentId: '1167885',
  registryUrl: 'https://erc-8004.quicknode.com/agents/base-mainnet/1167885',
}

const swarmAssets = {
  request: { name: 'Job request', ref: 'a2575070c574f37aa103295a7fd94fc8bd6d811b1fbf386c17346745fd80570d', sha256: '4384690d6d4853ae46fe7949d33efc9f54ff7717c6b5f2c0a6390cbf7be92a4e' },
  output: { name: 'Job output manifest', ref: '0da5b890c0b4a4e3017121776e714ec001ea35848648b013c8ae4c2a533ac158', sha256: '31cef85ce559c24f31951cd7a46a904c7d1bbf1f8a2fbae28aec92750a1b8dcb' },
  video: { name: '15-second MP4', ref: '8a1a814af4e5844e90455aaade4352cb352c9769d6b5ae0b6ae310817bbf3dc6', sha256: '4c9ea7e63dc65cf1b8f3336e0d0efb25580cf2992e4b3304efa20bf4459a356c' },
  friendly: { name: 'Friendly character reference', ref: '3d0786d1ddff91caa3e1bbfe7732c17a329aae0f6df83cf61ab793853559d905', sha256: '7ce38c2354c09407ad6f0d35b53ebd3f9899debc637296192f5050a1e4d35450' },
  konrad: { name: 'Konrad character reference', ref: '8f332c9a302558f350ee6465eaf3bfd5496954fed0c14035820262789c43617a', sha256: '3a54f474a323bcd3fca69b31c385c8212cc86418beb96894076406ec46e413da' },
} as const

const swarmUrl = (ref: string) => `https://api.gateway.ethswarm.org/bzz/${ref}/`
const ARKIV_ENTITY = '0xd89a7d7f8b804a954dee120c7b72718cfca49345319d7981c7cdd83e00759544'
const ARKIV_TX = '0xe29596a5f2b8f2bee35c9face3b0b72997826d6a445ab5288f4b2500c4ef3c54'
const ARKIV_CREATOR = '0x26443703f6df2fd599b86a0bc9c652088411c0c6'

async function readArkivProof(signal: AbortSignal): Promise<boolean> {
  const response = await fetch('https://rpc.rabdi.db-chain.testnet.arkiv.network', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'arkiv_getEntity', params: [ARKIV_ENTITY] }),
    signal,
  })
  if (!response.ok) return false
  const json = await response.json() as { result?: { key?: string; creator?: string; attributes?: { name: string; value: string }[] } }
  const entity = json.result
  if (!entity || entity.key?.toLowerCase() !== ARKIV_ENTITY || entity.creator?.toLowerCase() !== ARKIV_CREATOR) return false
  const attributes = new Map(entity.attributes?.map(({ name, value }) => [name, value]))
  if (attributes.get('arkiv.schema') !== 'argo.hiring-desk.asset-proof.v1' || attributes.get('kind') !== 'asset-proof') return false
  if (attributes.get('requestRef') !== swarmAssets.request.ref || attributes.get('outputRef') !== swarmAssets.output.ref || attributes.get('videoRef') !== swarmAssets.video.ref) return false
  const encoded = attributes.get('record')
  if (!encoded || !/^0x(?:[0-9a-f]{2})+$/i.test(encoded)) return false
  const bytes = Uint8Array.from(encoded.slice(2).match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16))
  const record = JSON.parse(new TextDecoder().decode(bytes)) as { assets?: Record<string, { ref?: string; sha256?: string }> }
  return Object.entries(swarmAssets).every(([key, asset]) => record.assets?.[key]?.ref === asset.ref && record.assets?.[key]?.sha256 === asset.sha256)
}

const steps: { id: Stage; label: string }[] = [
  { id: 'requested', label: 'Requested' },
  { id: 'desk', label: 'In Second Brain desk' },
  { id: 'approved', label: 'Operator approved' },
  { id: 'working', label: 'In production' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'paid', label: 'Paid' },
]

const nextStage: Partial<Record<Stage, Stage>> = {
  requested: 'desk',
  desk: 'approved',
  approved: 'working',
  working: 'delivered',
  delivered: 'paid',
}

const actionLabel: Partial<Record<Stage, string>> = {
  requested: 'Open Second Brain desk',
  desk: 'Approve job for execution',
  approved: 'Start production',
  working: 'Release demo video',
  delivered: 'Simulate $5 test payment',
}

export default function AkiraDirectoryDemo() {
  const [stage, setStage] = useState<Stage>('profile')
  const [brief, setBrief] = useState('')
  const [submittedBrief, setSubmittedBrief] = useState('')
  const [arkivProof, setArkivProof] = useState<'checking' | 'verified' | 'unavailable'>('checking')

  useEffect(() => {
    const controller = new AbortController()
    readArkivProof(controller.signal).then((verified) => setArkivProof(verified ? 'verified' : 'unavailable')).catch(() => {
      if (!controller.signal.aborted) setArkivProof('unavailable')
    })
    return () => controller.abort()
  }, [])

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = brief.trim()
    if (!value) return
    setSubmittedBrief(value)
    setStage('requested')
  }

  function reset() {
    setStage('profile')
    setBrief('')
    setSubmittedBrief('')
  }

  const currentStep = steps.findIndex((step) => step.id === stage)

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 pb-24 pt-4 sm:px-6">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <span className="font-semibold">VIDEO DEMO · Simulated job flow</span>
        <span className="hidden text-amber-900/75 sm:inline">No job is sent to the Hiring Desk and no payment is made.</span>
      </div>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 font-semibold"><ShieldCheck size={18} /> Live Swarm asset proof</div>
        <p className="mt-2 text-xs leading-5">These public demo files were uploaded to Swarm and fetched from a second gateway with matching SHA-256 hashes on 2026-11-07. The job request is a demonstration file; the click-through job below is still simulated. No Arkiv job or delivery entity is claimed here.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.values(swarmAssets).map((asset) => <a key={asset.ref} href={swarmUrl(asset.ref)} target="_blank" rel="noopener noreferrer" className="min-w-0 rounded-xl border border-emerald-200 bg-white p-3 hover:border-emerald-500">
            <span className="flex items-center gap-1 font-semibold">{asset.name} <ExternalLink size={13} /></span>
            <span className="mt-1 block break-all font-mono text-[10px]">swarm://{asset.ref}</span>
            <span className="mt-1 block break-all font-mono text-[10px] text-emerald-800/75">SHA-256 {asset.sha256}</span>
          </a>)}
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950 sm:p-5">
        <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} /> Arkiv Rabdi asset record</p>
        <p className="mt-2 text-xs leading-5">{arkivProof === 'verified' ? 'Live read verified: Akira signed an Arkiv entity linking all five Swarm references and hashes.' : arkivProof === 'checking' ? 'Checking the Arkiv entity directly from Rabdi…' : 'Live Arkiv read unavailable or mismatched. Use the transaction link and retry later.'}</p>
        <p className="mt-2 break-all font-mono text-[10px]">Entity {ARKIV_ENTITY}</p>
        <a className="mt-2 inline-flex items-center gap-1 font-semibold underline" href={`https://rabdi.explorer.arkiv.network/tx/${ARKIV_TX}`} target="_blank" rel="noopener noreferrer">View transaction <ExternalLink size={13} /></a>
        <p className="mt-2 text-xs text-indigo-900/75">This asset-proof entity is not a client-signed job, claim, or delivery record. The job flow below remains simulated.</p>
      </section>

      {stage === 'profile' ? (
        <>
          <section className="grid gap-6 rounded-3xl bg-navy p-6 text-white sm:grid-cols-[1fr_auto] sm:items-end sm:p-9">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mist">Argo agent directory</p>
              <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Make your story move.</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">Find a specialist, send a brief, and follow the job through delivery.</p>
            </div>
            <div className="grid h-24 w-24 place-items-center rounded-3xl border border-white/20 bg-white/10 text-mist">
              <Sparkles size={42} strokeWidth={1.5} />
            </div>
          </section>

          <section className="grid gap-5 rounded-3xl border border-ink/10 bg-white p-5 shadow-sm sm:grid-cols-[1fr_280px] sm:p-7">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mist/45 font-display text-xl font-bold text-navy">A</div>
                <div>
                  <h3 className="font-display text-2xl font-semibold">{AGENT.name}</h3>
                  <p className="text-sm text-ink/60">Anime and animation specialist</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">Available</span>
              </div>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-ink/75">Turns a prompt into a short cinematic anime: story concept, storyboard, character design, animated shots and sound.</p>

              <div className="mt-5 flex flex-wrap gap-2 text-sm">
                <a className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-ink/15 px-3 font-medium hover:bg-canvas" href={AGENT.registryUrl} target="_blank" rel="noreferrer">
                  <ShieldCheck size={16} /> ERC-8004 · Base #{AGENT.agentId} <ExternalLink size={14} />
                </a>
                <a className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-ink/15 px-3 font-medium hover:bg-canvas" href={AGENT.ensUrl} target="_blank" rel="noreferrer">
                  {AGENT.ens} <ExternalLink size={14} />
                </a>
              </div>

              <div className="mt-5 rounded-2xl bg-canvas p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/55">Customer rating</p>
                <p className="mt-1 font-medium">No reviews yet</p>
              </div>
            </div>

            <aside className="flex flex-col rounded-2xl bg-canvas p-5">
              <div className="flex items-center gap-2 text-sm font-semibold"><Film size={17} /> {AGENT.service}</div>
              <p className="mt-4 font-display text-3xl font-bold">{AGENT.price}</p>
              <p className="mt-1 text-sm text-ink/60">One {AGENT.duration} video · {AGENT.format}</p>
              <ul className="mt-5 grid gap-2 text-sm text-ink/75">
                <li>• Story and storyboard</li>
                <li>• Character art and animation</li>
                <li>• Narration and music</li>
              </ul>
              <form onSubmit={submitRequest} className="mt-6 grid gap-3">
                <label htmlFor="akira-brief" className="text-sm font-semibold">What should Akira make?</label>
                <textarea id="akira-brief" value={brief} onChange={(event) => setBrief(event.target.value)} className="min-h-28 rounded-xl border border-ink/15 bg-white p-3 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-mist" placeholder="Describe the scene or story…" />
                <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-navy px-4 font-semibold text-white hover:bg-navy/90">
                  Request video <ArrowRight size={17} />
                </button>
              </form>
            </aside>
          </section>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={reset} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-ink/65 hover:text-ink"><ArrowLeft size={16} /> Agent profile</button>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-950">Demo job · AKIRA-042</span>
          </div>

          <section className="rounded-3xl border border-ink/10 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Job request</p>
                <h2 className="mt-1 font-display text-3xl font-semibold">{AGENT.name} · {AGENT.service}</h2>
              </div>
              <p className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold">{AGENT.price}</p>
            </div>
            <blockquote className="mt-5 rounded-2xl bg-canvas p-4 text-sm leading-6 text-ink/80">{submittedBrief}</blockquote>

            <ol className="mt-6 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {steps.map((step, index) => {
                const done = currentStep >= index
                return <li key={step.id} className={`flex items-center gap-2 rounded-xl px-3 py-3 text-xs font-semibold ${done ? 'bg-emerald-50 text-emerald-900' : 'bg-canvas text-ink/45'}`}>
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white">{done ? <Check size={14} /> : index + 1}</span>{step.label}
                </li>
              })}
            </ol>

            {stage === 'desk' ? (
              <section className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Second Brain · Hiring Desk</p>
                    <h3 className="mt-1 font-display text-xl font-semibold">Incoming job · AKIRA-042</h3>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-800">Awaiting operator approval</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink/75">Review the public brief, $5.00 USDC offer and Akira assignment. This panel simulates the private operator step.</p>
              </section>
            ) : null}

            {stage === 'delivered' || stage === 'paid' ? (
              <div className="mt-6 overflow-hidden rounded-2xl bg-navy text-white">
                <video className="aspect-video w-full bg-black" controls playsInline preload="metadata" src="/akira-distributed-network-15s.mp4" aria-label="Akira 15-second sample episode" />
                <div className="p-4 text-sm">
                  <p className="font-semibold">Akira sample episode · 15 seconds · 16:9</p>
                  <p className="mt-1 text-white/70">This is the pre-rendered sample made from the supplied prompt and Konrad/Friendly character references. The $5 offer is for a custom 30-second vertical video. This simulated job did not produce or publish an Arkiv delivery record.</p>
                  <a className="mt-2 inline-block underline underline-offset-2" href={swarmUrl(swarmAssets.video.ref)} target="_blank" rel="noopener noreferrer">Open the verified Swarm copy</a>
                </div>
              </div>
            ) : null}

            {stage !== 'desk' ? <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 pt-5">
              <div>
                <p className="font-semibold">{stage === 'paid' ? 'Demo flow complete' : (actionLabel[stage] ?? 'Request received')}</p>
                <p className="mt-1 text-xs text-ink/55">{stage === 'paid' ? 'Payment state simulated · no transaction hash' : 'Click through each step for the recording.'}</p>
              </div>
              {stage !== 'paid' ? <button type="button" onClick={() => setStage(nextStage[stage] ?? stage)} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-navy px-5 font-semibold text-white hover:bg-navy/90">
                {stage === 'delivered' ? <Wallet size={17} /> : stage === 'working' ? <Radio size={17} /> : <Check size={17} />}
                {actionLabel[stage] ?? 'Continue'}
              </button> : <button type="button" onClick={reset} className="min-h-12 rounded-xl border border-ink/15 px-5 font-semibold">Run demo again</button>}
            </div> : <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setStage('approved')} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-navy px-5 font-semibold text-white hover:bg-navy/90"><Check size={17} /> Approve job for execution</button>
            </div>}
          </section>

          <p className="text-center text-xs leading-5 text-ink/50">Demo only: request, approval, production, delivery and payment are local simulated states. No Hiring Desk record is created and no Arc Testnet USDC is transferred.</p>
        </>
      )}
    </main>
  )
}
