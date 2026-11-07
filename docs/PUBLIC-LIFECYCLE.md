# Public hiring lifecycle

The home page now displays public jobs and offers and lets the client prepare a public job draft. The existing Studio payment module remains unchanged. Existing `/jobs/:ref` and `/pay/:ref` payment links remain supported, including URL-encoded canonical Arkiv references containing one slash.

## Reads and authority

`createLifecycleReader` reads the configured `VITE_HIRING_DESK_API_URL` using only the existing public `GET /jobs`, `GET /jobs/:ref` and `GET /jobs/:ref/offers` contracts. It omits credentials, disables HTTP caching, bounds listing sizes, applies a timeout and rejects malformed records or offers bound to another job/creator. HTTPS remains required in production through the existing base-URL validator. Reload reconstructs public jobs from Argo. No lifecycle authority is stored in browser storage. A bounded non-secret pending transaction reference is kept in sessionStorage for recovery only.

A finalized-record label reflects the public reader response. It does not replace independent verification. The UI displays authority addresses in full and renders public text through React, without HTML injection. Finalized offers with expired terms or conflicting job state cannot enable acceptance review.

## Publication integration

The shipped app does not yet configure a public publication adapter. Posting and acceptance review therefore show an explicit unavailable result. They do not send a speculative request, sign arbitrary data, or display fixture success. The draft is not an on-chain job.

`HiringBoard` accepts an explicit `PublicationAdapter` prop. A future reviewed integration must provide:

- `prepare(action, input, signer)` returning a versioned unsigned `PublicationIntent` bound to the exact normalized draft or authoritative offer, signer, network, job, digest and expiry;
- `submit(intentRef, txHash)` binding the pending submission to durable authoritative terms;
- `reconcile(intentRef)` independently verifying finalized chain records and author before returning confirmed.

Public publication intents are discriminated by `action: post-job | accept-offer | feedback`; private provider intents use `claim | delivery`. They must never be interchanged merely because both use the `desk-wallet/v1` version label.

This interface is an integration seam, not a claim that corresponding HTTP endpoints exist. Integrators must independently validate offer digests, nonce/replay protection, provider identity, expiry and competing acceptance, and must never treat the draft, injected-wallet result or a local transaction hash as confirmation. A browser cannot supply authoritative recipient, price or payment chain overrides.

The EIP-1193 `LifecycleWallet` requests access only after a click. It reviews immutable transaction snapshots, checks account and network before sending, invalidates reviews on account/chain/disconnect events, rejects expired or mutated intents and consumes each review once before opening the wallet prompt. Submission always returns pending. The review shows action, full signer, chain, destination, calldata, native value, job binding, digest, intent reference and expiry. No private key is requested or held by this app.

A submitted hash remains visible even if registration with the backend fails. A sessionStorage hint preserves only intent reference, hash, action and job reference across reload. Retry first re-registers that exact reference/hash idempotently, then asks the adapter to independently reconcile. The hint never supplies terms or confirmation; poisoned hints cannot confirm anything. Public reads remain authoritative. No speculative intent discovery endpoint is introduced.

## Still unavailable

- Real Arkiv transaction preparation/publication integration for public job posting and acceptance.
- Configured verified provider discovery/profile reader. The current engine discovery handler supplies an empty provider list.
- Deployed ERC-8004 feedback ABI, authorization and independent readback. The UI shows feedback unavailable rather than displaying a local star count.
- Production runtime composition and the Arc-to-Arkiv payment evidence bridge documented in the engine integration PR.
- Funded live-wallet, fresh-reader and deployed end-to-end verification.

## Verification

Run `bun test tests`, `npx vite build` and `npx tsc --noEmit`. The existing deploy-helper typecheck failure resolving `@circlefin/compass-chains` remains a separate baseline issue; it is not suppressed or hidden by the lifecycle implementation.
