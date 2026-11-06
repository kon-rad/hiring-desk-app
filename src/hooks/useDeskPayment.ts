/** Generated in Arc Studio. */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { createDeskController } from '@/lib/desk-payment-controller'
import { createHiringDeskClient } from '@/lib/hiring-desk-api'
import { settlementAdapter } from '@/lib/settlementRuntime'

/** Loads and drives one job's payment from the Argo public API. Argo is the only source of truth. */
export function useDeskPayment(jobRef: string) {
  const controller = useMemo(
    () =>
      createDeskController({
        client: createHiringDeskClient(),
        jobRef,
        // Argo says the earlier attempt failed and may be retried: drop the local resume hint.
        onRetryable: (terms) => void settlementAdapter.abandon(terms.jobKey),
      }),
    [jobRef],
  )

  useEffect(() => {
    controller.start()
    void controller.load()
    return () => controller.dispose()
  }, [controller])

  const view = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getView(),
  )
  return { view, controller }
}
