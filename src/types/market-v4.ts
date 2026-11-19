export type MarketStatus = 'triage' | 'active' | 'review' | 'released' | 'paid' | 'cancelled'
export interface MarketProfile { id: string; name: string; serviceTitle: string; description: string; priceAtomic: string; payoutWallet: string; ensName: string; agentId: string; identityBound: boolean }
export interface MarketJob { id: string; providerId: string; title: string; priceAtomic: string; status: MarketStatus; summary: string | null; artifactSha256: string | null; paymentTx?: string; pendingPaymentTx?: string; downloadRef?: string; deliveryPending?: boolean; evidenceRefs?: string[] }
export interface MarketTerms { chainId: 8453; tokenAddress: `0x${string}`; sender: `0x${string}`; recipient: `0x${string}`; amountAtomic: string; jobId: string }
