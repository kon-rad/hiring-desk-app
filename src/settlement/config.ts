/**
 * Network and token configuration for the settlement module.
 *
 * This is the ONLY file that knows which chain and token are allowed, and the ONLY place
 * token decimals are written down. The adapter re-checks decimals() and symbol() on chain
 * before the first payment.
 *
 * Self-contained: depends only on viem. Re-verify every value against
 * the chain and issuer documentation before changing it or adding a network.
 */

import { getAddress, type Address } from 'viem'
import { SettlementError } from './errors'

export interface SettlementTokenConfig {
  symbol: string
  address: Address
  /** Single source of truth for the token's decimal count (ERC-20 view). */
  decimals: number
}

export interface SettlementNetworkConfig {
  chainId: number
  name: string
  rpcUrl: string
  explorerBase: string
  token: SettlementTokenConfig
  /** Decimals of the native gas asset (ETH on Base). */
  nativeDecimals: number
  /** Blocks (including the inclusion block) required before a payment counts as confirmed. */
  requiredConfirmations: number
}

export const BASE_MAINNET_CHAIN_ID = 8453

const BASE_MAINNET: SettlementNetworkConfig = {
  chainId: BASE_MAINNET_CHAIN_ID,
  name: 'Base Mainnet',
  rpcUrl: 'https://mainnet.base.org',
  explorerBase: 'https://basescan.org',
  token: { symbol: 'USDC', address: getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'), decimals: 6 },
  nativeDecimals: 18,
  requiredConfirmations: 2,
}

export const BASE_MAINNET_CONFIG: SettlementNetworkConfig = Object.freeze(BASE_MAINNET)

/** Allow-list. A chain that is not here can never be paid on. */
export const SETTLEMENT_NETWORKS: Readonly<Record<number, SettlementNetworkConfig>> = Object.freeze({
  [BASE_MAINNET_CONFIG.chainId]: BASE_MAINNET_CONFIG,
})

export function getNetworkConfig(chainId: number): SettlementNetworkConfig {
  const config = SETTLEMENT_NETWORKS[chainId]
  if (!config) {
    const allowed = Object.values(SETTLEMENT_NETWORKS)
      .map((n) => `${n.name} (${n.chainId})`)
      .join(', ')
    throw new SettlementError('UNSUPPORTED_CHAIN', `Chain ${chainId} is not supported for settlement. Supported: ${allowed}.`)
  }
  return config
}

export function explorerTxUrl(config: SettlementNetworkConfig, txHash: string): string {
  return `${config.explorerBase}/tx/${txHash}`
}

export function explorerAddressUrl(config: SettlementNetworkConfig, address: string): string {
  return `${config.explorerBase}/address/${address}`
}
