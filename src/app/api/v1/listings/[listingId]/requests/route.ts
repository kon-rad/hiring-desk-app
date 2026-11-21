import { apiError, HttpError, json, requirePrincipal } from '@/server/http'
import { db } from '@/server/db'
import { matchesRequestPayload } from '@/server/request-idempotency'

type Context = { params: Promise<{ listingId: string }> }

export async function POST(request: Request, { params }: Context) {
  const principal = await requirePrincipal()
  if (!principal) return apiError('Authentication required', 401)

  const listingId = (await params).listingId
  const body = await request.json()
  const title = String(body.title ?? '').trim()
  const description = String(body.description ?? '').trim()
  const idempotencyKey = String(body.idempotencyKey ?? '')
  const attachmentRefs = body.attachmentRefs ?? []
  if (
    !title || title.length > 200 || !description || description.length > 10000
    || !/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey)
    || !Array.isArray(attachmentRefs) || attachmentRefs.length > 5
    || attachmentRefs.some((value: unknown) => typeof value !== 'string' || value.length > 2000 || !/^https:\/\//.test(value))
  ) return apiError('Invalid request or attachment references')

  const submitted = { listingId, title, description, attachmentRefs: attachmentRefs as string[] }
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const wallet = principal.address.toLowerCase()
    const previous = await client.query(
      'SELECT * FROM cyba_requests WHERE requester_wallet=$1 AND idempotency_key=$2 FOR UPDATE',
      [wallet, idempotencyKey],
    )
    let row = previous.rows[0]
    let created = false

    if (row) {
      if (!matchesRequestPayload(row, submitted)) {
        throw new HttpError('This idempotency key was already used with a different request payload.', 409)
      }
    } else {
      const listing = await client.query(
        "SELECT l.*,a.name AS agent_name FROM cyba_listings l JOIN cyba_agents a ON a.id=l.agent_id WHERE l.id=$1 AND l.status='published' FOR SHARE OF l",
        [listingId],
      )
      if (!listing.rowCount) throw new Error('Listing unavailable')

      const terms = listing.rows[0]
      const listingSnapshot = {
        listingId: terms.id,
        listingName: terms.name,
        agentName: terms.agent_name,
        priceAtomic: String(terms.price_atomic),
        payoutWallet: terms.payout_wallet,
        ensName: terms.ens_name,
        revision: terms.revision,
      }

      const inserted = await client.query(
        `INSERT INTO cyba_requests(listing_id,requester_wallet,idempotency_key,title,description,attachment_refs,listing_snapshot)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(requester_wallet,idempotency_key) DO NOTHING
         RETURNING *`,
        [listingId, wallet, idempotencyKey, title, description, JSON.stringify(attachmentRefs), JSON.stringify(listingSnapshot)],
      )

      row = inserted.rows[0]
      created = Boolean(row)
      if (!row) {
        const concurrent = await client.query(
          'SELECT * FROM cyba_requests WHERE requester_wallet=$1 AND idempotency_key=$2 FOR UPDATE',
          [wallet, idempotencyKey],
        )
        row = concurrent.rows[0]
        if (!row) throw new Error('Request idempotency record could not be loaded')
        if (!matchesRequestPayload(row, submitted)) {
          throw new HttpError('This idempotency key was already used with a different request payload.', 409)
        }
      }
    }

    await client.query(
      "INSERT INTO cyba_request_events(request_id,actor,state,idempotency_key) VALUES($1,$2,'submitted',$3) ON CONFLICT DO NOTHING",
      [row.id, wallet, `${idempotencyKey}:submitted`],
    )
    await client.query('COMMIT')
    return json({ request: row }, created ? 201 : 200)
  } catch (error) {
    await client.query('ROLLBACK')
    return apiError(error instanceof HttpError ? error.message : error instanceof Error ? error.message : 'Request failed', error instanceof HttpError ? error.status : 400)
  } finally {
    client.release()
  }
}
