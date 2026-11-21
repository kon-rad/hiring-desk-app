import 'server-only'
import { Pool } from 'pg'
import { serverEnv } from './env'

const env = serverEnv()
const globalPool = globalThis as typeof globalThis & { cybazaarPool?: Pool }
export const db = globalPool.cybazaarPool ?? new Pool({ connectionString: env.databaseUrl, max: 12, connectionTimeoutMillis: 5000 })
if (process.env.NODE_ENV !== 'production') globalPool.cybazaarPool = db

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values: unknown[] = []) {
  if (!process.env.CYBA_DATABASE_URL) throw new Error('Marketplace database is not configured')
  return db.query<T>(text, values)
}
