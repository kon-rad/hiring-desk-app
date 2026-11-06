/**
 * Receipt parsing and validation. Generated in Arc Studio.
 *
 * Pure: takes a transaction and a receipt that were already fetched, and either returns a
 * ParsedReceipt or throws a SettlementError. A payment is only ever "confirmed" if this
 * function accepts it.
 */

import { decodeFunctionData, erc20Abi, parseEventLogs, type Address, type Hash, type Log, type TransactionReceipt } from 'viem'
import { toNativeView } from './amount'
import type { SettlementNetworkConfig } from './config'
import { SettlementError, type VerificationCheck } from './errors'
import type { NativeMirrorDetails, ParsedReceipt, SettlementRequest, TransferLogDetails } from './types'

/** The subset of a viem Transaction that validation needs. */
export interface TransactionLike {
  hash: Hash
  from: Address
  to?: Address | null
  value: bigint
  input: `0x${string}`
  chainId?: number
}

export interface ValidateReceiptInput {
  config: SettlementNetworkConfig
  request: SettlementRequest
  transaction: TransactionLike
  receipt: TransactionReceipt
  /** If set, the transaction must have been sent by this address (the connected client wallet). */
  expectedSender?: Address
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

type MismatchCode = 'VERIFICATION_FAILED' | 'WRONG_RECIPIENT' | 'WRONG_SENDER' | 'WRONG_AMOUNT'

function fail(check: VerificationCheck, message: string, expected: string, actual: string, code: MismatchCode = 'VERIFICATION_FAILED'): never {
  throw new SettlementError(code, message, { check, details: { expected, actual } })
}

function decodeTransfers(logs: readonly Log[], emitter: Address): TransferLogDetails[] {
  const own = logs.filter((log) => same(log.address, emitter))
  return parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: own, strict: true }).map((log) => ({
    logIndex: log.logIndex ?? -1,
    from: log.args.from,
    to: log.args.to,
    value: log.args.value,
  }))
}

export function validateReceipt(input: ValidateReceiptInput): ParsedReceipt {
  const { config, request, transaction, receipt, expectedSender } = input

  if (transaction.chainId !== config.chainId) {
    fail('chain', 'The transaction was sent on a different network.', String(config.chainId), String(transaction.chainId ?? 'missing'))
  }
  if (!same(receipt.transactionHash, transaction.hash)) {
    fail('transaction_target', 'The receipt does not belong to this transaction.', transaction.hash, receipt.transactionHash)
  }
  if (receipt.status !== 'success') {
    fail('status', 'The transaction was reverted.', 'success', receipt.status)
  }

  // ERC-20 path only. A native-value send, or a call routed through any other contract, is rejected.
  if (!transaction.to || !same(transaction.to, config.token.address) || !receipt.to || !same(receipt.to, config.token.address)) {
    fail('transaction_target', 'The transaction was not sent directly to the verified token contract.', config.token.address, transaction.to ?? 'contract creation')
  }
  if (transaction.value !== 0n) {
    fail('native_value', 'The transaction moved native value instead of an ERC-20 transfer.', '0', transaction.value.toString())
  }

  // Sender: the receipt, the transaction, and (if given) the connected wallet must agree.
  if (!same(receipt.from, transaction.from)) {
    fail('sender', 'Receipt sender and transaction sender differ.', transaction.from, receipt.from)
  }
  if (expectedSender && !same(receipt.from, expectedSender)) {
    fail('sender', 'The payment was sent from a different wallet than expected.', expectedSender, receipt.from, 'WRONG_SENDER')
  }

  // Calldata must be exactly transfer(recipient, amount).
  let decoded: ReturnType<typeof decodeFunctionData<typeof erc20Abi>>
  try {
    decoded = decodeFunctionData({ abi: erc20Abi, data: transaction.input })
  } catch {
    return fail('calldata', 'The transaction data is not an ERC-20 call.', 'transfer(address,uint256)', transaction.input.slice(0, 10))
  }
  if (decoded.functionName !== 'transfer') {
    fail('calldata', 'The transaction did not call transfer.', 'transfer', decoded.functionName)
  }
  const [callTo, callValue] = decoded.args
  if (!same(callTo, request.recipientAddress)) {
    fail('calldata', 'The transfer targets a different recipient.', request.recipientAddress, callTo, 'WRONG_RECIPIENT')
  }
  if (callValue !== request.amountBaseUnits) {
    fail('calldata', 'The transfer amount differs from the request.', request.amountBaseUnits.toString(), callValue.toString(), 'WRONG_AMOUNT')
  }

  // Logs: exactly one token Transfer must match sender, recipient and amount.
  const tokenLogs = decodeTransfers(receipt.logs, config.token.address)
  const matches = tokenLogs.filter(
    (t) => same(t.from, receipt.from) && same(t.to, request.recipientAddress) && t.value === request.amountBaseUnits,
  )
  if (matches.length !== 1) {
    const toRecipient = tokenLogs.filter((t) => same(t.to, request.recipientAddress))
    const code: MismatchCode =
      matches.length === 0 && toRecipient.length > 0 ? 'WRONG_AMOUNT' : matches.length === 0 && tokenLogs.length > 0 ? 'WRONG_RECIPIENT' : 'VERIFICATION_FAILED'
    fail('transfer_log', `Expected exactly one matching Transfer event from the token, found ${matches.length}.`, `${receipt.from} -> ${request.recipientAddress}: ${request.amountBaseUnits}`, `${tokenLogs.length} token transfer log(s)`, code)
  }
  const transfer = matches[0]

  // Arc mirrors the transfer in the 18-decimal native view. If present it must agree (x 10^12).
  const mirrorLogs = decodeTransfers(receipt.logs, config.nativeMirrorEmitter)
  let nativeMirror: NativeMirrorDetails | null = null
  if (mirrorLogs.length > 0) {
    const expectedNative = toNativeView(config.chainId, request.amountBaseUnits)
    const mirror = mirrorLogs.find((m) => same(m.from, receipt.from) && same(m.to, request.recipientAddress) && m.value === expectedNative)
    if (!mirror) {
      fail('native_mirror', 'The native-view transfer does not match the ERC-20 transfer.', expectedNative.toString(), mirrorLogs.map((m) => m.value.toString()).join(','))
    }
    nativeMirror = { emitter: config.nativeMirrorEmitter, logIndex: mirror.logIndex, from: mirror.from, to: mirror.to, valueNative: mirror.value }
  }

  return {
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    status: 'success',
    from: receipt.from,
    to: receipt.to,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
    transfer,
    tokenTransferLogs: tokenLogs,
    nativeMirror,
  }
}
