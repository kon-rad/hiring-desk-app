import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { ArrowLeft } from 'lucide-react'
import { JobHarness } from '@/components/JobHarness'
import { SettlementFlow } from '@/components/settlement/SettlementFlow'
import type { SettlementJob } from '@/components/settlement/types'

export default function App() {
  const [job, setJob] = useState<SettlementJob | null>(null)

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-xl items-center justify-between px-4 pb-2 pt-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/55">Hiring Desk</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">Pay your agent</h1>
        </div>
        <ConnectKitButton showBalance={false} />
      </header>

      <main className="mx-auto grid max-w-xl gap-4 px-4 pb-24 pt-4">
        {job ? (
          <>
            <button
              type="button"
              onClick={() => setJob(null)}
              className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-ink/65 hover:text-ink"
            >
              <ArrowLeft size={16} /> Change job
            </button>
            <SettlementFlow key={job.jobKey} job={job} />
          </>
        ) : (
          <JobHarness onReady={setJob} />
        )}
        <p className="text-center text-xs text-ink/50">Arc Testnet · test USDC only. Get test USDC from the Arc Studio sidebar.</p>
      </main>
    </div>
  )
}
