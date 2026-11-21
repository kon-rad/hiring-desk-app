import { describe, expect, test } from 'bun:test'
import { matchesRequestPayload } from '../src/server/request-idempotency'

const submitted = {
  listingId: 'listing-1',
  title: 'Summarize the report',
  description: 'Focus on the main findings.',
  attachmentRefs: ['https://example.com/report.pdf'],
}

const existing = {
  listing_id: 'listing-1',
  title: submitted.title,
  description: submitted.description,
  attachment_refs: [...submitted.attachmentRefs],
}

describe('request idempotency payload matching', () => {
  test('accepts an exact retry', () => {
    expect(matchesRequestPayload(existing, submitted)).toBe(true)
  })

  test.each([
    ['listing', { ...submitted, listingId: 'listing-2' }],
    ['title', { ...submitted, title: 'Different title' }],
    ['description', { ...submitted, description: 'Different brief' }],
    ['attachments', { ...submitted, attachmentRefs: [] }],
  ])('rejects a reused key with a different %s', (_field, changed) => {
    expect(matchesRequestPayload(existing, changed)).toBe(false)
  })

  test('rejects malformed stored attachment data', () => {
    expect(matchesRequestPayload({ ...existing, attachment_refs: null }, submitted)).toBe(false)
  })
})
