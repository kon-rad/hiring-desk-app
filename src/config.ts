/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { base, mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { getNetworkConfig } from './settlement'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
// Pass the RPC explicitly so browser reads and traces use the settlement allow-list.
const baseRpcUrl = getNetworkConfig(base.id).rpcUrl
registerChain(base.id, baseRpcUrl)

export const config = createConfig({
  chains: [base, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [base.id]: http(baseRpcUrl),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
