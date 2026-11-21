import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

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

mock.module('@/server/db', () => ({ db: { connect: async () => client } }))
mock.module('@/server/http', () => ({
  apiError: (message: string, status = 400) => Response.json({ error: { message } }, { status }),
  json: (body: unknown, status = 200) => Response.json(body, { status }),
  requirePrincipal: async () => ({ address: wallet }),
  HttpError: class HttpError extends Error {
    constructor(message: string, public readonly status: number) { super(message) }
  },
}))

const { POST } = await import('../src/app/api/v1/listings/[listingId]/requests/route')

beforeEach(() => {
  state = { existing: null, listingPublished: true, conflictInsert: false, queries: [] }
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
