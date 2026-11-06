/**
 * Network and token configuration for the settlement module.
 *
 * Generated in Arc Studio. This is the ONLY file that knows which chain and token are allowed,
 * and the ONLY place token decimals are written down. Values were confirmed against live Arc
 * Testnet on 2026-11-06 (eth_chainId = 0x4cef52, decimals() = 6, symbol() = USDC), and the
 * adapter re-checks decimals() and symbol() on chain before the first payment.
 *
 * Self-contained: depends only on viem. Re-verify every value against
 * https://docs.arc.io before changing it or adding a network.
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
  /** Decimals of the native gas view. On Arc the gas token IS USDC, at 18 decimals instead of 6. */
  nativeDecimals: number
  /** Blocks (including the inclusion block) required before a payment counts as confirmed. */
  requiredConfirmations: number
  /**
   * Arc mirrors every USDC ERC-20 transfer as a second Transfer log, in the 18-decimal
   * native view, from this system address. Observed on live Arc Testnet receipts. It is
   * never counted as a token transfer; it is only cross-checked (value = amount x 10^12).
   */
  nativeMirrorEmitter: Address
}

export const ARC_TESTNET_CHAIN_ID = 5042002

const ARC_TESTNET: SettlementNetworkConfig = {
  chainId: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  rpcUrl: 'https://rpc.testnet.arc.io',
  explorerBase: 'https://explorer.testnet.arc.io',
  token: { symbol: 'USDC', address: getAddress('0x3600000000000000000000000000000000000000'), decimals: 6 },
  nativeDecimals: 18,
  requiredConfirmations: 1,
  nativeMirrorEmitter: getAddress('0xfffffffffffffffffffffffffffffffffffffffe'),
}

export const ARC_TESTNET_CONFIG: SettlementNetworkConfig = Object.freeze(ARC_TESTNET)

/** Allow-list. A chain that is not here can never be paid on. */
export const SETTLEMENT_NETWORKS: Readonly<Record<number, SettlementNetworkConfig>> = Object.freeze({
  [ARC_TESTNET_CONFIG.chainId]: ARC_TESTNET_CONFIG,
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
