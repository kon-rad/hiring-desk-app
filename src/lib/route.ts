/**
 * Job reference from the page route. Generated in Arc Studio.
 * Only the reference is read. Query parameters such as recipient or amount are ignored on purpose.
 */

const JOB_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]*(?:\/[A-Za-z0-9][A-Za-z0-9._:-]*)?$/
const PATH = /^\/(?:jobs|pay)\/([^/]+)\/?$/

export function readJobRef(location: Pick<Location, 'pathname' | 'search'>): string | null {
  const fromPath = PATH.exec(location.pathname)?.[1]
  let candidate: string | null | undefined = null
  if (fromPath) {
    try {
      candidate = decodeURIComponent(fromPath)
    } catch {
      return null
    }
  } else {
    candidate = new URLSearchParams(location.search).get('job')
  }
  return candidate && candidate.length <= 128 && !candidate.includes('..') && JOB_REF.test(candidate) ? candidate : null
}
