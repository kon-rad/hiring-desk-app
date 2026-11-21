import { apiError, json, verifyChallenge } from '@/server/http'
export async function POST(request: Request) {
  try { return json(await verifyChallenge(await request.json())) }
  catch (error) { return apiError(error instanceof Error ? error.message : 'Wallet verification failed', 401) }
}
