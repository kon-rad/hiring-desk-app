/**
 * Public surface of the settlement module. Generated in Arc Studio.
 * Host applications import from here and nowhere deeper.
 */

export { createSettlementAdapter } from './adapter'
export type { SettleOptions, SettlementAdapter, SettlementAdapterOptions } from './adapter'
export { verifySettlement } from './verify'
export type { VerifyOptions } from './verify'
export { validateReceipt } from './receipt'
export { formatBaseUnits, formatBaseUnitsPadded, toBaseUnits } from './amount'
export {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_CONFIG,
  SETTLEMENT_NETWORKS,
  explorerAddressUrl,
  explorerTxUrl,
  getNetworkConfig,
} from './config'
export type { SettlementNetworkConfig, SettlementTokenConfig } from './config'
export { createSettlementPublicClient, getSettlementChain } from './client'
export { classifyError, SettlementError } from './errors'
export type { SettlementErrorCode, VerificationCheck } from './errors'
export { createKeyValueLedger, createMemoryStore } from './ledger'
export type { KeyValueStore, LedgerEntry, LedgerStatus, SettlementLedger } from './ledger'
export { normalizeRequest } from './request'
export { serializeOutcome } from './serialize'
export { toPaymentReceipt, toPaymentReceiptJson, toVerifyResponse } from './api'
export type { PaymentReceiptJson, VerifyPaymentRequestBody, VerifyPaymentResponse } from './api'
export type {
  ConfirmedSettlement,
  FailedSettlement,
  NativeMirrorDetails,
  ParsedReceipt,
  PaymentReceipt,
  PendingSettlement,
  SettlementOutcome,
  SettlementPreflight,
  SettlementProgress,
  SettlementRequest,
  TransferLogDetails,
} from './types'
