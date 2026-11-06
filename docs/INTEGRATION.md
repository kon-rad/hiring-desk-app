# Integration guide: Arc USDC payment module

> The Argo Hiring Desk integration (public API client, production page, server-verified payments) is documented in [ARGO-INTEGRATION.md](ARGO-INTEGRATION.md). The HTTP contract in section 6 below is the generic example; Argo's routes there are canonical. Use `adapter.submit(...)` (sign and return the hash without waiting) when a server decides confirmation, and `<SettlementFlow mode="external">` in the UI.

Generated in [Arc Studio](https://studio.arc.io). For the private Second Brain Hiring Desk. The module settles one payment per job. Job state, operator state, deliverables and the agent's wallet record stay in your application.

## 1. Requirements coverage

| # | Requirement | Where it is met |
| --- | --- | --- |
| 1 | Accept `jobKey`, `chainId`, `tokenAddress`, `recipientAddress`, exact base units | `SettlementRequest` |
| 2 | Show every detail before signing | `<SettlementFlow>` review step (job reference, deliverable, amount, network, token, recipient name and full address, connected wallet). Headless callers must render their own review. |
| 3 | Signing is client-side | `adapter.settle(request, walletClient)`. The wallet client belongs to the user's wallet. |
| 4 | Wait for a confirmed receipt | `settle` waits, then calls the verifier. A wallet hash alone is `pending`. |
| 5 | Verify chain, token, sender, recipient, amount | `validateReceipt` via `verifySettlement` |
| 6 | Typed `PaymentReceipt` | `toPaymentReceipt(confirmedOutcome)` |
| 7 | Rejected, pending, failed, wrong network, wrong recipient, insufficient funds | See state table below |
| 8 | No floating point | All amounts are `bigint`; decimals parsed from strings with an exact parser; excess decimals are rejected |
| 9 | No private key | Nothing requests, reads or stores a key. No signer code, no key env var |
| 10 | Job and operator state external | Module holds none. It writes only to a `SettlementLedger` that you implement |

## 2. Exported functions and types

Import from `src/settlement/index.ts` only.

Functions:

| Export | Use |
| --- | --- |
| `createSettlementAdapter({ publicClient, ledger?, receiptTimeoutMs? })` | Browser. Returns `{ preflight, settle, verify, resume, abandon }` |
| `adapter.settle(request, walletClient, { onProgress? })` | Runs the payment. Never throws. Resolves to `SettlementOutcome` |
| `adapter.submit(request, walletClient, { onProgress? })` | Signs and submits, returns `{ status: 'submitted', txHash }` or a failure. Does not wait. Never throws |
| `adapter.preflight(request, walletClient)` | Optional pre-signing checks (network, token on chain, balance). Throws `SettlementError` |
| `adapter.verify(request, txHash, expectedSender?)` | One-shot status of a known hash |
| `adapter.resume(request)` | Re-checks a payment the ledger already knows (after a reload) |
| `adapter.abandon(jobKey)` | Releases a stuck `submitted` entry. Operator action only |
| `verifySettlement(publicClient, request, txHash, { expectedSender?, ledger? })` | Node or browser, read-only. Never throws. The server-side proof |
| `toPaymentReceipt(confirmed)` | `ConfirmedSettlement` to `PaymentReceipt` |
| `toVerifyResponse(outcome)` / `toPaymentReceiptJson(receipt)` | String-encoded JSON for your API |
| `validateReceipt({ config, request, transaction, receipt, expectedSender? })` | Pure receipt validation |
| `normalizeRequest(request)` | Validates and checksums a request |
| `toBaseUnits(chainId, "12.50")`, `formatBaseUnits`, `formatBaseUnitsPadded` | Exact amount conversion |
| `createSettlementPublicClient(chainId, rpcUrl?)` | Read-only viem client |
| `createKeyValueLedger`, `createMemoryStore` | Demo ledger. Replace in production |
| `getNetworkConfig`, `ARC_TESTNET_CONFIG`, `SETTLEMENT_NETWORKS`, `explorerTxUrl`, `explorerAddressUrl` | Config access |
| `classifyError`, `SettlementError`, `serializeOutcome` | Error handling and JSON-safe output |

Types: `SettlementRequest`, `SettlementOutcome` (`PendingSettlement | ConfirmedSettlement | FailedSettlement`), `PaymentReceipt`, `ParsedReceipt`, `SettlementProgress`, `SettlementLedger`, `LedgerEntry`, `SettlementErrorCode`, `VerifyPaymentRequestBody`, `VerifyPaymentResponse`, `PaymentReceiptJson`.

Optional React layer: `SettlementFlow` (props `job`, `onPaymentConfirmed(receipt)`), `useSettlement`.

## 3. Files required

Core (viem only, no React, no path aliases):

```
src/settlement/index.ts      src/settlement/config.ts     src/settlement/types.ts
src/settlement/errors.ts     src/settlement/amount.ts     src/settlement/request.ts
src/settlement/client.ts     src/settlement/receipt.ts    src/settlement/verify.ts
src/settlement/ledger.ts     src/settlement/adapter.ts    src/settlement/api.ts
src/settlement/serialize.ts
```

Optional React UI (needs the `@/` alias, wagmi, ConnectKit, Tailwind, lucide-react, @web3icons/react):

```
src/components/settlement/{SettlementFlow,ReviewCard,StatusPanels,ui,types}.tsx|ts
src/hooks/useSettlement.ts
src/lib/settlementRuntime.ts     (demo wiring: replace its ledger)
```

Do not copy: `src/App.tsx`, `src/components/JobHarness.tsx` (demo only), `tests/` (copy if you want the tests; they need `bun:test`).

## 4. Dependencies

| Package | Needed by |
| --- | --- |
| `viem` ^2 (tested 2.57.5) | core module |
| `typescript` ^5 with `target` ES2020 or later (bigint literals) | core module |
| `react` 18, `wagmi` ^2, `connectkit`, `@tanstack/react-query` | optional UI |
| `tailwindcss`, `lucide-react`, `@web3icons/react` | optional UI |

## 5. Environment variables

The module reads none. It never touches `process.env` or `import.meta.env`.

Recommended in your app (server side, never `VITE_`-prefixed because provider URLs can embed a key):

| Variable | Purpose |
| --- | --- |
| `ARC_TESTNET_RPC_URL` | Your own RPC provider URL for server verification. Passed to `createSettlementPublicClient(5042002, process.env.ARC_TESTNET_RPC_URL)`. If unset, the public Arc RPC is used and may rate-limit. |

## 6. API request and response shape

Module types:

```ts
interface SettlementRequest {
  chainId: number               // must be allow-listed (Arc Testnet 5042002)
  tokenAddress: Address         // must equal the verified USDC address
  recipientAddress: Address     // EIP-55 checksummed or all-lowercase
  amountBaseUnits: bigint       // exact, > 0 (USDC: 6 decimals)
  jobKey: string                // your job id, 1-128 printable chars
}

type SettlementOutcome = PendingSettlement | ConfirmedSettlement | FailedSettlement

interface PaymentReceipt {
  status: 'confirmed'
  jobKey: string; txHash: Hash; chainId: number
  tokenAddress: Address         // from the receipt
  sender: Address; recipient: Address
  amountBaseUnits: bigint       // from the Transfer log
  blockNumber: bigint; blockHash: Hash
  explorerUrl: string
  receipt: ParsedReceipt        // gasUsed, effectiveGasPrice, matched Transfer log, native-view mirror
}
```

Recommended HTTP contract between the job page and your server. The browser sends only the hash. The server loads everything else from its own database.

```
POST /api/jobs/:jobKey/payment
Request:  { "txHash": "0x..." }

200 { "status": "confirmed", "receipt": {
        "status": "confirmed", "jobKey": "...", "txHash": "0x...", "chainId": 5042002,
        "tokenAddress": "0x3600000000000000000000000000000000000000",
        "sender": "0x...", "recipient": "0x...", "amountBaseUnits": "25000000",
        "blockNumber": "123", "blockHash": "0x...", "gasUsed": "50000", "explorerUrl": "https://..." } }
200 { "status": "pending", "txHash": "0x...", "confirmations": 0, "requiredConfirmations": 1, "warning": null }
200 { "status": "failed", "code": "WRONG_RECIPIENT", "message": "...", "retryable": false, "txHash": "0x..." }
```

Failure codes and what the user sees:

| State | `code` | Retryable |
| --- | --- | --- |
| Rejected in wallet | `USER_REJECTED` | yes |
| Wrong network | `WRONG_NETWORK` | yes |
| Insufficient funds (amount, or amount plus fee) | `INSUFFICIENT_FUNDS` | yes |
| RPC failure before sending | `RPC_FAILURE` | yes |
| RPC failure after sending | status stays `pending` with `warning` | n/a |
| Reverted | `REVERTED` | yes (no USDC moved) |
| Paid the wrong recipient | `WRONG_RECIPIENT` | no. Job is not marked paid; investigate |
| Paid from an unexpected wallet | `WRONG_SENDER` | no |
| Paid a different amount | `WRONG_AMOUNT` | no |
| Other receipt mismatch (chain, token, native send, log) | `VERIFICATION_FAILED` | no |
| Job already paid or in progress | `ALREADY_PAID`, `DUPLICATE_TRANSACTION` | no |
| Bad input | `INVALID_REQUEST`, `UNSUPPORTED_CHAIN`, `TOKEN_MISMATCH`, `TOKEN_METADATA_MISMATCH` | no |

## 7. Minimal Hiring Desk job page

Browser (React). `job` comes from your API; the agent's wallet must come from your verified record.

```tsx
import { useEffect, useState } from 'react'
import { SettlementFlow } from './components/settlement/SettlementFlow'
import type { SettlementJob } from './components/settlement/types'
import type { PaymentReceipt, VerifyPaymentResponse } from './settlement'

export function JobPaymentStep({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<SettlementJob | null>(null)
  const [paid, setPaid] = useState<VerifyPaymentResponse | null>(null)

  useEffect(() => {
    // Your endpoint: returns the stored job, deliverable URL and the agent's verified wallet.
    void fetch(`/api/jobs/${jobId}/payment-details`)
      .then((r) => r.json())
      .then((d: Omit<SettlementJob, 'amountBaseUnits'> & { amountBaseUnits: string }) =>
        setJob({ ...d, amountBaseUnits: BigInt(d.amountBaseUnits) }),
      )
  }, [jobId])

  async function onPaymentConfirmed(receipt: PaymentReceipt) {
    // UI signal only. The server re-verifies before it changes any job state.
    const res = await fetch(`/api/jobs/${jobId}/payment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txHash: receipt.txHash }),
    })
    setPaid((await res.json()) as VerifyPaymentResponse)
  }

  if (!job) return <p>Loading payment details…</p>
  if (paid?.status === 'confirmed') return <p>Job marked paid. Tx {paid.receipt.txHash}</p>
  return <SettlementFlow job={job} onPaymentConfirmed={onPaymentConfirmed} />
}
```

`SettlementJob` is `{ jobKey, jobReference, deliverableUrl, recipientName, recipientAddress, chainId, tokenAddress, amountBaseUnits }`. The page must be inside your existing wagmi and ConnectKit providers.

Server route (framework-agnostic). The server decides the recipient and amount, never the request body.

```ts
import { createSettlementPublicClient, toVerifyResponse, verifySettlement } from './settlement'

const client = createSettlementPublicClient(5042002, process.env.ARC_TESTNET_RPC_URL)

export async function verifyJobPayment(jobKey: string, body: { txHash: `0x${string}` }) {
  const job = await db.jobs.get(jobKey)                 // your state, not this module's
  if (!job || job.status !== 'awaiting_payment') throw new Error('job not payable')

  const outcome = await verifySettlement(
    client,
    {
      chainId: job.chainId,
      tokenAddress: job.tokenAddress,
      recipientAddress: job.agent.verifiedWallet,       // from your records
      amountBaseUnits: BigInt(job.amountBaseUnits),     // stored as a string or numeric column
      jobKey,
    },
    body.txHash,
    { expectedSender: job.client.wallet, ledger: dbLedger },
  )

  if (outcome.status === 'confirmed') await db.jobs.markPaid(jobKey, outcome) // unique tx_hash
  return toVerifyResponse(outcome)
}
```

Headless use (no bundled UI): call `adapter.settle(request, walletClient)` yourself and render the eight review fields before you call it.

## 8. Assumptions to change before integration

1. **Ledger.** `src/lib/settlementRuntime.ts` stores payment records in browser `localStorage`, which protects one browser only. Implement `SettlementLedger` on your database with `UNIQUE(tx_hash)` and a unique open/confirmed row per `job_key`, and pass it to `verifySettlement` and the adapter.
2. **Recipient source.** The demo form takes a wallet from user input. In production the recipient comes only from your verified agent record, on the server.
3. **Server verification is mandatory.** `onPaymentConfirmed` runs in the browser and is not proof. Mark a job paid only from `verifySettlement` on your server.
4. **Expected sender.** Pass the client's wallet to `expectedSender` if your records have it. If they do not, record the sender from the first confirmed receipt and bind the job to it.
5. **Network.** Only Arc Testnet (5042002) is allow-listed. Adding mainnet is a deliberate change to `config.ts` that needs your own review, an independent audit and real-funds sign-off; this module does not enable it.
6. **Config values.** `config.ts` holds literal values confirmed on 2026-11-06. Re-check chain ID, token address, decimals and explorer against Arc docs at integration time. The module also checks `decimals()` and `symbol()` on chain before the first payment.
7. **Native-view mirror log.** The `0xff…fe` mirror log was observed on live receipts, not taken from official documentation. It is cross-checked when present and tolerated when absent.
8. **Confirmations.** `requiredConfirmations` is 1. Raise it if Arc finality guarantees do not meet your policy.
9. **RPC.** Use your own provider URL on the server (`ARC_TESTNET_RPC_URL`). The public RPC may rate-limit, and I have not measured its limits.
10. **Operator release.** The "Release stuck payment" button in `StatusPanels.tsx` lets a client free a stuck job. Remove it for end users and expose `abandon` only to operators, after a server check that the hash is not confirmed.
11. **Wallets.** The demo uses an injected wallet through ConnectKit. Keep whatever connector your Hiring Desk already uses; any viem `WalletClient` works with the adapter.
12. **Public demo.** The Vercel deployment contains the demo form. Do not link it from the private Hiring Desk. It is not wired to your data.
13. **Untested end to end.** Unit tests (26) and live read-only checks pass, but a signed payment has not been sent from the deployed build. Run one small payment with test USDC before relying on it.
