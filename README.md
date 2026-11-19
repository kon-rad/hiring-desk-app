# Cybazaar

Commission one configured agent service through a wallet-authenticated client. The operator approves the request on the existing board, completes the work, reviews the private MP4 and clicks Release. The client sees the summary and reviewed hash, then pays the exact Base USDC terms. Only independent engine verification and Swarm readback unlock the file.

This branch implements the client side of the v4 contract. It builds on PR #7's views and native Base USDC correction. A passing local test is not evidence of a deployed or paid commission.

## Run the v4 client

Use Bun, install the locked dependencies and run the persistent gateway behind the same origin as the frontend:

```sh
bun install --frozen-lockfile
HIRING_DESK_UPSTREAM=https://engine.example/api/desk/market CYBA_ENVELOPE_SECRET="$SERVICE_SECRET" bun run start:server
VITE_HIRING_DESK_API_URL=/api bun run dev
```

Supply `SERVICE_SECRET` through your protected service environment. It must match the engine's envelope secret and contain at least 32 bytes. Do not put it in a `VITE_` setting, repository, URL or browser. The default gateway bind is loopback port 3001; `PORT` changes it. The Vite development proxy forwards `/api` to that port. Production serves the built frontend and `/api` through one HTTPS reverse proxy.

`CYBA_COOKIE_SECURE=0` is allowed only for local HTTP development. Production requires Secure cookies and a durable upstream; `NODE_ENV=production` refuses memory mode or insecure cookies. Wallet challenges and 15-minute HttpOnly sessions stay in the Bun process. A restart requires wallet sign-in again. Jobs, payment reservations and delivery checkpoints remain in the engine's PostgreSQL authority.

## Production API

| Route | Authority |
|---|---|
| `GET /api/health` | Gateway liveness only; it reports upstream health as not probed |
| `POST /api/auth/challenge`, `/verify`, `/logout`; `GET /api/auth/session` | Local challenge/session service, never forwarded |
| `GET /api/agents?q=` | Configured services whose identity/payout bindings pass engine verification |
| `GET /api/jobs` | Authenticated client's jobs |
| `POST /api/jobs` | `{ providerId, title, brief, requestKey }`; wallet is derived from the session |
| `GET /api/jobs/:id` | Authenticated owning client's projected job |
| `GET /api/jobs/:id/payment-terms` | Immutable authoritative terms after Release |
| `POST /api/jobs/:id/payment` | Only `{ txHash }`; engine verifies or resumes the transaction/delivery |

The gateway signs only these fixed engine routes. Its canonical envelope binds method, full path/query, SHA-256 of the exact body bytes, session wallet and millisecond timestamp. It sends `x-cyba-wallet`, `x-cyba-timestamp` and `x-cyba-signature` to `/api/desk/market`; cookies, browser identity headers and authentication routes are never proxied. Cross-origin mutations are rejected. Requests and responses are bounded. Upstream outages return 502 with no memory fallback.

The production API does not expose profile editing, provider claim/result/review mutations or operator actions. Those belong to the private engine workflow. Job status is `triage -> active -> review -> released -> paid`, with `cancelled` terminal. A pending transaction or confirmed-payment/delivery-pending checkpoint suppresses another Pay action. A browser hash hint is only a reconciliation aid and never decides paid state.

## Payment and delivery

The configured token is native Base Mainnet USDC, chain `8453`, address `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, six decimals. The engine decides payer, recipient and amount from immutable job terms; the browser signs a direct ERC-20 transfer. No escrow, automatic refunds or native ETH payment is provided.

An unpaid projection contains no artifact bytes, path, download URL or Swarm reference. After payment verification, the engine uploads the exact reviewed MP4 and checks downloaded bytes against its SHA-256. Only a paid job carrying a valid `swarm://` reference renders a public Swarm gateway download. Once published, the reference is public; this is pay-to-unlock publication, not a permanent access-control system. `evidenceRefs`, when returned by the engine, identify finalized server-attested Arkiv records. The server signer is not represented as the client wallet.

## Verification and live handoff

```sh
bun test tests
bun run typecheck
bun run build
```

Typecheck covers both the frontend and the Bun server. The shared synthetic envelope fixture is `tests/fixtures/engine-envelope.json`. Tests cover local auth, forged wallets, cross-wallet engine denial, body allow-lists, same-origin mutations, envelope bytes, upstream failure, unpaid redaction, pending/restart reconciliation and v4 client states.

For a live rehearsal, record accepted client/engine SHAs and verify JSON API routing first. Sign in with a separate client wallet, submit one request and record its job/card IDs. Approve the triage card in the private engine, stage the finished MP4, inspect its hash and click Release. Confirm API and finalized Arkiv reads reveal no file reference. Review exact terms and submit the one approved Base transfer. Reload during verification and confirm no second payment is requested. Independently fetch the resulting Swarm file, match its SHA-256, and read the finalized Arkiv records with a fresh reader. Record the transaction, references and actual results. No automated test sends funds or performs this rehearsal.

## Legacy development lane

`HIRING_DESK_DEV_MEMORY=1 bun run dev:server` selects the separate, explicitly ephemeral old marketplace for local testing. Use the development frontend's `?mvp=1` view. Production and memory flags cannot be combined. Memory data disappears on restart and uses the earlier lifecycle; it does not implement v4 private Release or durable pay-to-unlock. Do not use it to demonstrate live acceptance.
