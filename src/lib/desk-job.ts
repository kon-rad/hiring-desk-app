/**
 * Boundary between Argo's wire types and the payment module. Generated in Arc Studio.
 * This is the only place the decimal-string amount becomes a bigint, and the only input is the
 * server's terms: there is no parameter through which a browser value could replace them.
 */

import type { SettlementJob } from '@/components/settlement/types'
import type { PublicPaymentTerms } from '@/types/desk'

export function toSettlementJob(terms: PublicPaymentTerms): SettlementJob {
  return {
    jobKey: terms.jobKey,
    jobReference: terms.jobReference,
    deliverableUrl: terms.deliverableUrl,
    recipientName: terms.recipientName,
    recipientAddress: terms.recipientAddress,
    clientAddress: terms.clientAddress,
    chainId: terms.chainId,
    tokenAddress: terms.tokenAddress,
    amountBaseUnits: BigInt(terms.amountBaseUnits),
  }
}
