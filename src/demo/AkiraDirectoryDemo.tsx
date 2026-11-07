import { useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, Film, ShieldCheck } from 'lucide-react'
import { ARC_PROOF, verifyArcProof } from './arcProof'

const agent = {
  name: 'Akira',
  ens: 'akira.myargoquest.eth',
  agentId: '1167885',
  wallet: '0x26443703F6dF2fD599B86a0bc9c652088411C0c6',
  registry: 'https://erc-8004.quicknode.com/agents/base-mainnet/1167885',
  ensUrl: 'https://app.ens.domains/akira.myargoquest.eth',
}

const assets = [
  { name: 'Request brief', ref: 'a2575070c574f37aa103295a7fd94fc8bd6d811b1fbf386c17346745fd80570d', sha256: '4384690d6d4853ae46fe7949d33efc9f54ff7717c6b5f2c0a6390cbf7be92a4e' },
  { name: 'Output manifest', ref: '0da5b890c0b4a4e3017121776e714ec001ea35848648b013c8ae4c2a533ac158', sha256: '31cef85ce559c24f31951cd7a46a904c7d1bbf1f8a2fbae28aec92750a1b8dcb' },
  { name: 'Akira MP4 · 15 seconds', ref: '8a1a814af4e5844e90455aaade4352cb352c9769d6b5ae0b6ae310817bbf3dc6', sha256: '4c9ea7e63dc65cf1b8f3336e0d0efb25580cf2992e4b3304efa20bf4459a356c' },
] as const

const swarmUrl = (ref: string) => `https://bzz.link/bzz/${ref}/`
const arkivEntity = '0xd89a7d7f8b804a954dee120c7b72718cfca49345319d7981c7cdd83e00759544'
const arkivTx = '0xe29596a5f2b8f2bee35c9face3b0b72997826d6a445ab5288f4b2500c4ef3c54'
const video = '/akira-distributed-network-15s.mp4'

function Link({ href, children }: { href: string; children: ReactNode }) {
  return <a className="inline-flex items-center gap-1 break-all font-medium underline underline-offset-2" href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={13} className="shrink-0" /></a>
}

export default function AkiraDirectoryDemo() {
  const [arkiv, setArkiv] = useState<'checking' | 'verified' | 'unavailable'>('checking')
  const [arc, setArc] = useState<'checking' | 'verified' | 'unavailable'>('checking')
  useEffect(() => {
    const controller = new AbortController()
    void fetch('https://rpc.rabdi.db-chain.testnet.arkiv.network', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'arkiv_getEntity', params: [arkivEntity] }), signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error('Arkiv read unavailable')
      const body = await response.json() as { result?: { key?: string; creator?: string; attributes?: { name: string; value: string }[] } }
      const entity = body.result
      const attrs = new Map(entity?.attributes?.map(item => [item.name, item.value]))
      const ok = entity?.key?.toLowerCase() === arkivEntity
        && entity.creator?.toLowerCase() === '0x26443703f6df2fd599b86a0bc9c652088411c0c6'
        && attrs.get('arkiv.schema') === 'argo.hiring-desk.asset-proof.v1'
        && attrs.get('kind') === 'asset-proof'
      if (!ok) throw new Error('Arkiv proof mismatch')
      const encoded = attrs.get('record')
      if (!encoded || !/^0x(?:[0-9a-f]{2})+$/i.test(encoded)) throw new Error('Arkiv payload invalid')
      const bytes = Uint8Array.from(encoded.slice(2).match(/.{2}/g) ?? [], pair => parseInt(pair, 16))
      const record = JSON.parse(new TextDecoder().decode(bytes)) as { assets?: Record<string, { ref?: string; sha256?: string }> }
      if (!assets.every((asset, index) => {
        const key = ['request', 'output', 'video'][index]
        return record.assets?.[key]?.ref === asset.ref && record.assets?.[key]?.sha256 === asset.sha256
      })) throw new Error('Arkiv asset hashes do not match')
      setArkiv('verified')
    }).catch(() => { if (!controller.signal.aborted) setArkiv('unavailable') })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    let active = true
    void verifyArcProof().then(() => { if (active) setArc('verified') }).catch(() => { if (active) setArc('unavailable') })
    return () => { active = false }
  }, [])

  return <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 pb-24 pt-4 sm:px-6">
    <section className="rounded-3xl bg-navy p-6 text-white sm:p-9">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mist">Argo agent · public evidence</p>
      <h2 className="mt-3 font-display text-4xl font-semibold">Akira’s job and delivery record</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">The dashboard links to the published Arkiv asset record, Swarm files, ERC-8004 identity and an independently verified Arc Testnet USDC transfer.</p>
    </section>

    <section className="grid gap-4 sm:grid-cols-2">
      <article className="rounded-3xl border border-ink/10 bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 font-display text-xl font-semibold"><ShieldCheck size={18} /> Akira identity</h3>
        <p className="mt-2 text-sm text-ink/70">ERC-8004 on Base · Agent {agent.agentId}</p><p className="mt-1 break-all font-mono text-xs text-ink/60">Owner and agent wallet · {agent.wallet}</p>
        <div className="mt-4 grid gap-2 text-sm"><Link href={agent.registry}>Open ERC-8004 registration</Link><Link href={agent.ensUrl}>{agent.ens}</Link></div>
        <div className="mt-4 rounded-xl bg-canvas p-3 text-sm"><strong>Client feedback</strong><p className="mt-1 text-ink/70">No client feedback transaction is recorded for this agent yet.</p></div>
      </article>

      <article className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5">
        <h3 className="font-display text-xl font-semibold">Arkiv Rabdi asset record</h3>
        <p className="mt-2 text-sm">{arkiv === 'verified' ? 'Live read verified: the Arkiv entity references the listed Swarm assets and hashes.' : arkiv === 'checking' ? 'Reading and checking the Arkiv entity…' : 'Live Arkiv read unavailable. The explorer link remains available.'}</p>
        <dl className="mt-4 grid gap-2 text-xs"><div><dt className="font-semibold">Entity key</dt><dd className="break-all font-mono">{arkivEntity}</dd></div><div><dt className="font-semibold">Transaction</dt><dd><Link href={`https://rabdi.explorer.arkiv.network/tx/${arkivTx}`}>View on Rabdi explorer</Link></dd></div></dl>
        <p className="mt-3 text-xs text-indigo-950/75">This published entity proves asset linkage. It is not a client-authored job lifecycle record.</p>
      </article>
    </section>

    <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
      <h3 className="font-display text-xl font-semibold">Swarm files</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{assets.map(asset => <article key={asset.ref} className="min-w-0 rounded-2xl border border-emerald-200 bg-white p-4"><p className="font-semibold">{asset.name}</p><Link href={swarmUrl(asset.ref)}>Open Swarm file</Link><p className="mt-2 break-all font-mono text-[10px] text-ink/65">swarm://{asset.ref}</p><p className="mt-2 break-all font-mono text-[10px] text-ink/65">SHA-256 {asset.sha256}</p></article>)}</div>
    </section>

    <section className="overflow-hidden rounded-3xl bg-navy text-white">
      <div className="flex items-center gap-2 p-5 pb-3 font-display text-xl font-semibold"><Film size={19} /> Akira MP4 delivery</div>
      <video className="aspect-video w-full bg-black" controls playsInline preload="metadata" src={video} aria-label="Akira 15-second demo video" />
      <div className="grid gap-2 p-5 text-sm"><Link href={swarmUrl(assets[2].ref)}>Open the Swarm MP4</Link><p className="text-white/70">This is the existing 15-second sample video, also published to Swarm and linked from the Arkiv asset record.</p></div>
    </section>

    <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5">
      <h3 className="font-display text-xl font-semibold">Arc Testnet USDC transfer</h3>
      <p className="mt-2 text-sm">{arc === 'verified' ? `Live receipt verified: ${ARC_PROOF.amountUSDC} test USDC from Akira’s provider wallet to the separate demo wallet.` : arc === 'checking' ? 'Checking Arc Testnet transaction, receipt and USDC Transfer event…' : 'Arc RPC verification is currently unavailable; open the explorer transaction to inspect it.'}</p>
      <p className="mt-2 text-xs text-sky-950/75">This is a real Arc transfer. It is not bound to the Arkiv asset record as job payment.</p>
      <div className="mt-3 text-sm"><Link href={ARC_PROOF.explorer}>View transaction on Arc explorer</Link></div>
    </section>
  </main>
}
