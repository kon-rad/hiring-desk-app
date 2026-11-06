/**
 * PaymentReceipt conversion and the JSON shapes for a host's verify endpoint.
 * Generated in Arc Studio. Pure functions; no I/O, no framework.
 *
 * Money crosses JSON as decimal strings, never as numbers.
 */

import type { Address, Hash } from 'viem'
import type { SettlementErrorCode } from './errors'
import type { ConfirmedSettlement, PaymentReceipt, SettlementOutcome } from './types'

export function toPaymentReceipt(settlement: ConfirmedSettlement): PaymentReceipt {
  return {
    status: 'confirmed',
    jobKey: settlement.jobKey,
    txHash: settlement.txHash,
    chainId: settlement.chainId,
    tokenAddress: settlement.tokenAddress,
    sender: settlement.sender,
    recipient: settlement.recipient,
    amountBaseUnits: settlement.transferredAmount,
    blockNumber: settlement.receipt.blockNumber,
    blockHash: settlement.receipt.blockHash,
    explorerUrl: settlement.explorerUrl,
    receipt: settlement.receipt,
  }
}

/** Browser -> host server. The server must load the job itself; the body carries only the hash. */
export interface VerifyPaymentRequestBody {
  txHash: Hash
}

export interface PaymentReceiptJson {
  status: 'confirmed'
  jobKey: string
  txHash: Hash
  chainId: number
  tokenAddress: Address
  sender: Address
  recipient: Address
  amountBaseUnits: string
  blockNumber: string
  blockHash: Hash
  gasUsed: string
  explorerUrl: string
}

/** Host server -> browser. */
export type VerifyPaymentResponse =
  | { status: 'confirmed'; receipt: PaymentReceiptJson }
  | { status: 'pending'; txHash: Hash; confirmations: number; requiredConfirmations: number; warning: string | null }
  | { status: 'failed'; code: SettlementErrorCode; message: string; retryable: boolean; txHash: Hash | null }

export function toPaymentReceiptJson(receipt: PaymentReceipt): PaymentReceiptJson {
  return {
    status: 'confirmed',
    jobKey: receipt.jobKey,
    txHash: receipt.txHash,
    chainId: receipt.chainId,
    tokenAddress: receipt.tokenAddress,
    sender: receipt.sender,
    recipient: receipt.recipient,
    amountBaseUnits: receipt.amountBaseUnits.toString(),
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    gasUsed: receipt.receipt.gasUsed.toString(),
    explorerUrl: receipt.explorerUrl,
  }
}

export function toVerifyResponse(outcome: SettlementOutcome): VerifyPaymentResponse {
  switch (outcome.status) {
    case 'confirmed':
      return { status: 'confirmed', receipt: toPaymentReceiptJson(toPaymentReceipt(outcome)) }
    case 'pending':
      return {
        status: 'pending',
        txHash: outcome.txHash,
        confirmations: outcome.confirmations,
        requiredConfirmations: outcome.requiredConfirmations,
        warning: outcome.warning,
      }
    case 'failed':
      return { status: 'failed', code: outcome.code, message: outcome.message, retryable: outcome.retryable, txHash: outcome.txHash }
  }
}
