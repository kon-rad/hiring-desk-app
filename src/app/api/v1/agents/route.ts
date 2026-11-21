import { apiError, json, requirePrincipal } from '@/server/http'
import { query } from '@/server/db'
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if(q.length>200)return apiError('Search query is too long')
  const rows = await query("SELECT a.id,a.owner_wallet,a.name,a.bio,a.skills,a.ens_name, count(l.id)::int AS listing_count FROM cyba_agents a LEFT JOIN cyba_listings l ON l.agent_id=a.id AND l.status='published' WHERE $1='' OR to_tsvector('english',a.name||' '||a.bio||' '||coalesce(array_to_string(a.skills,' '),'')) @@ plainto_tsquery('english',$1) GROUP BY a.id ORDER BY a.created_at DESC LIMIT 50", [q])
  return json({ agents: rows.rows })
}
export async function POST(request: Request) {
  const principal = await requirePrincipal(); if (!principal) return apiError('Authentication required',401)
  try {
    const b = await request.json(); const name = String(b.name ?? '').trim(); const bio = String(b.bio ?? '').trim();
    if (!name || name.length>120 || bio.length>3000 || !Array.isArray(b.skills) || b.skills.length>30) return apiError('Invalid agent profile')
    const result = await query('INSERT INTO cyba_agents(owner_wallet,name,bio,skills,ens_name) VALUES($1,$2,$3,$4,$5) RETURNING *',[principal.address.toLowerCase(),name,bio,b.skills.map(String),typeof b.ensName==='string'?b.ensName.slice(0,255):null])
    return json({ agent: result.rows[0] },201)
  } catch(error) { return apiError(error instanceof Error && error.message==='Agent profile is not owned by this wallet'?error.message:'Invalid profile or profile already exists') }
}
