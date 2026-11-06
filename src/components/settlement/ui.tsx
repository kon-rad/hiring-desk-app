/** Generated in Arc Studio. */
import { useState, type ReactNode } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/55">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  )
}

/** Full, untruncated value in monospace with copy + optional explorer link. */
export function FullValue({ value, href }: { value: string; href?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <span className="flex items-start gap-2">
      <span className="min-w-0 flex-1 break-all font-mono text-[12.5px] leading-5 tabular-nums">{value}</span>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy value"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink/55 transition hover:bg-ink/5 hover:text-ink"
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in explorer"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink/55 transition hover:bg-ink/5 hover:text-ink"
        >
          <ExternalLink size={15} />
        </a>
      ) : null}
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_8px_40px_rgba(27,49,88,0.08)] backdrop-blur sm:p-7 ${className}`}>
      {children}
    </section>
  )
}

export function PrimaryButton({ children, disabled, onClick, type = 'button' }: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-navy px-5 text-[15px] font-semibold text-white transition hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:cursor-not-allowed disabled:bg-ink/25"
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-ink/15 px-4 text-sm font-semibold text-ink transition hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}
