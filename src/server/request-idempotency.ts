export type SubmittedRequestPayload = {
  listingId: string
  title: string
  description: string
  attachmentRefs: string[]
}

export type ExistingRequestPayload = {
  listing_id: string
  title: string
  description: string
  attachment_refs: unknown
}

function normalizeUuid(value: string): string {
  const hex = value.replace(/[{}-]/g, '').toLowerCase()
  if (/^[0-9a-f]{32}$/.test(hex)) {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return value.toLowerCase()
}

export function matchesRequestPayload(
  existing: ExistingRequestPayload,
  submitted: SubmittedRequestPayload,
): boolean {
  return normalizeUuid(existing.listing_id) === normalizeUuid(submitted.listingId)
    && existing.title === submitted.title
    && existing.description === submitted.description
    && Array.isArray(existing.attachment_refs)
    && JSON.stringify(existing.attachment_refs) === JSON.stringify(submitted.attachmentRefs)
}
