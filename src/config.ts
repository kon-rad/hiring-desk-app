/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { getNetworkConfig } from './settlement'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
// Pass the RPC explicitly: viem's built-in default for Arc may be empty on older versions.
const arcRpcUrl = getNetworkConfig(arcTestnet.id).rpcUrl
registerChain(arcTestnet.id, arcRpcUrl)

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(arcRpcUrl),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
