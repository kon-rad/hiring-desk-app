import { json, requirePrincipal } from '@/server/http'
export async function GET() { const principal = await requirePrincipal(); return principal ? json({ address: principal.address }) : json({ error: { message: 'Authentication required' } }, 401) }
