/** Generated in Arc Studio. */
import { TokenUSDC } from '@web3icons/react'
import { explorerAddressUrl, formatBaseUnitsPadded, getNetworkConfig } from '@/settlement'
import { FullValue, Row } from './ui'
import type { SettlementJob } from './types'

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

interface ReviewDetailsProps {
  job: SettlementJob
  walletAddress?: string
  balance?: bigint
  balanceError?: boolean
}

/**
 * The read-only payment summary shown before signing. Every value comes from `job`
 * (server-supplied terms in production) or from the connected wallet. Nothing here is editable.
 */
export function ReviewDetails({ job, walletAddress, balance, balanceError = false }: ReviewDetailsProps) {
  const config = getNetworkConfig(job.chainId)
  const amount = formatBaseUnitsPadded(job.chainId, job.amountBaseUnits)

  return (
    <>
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-canvas px-4 py-4">
        <TokenUSDC variant="branded" size={36} />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/55">Exact amount</p>
          <p className="font-display text-3xl font-semibold tracking-[-0.03em] tabular-nums" data-testid="exact-amount">
            {amount} <span className="text-xl text-ink/60">{config.token.symbol}</span>
          </p>
        </div>
      </div>

      <dl className="mt-3 divide-y divide-ink/10">
        <Row label="Job reference">
          <span className="font-semibold">{job.jobReference}</span>
        </Row>
        <Row label="Deliverable">
          <span className="text-ink/70">Locked until this payment is verified</span>
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
          {walletAddress ? (
            <>
              <FullValue value={walletAddress} href={explorerAddressUrl(config, walletAddress)} />
              {balance !== undefined ? (
                <span className="mt-1 block text-xs text-ink/60 tabular-nums">
                  Balance {formatBaseUnitsPadded(job.chainId, balance)} {config.token.symbol}
                </span>
              ) : balanceError ? (
                <span className="mt-1 block text-xs text-red-700">Could not read your balance.</span>
              ) : null}
            </>
          ) : (
            <span className="text-ink/60">No wallet connected</span>
          )}
        </Row>
      </dl>
    </>
  )
}
