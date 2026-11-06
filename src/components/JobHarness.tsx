/** Generated in Arc Studio. */
import { useMemo, useState, type FormEvent } from 'react'
import { isAddress } from 'viem'
import { ARC_TESTNET_CONFIG, toBaseUnits } from '@/settlement'
import { Card, PrimaryButton } from './settlement/ui'
import type { SettlementJob } from './settlement/types'

/**
 * Stand-in for the Hiring Desk. In the real app the job record, the agent's verified wallet and
 * the deliverable link come from the Hiring Desk's own database and are passed to <SettlementFlow />.
 * This form exists only so the payment step can be exercised on Arc Testnet.
 */
const field =
  'min-h-11 w-full rounded-xl border border-ink/15 bg-white px-3 text-sm text-ink placeholder:text-ink/35 focus:border-navy focus:outline-none focus:ring-2 focus:ring-mist'

function initial(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? ''
}

export function JobHarness({ onReady }: { onReady: (job: SettlementJob) => void }) {
  const [jobReference, setJobReference] = useState(initial('job'))
  const [deliverableUrl, setDeliverableUrl] = useState(initial('deliverable'))
  const [recipientName, setRecipientName] = useState(initial('name'))
  const [recipientAddress, setRecipientAddress] = useState(initial('wallet'))
  const [amount, setAmount] = useState(initial('amount'))
  const [error, setError] = useState<string | null>(null)

  const hint = useMemo(() => (recipientAddress && !isAddress(recipientAddress, { strict: true }) ? 'Not a valid address (check the checksum).' : null), [recipientAddress])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      if (!jobReference.trim() || !recipientName.trim()) throw new Error('Job reference and recipient name are required.')
      if (!isAddress(recipientAddress, { strict: true })) throw new Error('Recipient wallet is not a valid address.')
      onReady({
        jobKey: jobReference.trim(),
        jobReference: jobReference.trim(),
        deliverableUrl: deliverableUrl.trim(),
        recipientName: recipientName.trim(),
        recipientAddress,
        chainId: ARC_TESTNET_CONFIG.chainId,
        tokenAddress: ARC_TESTNET_CONFIG.token.address,
        amountBaseUnits: toBaseUnits(ARC_TESTNET_CONFIG.chainId, amount),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the job details.')
    }
  }

  return (
    <Card>
      <h2 className="font-display text-2xl font-semibold tracking-tight">Job to pay</h2>
      <p className="mt-1 text-sm text-ink/65">
        Integration harness. In production the Hiring Desk supplies these values from its own records, including the agent's verified wallet.
      </p>
      <form onSubmit={submit} className="mt-5 grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">
          Job reference
          <input className={field} value={jobReference} onChange={(e) => setJobReference(e.target.value)} placeholder="JOB-1042" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Deliverable link (https)
          <input className={field} value={deliverableUrl} onChange={(e) => setDeliverableUrl(e.target.value)} placeholder="https://" inputMode="url" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Recipient name
          <input className={field} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Agent name" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Recipient wallet
          <input className={`${field} font-mono text-[12.5px]`} value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value.trim())} placeholder="0x…" spellCheck={false} />
          {hint ? <span className="text-xs text-red-700">{hint}</span> : null}
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Amount (USDC)
          <input className={`${field} tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value.trim())} placeholder="25.00" inputMode="decimal" />
        </label>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <PrimaryButton type="submit">Continue to review</PrimaryButton>
      </form>
    </Card>
  )
}
