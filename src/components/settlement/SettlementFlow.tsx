/** Generated in Arc Studio. */
import type { Hash } from 'viem'
import { useSettlement } from '@/hooks/useSettlement'
import { toPaymentReceipt, type PaymentReceipt } from '@/settlement'
import { ReviewCard } from './ReviewCard'
import { ConfirmedPanel, FailedPanel, PendingPanel, SigningPanel, SubmittedPanel } from './StatusPanels'
import type { SettlementJob } from './types'

interface SettlementFlowProps {
  job: SettlementJob
  /**
   * Called with the verified PaymentReceipt once the browser has confirmed it. This is a UI signal only:
   * the host must still verify the txHash on its server before it marks the job paid.
   */
  onPaymentConfirmed?: (receipt: PaymentReceipt) => void
  /**
   * 'self' (default, demo): this component waits for the receipt and shows "confirmed" itself.
   * 'external': it only signs and submits, then calls `onTransactionSubmitted`. The host shows
   * pending and paid from its own server's verdict.
   */
  mode?: 'self' | 'external'
  onTransactionSubmitted?: (txHash: Hash) => void
}

/** Drop-in payment step: review -> signing -> pending -> confirmed | failed. */
export function SettlementFlow({ job, onPaymentConfirmed, mode = 'self', onTransactionSubmitted }: SettlementFlowProps) {
  const s = useSettlement(job, {
    mode,
    onSettled: (settlement) => onPaymentConfirmed?.(toPaymentReceipt(settlement)),
    onSubmitted: onTransactionSubmitted,
  })

  switch (s.phase) {
    case 'signing':
      return <SigningPanel />
    case 'submitted':
      return <SubmittedPanel />
    case 'pending':
      return (
        <PendingPanel
          pending={s.outcome?.status === 'pending' ? s.outcome : null}
          txHash={s.progress?.stage === 'confirming' ? s.progress.txHash : undefined}
          chainId={job.chainId}
          busy={s.busy}
          onCheckAgain={() => void s.checkAgain()}
          onAbandon={() => void s.abandonPending()}
        />
      )
    case 'confirmed':
      return s.outcome?.status === 'confirmed' ? <ConfirmedPanel settlement={s.outcome} /> : null
    case 'failed':
      return s.outcome?.status === 'failed' ? <FailedPanel failure={s.outcome} onRetry={s.reset} /> : null
    default:
      return (
        <ReviewCard
          job={job}
          isConnected={s.isConnected}
          walletAddress={s.walletAddress}
          wrongClient={s.wrongClient}
          wrongNetwork={s.wrongNetwork}
          walletChainId={s.walletChainId}
          balance={s.balance}
          balanceError={s.balanceError}
          busy={s.busy}
          isSwitching={s.isSwitching}
          switchError={s.switchError}
          onSwitch={() => void s.switchNetwork()}
          onPay={() => void s.pay()}
        />
      )
  }
}
