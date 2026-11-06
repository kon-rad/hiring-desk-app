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
    nativeCurrency: { name: config.token.symbol, symbol: config.token.symbol, decimals: config.nativeDecimals },
    rpcUrls: { default: { http: [url] } },
    blockExplorers: { default: { name: 'Arc Explorer', url: config.explorerBase } },
    testnet: true,
  })
}

export function createSettlementPublicClient(chainId: number, rpcUrl?: string): PublicClient {
  const chain = getSettlementChain(chainId, rpcUrl)
  return createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { retryCount: 2, timeout: 15_000 }) })
}
