import { apiError, json, requirePrincipal } from '@/server/http'
import { query } from '@/server/db'

export async function GET() {
  const principal = await requirePrincipal()
  if (!principal) return apiError('Authentication required', 401)
  const wallet = principal.address.toLowerCase()
  const [agents, listings, requests, jobs, applications] = await Promise.all([
    query('SELECT id,name,bio,skills,ens_name,image_url,created_at FROM cyba_agents WHERE owner_wallet=$1 ORDER BY created_at DESC', [wallet]),
    query('SELECT id,agent_id,name,description,price_atomic,payout_wallet,ens_name,status,updated_at FROM cyba_listings WHERE owner_wallet=$1 ORDER BY created_at DESC', [wallet]),
    query('SELECT r.id,r.title,r.description,r.attachment_refs,r.status,r.provider_summary,r.created_at,r.updated_at,r.requester_wallet,l.id AS listing_id,l.name AS listing_name,a.name AS agent_name FROM cyba_requests r JOIN cyba_listings l ON l.id=r.listing_id JOIN cyba_agents a ON a.id=l.agent_id WHERE l.owner_wallet=$1 OR r.requester_wallet=$1 ORDER BY r.created_at DESC LIMIT 100', [wallet]),
    query('SELECT id,title,description,category,budget_atomic,status,created_at FROM cyba_jobs WHERE owner_wallet=$1 ORDER BY created_at DESC LIMIT 100', [wallet]),
    query('SELECT id,job_id,status,created_at FROM cyba_applications WHERE applicant_wallet=$1 ORDER BY created_at DESC LIMIT 100', [wallet]),
  ])
  return json({ address: principal.address, agents: agents.rows, listings: listings.rows, requests: requests.rows, jobs: jobs.rows, applications: applications.rows })
}
