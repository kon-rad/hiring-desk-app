import { apiError, integrationForRequest, json } from '@/server/http'
import { query } from '@/server/db'
import {
  cursorForCurrentGrant,
  encodeIntegrationCursor,
  listingGrantFingerprint,
  readIntegrationCursor,
} from '@/server/integration-cursor'

export async function GET(request: Request) {
  const integrationId = await integrationForRequest(request)
  if (!integrationId) return apiError('Integration credential required', 401)

  const url = new URL(request.url)
  const suppliedCursor = readIntegrationCursor(url.searchParams.get('cursor'))
  if (url.searchParams.has('cursor') && !suppliedCursor) return apiError('Invalid cursor')

  const grant = await query<{ listing_ids: string[] }>(
    'SELECT listing_ids FROM cyba_integrations WHERE id=$1 AND enabled=true AND revoked_at IS NULL',
    [integrationId],
  )
  const grantRow = grant.rows[0]
  if (!grantRow) return apiError('Integration credential required', 401)

  const fingerprint = listingGrantFingerprint(integrationId, grantRow.listing_ids ?? [])
  const cursor = cursorForCurrentGrant(suppliedCursor, fingerprint)
  const result = await query(
    `SELECT r.id,r.requester_wallet,r.title,r.description,r.attachment_refs,r.status,r.created_at,r.updated_at,r.listing_snapshot,l.id AS listing_id
     FROM cyba_requests r
     JOIN cyba_listings l ON l.id=r.listing_id
     JOIN cyba_integrations i ON i.id=$3 AND i.enabled=true AND i.revoked_at IS NULL AND l.id=ANY(i.listing_ids)
     WHERE ($1::timestamptz IS NULL OR (r.updated_at,r.id)>($1::timestamptz,$2::uuid))
     ORDER BY r.updated_at ASC,r.id ASC LIMIT 100`,
    [cursor?.updatedAt ?? null, cursor?.id ?? null, integrationId],
  )
  const last = result.rows.at(-1)
  const nextCursor = last
    ? encodeIntegrationCursor({
        updatedAt: new Date(last.updated_at as string).toISOString(),
        id: last.id as string,
        grantFingerprint: fingerprint,
      })
    : null
  return json({ requests: result.rows, nextCursor })
}
