import { createHash } from 'node:crypto'

export type IntegrationRequestCursor = {
  updatedAt: string
  id: string
  grantFingerprint?: string
}

export function listingGrantFingerprint(integrationId: string, listingIds: string[]): string {
  const canonicalIds = [...new Set(listingIds.map((id) => id.toLowerCase()))].sort()
  return createHash('sha256').update(JSON.stringify([integrationId, canonicalIds])).digest('hex')
}

export function encodeIntegrationCursor(cursor: IntegrationRequestCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export function readIntegrationCursor(value: string | null): IntegrationRequestCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString()) as Partial<IntegrationRequestCursor>
    if (
      typeof parsed.updatedAt !== 'string' || !Number.isFinite(Date.parse(parsed.updatedAt))
      || typeof parsed.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.id)
      || parsed.grantFingerprint !== undefined
        && (typeof parsed.grantFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.grantFingerprint))
    ) return null
    return parsed as IntegrationRequestCursor
  } catch {
    return null
  }
}

export function cursorForCurrentGrant(
  cursor: IntegrationRequestCursor | null,
  currentFingerprint: string,
): IntegrationRequestCursor | null {
  return cursor?.grantFingerprint === currentFingerprint ? cursor : null
}
