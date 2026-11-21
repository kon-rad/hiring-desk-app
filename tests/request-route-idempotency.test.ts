import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { encodeIntegrationCursor, listingGrantFingerprint } from '../src/server/integration-cursor'

const wallet = '0x1111111111111111111111111111111111111111'
const listingId = '123e4567-e89b-12d3-a456-426614174000'
const requestPayload = {
  title: 'Summarize the report',
  description: 'Focus on the main findings.',
  attachmentRefs: ['https://example.com/report.pdf'],
  idempotencyKey: 'retry-key-001',
}

let state: {
  existing: Record<string, unknown> | null
  listingPublished: boolean
  conflictInsert: boolean
  queries: string[]
  integrationAuthorized: boolean
  listingGrants: string[]
  pollRows: Record<string, unknown>[]
  pollArgs: unknown[] | null
  pollSql: string
}

const existingRequest = () => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  listing_id: listingId,
  requester_wallet: wallet.toLowerCase(),
  idempotency_key: requestPayload.idempotencyKey,
  title: requestPayload.title,
  description: requestPayload.description,
  attachment_refs: requestPayload.attachmentRefs,
  listing_snapshot: { listingId, listingName: 'Research', agentName: 'Analyst' },
  status: 'submitted',
})

const client = {
  async query(sql: string) {
    state.queries.push(sql)
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
    if (sql.includes('SELECT * FROM cyba_requests WHERE requester_wallet=$1 AND idempotency_key=$2 FOR UPDATE')) {
      return { rows: state.existing ? [state.existing] : [], rowCount: state.existing ? 1 : 0 }
    }
    if (sql.includes('SELECT l.*,a.name AS agent_name')) {
      if (!state.listingPublished) return { rows: [], rowCount: 0 }
      return { rows: [{ id: listingId, name: 'Research', agent_name: 'Analyst', price_atomic: '5000000', payout_wallet: wallet, ens_name: null, revision: 1 }], rowCount: 1 }
    }
    if (sql.includes('INSERT INTO cyba_requests')) {
      state.existing = existingRequest()
      return state.conflictInsert ? { rows: [], rowCount: 0 } : { rows: [state.existing], rowCount: 1 }
    }
    if (sql.includes('INSERT INTO cyba_request_events')) return { rows: [], rowCount: 1 }
    throw new Error(`Unexpected SQL in request route test: ${sql}`)
  },
  release() {},
}

async function query(sql: string, values?: unknown[]) {
  state.queries.push(sql)
  if (sql.includes('SELECT listing_ids FROM cyba_integrations')) {
    return { rows: state.integrationAuthorized ? [{ listing_ids: state.listingGrants }] : [], rowCount: state.integrationAuthorized ? 1 : 0 }
  }
  if (sql.includes('SELECT r.id,r.requester_wallet')) {
    state.pollArgs = values ?? null
    state.pollSql = sql
    return { rows: state.pollRows, rowCount: state.pollRows.length }
  }
  throw new Error(`Unexpected database query in request route test: ${sql}`)
}

mock.module('@/server/db', () => ({ db: { connect: async () => client }, query }))
mock.module('@/server/http', () => ({
  apiError: (message: string, status = 400) => Response.json({ error: { message } }, { status }),
  json: (body: unknown, status = 200) => Response.json(body, { status }),
  requirePrincipal: async () => ({ address: wallet }),
  integrationForRequest: async () => state.integrationAuthorized ? 'argo-secondbrain' : null,
  HttpError: class HttpError extends Error {
    constructor(message: string, public readonly status: number) { super(message) }
  },
}))

const { POST } = await import('../src/app/api/v1/listings/[listingId]/requests/route')
const { GET: pollArgoRequests } = await import('../src/app/api/v1/integrations/argo/requests/route')

beforeEach(() => {
  state = {
    existing: null,
    listingPublished: true,
    conflictInsert: false,
    queries: [],
    integrationAuthorized: true,
    listingGrants: [listingId],
    pollRows: [],
    pollArgs: null,
    pollSql: '',
  }
})
afterEach(() => mock.restore())

async function submit(pathListingId = listingId, body: Record<string, unknown> = requestPayload) {
  const request = new Request(`http://localhost/api/v1/listings/${pathListingId}/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(request, { params: Promise.resolve({ listingId: pathListingId }) })
}

describe('request route idempotency', () => {
  test('replays an exact retry even after the listing is unpublished', async () => {
    state.existing = existingRequest()
    state.listingPublished = false

    const response = await submit()

    expect(response.status).toBe(200)
    expect(state.queries.some((sql) => sql.includes('SELECT l.*,a.name AS agent_name'))).toBe(false)
  })

  test('returns 409 when an idempotency key is reused with a changed payload', async () => {
    state.existing = existingRequest()

    const response = await submit(listingId, { ...requestPayload, title: 'Changed title' })

    expect(response.status).toBe(409)
    expect(state.queries.some((sql) => sql.includes('INSERT INTO cyba_request_events'))).toBe(false)
  })

  test('replays an exact retry when the URL UUID uses uppercase characters', async () => {
    state.existing = existingRequest()

    const response = await submit(listingId.toUpperCase())

    expect(response.status).toBe(200)
  })

  test('handles the unique-constraint race by replaying the winning insert', async () => {
    state.conflictInsert = true

    const response = await submit()

    expect(response.status).toBe(200)
    expect(state.queries.filter((sql) => sql.includes('SELECT * FROM cyba_requests WHERE requester_wallet=$1 AND idempotency_key=$2 FOR UPDATE'))).toHaveLength(2)
  })
})

describe('Argo poll route grant-cursor invalidation', () => {
  test('resets an old cursor after a listing grant changes and returns the older new-grant request', async () => {
    const previousGrant = listingGrantFingerprint('argo-secondbrain', [listingId])
    const oldCursor = encodeIntegrationCursor({
      updatedAt: '2026-11-20T00:00:00.000Z',
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      grantFingerprint: previousGrant,
    })
    const oldRequest = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      listing_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      updated_at: '2026-11-19T00:00:00.000Z',
    }
    state.listingGrants = [listingId, oldRequest.listing_id]
    state.pollRows = [oldRequest]

    const response = await pollArgoRequests(new Request(`http://localhost/api/v1/integrations/argo/requests?cursor=${oldCursor}`))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(state.pollArgs?.[0]).toBeNull()
    expect(payload.requests).toEqual([oldRequest])
    expect(state.pollSql).toContain('i.enabled=true AND i.revoked_at IS NULL AND l.id=ANY(i.listing_ids)')
  })

  test('does not query requests after the integration credential is revoked', async () => {
    state.integrationAuthorized = false

    const response = await pollArgoRequests(new Request('http://localhost/api/v1/integrations/argo/requests'))

    expect(response.status).toBe(401)
    expect(state.pollSql).toBe('')
  })
})
