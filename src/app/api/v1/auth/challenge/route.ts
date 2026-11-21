import { createChallenge, apiError, json } from '@/server/http'
export async function POST(request: Request) {
  try { const body = await request.json(); return json(await createChallenge(body.address)) }
  catch (error) { const status=typeof error==='object'&&error!==null&&'status' in error?Number(error.status):400; return apiError(error instanceof Error ? error.message : 'Invalid challenge request',status) }
}
