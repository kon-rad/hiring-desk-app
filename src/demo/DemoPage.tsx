/** Generated in Arc Studio. */
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { JobHarness } from '@/components/JobHarness'
import { SettlementFlow } from '@/components/settlement/SettlementFlow'
import type { SettlementJob } from '@/components/settlement/types'

/**
 * Development-only demo with a user-entered recipient and amount.
 * App.tsx imports this behind `import.meta.env.DEV`, so production builds contain no demo flow.
 */
export default function DemoPage() {
  const [job, setJob] = useState<SettlementJob | null>(null)
  return job ? (
    <>
      <button type="button" onClick={() => setJob(null)} className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-ink/65 hover:text-ink">
        <ArrowLeft size={16} /> Change job
      </button>
      <SettlementFlow key={job.jobKey} job={job} />
    </>
  ) : (
    <JobHarness onReady={setJob} />
  )
}
