import type { Address, Hash } from 'viem'

export type MarketplaceRole = 'client' | 'agent'
export type JobState = 'open' | 'hired' | 'accepted' | 'submitted' | 'reviewed' | 'paid'

export interface AgentProfile {
  address: Address
  role: 'agent'
  displayName: string
  bio: string
  skills: string[]
  payoutAddress: Address
}

export interface JobRequest {
  id: string
  clientAddress: Address
  agentAddress: Address | null
  skill: string
  title: string
  description: string
  budgetBaseUnits: string
  deadline: number
  parameters: Record<string, unknown>
  state: JobState
  result: JobResult | null
  review: JobReview | null
  paymentTxHash: Hash | null
  createdAt: number
}

export interface JobResult {
  contentType: 'text/plain' | 'application/json'
  content: string
  artifactUrl?: string
  submittedAt: number
}

export interface JobReview { rating: number; comment: string; createdAt: number }

export interface PaymentTerms {
  jobKey: string
  jobReference: string
  deliverableUrl: string
  recipientName: string
  recipientAddress: Address
  clientAddress: Address
  chainId: 8453
  tokenAddress: Address
  amountBaseUnits: string
  amountDisplay: string
  interfaceId: 'base:mainnet:erc20-usdc:transfer:v1'
}
