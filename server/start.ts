import { createHandler, createMvpHandler } from './app'
import { BASE_MAINNET_CONFIG, createSettlementPublicClient, verifySettlement } from '../src/settlement'

const upstream = process.env.HIRING_DESK_UPSTREAM
const memory = process.env.HIRING_DESK_DEV_MEMORY === '1'
if (!upstream && !memory) throw new Error('Set HIRING_DESK_UPSTREAM, or explicitly set HIRING_DESK_DEV_MEMORY=1 for ephemeral local development')
const publicClient = memory ? createSettlementPublicClient(8453, process.env.BASE_RPC_URL) : null
const handler = upstream ? createHandler(upstream) : createMvpHandler({
  verifyPayment: async input => {
    const outcome = await verifySettlement(publicClient!, { jobKey: input.jobId, chainId: 8453, tokenAddress: BASE_MAINNET_CONFIG.token.address, recipientAddress: input.recipient, amountBaseUnits: input.amountBaseUnits }, input.txHash, { expectedSender: input.sender })
    return outcome.status === 'confirmed'
      ? { status: 'confirmed', txHash: outcome.txHash, blockNumber: outcome.receipt.blockNumber.toString(), explorerUrl: outcome.explorerUrl }
      : outcome.status === 'pending'
        ? { status: 'pending', txHash: outcome.txHash, confirmations: outcome.confirmations, requiredConfirmations: outcome.requiredConfirmations, warning: outcome.warning }
        : { status: 'failed', txHash: outcome.txHash, code: outcome.code, message: outcome.message, retryable: outcome.retryable }
  },
})
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PORT ?? 3001),
  fetch: handler,
})
console.log(`Hiring Desk gateway listening on ${server.url}`)
