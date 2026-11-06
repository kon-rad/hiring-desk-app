/**
 * Amount helpers. Generated in Arc Studio.
 *
 * Every decimal count comes from `getNetworkConfig(chainId)`; nothing here (or anywhere else
 * in the module) hard-codes 6 or 18. All math is bigint. No floating point, no rounding:
 * input with more fraction digits than the token has is rejected, never truncated.
 */

import { getNetworkConfig } from './config'
import { SettlementError } from './errors'

const UINT256_MAX = (1n << 256n) - 1n
const DECIMAL = /^(\d+)(?:\.(\d+))?$/

/** Parses a plain decimal string such as "12.50" into exact base units. */
export function toBaseUnits(chainId: number, decimalString: string): bigint {
  const { token } = getNetworkConfig(chainId)
  const match = DECIMAL.exec(decimalString.trim())
  const whole = match?.[1]
  const fraction = match?.[2] ?? ''
  if (whole === undefined || fraction.length > token.decimals) {
    throw new SettlementError('INVALID_REQUEST', `"${decimalString}" is not a valid ${token.symbol} amount (digits only, max ${token.decimals} decimal places).`)
  }
  return BigInt(whole + fraction.padEnd(token.decimals, '0'))
}

/** Formats base units as an exact decimal string with no rounding, for example "12.5". */
export function formatBaseUnits(chainId: number, baseUnits: bigint): string {
  const { token } = getNetworkConfig(chainId)
  const negative = baseUnits < 0n
  const digits = (negative ? -baseUnits : baseUnits).toString().padStart(token.decimals + 1, '0')
  const whole = digits.slice(0, digits.length - token.decimals)
  const fraction = digits.slice(digits.length - token.decimals).replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

/** Formats with at least `minFraction` decimals ("12.50"), still exact. */
export function formatBaseUnitsPadded(chainId: number, baseUnits: bigint, minFraction = 2): string {
  const [whole, fraction = ''] = formatBaseUnits(chainId, baseUnits).split('.')
  return `${whole}.${fraction.padEnd(minFraction, '0')}`
}

/**
 * The same funds in the 18-decimal native gas view (used to compare against fees and to
 * cross-check Arc's mirrored Transfer log). Widening is exact; this is the module's only rescale.
 */
export function toNativeView(chainId: number, baseUnits: bigint): bigint {
  const { token, nativeDecimals } = getNetworkConfig(chainId)
  return baseUnits * 10n ** BigInt(nativeDecimals - token.decimals)
}

export function assertValidBaseUnits(amount: unknown): asserts amount is bigint {
  if (typeof amount !== 'bigint') {
    throw new SettlementError('INVALID_REQUEST', 'Amount must be a bigint in token base units.')
  }
  if (amount <= 0n) {
    throw new SettlementError('INVALID_REQUEST', 'Amount must be greater than zero.')
  }
  if (amount > UINT256_MAX) {
    throw new SettlementError('INVALID_REQUEST', 'Amount exceeds the maximum token amount.')
  }
}
