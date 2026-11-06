/**
 * JSON-safe serialization for sending an outcome to the host backend. Generated in Arc Studio.
 * bigint values become decimal strings, so no amount ever passes through a JS number.
 */

import type { SettlementOutcome } from './types'

export function serializeOutcome(outcome: SettlementOutcome): string {
  return JSON.stringify(outcome, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2)
}
