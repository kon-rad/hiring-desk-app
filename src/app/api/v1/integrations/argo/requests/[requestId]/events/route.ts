import { apiError, integrationForRequest, json } from '@/server/http'
import { db } from '@/server/db'

type Context={params:Promise<{requestId:string}>}
const allowedStates=new Set(['accepted','rejected','in_progress','revision_requested','completed'])
const transitions:Record<string,string[]>={submitted:['accepted','rejected'],accepted:['in_progress','rejected'],in_progress:['revision_requested','completed','rejected'],revision_requested:['in_progress','rejected']}

export async function POST(request:Request,{params}:Context){
  const integrationId=await integrationForRequest(request)
  if(!integrationId)return apiError('Integration credential required',401)
  const id=(await params).requestId
  const body=await request.json()
  if(!allowedStates.has(body.status)||typeof body.idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{8,120}$/.test(body.idempotencyKey)||body.summary!==undefined&&(typeof body.summary!=='string'||body.summary.length>2000))return apiError('Invalid lifecycle event')
  const client=await db.connect()
  try{
    await client.query('BEGIN')
    const found=await client.query('SELECT r.status FROM cyba_requests r JOIN cyba_listings l ON l.id=r.listing_id JOIN cyba_integrations i ON i.id=$2 AND i.enabled=true AND i.revoked_at IS NULL AND l.id=ANY(i.listing_ids) WHERE r.id=$1 FOR UPDATE',[id,integrationId])
    if(!found.rowCount)throw new Error('Request not found in integration scope')
    const duplicate=await client.query('SELECT state FROM cyba_request_events WHERE request_id=$1 AND idempotency_key=$2',[id,body.idempotencyKey])
    if(duplicate.rowCount){
      if(duplicate.rows[0].state!==body.status)throw new Error('Idempotency key already used for another state')
      await client.query('COMMIT')
      return json({ok:true,status:body.status,replayed:true})
    }
    const previous=found.rows[0].status
    if(!transitions[previous]?.includes(body.status))throw new Error(`Invalid lifecycle transition: ${previous} to ${body.status}`)
    const summary=typeof body.summary==='string'?body.summary.slice(0,2000):null
    await client.query('UPDATE cyba_requests SET status=$2,provider_summary=$3,updated_at=now() WHERE id=$1',[id,body.status,summary])
    await client.query('INSERT INTO cyba_request_events(request_id,actor,state,summary,idempotency_key) VALUES($1,$2,$3,$4,$5)',[id,'argo-integration',body.status,summary,body.idempotencyKey])
    await client.query('COMMIT')
    return json({ok:true,status:body.status})
  }catch(error){
    await client.query('ROLLBACK')
    return apiError(error instanceof Error?error.message:'Update failed',409)
  }finally{client.release()}
}
