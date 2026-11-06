/** Generated in Arc Studio. */
import { useDeskPayment } from '@/hooks/useDeskPayment'
import { toSettlementJob } from '@/lib/desk-job'
import { SettlementFlow } from '@/components/settlement/SettlementFlow'
import { PendingPanel } from '@/components/settlement/StatusPanels'
import { DuplicatePanel, LoadingPanel, NotPayablePanel, PaidPanel, ServerFailedPanel, UnavailablePanel } from './DeskStatusPanels'

/**
 * Production payment step. Loads accepted-job terms from the public Argo API, lets the user's
 * wallet sign, reports only the transaction hash to Argo, and shows "Paid" only after Argo
 * returns a confirmed, server-verified result. Browser storage never decides payment state.
 */
export function DeskPaymentPage({ jobRef }: { jobRef: string }) {
  const { view, controller } = useDeskPayment(jobRef)

  switch (view.kind) {
    case 'loading':
      return <LoadingPanel />
    case 'unavailable':
      return <UnavailablePanel view={view} onRetry={() => void controller.load()} />
    case 'not_payable':
      return <NotPayablePanel view={view} />
    case 'payable':
      return (
        <SettlementFlow
          key={view.terms.jobKey}
          job={toSettlementJob(view.terms)}
          mode="external"
          onTransactionSubmitted={(txHash) => void controller.onTransactionSubmitted(txHash)}
        />
      )
    case 'verifying':
      return (
        <PendingPanel
          pending={null}
          txHash={view.txHash}
          chainId={view.terms.chainId}
          busy={view.checking}
          warning={view.warning}
          description="Your transaction was submitted. The Hiring Desk marks this job paid only after it independently verifies the receipt onchain."
          onCheckAgain={() => void controller.checkAgain()}
        />
      )
    case 'confirmed':
      return <PaidPanel view={view} />
    case 'failed':
      return <ServerFailedPanel view={view} onRetry={() => controller.retry()} />
    case 'duplicate':
      return <DuplicatePanel view={view} onRefresh={() => void controller.load()} />
  }
}
