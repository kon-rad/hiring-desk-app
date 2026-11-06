/** Generated in Arc Studio. */
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react'
import {
  explorerAddressUrl,
  explorerTxUrl,
  formatBaseUnitsPadded,
  getNetworkConfig,
  serializeOutcome,
  type ConfirmedSettlement,
  type FailedSettlement,
  type PendingSettlement,
} from '@/settlement'
import { Card, FullValue, GhostButton, PrimaryButton, Row } from './ui'

export function SigningPanel() {
  return (
    <Card>
      <div className="flex items-center gap-3" role="status" aria-live="polite">
        <Loader2 className="animate-spin text-navy" size={26} />
        <div>
          <h2 className="font-display text-xl font-semibold">Confirm in your wallet</h2>
          <p className="text-sm text-ink/65">Check the recipient and amount in your wallet, then approve. Nothing has been sent yet.</p>
        </div>
      </div>
    </Card>
  )
}

interface PendingProps {
  pending: PendingSettlement | null
  txHash?: string
  chainId: number
  busy: boolean
  onCheckAgain: () => void
  onAbandon: () => void
}

export function PendingPanel({ pending, txHash, chainId, busy, onCheckAgain, onAbandon }: PendingProps) {
  const config = getNetworkConfig(chainId)
  const hash = pending?.txHash ?? txHash
  return (
    <Card>
      <div className="flex items-start gap-3" role="status" aria-live="polite">
        <Loader2 className={`mt-1 text-navy ${busy ? 'animate-spin' : ''}`} size={26} />
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">Waiting for confirmation</h2>
          <p className="text-sm text-ink/65">
            The payment was submitted. It counts as paid only after the network confirms it and the receipt matches this job.
          </p>
        </div>
      </div>
      {hash ? (
        <dl className="mt-4 divide-y divide-ink/10">
          <Row label="Transaction hash">
            <FullValue value={hash} href={explorerTxUrl(config, hash)} />
          </Row>
        </dl>
      ) : null}
      {pending?.warning ? (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {pending.warning}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <GhostButton onClick={onCheckAgain} disabled={busy}>
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> Check again
        </GhostButton>
        <GhostButton
          onClick={() => {
            if (window.confirm('Only do this if the transaction is dropped or missing on the explorer. If it later confirms, the job could be paid twice. Continue?')) onAbandon()
          }}
          disabled={busy}
        >
          Release stuck payment
        </GhostButton>
      </div>
    </Card>
  )
}

export function ConfirmedPanel({ settlement }: { settlement: ConfirmedSettlement }) {
  const config = getNetworkConfig(settlement.chainId)
  const amount = formatBaseUnitsPadded(settlement.chainId, settlement.transferredAmount)
  const copyReceipt = () => void navigator.clipboard.writeText(serializeOutcome(settlement))
  return (
    <Card>
      <div className="flex items-start gap-3" role="status" aria-live="polite">
        <CheckCircle2 className="mt-0.5 text-emerald-600" size={28} />
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Payment confirmed</h2>
          <p className="text-sm text-ink/65">The receipt was read from {config.name} and matches this job exactly.</p>
        </div>
      </div>
      <p className="mt-4 font-display text-3xl font-semibold tracking-[-0.03em] tabular-nums">
        {amount} <span className="text-xl text-ink/60">{config.token.symbol}</span>
      </p>
      <dl className="mt-2 divide-y divide-ink/10">
        <Row label="Transaction hash">
          <FullValue value={settlement.txHash} href={settlement.explorerUrl} />
        </Row>
        <Row label="Job">{settlement.jobKey}</Row>
        <Row label="From">
          <FullValue value={settlement.sender} href={explorerAddressUrl(config, settlement.sender)} />
        </Row>
        <Row label="To">
          <FullValue value={settlement.recipient} href={explorerAddressUrl(config, settlement.recipient)} />
        </Row>
        <Row label="Token (verified)">
          <FullValue value={settlement.tokenAddress} href={explorerAddressUrl(config, settlement.tokenAddress)} />
        </Row>
        <Row label="Network">
          {config.name} <span className="text-ink/55">· chain ID {settlement.chainId}</span>
        </Row>
        <Row label="Block">
          <span className="font-mono text-[12.5px] tabular-nums">{settlement.receipt.blockNumber.toString()}</span>
        </Row>
        <Row label="Network fee">
          <span className="font-mono text-[12.5px] tabular-nums">{settlement.receipt.gasUsed.toString()} gas</span>
        </Row>
      </dl>
      <div className="mt-5 flex flex-wrap gap-3">
        <a
          href={settlement.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-2 rounded-2xl bg-navy px-4 text-sm font-semibold text-white transition hover:bg-ink"
        >
          View on explorer <ExternalLink size={15} />
        </a>
        <GhostButton onClick={copyReceipt}>Copy verified receipt (JSON)</GhostButton>
      </div>
    </Card>
  )
}

interface FailedProps {
  failure: FailedSettlement
  onRetry: () => void
}

const TITLES: Record<string, string> = {
  USER_REJECTED: 'Payment cancelled',
  INSUFFICIENT_FUNDS: 'Not enough USDC',
  WRONG_NETWORK: 'Wrong network',
  RPC_FAILURE: 'Network unreachable',
  REVERTED: 'Transaction reverted',
  VERIFICATION_FAILED: 'Receipt does not match this job',
  WRONG_RECIPIENT: 'Paid the wrong recipient',
  WRONG_SENDER: 'Paid from an unexpected wallet',
  WRONG_AMOUNT: 'Paid a different amount',
  ALREADY_PAID: 'Already paid or in progress',
  DUPLICATE_TRANSACTION: 'Transaction already used',
  TOKEN_MISMATCH: 'Unexpected token',
  TOKEN_METADATA_MISMATCH: 'Token check failed',
}

export function FailedPanel({ failure, onRetry }: FailedProps) {
  const config = getNetworkConfig(failure.chainId)
  const cancelled = failure.code === 'USER_REJECTED'
  return (
    <Card>
      <div className="flex items-start gap-3" role="alert">
        {cancelled ? <AlertTriangle className="mt-0.5 text-amber-600" size={26} /> : <XCircle className="mt-0.5 text-red-600" size={26} />}
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">{TITLES[failure.code] ?? 'Payment not completed'}</h2>
          <p className="text-sm text-ink/70">{failure.message}</p>
        </div>
      </div>
      {failure.details ? (
        <dl className="mt-3 divide-y divide-ink/10">
          {Object.entries(failure.details).map(([k, v]) => (
            <Row key={k} label={k}>
              <span className="break-all font-mono text-[12.5px]">{v}</span>
            </Row>
          ))}
        </dl>
      ) : null}
      {failure.txHash ? (
        <dl className="mt-2 divide-y divide-ink/10">
          <Row label="Transaction hash">
            <FullValue value={failure.txHash} href={explorerTxUrl(config, failure.txHash)} />
          </Row>
        </dl>
      ) : null}
      {['VERIFICATION_FAILED', 'WRONG_RECIPIENT', 'WRONG_SENDER', 'WRONG_AMOUNT'].includes(failure.code) ? (
        <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-900">
          This job is not marked as paid. Funds may have moved, so check the transaction on the explorer and contact support before paying again.
        </p>
      ) : null}
      {failure.retryable ? (
        <div className="mt-5">
          <PrimaryButton onClick={onRetry}>Back to review</PrimaryButton>
        </div>
      ) : null}
    </Card>
  )
}
