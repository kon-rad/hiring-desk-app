# Argo Hiring Desk integration

Generated in [Arc Studio](https://studio.arc.io). This app is a **public client** for the Argo Hiring Desk. It lets a client wallet sign one ERC-20 USDC transfer on Arc Testnet. **Argo independently verifies every payment and owns all durable payment state, transaction reservation and duplicate protection.**

## What this repository does and does not do

| This app (public client) | Argo (backend) |
| --- | --- |
| Reads a job reference from the page route | Stores jobs, accepted terms, payer, recipient, amount |
| Fetches payment terms from the public API | Decides the terms and sends them |
| Shows the review screen, asks the user's wallet to sign | Never signs, never holds a payment key |
| Sends only the transaction hash | Reloads the job, reads the receipt with its own RPC, verifies chain, token, payer, recipient, amount |
| Shows Paid only after Argo says confirmed | Reserves the transaction hash, rejects duplicates, records the payment |
| Holds no secrets, no server RPC URL, no operator routes | Holds the server-side RPC URL, database and operator credentials |

## Configuration

| Where | Variable | Value |
| --- | --- | --- |
| Vercel (Preview and Production) | `VITE_HIRING_DESK_API_URL` | Public Argo API base URL, https, no trailing slash. Example: `https://argo.example.com/api` |

This is a public value, compiled into the browser bundle. Do not put an RPC provider key, database URL, private key or operator credential in any `VITE_` variable. The client refuses a non-https URL in production builds, and a URL containing credentials. Vite reads env at build time, so redeploy after changing it.

Payment-flow fixed values (not configurable): chain ID `5042002`, token `0x3600000000000000000000000000000000000000`, 6 decimals, `transfer(recipient, amount)`, interface id `arc:testnet:erc20-usdc:transfer:v1`.

## Page routes

`/jobs/:ref` or `/pay/:ref` (or `?job=:ref`). Only the reference is read. A recipient, amount, chain or token in the URL is ignored. `vercel.json` rewrites all paths to `index.html` so these routes load on a fresh visit.

## Public API contract (final routes expected from Argo)

All calls use `credentials: 'omit'`, JSON, and decimal strings for amounts. Argo must send CORS headers allowing the Vercel origin(s) and no credentials.

```
GET  {base}/jobs/:ref/payment
POST {base}/jobs/:ref/payments/verify      body: { "txHash": "0x…64 hex" }
POST {base}/jobs/:ref/payments/reconcile   body: { "txHash": "0x…64 hex" }
```

The body contains the hash and nothing else. Argo must reload the accepted job, payer, recipient and amount from its database and ignore anything the browser could add.

### Payment terms (`terms`)

```ts
type PublicPaymentTerms = {
  jobKey: string
  jobReference: string
  deliverableUrl: string
  recipientName: string
  recipientAddress: `0x${string}`
  clientAddress?: `0x${string}`   // if present, only this wallet may pay
  chainId: 5042002
  tokenAddress: `0x${string}`     // must be the Arc Testnet USDC address
  amountBaseUnits: string         // decimal digits, e.g. "25500000"
  amountDisplay: string           // "25.5" or "25.50"; must equal amountBaseUnits exactly
  interfaceId: 'arc:testnet:erc20-usdc:transfer:v1'
}
```

### Responses

HTTP 200 (or 409 and 422 where noted). The `state` field drives the UI. Fields marked `terms` are required for `payable`, and required on `pending`, `confirmed` and `failed` from `GET`.

```jsonc
{ "state": "payable",     "terms": { … } }
{ "state": "pending",     "terms": { … }, "txHash": "0x…", "confirmations": 0, "warning": null }
{ "state": "confirmed",   "terms": { … }, "receipt": { "txHash": "0x…", "sender": "0x…", "recipient": "0x…",
                           "tokenAddress": "0x…", "chainId": 5042002, "amountBaseUnits": "25500000", "blockNumber": "123" } }
{ "state": "failed",      "terms": { … }, "txHash": "0x…", "code": "REVERTED", "message": "…", "retryable": true }
{ "state": "duplicate",   "txHash": "0x…", "message": "…" }                       // HTTP 409
{ "state": "not_payable", "reason": "expired|not_accepted|cancelled|unknown", "message": "…" }
```

Other statuses: `404` job not found, `429` rate limited, `5xx` or network error: shown as Argo unavailable. A pending payment is never lost when Argo is unreachable; the hash stays on screen with Check again.

Failure `code` values the UI recognizes: `USER_REJECTED`, `INSUFFICIENT_FUNDS`, `WRONG_NETWORK`, `RPC_FAILURE`, `REVERTED`, `VERIFICATION_FAILED`, `WRONG_RECIPIENT`, `WRONG_SENDER`, `WRONG_AMOUNT`, `ALREADY_PAID`, `DUPLICATE_TRANSACTION`. Any other code is shown as a generic verification failure. Set `retryable: true` only when no USDC moved (for example a revert).

## Authoritative from Argo

Job reference and key, deliverable URL, recipient name and wallet, client wallet, chain ID, token address, amount (base units), payment state (`payable`, `pending`, `confirmed`, `failed`, `duplicate`, `not_payable`), the confirmed receipt, and the transaction hash that counts. The browser is authoritative only for the wallet signature and the hash it reports.

## Client-side safeguards

- Terms are validated before use: allow-listed chain and token, checksummed addresses, non-zero amount, display string equals base units.
- The amount becomes a `bigint` only in `src/lib/desk-job.ts`.
- A confirmed receipt that disagrees with Argo's own terms (recipient, amount, token, chain, payer) is rejected and not shown as paid.
- If `clientAddress` is set, any other connected wallet is blocked before signing.
- Browser `localStorage` is only a temporary hint that lets a reload re-send an already-signed hash instead of asking the wallet to sign twice. It is not payment history and never decides whether a job is paid.
- The demo form with a user-entered recipient and amount exists only behind `import.meta.env.DEV` (`?demo=1`). It is not part of the production bundle.

## Flow

```
/jobs/:ref
   │ GET /jobs/:ref/payment ──────────────► Argo (terms + state)
   ▼
review screen (server terms only) ─► user's wallet signs transfer(recipient, amount) ─► Arc Testnet
   │ POST /payments/verify { txHash } ─────► Argo reads receipt with its own RPC, verifies, records
   ▼
pending (poll POST /payments/reconcile or Check again) ─► Paid only when Argo returns "confirmed"
reload: GET /jobs/:ref/payment restores pending / paid / failed from Argo
```

## Remaining dependency on Argo

The deployed app cannot show a payable job until Argo serves these three routes with CORS for the Vercel origin and the shapes above. Until then the page shows "Hiring Desk unavailable" or a configuration error. Route names are configurable only through the base URL; if Argo renames a path, change the three path strings in `src/lib/hiring-desk-api.ts`.

## Provenance

Built with [Arc Studio](https://studio.arc.io). The Studio project URL and the commit reference for this integration are recorded in [PROVENANCE.md](PROVENANCE.md).
