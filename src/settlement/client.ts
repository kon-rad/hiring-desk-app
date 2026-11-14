/**
 * Read-only viem client factory. Generated in Arc Studio.
 * Works in the browser and in Node. It never holds a key and cannot sign.
 */

import { createPublicClient, defineChain, http, type Chain, type PublicClient } from 'viem'
import { getNetworkConfig } from './config'

export function getSettlementChain(chainId: number, rpcUrl?: string): Chain {
  const config = getNetworkConfig(chainId)
  const url = rpcUrl ?? config.rpcUrl
  return defineChain({
    id: config.chainId,
    name: config.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: config.nativeDecimals },
    rpcUrls: { default: { http: [url] } },
    blockExplorers: { default: { name: 'Basescan', url: config.explorerBase } },
    testnet: false,
  })
}

export function createSettlementPublicClient(chainId: number, rpcUrl?: string): PublicClient {
  const chain = getSettlementChain(chainId, rpcUrl)
  return createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { retryCount: 2, timeout: 15_000 }) })
}
