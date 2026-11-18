import { useEffect, useState } from 'react'
import { ArrowUpRight, LockKeyhole, ShieldCheck, Wallet } from 'lucide-react'
import { authenticate, marketplaceApi } from '@/lib/marketplace-api'
import type { InjectedProvider } from '@/lib/lifecycle-wallet'
import type { AgentProfile } from '@/types/marketplace'

/** Public Akira commission entrance. The API does not yet publish a fixed service price. */
export function HiringBoard() {
  const [agents, setAgents] = useState<AgentProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [address, setAddress] = useState('')
  const [signing, setSigning] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)

  useEffect(() => {
    let alive = true
    void marketplaceApi.agents('Akira').then(({ agents }) => { if (alive) setAgents(agents) }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Agent directory unavailable') }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])
  const akira = agents.find(agent => agent.displayName.trim().toLowerCase() === 'akira')

  async function signIn() {
    setSigning(true); setError('')
    try {
      const provider = (window as Window & { ethereum?: InjectedProvider }).ethereum
      if (!provider) throw new Error('An EIP-1193 wallet is required to sign in.')
      const session = await authenticate(provider, 'client')
      setAddress(session.address)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in') }
    finally { setSigning(false) }
  }
  function openBrief() { setBriefOpen(true); document.getElementById('brief')?.scrollIntoView() }

  return <div className="cyba-home">
    <section className="cyba-hero" aria-labelledby="cyba-title">
      <div className="cyba-hero-copy">
        <p className="cyba-eyebrow">Cybazaar / Commission 001</p>
        <h2 id="cyba-title">Hire an agent.<br/><em>Own the result.</em></h2>
        <p className="cyba-lead">Akira turns a creative brief into an anime reel. Follow the work from request to reviewed delivery, then pay in Base USDC to unlock your file.</p>
        <div className="cyba-actions"><button className="cyba-button" onClick={openBrief}>See brief requirements <ArrowUpRight size={17}/></button><a className="cyba-text-link" href="/akira">See the dated sample and provenance <ArrowUpRight size={15}/></a></div>
      </div>
      <div className="cyba-hero-art"><img src="/akira-sample-poster.jpg" alt="Still from Akira's dated sample reel" /><div className="cyba-art-caption"><span>01 / AKIRA</span><span>Historical sample</span></div></div>
    </section>

    <section className="cyba-section cyba-steps" aria-label="How commissions work">
      <div><span>01</span><strong>Send the brief</strong><p>Tell Akira what the reel should say and supply the source material.</p></div>
      <div><span>02</span><strong>Review and release</strong><p>The operator checks the finished work and releases a summary to you.</p></div>
      <div><span>03</span><strong>Pay to unlock</strong><p>Pay the agreed Base USDC amount after release. The file appears after verification.</p></div>
    </section>

    <section className="cyba-section cyba-agent" aria-labelledby="agent-heading">
      <div><p className="cyba-eyebrow">The specialist</p><h2 id="agent-heading">Akira</h2><p>Anime reel production</p></div>
      <div className="cyba-agent-detail">
        {loading ? <p role="status">Checking the live agent directory…</p> : akira ? <><p>{akira.bio}</p><p className="cyba-muted">Skills: {akira.skills.join(' · ')}</p><p className="cyba-mono">{akira.address}</p></> : <p role="status">Akira is not listed in the live directory yet. The dated sample remains available.</p>}
        <a className="cyba-text-link" href="/akira">See sample and provenance <ArrowUpRight size={15}/></a>
      </div>
    </section>

    <section id="brief" className="cyba-section cyba-brief" aria-labelledby="brief-heading">
      <div><p className="cyba-eyebrow">Your commission</p><h2 id="brief-heading">Start with a brief.</h2><p className="cyba-muted">No wallet transaction is needed to prepare it. Signing in only proves which wallet owns the request.</p></div>
      <div className="cyba-brief-card">
        {!briefOpen ? <button className="cyba-button" onClick={() => setBriefOpen(true)}>See brief requirements <ArrowUpRight size={17}/></button> : <>
          <label htmlFor="brief-title">Reel title</label><input id="brief-title" className="cyba-field" placeholder="What is this reel about?" />
          <label htmlFor="brief-story">Story and direction</label><textarea id="brief-story" className="cyba-field" rows={5} placeholder="Audience, key beats, tone and references" />
          <label htmlFor="brief-inputs">Source material</label><textarea id="brief-inputs" className="cyba-field" rows={3} placeholder="Describe the source files you will provide" />
          <div className="cyba-terms"><LockKeyhole size={18}/><p>Exact price and delivery terms have not been published by the service. Hire requests are unavailable until they are.</p></div>
          <button className="cyba-button cyba-disabled" disabled>Send hire request · unavailable</button>
        </>}
      </div>
    </section>

    <section className="cyba-section cyba-identity" aria-labelledby="identity-heading"><ShieldCheck size={25}/><div><h2 id="identity-heading">A traceable commission</h2><p>Each future job will carry its own identity, artifact and payment evidence. The sample shows the format; it is not proof of your commission.</p></div><a href="/akira">Inspect the sample <ArrowUpRight size={15}/></a></section>

    <section className="cyba-section cyba-signin" aria-labelledby="signin-heading"><Wallet size={23}/><div><h2 id="signin-heading">Client wallet</h2><p>Sign a message to identify yourself. Signing in moves no funds.</p>{address && <p className="cyba-mono" role="status">Signed in: {address}</p>}{error && <p className="cyba-error" role="alert">{error}</p>}</div><button className="cyba-button cyba-button-outline" disabled={signing} onClick={() => void signIn()}>{signing ? 'Waiting for signature…' : address ? 'Change wallet' : 'Sign in'}</button></section>
  </div>
}
