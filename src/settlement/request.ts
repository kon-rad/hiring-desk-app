/**
 * Request validation. Generated in Arc Studio.
 * Runs before anything is shown to the user or sent to a wallet.
 */

import { getAddress, isAddress, zeroAddress, type Address } from 'viem'
import { assertValidBaseUnits } from './amount'
import { getNetworkConfig, type SettlementNetworkConfig } from './config'
import { SettlementError } from './errors'
import type { SettlementRequest } from './types'

const MAX_JOB_KEY_LENGTH = 128
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export interface NormalizedRequest {
  request: SettlementRequest
  config: SettlementNetworkConfig
}

function normalizeAddress(label: string, value: unknown): Address {
  // strict: a mixed-case address must carry a valid EIP-55 checksum, which catches typos.
  if (typeof value !== 'string' || !isAddress(value, { strict: true })) {
    throw new SettlementError('INVALID_REQUEST', `${label} is not a valid address (or its checksum is wrong).`)
  }
  const address = getAddress(value)
  if (address === zeroAddress) {
    throw new SettlementError('INVALID_REQUEST', `${label} cannot be the zero address.`)
  }
  return address
}

/** Validates a request, checksums its addresses, and pins it to the allow-listed chain and token. */
export function normalizeRequest(input: SettlementRequest): NormalizedRequest {
  if (!Number.isSafeInteger(input.chainId)) {
    throw new SettlementError('INVALID_REQUEST', 'chainId must be an integer.')
  }
  const config = getNetworkConfig(input.chainId)

  const tokenAddress = normalizeAddress('Token address', input.tokenAddress)
  if (tokenAddress !== config.token.address) {
    throw new SettlementError(
      'TOKEN_MISMATCH',
      `Token ${tokenAddress} is not the verified ${config.token.symbol} token on ${config.name} (${config.token.address}).`,
    )
  }

  const recipientAddress = normalizeAddress('Recipient address', input.recipientAddress)
  if (recipientAddress === config.token.address || recipientAddress === config.nativeMirrorEmitter) {
    throw new SettlementError('INVALID_REQUEST', 'Recipient cannot be the token contract or a system address.')
  }

  assertValidBaseUnits(input.amountBaseUnits)

  const jobKey = typeof input.jobKey === 'string' ? input.jobKey.trim() : ''
  if (jobKey.length === 0 || jobKey.length > MAX_JOB_KEY_LENGTH || CONTROL_CHARS.test(jobKey)) {
    throw new SettlementError('INVALID_REQUEST', `jobKey must be 1-${MAX_JOB_KEY_LENGTH} printable characters.`)
  }

  return {
    config,
    request: { chainId: input.chainId, tokenAddress, recipientAddress, amountBaseUnits: input.amountBaseUnits, jobKey },
  }
}
