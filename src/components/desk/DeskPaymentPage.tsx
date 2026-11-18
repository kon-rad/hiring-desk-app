/** Generated in Arc Studio. */
import type { ReactNode } from 'react'
import { useDeskPayment } from '@/hooks/useDeskPayment'
import { toSettlementJob } from '@/lib/desk-job'
import { SettlementFlow } from '@/components/settlement/SettlementFlow'
import { PendingPanel } from '@/components/settlement/StatusPanels'
import { DuplicatePanel, LoadingPanel, NotPayablePanel, PaidPanel, ServerFailedPanel, UnavailablePanel } from './DeskStatusPanels'
import { LiveJobOverview } from './JobOverview'

/**
 * Production payment step. Loads accepted-job terms from the public Argo API, lets the user's
 * wallet sign, reports only the transaction hash to Argo, and shows "Paid" only after Argo
 * returns a confirmed, server-verified result. Browser storage never decides payment state.
 */
export function DeskPaymentPage({ jobRef }: { jobRef: string }) {
  const { view, controller } = useDeskPayment(jobRef)

  let payment: ReactNode
  switch (view.kind) {
    case 'loading':
      payment = <LoadingPanel />; break
    case 'unavailable':
      payment = <UnavailablePanel view={view} onRetry={() => void controller.load()} />; break
    case 'not_payable':
      payment = <NotPayablePanel view={view} />; break
    case 'payable':
      payment = (
        <SettlementFlow
          key={view.terms.jobKey}
          job={toSettlementJob(view.terms)}
          mode="external"
          onTransactionSubmitted={(txHash) => void controller.onTransactionSubmitted(txHash)}
        />
      ); break
    case 'verifying':
      payment = (
        <PendingPanel
          pending={null}
          txHash={view.txHash}
          chainId={view.terms.chainId}
          busy={view.checking}
          warning={view.warning}
          description="Your transaction was submitted. The Hiring Desk marks this job paid only after it independently verifies the receipt onchain."
          onCheckAgain={() => void controller.checkAgain()}
        />
      ); break
    case 'confirmed':
      payment = <PaidPanel view={view} />; break
    case 'failed':
      payment = <ServerFailedPanel view={view} onRetry={() => controller.retry()} />; break
    case 'duplicate':
      payment = <DuplicatePanel view={view} onRefresh={() => void controller.load()} />; break
  }
  return <div className="cyba-job-page"><LiveJobOverview jobRef={jobRef}/><aside className="cyba-payment-rail" aria-label="Payment and next action"><p className="cyba-eyebrow">Next action</p>{payment}</aside></div>
}
