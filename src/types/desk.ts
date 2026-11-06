/**
 * Public Hiring Desk (Argo) API types. Generated in Arc Studio.
 *
 * Money crosses the HTTP boundary as decimal strings of base units. It becomes a bigint only at
 * the payment-module boundary (see src/lib/desk-job.ts).
 */

export type Hex = `0x${string}`

export const PAYMENT_INTERFACE_ID = 'arc:testnet:erc20-usdc:transfer:v1' as const

/** Authoritative payment terms for one accepted job. Every field is decided by Argo. */
export type PublicPaymentTerms = {
  jobKey: string
  jobReference: string
  deliverableUrl: string
  recipientName: string
  recipientAddress: Hex
  clientAddress?: Hex
  chainId: 5042002
  tokenAddress: Hex
  /** Exact amount in token base units, decimal digits only. */
  amountBaseUnits: string
  /** Human-readable amount. Cross-checked against amountBaseUnits; never used for payment. */
  amountDisplay: string
  interfaceId: typeof PAYMENT_INTERFACE_ID
}

/** Argo's server-verified receipt. Present only when Argo itself confirmed the payment. */
export type PublicPaymentReceipt = {
  txHash: Hex
  sender: Hex
  recipient: Hex
  tokenAddress: Hex
  chainId: number
  amountBaseUnits: string
  blockNumber?: string
}

export type NotPayableReason = 'expired' | 'not_accepted' | 'cancelled' | 'unknown'

export type UnavailableReason =
  | 'config_missing'
  | 'config_insecure'
  | 'network'
  | 'timeout'
  | 'not_found'
  | 'rate_limited'
  | 'server_error'
  | 'invalid_response'

/** Stable result of every public API call. Calls never throw for server-side outcomes. */
export type PaymentStatus =
  | { state: 'payable'; terms: PublicPaymentTerms }
  | { state: 'pending'; terms: PublicPaymentTerms | null; txHash: Hex; confirmations: number | null; warning: string | null }
  | { state: 'confirmed'; terms: PublicPaymentTerms | null; receipt: PublicPaymentReceipt }
  | { state: 'failed'; terms: PublicPaymentTerms | null; txHash: Hex | null; code: string; message: string; retryable: boolean }
  | { state: 'duplicate'; txHash: Hex | null; message: string }
  | { state: 'not_payable'; reason: NotPayableReason; message: string }
  | { state: 'unavailable'; reason: UnavailableReason; message: string }

/** Body of POST /jobs/:ref/payments/verify and /reconcile. The hash is the only thing the browser sends. */
export type SubmitTransactionBody = { txHash: Hex }
