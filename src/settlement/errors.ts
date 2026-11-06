/**
 * Typed settlement errors and wallet/RPC error classification.
 * Generated in Arc Studio.
 */

import {
  BaseError,
  ChainMismatchError,
  ContractFunctionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  RpcRequestError,
  TimeoutError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
} from 'viem'

export type SettlementErrorCode =
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_CHAIN'
  | 'TOKEN_MISMATCH'
  | 'TOKEN_METADATA_MISMATCH'
  | 'WALLET_NOT_CONNECTED'
  | 'WRONG_NETWORK'
  | 'INSUFFICIENT_FUNDS'
  | 'USER_REJECTED'
  | 'RPC_FAILURE'
  | 'REVERTED'
  | 'VERIFICATION_FAILED'
  | 'WRONG_RECIPIENT'
  | 'WRONG_SENDER'
  | 'WRONG_AMOUNT'
  | 'ALREADY_PAID'
  | 'DUPLICATE_TRANSACTION'
  | 'UNKNOWN'

/** Which receipt check failed when `code` is VERIFICATION_FAILED. */
export type VerificationCheck =
  | 'chain'
  | 'status'
  | 'transaction_target'
  | 'native_value'
  | 'calldata'
  | 'sender'
  | 'transfer_log'
  | 'native_mirror'

export class SettlementError extends Error {
  readonly code: SettlementErrorCode
  readonly retryable: boolean
  readonly check?: VerificationCheck
  readonly details?: Readonly<Record<string, string>>
  readonly cause?: unknown

  constructor(
    code: SettlementErrorCode,
    message: string,
    options: {
      retryable?: boolean
      check?: VerificationCheck
      details?: Record<string, string>
      cause?: unknown
    } = {},
  ) {
    super(message)
    this.name = 'SettlementError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.check = options.check
    this.details = options.details
    this.cause = options.cause
  }
}

function hasCause<T extends Error>(error: unknown, ctor: new (...args: never[]) => T): boolean {
  if (!(error instanceof BaseError)) return false
  return error.walk((e) => e instanceof ctor) !== null
}

function flattenMessage(error: unknown): string {
  if (error instanceof BaseError) {
    const parts: string[] = []
    error.walk((e) => {
      if (e instanceof Error) parts.push(e.message)
      return false
    })
    return parts.join(' ').toLowerCase()
  }
  return error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
}

function rpcCode(error: unknown): number | undefined {
  if (error instanceof BaseError) {
    const hit: unknown = error.walk((e) => typeof (e as { code?: unknown }).code === 'number')
    const code = (hit as { code?: unknown } | null)?.code
    return typeof code === 'number' ? code : undefined
  }
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'number' ? code : undefined
}

/** Maps anything thrown by a wallet or an RPC node to a SettlementError with user-safe copy. */
export function classifyError(error: unknown): SettlementError {
  if (error instanceof SettlementError) return error

  const message = flattenMessage(error)

  if (hasCause(error, UserRejectedRequestError) || rpcCode(error) === 4001 || message.includes('user rejected') || message.includes('user denied')) {
    return new SettlementError('USER_REJECTED', 'You rejected the request in your wallet. No payment was sent.', { retryable: true, cause: error })
  }
  if (hasCause(error, ChainMismatchError) || message.includes('does not match the target chain') || message.includes('chain mismatch')) {
    return new SettlementError('WRONG_NETWORK', 'Your wallet is on a different network. Switch to the required network and try again.', { retryable: true, cause: error })
  }
  if (
    hasCause(error, InsufficientFundsError) ||
    message.includes('insufficient funds') ||
    message.includes('exceeds balance') ||
    message.includes('insufficient balance')
  ) {
    return new SettlementError('INSUFFICIENT_FUNDS', 'Your wallet does not have enough USDC to cover this payment and the network fee.', { retryable: true, cause: error })
  }
  if (hasCause(error, ContractFunctionRevertedError) || message.includes('execution reverted') || message.includes('reverted')) {
    return new SettlementError('REVERTED', 'The USDC contract rejected this transfer. Nothing was sent.', { cause: error })
  }
  if (
    hasCause(error, HttpRequestError) ||
    hasCause(error, TimeoutError) ||
    hasCause(error, RpcRequestError) ||
    hasCause(error, WaitForTransactionReceiptTimeoutError) ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('timed out') ||
    message.includes('timeout')
  ) {
    return new SettlementError('RPC_FAILURE', 'The network node could not be reached. Check your connection and try again.', { retryable: true, cause: error })
  }
  return new SettlementError('UNKNOWN', 'Something went wrong before the payment could be completed.', { retryable: true, cause: error })
}
