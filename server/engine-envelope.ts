import { createHash, createHmac } from 'node:crypto'

export interface EngineEnvelopeInput { method: string; path: string; body: string; wallet: string; timestamp: number }
/** Byte-for-byte contract shared with the engine's cybazaar-envelope/v1 verifier. */
export function canonicalEnvelope(input: EngineEnvelopeInput): string {
  return JSON.stringify(['cybazaar-envelope/v1', input.method.toUpperCase(), input.path, createHash('sha256').update(input.body).digest('hex'), input.wallet.toLowerCase(), String(input.timestamp)])
}
export function signEngineRequest(input: EngineEnvelopeInput, secret: string): string {
  if (Buffer.byteLength(secret) < 32) throw new Error('CYBA_ENVELOPE_SECRET must contain at least 32 bytes')
  return createHmac('sha256', secret).update(canonicalEnvelope(input)).digest('hex')
}
export function envelopeHeaders(input: EngineEnvelopeInput, secret: string): Headers {
  return new Headers({ accept: 'application/json', 'content-type': 'application/json', 'x-cyba-wallet': input.wallet.toLowerCase(), 'x-cyba-timestamp': String(input.timestamp), 'x-cyba-signature': signEngineRequest(input, secret) })
}
