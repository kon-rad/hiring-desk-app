/** Generated in Arc Studio. */
import { ConnectKitButton } from 'connectkit'
import { TokenUSDC } from '@web3icons/react'
import { AlertTriangle, ExternalLink, Loader2, ShieldCheck } from 'lucide-react'
import { explorerAddressUrl, formatBaseUnitsPadded, getNetworkConfig } from '@/settlement'
import { Card, FullValue, PrimaryButton, Row } from './ui'
import type { SettlementJob } from './types'

interface ReviewCardProps {
  job: SettlementJob
  isConnected: boolean
  walletAddress?: string
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

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
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

      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-canvas px-4 py-4">
        <TokenUSDC variant="branded" size={36} />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/55">Exact amount</p>
          <p className="font-display text-3xl font-semibold tracking-[-0.03em] tabular-nums">
            {amount} <span className="text-xl text-ink/60">{config.token.symbol}</span>
          </p>
        </div>
      </div>

      <dl className="mt-3 divide-y divide-ink/10">
        <Row label="Job reference">
          <span className="font-semibold">{job.jobReference}</span>
        </Row>
        <Row label="Deliverable">
          {deliverableOk ? (
            <a href={job.deliverableUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 break-all font-medium text-navy underline underline-offset-2">
              {job.deliverableUrl} <ExternalLink size={14} className="mt-1 shrink-0" />
            </a>
          ) : (
            <span className="text-red-700">No valid https link</span>
          )}
        </Row>
        <Row label="Network">
          {config.name} <span className="text-ink/55">· chain ID {config.chainId}</span>
        </Row>
        <Row label="Token">
          <span className="mb-1 block font-semibold">{config.token.symbol} (ERC-20, {config.token.decimals} decimals)</span>
          <FullValue value={job.tokenAddress} href={explorerAddressUrl(config, job.tokenAddress)} />
        </Row>
        <Row label="Recipient">
          <span className="mb-1 block font-semibold">{job.recipientName}</span>
          <FullValue value={job.recipientAddress} href={explorerAddressUrl(config, job.recipientAddress)} />
        </Row>
        <Row label="Connected wallet">
          {props.walletAddress ? (
            <>
              <FullValue value={props.walletAddress} href={explorerAddressUrl(config, props.walletAddress)} />
              {props.balance !== undefined ? (
                <span className="mt-1 block text-xs text-ink/60 tabular-nums">
                  Balance {formatBaseUnitsPadded(job.chainId, props.balance)} {config.token.symbol}
                </span>
              ) : props.balanceError ? (
                <span className="mt-1 block text-xs text-red-700">Could not read your balance.</span>
              ) : null}
            </>
          ) : (
            <span className="text-ink/60">No wallet connected</span>
          )}
        </Row>
      </dl>

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
