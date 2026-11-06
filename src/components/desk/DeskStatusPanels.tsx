/** Generated in Arc Studio. */
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { explorerAddressUrl, explorerTxUrl, formatBaseUnitsPadded, getNetworkConfig, type SettlementErrorCode } from '@/settlement'
import { FailedPanel } from '@/components/settlement/StatusPanels'
import { Card, FullValue, GhostButton, PrimaryButton, Row } from '@/components/settlement/ui'
import type { DeskView } from '@/lib/desk-payment-controller'

export function LoadingPanel() {
  return (
    <Card>
      <div className="flex items-center gap-3" role="status" aria-live="polite">
        <Loader2 className="animate-spin text-navy" size={24} />
        <p className="text-sm text-ink/70">Loading payment terms from the Hiring Desk…</p>
      </div>
    </Card>
  )
}

const UNAVAILABLE_TITLES: Record<string, string> = {
  config_missing: 'Payment is not configured',
  config_insecure: 'Payment is not configured securely',
  not_found: 'Job not found',
  rate_limited: 'Please try again shortly',
}

export function UnavailablePanel({ view, onRetry }: { view: Extract<DeskView, { kind: 'unavailable' }>; onRetry: () => void }) {
  const configError = view.reason === 'config_missing' || view.reason === 'config_insecure'
  return (
    <Card>
      <div className="flex items-start gap-3" role="alert">
        <AlertTriangle className="mt-0.5 text-amber-600" size={24} />
        <div>
          <h2 className="font-display text-xl font-semibold">{UNAVAILABLE_TITLES[view.reason] ?? 'Hiring Desk unavailable'}</h2>
          <p className="mt-1 text-sm text-ink/70">{view.message}</p>
        </div>
      </div>
      {!configError && view.reason !== 'not_found' ? (
        <div className="mt-5">
          <GhostButton onClick={onRetry}>
            <RefreshCw size={16} /> Try again
          </GhostButton>
        </div>
      ) : null}
    </Card>
  )
}

const NOT_PAYABLE_TITLES: Record<string, string> = {
  expired: 'Payment window has expired',
  not_accepted: 'This job has not been accepted',
  cancelled: 'This job was cancelled',
  unknown: 'This job cannot be paid right now',
}

export function NotPayablePanel({ view }: { view: Extract<DeskView, { kind: 'not_payable' }> }) {
  return (
    <Card>
      <div className="flex items-start gap-3" role="status">
        <AlertTriangle className="mt-0.5 text-amber-600" size={24} />
        <div>
          <h2 className="font-display text-xl font-semibold">{NOT_PAYABLE_TITLES[view.reason]}</h2>
          <p className="mt-1 text-sm text-ink/70">{view.message}</p>
        </div>
      </div>
    </Card>
  )
}

export function DuplicatePanel({ view, onRefresh }: { view: Extract<DeskView, { kind: 'duplicate' }>; onRefresh: () => void }) {
  return (
    <Card>
      <div className="flex items-start gap-3" role="alert">
        <AlertTriangle className="mt-0.5 text-amber-600" size={24} />
        <div>
          <h2 className="font-display text-xl font-semibold">Already recorded</h2>
          <p className="mt-1 text-sm text-ink/70">{view.message}</p>
          <p className="mt-1 text-sm text-ink/70">Do not pay again. Refresh to load the Hiring Desk's current record for this job.</p>
        </div>
      </div>
      <div className="mt-5">
        <PrimaryButton onClick={onRefresh}>Refresh status</PrimaryButton>
      </div>
    </Card>
  )
}

/** Shown only after Argo returned a confirmed, server-verified result. */
export function PaidPanel({ view }: { view: Extract<DeskView, { kind: 'confirmed' }> }) {
  const { terms, receipt } = view
  const config = getNetworkConfig(terms.chainId)
  const amount = formatBaseUnitsPadded(terms.chainId, BigInt(receipt.amountBaseUnits))
  return (
    <Card>
      <div className="flex items-start gap-3" role="status" aria-live="polite">
        <CheckCircle2 className="mt-0.5 text-emerald-600" size={28} />
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Paid</h2>
          <p className="text-sm text-ink/65">The Hiring Desk independently verified this payment onchain.</p>
        </div>
      </div>
      <p className="mt-4 font-display text-3xl font-semibold tracking-[-0.03em] tabular-nums">
        {amount} <span className="text-xl text-ink/60">{config.token.symbol}</span>
      </p>
      <dl className="mt-2 divide-y divide-ink/10">
        <Row label="Job reference">{terms.jobReference}</Row>
        <Row label="Transaction hash">
          <FullValue value={receipt.txHash} href={explorerTxUrl(config, receipt.txHash)} />
        </Row>
        <Row label="From">
          <FullValue value={receipt.sender} href={explorerAddressUrl(config, receipt.sender)} />
        </Row>
        <Row label="To">
          <span className="mb-1 block font-semibold">{terms.recipientName}</span>
          <FullValue value={receipt.recipient} href={explorerAddressUrl(config, receipt.recipient)} />
        </Row>
        <Row label="Network">
          {config.name} <span className="text-ink/55">· chain ID {receipt.chainId}</span>
        </Row>
      </dl>
      <a
        href={explorerTxUrl(config, receipt.txHash)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex min-h-11 items-center rounded-2xl bg-navy px-4 text-sm font-semibold text-white transition hover:bg-ink"
      >
        View on explorer
      </a>
    </Card>
  )
}

const KNOWN: readonly SettlementErrorCode[] = [
  'USER_REJECTED', 'INSUFFICIENT_FUNDS', 'WRONG_NETWORK', 'RPC_FAILURE', 'REVERTED', 'VERIFICATION_FAILED',
  'WRONG_RECIPIENT', 'WRONG_SENDER', 'WRONG_AMOUNT', 'ALREADY_PAID', 'DUPLICATE_TRANSACTION',
]

/** Server-reported failure, rendered with the existing failure panel. */
export function ServerFailedPanel({ view, onRetry }: { view: Extract<DeskView, { kind: 'failed' }>; onRetry: () => void }) {
  const code = KNOWN.find((c) => c === view.code) ?? 'VERIFICATION_FAILED'
  return (
    <FailedPanel
      onRetry={onRetry}
      failure={{
        status: 'failed',
        jobKey: view.terms.jobKey,
        chainId: view.terms.chainId,
        txHash: view.txHash,
        code,
        check: null,
        message: view.message,
        retryable: view.retryable,
        details: null,
      }}
    />
  )
}
