import { json, logout } from '@/server/http'
export async function POST() { await logout(); return json({ ok: true }) }
