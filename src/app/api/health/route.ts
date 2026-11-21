import { json } from '@/server/http'
import { query } from '@/server/db'

export const dynamic='force-dynamic'
export async function GET(){
  if(!process.env.CYBA_DATABASE_URL)return json({status:'degraded',database:'not_configured',marketplace:'not_ready'},503)
  try{await query('SELECT 1');return json({status:'ok',database:'connected',marketplace:'ready'})}
  catch{return json({status:'degraded',database:'unavailable',marketplace:'not_ready'},503)}
}
