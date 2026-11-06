/** Generated in Arc Studio. */
import { ConnectKitButton } from 'connectkit'
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'
import { formatBaseUnitsPadded, getNetworkConfig } from '@/settlement'
import { ReviewDetails, isHttpsUrl } from './ReviewDetails'
import { Card, PrimaryButton } from './ui'
import type { SettlementJob } from './types'

interface ReviewCardProps {
  job: SettlementJob
  isConnected: boolean
  walletAddress?: string
  /** Connected wallet is not the client wallet this job requires. */
  wrongClient?: boolean
  wrongNetwork: boolean
  walletChainId?: number
  balance?: bigint
  balanceError: boolean
  busy: boolean
  isSwitching: boolean
  switchError: string | null
  onSwitch: () => void
  onPay: () => void
}

export function ReviewCard(props: ReviewCardProps) {
  const { job } = props
  const config = getNetworkConfig(job.chainId)
  const amount = formatBaseUnitsPadded(job.chainId, job.amountBaseUnits)
  const deliverableOk = isHttpsUrl(job.deliverableUrl)
  const insufficient = props.balance !== undefined && props.balance < job.amountBaseUnits

  let blocker: string | null = null
  if (!deliverableOk) blocker = 'The deliverable is not available yet, so payment is disabled.'
  else if (!props.isConnected) blocker = null
  else if (props.wrongClient) blocker = `This job must be paid from the client wallet ${job.clientAddress ?? ''}. Switch accounts in your wallet.`
  else if (props.wrongNetwork) blocker = `Your wallet is on chain ${props.walletChainId}. Switch to ${config.name} to continue.`
  else if (insufficient) blocker = `Your wallet holds ${formatBaseUnitsPadded(job.chainId, props.balance ?? 0n)} ${config.token.symbol}. You need at least ${amount} plus the network fee.`

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Review payment</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold text-ink/70">
          <ShieldCheck size={14} /> Signed by your wallet
        </span>
      </div>

      <ReviewDetails job={job} walletAddress={props.walletAddress} balance={props.balance} balanceError={props.balanceError} />

      {blocker ? (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {blocker}
        </p>
      ) : null}
      {props.switchError ? <p className="mt-2 text-sm text-red-700">{props.switchError}</p> : null}

      <div className="mt-5">
        {!props.isConnected ? (
          <ConnectKitButton.Custom>
            {({ show }) => <PrimaryButton onClick={show}>Connect wallet</PrimaryButton>}
          </ConnectKitButton.Custom>
        ) : props.wrongNetwork ? (
          <PrimaryButton onClick={props.onSwitch} disabled={props.isSwitching}>
            {props.isSwitching ? <Loader2 size={18} className="animate-spin" /> : null} Switch to {config.name}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={props.onPay} disabled={Boolean(blocker) || props.busy}>
            Pay {amount} {config.token.symbol}
          </PrimaryButton>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-ink/55">
        Your wallet will ask you to approve this exact transfer. Arc never sees or stores a private key.
      </p>
    </Card>
  )
}
