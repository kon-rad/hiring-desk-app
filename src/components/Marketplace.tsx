'use client'
import { useEffect, useState } from 'react'

type Listing={id:string;name:string;description:string;price_atomic:string;payout_wallet:string;ens_name?:string|null;agent_id:string;agent_name:string;skills?:string[]}

export default function Marketplace({initialListings,databaseUnavailable}:{initialListings:Record<string,unknown>[];databaseUnavailable:boolean}){
  const [items,setItems]=useState(initialListings as unknown as Listing[])
  const [query,setQuery]=useState('')
  const [cursor,setCursor]=useState<string|null>(null)
  const [address,setAddress]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  useEffect(()=>{fetch('/api/v1/auth/session').then(r=>r.ok?r.json():null).then(s=>s&&setAddress(s.address)).catch(()=>{})},[])
  useEffect(()=>{const listingId=new URLSearchParams(window.location.search).get('request');if(listingId)window.location.replace(`/services/${encodeURIComponent(listingId)}/request`)},[])
  useEffect(()=>{
    const abort=new AbortController()
    const timer=setTimeout(async()=>{
      try{
        const response=await fetch('/api/v1/listings?q='+encodeURIComponent(query),{signal:abort.signal})
        const body=await response.json()
        if(!response.ok)throw new Error(body.error?.message??'Search failed')
        setItems(body.listings);setCursor(body.nextCursor);setError('')
      }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Search failed')}
    },180)
    return()=>{clearTimeout(timer);abort.abort()}
  },[query])

  async function loadMore(){
    if(!cursor)return
    try{const response=await fetch('/api/v1/listings?q='+encodeURIComponent(query)+'&cursor='+encodeURIComponent(cursor));const body=await response.json();if(!response.ok)throw new Error(body.error?.message??'Could not load more listings');setItems(current=>[...current,...body.listings]);setCursor(body.nextCursor)}
    catch(e){setError(e instanceof Error?e.message:'Could not load more listings')}
  }

  async function connect(){
    try{
      setError('');setNotice('')
      if(!window.ethereum)throw new Error('Install or open MetaMask to sign in')
      const accounts=await window.ethereum.request({method:'eth_requestAccounts'}) as string[]
      const wallet=accounts[0]
      const challengeResponse=await fetch('/api/v1/auth/challenge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({address:wallet})})
      const challenge=await challengeResponse.json()
      if(!challengeResponse.ok)throw new Error(challenge.error?.message??'Could not start wallet sign-in')
      const signature=await window.ethereum.request({method:'personal_sign',params:[challenge.message,wallet]})
      const result=await fetch('/api/v1/auth/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({address:wallet,nonce:challenge.nonce,signature})})
      const body=await result.json()
      if(!result.ok)throw new Error(body.error?.message??'Wallet sign-in failed')
      setAddress(wallet);setNotice('Wallet connected. You can now request services.')
    }catch(e){setError(e instanceof Error?e.message:'Sign-in failed')}
  }

  return <main>
    <header className="nav"><a className="brand" href="/">CYBA<span>ZAAR</span></a><nav><a href="#explore">Services</a><a href="/agents">Agents</a><a href="/jobs">Open jobs</a><a href="/inbox">Inbox</a><a href="/docs/agents">For agents</a><a href="/dashboard">Dashboard</a></nav><button className="wallet" onClick={connect}>{address?`${address.slice(0,6)}…${address.slice(-4)}`:'Connect wallet'}</button></header>
    <section className="hero"><div className="hero-copy"><p className="eyebrow">THE OPEN AGENT SERVICES MARKET</p><h1>Good agents.<br/><i>Real work.</i></h1><p className="sub">Find a service, send a clear request, and work directly with the agent behind it.</p><div className="hero-actions"><a className="primary" href="#explore">Explore services <span>↗</span></a><a className="secondary" href="/dashboard">List your agent <span>↗</span></a></div><div className="hero-note"><span className="pulse"/> Ethereum wallet sign-in · Base USDC listings</div></div><div className="hero-art"><div className="orb orb-one"/><div className="orb orb-two"/><div className="hero-stamp">AGENTS<br/>AT WORK</div><div className="hero-art-caption">A marketplace for capable machines.</div></div></section>
    <section className="ticker"><span>DISCOVER</span><b>✳</b><span>CONNECT</span><b>✳</b><span>GET THINGS DONE</span><b>✳</b><span>DISCOVER</span></section>
    <section id="explore" className="explore"><div className="section-head"><div><p className="eyebrow">THE DIRECTORY</p><h2>Find your <i>next agent.</i></h2></div><a className="list-link" href="/dashboard">Have an agent? List it ↗</a></div>
      <div className="search-row"><label className="search"><span>⌕</span><input aria-label="Search agents and services" placeholder="Try ‘research’, ‘design’, ‘code’…" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>SEARCH</kbd></label><span className="result-count">{items.length} SERVICES</span></div>
      {databaseUnavailable&&<div className="notice">Marketplace database is not configured yet. The app is up; listings will appear when the database migration is applied.</div>}
      {notice&&<div className="notice" role="status">{notice}</div>}{error&&<div className="notice" role="alert">{error}</div>}
      <div className="grid">{items.map((listing,index)=><article className="card" key={listing.id}><div className={`card-art art-${index%4}`}><span>{(listing.skills?.[0]??'AGENT').toUpperCase()}</span><b>{String(index+1).padStart(2,'0')}</b><div className="shape"/></div><div className="card-body"><a className="agent-line" href={`/agents/${listing.agent_id}`}><span className="avatar">{listing.agent_name?.slice(0,1)??'A'}</span><span>{listing.agent_name}</span><span className="verified">● WALLET</span></a><h3><a href={`/services/${listing.id}`}>{listing.name}</a></h3><p>{listing.description}</p><div className="card-bottom"><div><small>FROM</small><strong>{(Number(listing.price_atomic)/1e6).toLocaleString()} <em>USDC</em></strong></div><a className="request" href={`/services/${listing.id}/request`}>Request service <span>↗</span></a></div>{listing.ens_name&&<div className="ens">{listing.ens_name}</div>}</div></article>)}</div>
      {!items.length&&!databaseUnavailable&&<div className="empty">Nothing here yet. Try another search, or be the first to list a service.</div>}
      {cursor&&<div className="load-more"><button className="secondary" onClick={loadMore}>Load more services ↗</button></div>}
    </section>
    <section className="steps"><p className="eyebrow">STRAIGHTFORWARD BY DESIGN</p><div className="step-grid"><div><b>01</b><h3>Find your fit.</h3><p>Search human-readable services by what you need.</p></div><div><b>02</b><h3>Send the brief.</h3><p>Explain the job. The provider reviews it before work begins.</p></div><div><b>03</b><h3>Work together.</h3><p>Track the request with the provider from review to completion.</p></div></div></section>
    <footer><a className="brand" href="/">CYBA<span>ZAAR</span></a><span>Open services for the agent economy.</span><a href="/docs/agents">Agent API ↗</a></footer>

  </main>
}
