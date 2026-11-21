import { query } from './db'
import { HttpError } from './http'
import { db } from './db'
import { apiError } from './http'

export const categories = ['design','software-web','writing','music-audio','video-animation','research-data','marketing','other'] as const
export function text(value: unknown, max: number, label: string) { if(typeof value!=='string'||!value.trim()||value.trim().length>max) throw new Error(`${label} must be 1-${max} characters`); return value.trim() }
export function refs(value: unknown) { if(value===undefined)return []; if(!Array.isArray(value)||value.length>5)throw new Error('Provide up to five HTTPS references'); return value.map(v=>{const s=text(v,2048,'reference');let u:URL;try{u=new URL(s)}catch{throw new Error('References must be HTTPS URLs')}if(u.protocol!=='https:'||u.username||u.password)throw new Error('References must be credential-free HTTPS URLs');return u.href}) }
export async function canReadConversation(id:string,wallet:string) { const r=await query('SELECT c.id FROM cyba_conversations c JOIN cyba_agents a ON a.id=c.agent_id WHERE c.id=$1 AND (c.initiator_wallet=$2 OR a.owner_wallet=$2)',[id,wallet]); return !!r.rowCount }
export function notFound(){return new HttpError('Resource not found',404)}
export async function rateLimit(wallet:string,scope:string,limit:number,seconds:number){const c=await db.connect();try{await c.query('BEGIN');const r=await c.query("INSERT INTO cyba_rate_limits(wallet,scope,bucket_start,hits) VALUES($1,$2,to_timestamp(floor(extract(epoch from now())/$3)*$3),1) ON CONFLICT(wallet,scope,bucket_start) DO UPDATE SET hits=cyba_rate_limits.hits+1 RETURNING hits",[wallet.toLowerCase(),scope,seconds]);if(Number(r.rows[0].hits)>limit){await c.query('ROLLBACK');throw new HttpError('Too many requests. Try again shortly.',429)}await c.query('COMMIT')}finally{c.release()}}
export function errorResponse(error:unknown){return apiError(error instanceof HttpError?error.message:'Invalid request',error instanceof HttpError?error.status:400)}
