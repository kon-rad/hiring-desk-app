/**
 * Read-only transaction verification. Generated in Arc Studio.
 *
 * `verifySettlement` is safe to run on a server: it needs a public RPC client and nothing
 * else. It never signs and never takes a key. The Hiring Desk backend should call it before
 * it marks a job as paid, and must not trust a client that says "paid".
 */

import {
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  type Address,
  type Hash,
  type PublicClient,
} from 'viem'
import { explorerTxUrl } from './config'
import type { SettlementLedger } from './ledger'
import { classifyError, SettlementError } from './errors'
import { normalizeRequest } from './request'
import { validateReceipt } from './receipt'
import type { FailedSettlement, PendingSettlement, SettlementOutcome, SettlementRequest } from './types'

export interface VerifyOptions {
  /** Require the payment to have been sent by this address (the connected client wallet). */
  expectedSender?: Address
  /** If given, a hash already bound to a different job is rejected (replay of one payment across jobs). */
  ledger?: SettlementLedger
}

const isHash = (value: unknown): value is Hash => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)

export function toFailed(error: unknown, jobKey: string, chainId: number, txHash: Hash | null): FailedSettlement {
  const e = classifyError(error)
  return {
    status: 'failed',
    jobKey,
    chainId,
    txHash,
    code: e.code,
    check: e.check ?? null,
    message: e.message,
    retryable: e.retryable,
    details: e.details ?? null,
  }
}

/**
 * Fetches the transaction and receipt for `txHash` and decides:
 * - `confirmed`: a successful receipt with enough confirmations that matches the request exactly.
 * - `pending`: not mined yet, not enough confirmations, or the node could not be reached.
 * - `failed`: reverted, or mined but does not match the request.
 * It never throws.
 */
export async function verifySettlement(
  publicClient: PublicClient,
  input: SettlementRequest,
  txHash: Hash,
  options: VerifyOptions = {},
): Promise<SettlementOutcome> {
  let normalized
  try {
    normalized = normalizeRequest(input)
  } catch (error) {
    return toFailed(error, input.jobKey, input.chainId, null)
  }
  const { request, config } = normalized

  if (!isHash(txHash)) {
    return toFailed(new SettlementError('INVALID_REQUEST', 'Transaction hash is not valid.'), request.jobKey, request.chainId, null)
  }

  const pending = (warning: string | null, confirmations = 0, sender: Address | null = options.expectedSender ?? null): PendingSettlement => ({
    status: 'pending',
    jobKey: request.jobKey,
    txHash,
    chainId: request.chainId,
    tokenAddress: request.tokenAddress,
    recipient: request.recipientAddress,
    sender,
    requestedAmount: request.amountBaseUnits,
    confirmations,
    requiredConfirmations: config.requiredConfirmations,
    receipt: null,
    warning,
  })

  try {
    const owner = await options.ledger?.getByTxHash(txHash)
    if (owner && owner.jobKey !== request.jobKey) {
      throw new SettlementError('DUPLICATE_TRANSACTION', 'This transaction is already recorded as the payment for a different job.')
    }

    // The RPC endpoint must really be the configured chain, or every later check is meaningless.
    const liveChainId = await publicClient.getChainId()
    if (liveChainId !== request.chainId) {
      throw new SettlementError('WRONG_NETWORK', `The RPC endpoint is on chain ${liveChainId}, expected ${request.chainId}.`)
    }

    let transaction
    try {
      transaction = await publicClient.getTransaction({ hash: txHash })
    } catch (error) {
      if (error instanceof TransactionNotFoundError) return pending(null)
      throw error
    }

    let receipt
    try {
      receipt = await publicClient.getTransactionReceipt({ hash: txHash })
    } catch (error) {
      if (error instanceof TransactionReceiptNotFoundError) return pending(null, 0, transaction.from)
      throw error
    }

    if (receipt.status !== 'success') {
      return toFailed(
        new SettlementError('REVERTED', 'The transaction was mined but reverted. No USDC moved; only the network fee was spent.', { retryable: true }),
        request.jobKey,
        request.chainId,
        txHash,
      )
    }

    const head = await publicClient.getBlockNumber()
    const confirmations = head >= receipt.blockNumber ? Number(head - receipt.blockNumber) + 1 : 0
    if (confirmations < config.requiredConfirmations) return pending(null, confirmations, transaction.from)

    const parsed = validateReceipt({ config, request, transaction, receipt, expectedSender: options.expectedSender })
    return {
      status: 'confirmed',
      jobKey: request.jobKey,
      txHash,
      chainId: request.chainId,
      tokenAddress: parsed.to,
      sender: parsed.from,
      recipient: parsed.transfer.to,
      transferredAmount: parsed.transfer.value,
      receipt: parsed,
      explorerUrl: explorerTxUrl(config, txHash),
    }
  } catch (error) {
    const e = classifyError(error)
    if (e.code === 'RPC_FAILURE') {
      // The transaction may still land. Never turn an outage into a failure or a success.
      return pending('Could not reach the network to check this payment. It may still confirm; check again shortly.')
    }
    return toFailed(e, request.jobKey, request.chainId, txHash)
  }
}
