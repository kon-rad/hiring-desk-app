import 'server-only'

export function serverEnv() {
  const production = process.env.NODE_ENV === 'production'
  const databaseUrl = process.env.CYBA_DATABASE_URL
  // Secrets are injected by systemd at runtime; Next's static build must work without production secrets.
  const publicOrigin = process.env.CYBA_PUBLIC_ORIGIN
  if (production && publicOrigin && new URL(publicOrigin).protocol !== 'https:') throw new Error('CYBA_PUBLIC_ORIGIN must use HTTPS in production')
  const integrationSecret = process.env.CYBA_ARGO_INTEGRATION_SECRET
  if (integrationSecret && Buffer.byteLength(integrationSecret) < 32) throw new Error('CYBA_ARGO_INTEGRATION_SECRET must contain at least 32 bytes')
  return {
    databaseUrl,
    publicOrigin,
    baseReadRpc: process.env.CYBA_BASE_RPC_URL ?? 'https://mainnet.base.org',
    baseSubmitRpc: process.env.CYBA_BASE_SEQUENCER_URL ?? 'https://mainnet-sequencer.base.org',
    argoConfigured: Boolean(integrationSecret),
  }
}
