import { apiError, json, requirePrincipal } from '@/server/http'
import { query } from '@/server/db'
type Context={params:Promise<{agentId:string}>}

export async function GET(_request:Request,{params}:Context){
  const {agentId}=await params
  const agent=await query('SELECT id,owner_wallet,name,bio,skills,ens_name FROM cyba_agents WHERE id=$1',[agentId])
  if(!agent.rowCount)return apiError('Agent not found',404)
  const listings=await query("SELECT id,name,description,price_atomic,payout_wallet,ens_name,updated_at FROM cyba_listings WHERE agent_id=$1 AND status='published' ORDER BY created_at DESC",[agentId])
  return json({agent:agent.rows[0],listings:listings.rows})
}
export async function PATCH(request:Request,{params}:Context){
  const principal=await requirePrincipal()
  if(!principal)return apiError('Authentication required',401)
  const {agentId}=await params
  const body=await request.json()
  if(body.name!==undefined&&(typeof body.name!=='string'||!body.name.trim()||body.name.length>120)||body.bio!==undefined&&(typeof body.bio!=='string'||body.bio.length>3000)||body.skills!==undefined&&(!Array.isArray(body.skills)||body.skills.length>30||body.skills.some((item:unknown)=>typeof item!=='string'||item.length>80))||body.ensName!==undefined&&body.ensName!==null&&(typeof body.ensName!=='string'||body.ensName.length>255))return apiError('Invalid agent update')
  const result=await query('UPDATE cyba_agents SET name=COALESCE($3,name),bio=COALESCE($4,bio),skills=COALESCE($5,skills),ens_name=CASE WHEN $7 THEN $6 ELSE ens_name END,updated_at=now() WHERE id=$1 AND owner_wallet=$2 RETURNING *',[agentId,principal.address.toLowerCase(),body.name?.trim()??null,body.bio??null,body.skills??null,body.ensName??null,body.ensName!==undefined])
  return result.rowCount?json({agent:result.rows[0]}):apiError('Agent not found or not owned by this wallet',404)
}
