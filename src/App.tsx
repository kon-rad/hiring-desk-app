/** Generated in Arc Studio. */
import { lazy, Suspense } from 'react'
import { ConnectKitButton } from 'connectkit'
import { DeskPaymentPage } from '@/components/desk/DeskPaymentPage'
import { readJobRef } from '@/lib/route'
import { HiringBoard } from '@/components/lifecycle/HiringBoard'
import { LegacyHiringBoard } from '@/components/lifecycle/LegacyHiringBoard'
const AkiraDirectoryDemo = lazy(() => import('@/demo/AkiraDirectoryDemo'))

// Demo flow (user-entered recipient and amount). `import.meta.env.DEV` is false in production
// builds, so this branch and the demo code are removed from the deployed bundle.
const DemoPage = import.meta.env.DEV ? lazy(() => import('@/demo/DemoPage')) : null

export default function App() {
  const demo = import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === '1'
  const jobRef = readJobRef(window.location)
  const akiraDemo = window.location.pathname.replace(/\/$/, '') === '/akira'
  const legacyMvp = import.meta.env.DEV && new URLSearchParams(window.location.search).get('mvp') === '1'

  return (
    <div className={akiraDemo || demo || legacyMvp ? 'min-h-dvh bg-canvas' : 'cyba-shell'}>
      <header className={akiraDemo || demo || legacyMvp ? 'mx-auto flex max-w-xl items-center justify-between px-4 pb-2 pt-6' : 'cyba-header'}>
        <div>
          <p className={akiraDemo || demo || legacyMvp ? 'text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/55' : 'cyba-eyebrow'}>Argo / Cybazaar</p>
          <h1 className={akiraDemo || demo || legacyMvp ? 'font-display text-3xl font-semibold tracking-[-0.03em]' : 'cyba-wordmark'}>{akiraDemo ? 'Akira asset proof' : 'Cybazaar'}</h1>
        </div>
        <ConnectKitButton showBalance={false} />
      </header>

      <nav className={akiraDemo || demo || legacyMvp ? 'mx-auto flex max-w-xl gap-4 px-4 pt-3 text-sm' : 'cyba-nav'}><a href="/">Explore</a><a href="/akira">Dated Akira sample</a></nav>
      {akiraDemo ? <Suspense fallback={<div className="mx-auto max-w-5xl px-4 py-8 text-sm">Loading Akira demo…</div>}><AkiraDirectoryDemo /></Suspense> :
      <main className={demo || legacyMvp ? 'mx-auto grid max-w-xl gap-4 px-4 pb-24 pt-4' : 'cyba-main'}>
        {demo && DemoPage ? (
          <Suspense fallback={null}>
            <DemoPage />
          </Suspense>
        ) : legacyMvp ? <LegacyHiringBoard /> : jobRef ? (
          <DeskPaymentPage key={jobRef} jobRef={jobRef} />
        ) : (
          <HiringBoard />
        )}
        <p className="cyba-footer">Base Mainnet · USDC payments use real funds. Review every wallet prompt.</p>
      </main>
      }
    </div>
  )
}
