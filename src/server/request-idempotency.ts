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

export function matchesRequestPayload(
  existing: ExistingRequestPayload,
  submitted: SubmittedRequestPayload,
): boolean {
  return existing.listing_id.toLowerCase() === submitted.listingId.toLowerCase()
    && existing.title === submitted.title
    && existing.description === submitted.description
    && Array.isArray(existing.attachment_refs)
    && JSON.stringify(existing.attachment_refs) === JSON.stringify(submitted.attachmentRefs)
}
