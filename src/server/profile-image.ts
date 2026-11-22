export function validProfileImageUrl(value: unknown): value is string | null {
  if (value === null) return true
  if (typeof value !== 'string' || value.length > 2048) return false
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password } catch { return false }
}
