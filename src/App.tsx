/** Generated in Arc Studio. */
import { lazy, Suspense } from 'react'
import { ConnectKitButton } from 'connectkit'
import { DeskPaymentPage } from '@/components/desk/DeskPaymentPage'
import { Card } from '@/components/settlement/ui'
import { readJobRef } from '@/lib/route'

// Demo flow (user-entered recipient and amount). `import.meta.env.DEV` is false in production
// builds, so this branch and the demo code are removed from the deployed bundle.
const DemoPage = import.meta.env.DEV ? lazy(() => import('@/demo/DemoPage')) : null

export default function App() {
  const demo = import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === '1'
  const jobRef = readJobRef(window.location)

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-xl items-center justify-between px-4 pb-2 pt-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/55">Argo Hiring Desk</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">Pay your agent</h1>
        </div>
        <ConnectKitButton showBalance={false} />
      </header>

      <main className="mx-auto grid max-w-xl gap-4 px-4 pb-24 pt-4">
        {demo && DemoPage ? (
          <Suspense fallback={null}>
            <DemoPage />
          </Suspense>
        ) : jobRef ? (
          <DeskPaymentPage key={jobRef} jobRef={jobRef} />
        ) : (
          <Card>
            <h2 className="font-display text-xl font-semibold">No job selected</h2>
            <p className="mt-1 text-sm text-ink/70">Open the payment link from your Hiring Desk job page. It looks like /jobs/&lt;job reference&gt;.</p>
          </Card>
        )}
        <p className="text-center text-xs text-ink/50">Arc Testnet · test USDC only. Get test USDC from the Arc Studio sidebar.</p>
      </main>
    </div>
  )
}
