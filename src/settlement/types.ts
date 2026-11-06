/**
 * Typed requests and responses for the settlement adapter.
 * Generated in Arc Studio.
 *
 * Money is always `bigint` in the token's base units. No `number` ever holds an amount.
 */

import type { Address, Hash } from 'viem'
import type { SettlementErrorCode, VerificationCheck } from './errors'

/** What the host application asks the adapter to settle. */
export interface SettlementRequest {
  chainId: number
  tokenAddress: Address
  recipientAddress: Address
  /** Exact amount in token base units (USDC on Arc: 6 decimals). Must be > 0. */
  amountBaseUnits: bigint
  /** The host's own job identifier. Used for duplicate detection; never sent onchain. */
  jobKey: string
}

/** Progress while the user's wallet and the chain are working. */
export type SettlementProgress =
  | { stage: 'awaiting_signature' }
  | { stage: 'confirming'; txHash: Hash }

export interface TransferLogDetails {
  logIndex: number
  from: Address
  to: Address
  value: bigint
}

/** The 18-decimal native-view mirror of an Arc USDC transfer. Informational and cross-checked. */
export interface NativeMirrorDetails {
  emitter: Address
  logIndex: number
  from: Address
  to: Address
  /** Value in the 18-decimal native view. */
  valueNative: bigint
}

/** Receipt fields that were parsed and validated against the request. */
export interface ParsedReceipt {
  transactionHash: Hash
  blockNumber: bigint
  blockHash: Hash
  status: 'success'
  from: Address
  /** The contract the transaction was sent to. Always the configured token. */
  to: Address
  gasUsed: bigint
  effectiveGasPrice: bigint
  /** The single token Transfer log that matched sender, recipient and amount. */
  transfer: TransferLogDetails
  /** Every Transfer log emitted by the token contract in this transaction. */
  tokenTransferLogs: readonly TransferLogDetails[]
  nativeMirror: NativeMirrorDetails | null
}

export interface PendingSettlement {
  status: 'pending'
  jobKey: string
  txHash: Hash
  chainId: number
  tokenAddress: Address
  recipient: Address
  sender: Address | null
  /** The amount that was requested. Nothing is verified yet. */
  requestedAmount: bigint
  confirmations: number
  requiredConfirmations: number
  receipt: null
  /** Set when status could not be refreshed (for example an RPC outage). The payment may still land. */
  warning: string | null
}

export interface ConfirmedSettlement {
  status: 'confirmed'
  jobKey: string
  txHash: Hash
  chainId: number
  /** Verified from the receipt, not echoed from the request. */
  tokenAddress: Address
  sender: Address
  recipient: Address
  /** Verified from the Transfer log. */
  transferredAmount: bigint
  receipt: ParsedReceipt
  explorerUrl: string
}

export interface FailedSettlement {
  status: 'failed'
  jobKey: string
  chainId: number
  txHash: Hash | null
  code: SettlementErrorCode
  check: VerificationCheck | null
  message: string
  retryable: boolean
  details: Readonly<Record<string, string>> | null
}

export type SettlementOutcome = PendingSettlement | ConfirmedSettlement | FailedSettlement

/** Result of the checks that run before the wallet is asked to sign. */
export interface SettlementPreflight {
  senderBalance: bigint
  tokenSymbol: string
  tokenDecimals: number
}

/**
 * The only thing a host application should persist as proof of payment.
 * Produced from a validated receipt; never from a wallet response.
 */
export interface PaymentReceipt {
  status: 'confirmed'
  jobKey: string
  txHash: Hash
  chainId: number
  /** Token address read from the receipt, not echoed from the request. */
  tokenAddress: Address
  sender: Address
  recipient: Address
  /** Exact amount from the Transfer log, in token base units. */
  amountBaseUnits: bigint
  blockNumber: bigint
  blockHash: Hash
  explorerUrl: string
  /** Full parsed receipt details. */
  receipt: ParsedReceipt
}
