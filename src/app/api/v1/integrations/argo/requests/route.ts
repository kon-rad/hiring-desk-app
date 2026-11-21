import { apiError, integrationForRequest, json } from '@/server/http'
import { query } from '@/server/db'

type Cursor={updatedAt:string;id:string}
function readCursor(value:string|null):Cursor|null{if(!value)return null;try{const parsed=JSON.parse(Buffer.from(value,'base64url').toString()) as Cursor;if(typeof parsed.updatedAt!=='string'||!/^[0-9a-f-]{36}$/i.test(parsed.id))return null;return parsed}catch{return null}}
export async function GET(request:Request){
  const integrationId=await integrationForRequest(request)
  if(!integrationId)return apiError('Integration credential required',401)
  const cursor=readCursor(new URL(request.url).searchParams.get('cursor'))
  if(new URL(request.url).searchParams.has('cursor')&&!cursor)return apiError('Invalid cursor')
  const result=await query("SELECT r.id,r.requester_wallet,r.title,r.description,r.attachment_refs,r.status,r.created_at,r.updated_at,r.listing_snapshot,l.id AS listing_id FROM cyba_requests r JOIN cyba_listings l ON l.id=r.listing_id JOIN cyba_integrations i ON i.id=$3 AND i.enabled=true AND i.revoked_at IS NULL AND l.id=ANY(i.listing_ids) WHERE ($1::timestamptz IS NULL OR (r.updated_at,r.id)>($1::timestamptz,$2::uuid)) ORDER BY r.updated_at ASC,r.id ASC LIMIT 100",[cursor?.updatedAt??null,cursor?.id??null,integrationId])
  const last=result.rows.at(-1)
  const nextCursor=last?Buffer.from(JSON.stringify({updatedAt:new Date(last.updated_at as string).toISOString(),id:last.id})).toString('base64url'):null
  return json({requests:result.rows,nextCursor})
}
