/** Generated in Arc Studio. */
import type { Address } from 'viem'

/** Everything the Hiring Desk passes to the payment step. The app owns this data; Arc never stores it. */
export interface SettlementJob {
  /** Idempotency key for the payment. Usually the job id. */
  jobKey: string
  /** Human-readable job reference shown before signing. */
  jobReference: string
  deliverableUrl: string
  recipientName: string
  /** The agent's verified payout wallet, from the Hiring Desk's own records. */
  recipientAddress: Address
  /** If the host knows which client wallet must pay, the flow refuses any other connected wallet. */
  clientAddress?: Address
  chainId: number
  tokenAddress: Address
  /** Exact amount in token base units. */
  amountBaseUnits: bigint
}

export type SettlementPhase = 'review' | 'signing' | 'submitted' | 'pending' | 'confirmed' | 'failed'
