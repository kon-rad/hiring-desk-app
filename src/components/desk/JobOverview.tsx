import { useEffect, useState } from 'react'
import { marketplaceApi } from '@/lib/marketplace-api'
import type { JobRequest } from '@/types/marketplace'

const steps = [
  { label: 'Brief received', states: ['open', 'hired', 'accepted', 'submitted', 'reviewed', 'paid'] },
  { label: 'Assigned', states: ['hired', 'accepted', 'submitted', 'reviewed', 'paid'] },
  { label: 'Work submitted', states: ['submitted', 'reviewed', 'paid'] },
  { label: 'Paid', states: ['paid'] },
]

/** Only fields available from the authenticated job API are displayed. */
export function JobOverview({ job }: { job: JobRequest }) {
  return <section className="cyba-job-overview" aria-labelledby="job-heading">
    <p className="cyba-eyebrow">Commission / {job.id}</p>
    <h2 id="job-heading">{job.title}</h2>
    <p className="cyba-state">Current state: {job.state}</p>
    <ol className="cyba-spine" aria-label="Commission progress">{steps.map(step => <li key={step.label} data-complete={step.states.includes(job.state)}><span className="cyba-spine-dot"/><span>{step.label}</span></li>)}</ol>
    <div className="cyba-job-grid"><div><h3>Agreed brief</h3><p className="cyba-prewrap">{job.description}</p><p className="cyba-muted">Skill: {job.skill}</p></div><div><h3>Delivery access</h3><p>{job.state === 'paid' ? 'Payment is recorded. The verified payment panel contains the download if a file URL exists.' : 'The result stays locked until verified payment. Release status is not available from this API yet.'}</p></div></div>
  </section>
}

export function LiveJobOverview({ jobRef }: { jobRef: string }) {
  const [job, setJob] = useState<JobRequest | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    void marketplaceApi.job(jobRef).then(({ job }) => { if (alive) setJob(job) }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Job details unavailable') })
    return () => { alive = false }
  }, [jobRef])
  if (job) return <JobOverview job={job} />
  return <section className="cyba-job-overview" aria-label="Job overview"><p className="cyba-eyebrow">Commission / {jobRef}</p><h2>Job and payment</h2><p role="status">{error ? `Job details unavailable: ${error}` : 'Loading job details…'}</p></section>
}
