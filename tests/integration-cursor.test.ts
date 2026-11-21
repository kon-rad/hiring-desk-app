import { describe, expect, test } from 'bun:test'
import {
  cursorForCurrentGrant,
  encodeIntegrationCursor,
  listingGrantFingerprint,
  readIntegrationCursor,
} from '../src/server/integration-cursor'

const integrationId = 'argo-secondbrain'
const listingA = '123e4567-e89b-12d3-a456-426614174000'
const listingB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const cursor = {
  updatedAt: '2026-11-21T00:00:00.000Z',
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
}

describe('Argo request cursor grant binding', () => {
  test('canonicalizes listing order, duplicate grants, and UUID casing', () => {
    expect(listingGrantFingerprint(integrationId, [listingA, listingB, listingA]))
      .toBe(listingGrantFingerprint(integrationId, [listingB.toUpperCase(), listingA]))
  })

  test('changes the fingerprint when the allowed listing set changes', () => {
    expect(listingGrantFingerprint(integrationId, [listingA]))
      .not.toBe(listingGrantFingerprint(integrationId, [listingA, listingB]))
  })

  test('accepts a cursor only for the same grant set', () => {
    const fingerprint = listingGrantFingerprint(integrationId, [listingA])
    const encoded = encodeIntegrationCursor({ ...cursor, grantFingerprint: fingerprint })
    const parsed = readIntegrationCursor(encoded)

    expect(cursorForCurrentGrant(parsed, fingerprint)).toEqual({ ...cursor, grantFingerprint: fingerprint })
    expect(cursorForCurrentGrant(parsed, listingGrantFingerprint(integrationId, [listingA, listingB]))).toBeNull()
  })

  test('rejects old unbound cursors so newly granted listings replay from the beginning', () => {
    const legacy = Buffer.from(JSON.stringify(cursor)).toString('base64url')
    const currentFingerprint = listingGrantFingerprint(integrationId, [listingB])

    const parsedLegacy = readIntegrationCursor(legacy)
    expect(parsedLegacy).not.toBeNull()
    expect(cursorForCurrentGrant(parsedLegacy, currentFingerprint)).toBeNull()
  })
})
