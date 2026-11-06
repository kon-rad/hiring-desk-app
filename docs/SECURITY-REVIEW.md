# Security review: Arc USDC settlement

Generated in [Arc Studio](https://studio.arc.io). Scope: `src/settlement/*`, `src/hooks/useSettlement.ts`, `src/lib/settlementRuntime.ts`, `src/components/settlement/*`. Date: 2026-11-06. No smart contract was written; the review covers TypeScript only.

Evidence: 23 unit tests pass; the validator was run against a real Arc Testnet transfer (accepted the exact match, rejected a 1-unit amount change and a different sender, returned pending for an unknown hash); the adapter was exercised live for wrong network, wrong token, missing wallet, insufficient funds and an unreachable RPC. A full signed payment was not sent from the sandbox: fund a wallet with the sidebar's "Get test USDC" and pay once to complete that check.

## Findings

| # | Severity | File | Problem | Exact fix | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | High (integration) | `src/hooks/useSettlement.ts` (`onSettled`), host code | `onSettled` runs in the browser. If the host trusts its payload to mark a job paid, a tampered client can claim a payment that never happened. | In the host, send only `txHash` to the backend and call `verifySettlement(client, requestBuiltFromDb, txHash, { expectedSender: job.clientWallet, ledger })`. Build `recipientAddress`, `amountBaseUnits`, `tokenAddress`, `chainId` from your database, never from the request body. Mark paid only on `status === 'confirmed'`. | Open: needs host code |
| 2 | Medium | `src/settlement/ledger.ts`, `src/lib/settlementRuntime.ts` | Duplicate-payment protection in the browser ledger is local to one browser. Clearing storage, a second device or two tabs racing can sign a second payment for one job. | Implement `SettlementLedger` on the Hiring Desk DB: `CREATE UNIQUE INDEX payments_job_open ON payments(job_key) WHERE status IN ('submitted','confirmed'); CREATE UNIQUE INDEX payments_tx ON payments(tx_hash);`. Call `markSubmitted` before the wallet is opened if your flow allows, and pass the ledger to `createSettlementAdapter` and `verifySettlement`. | Open: needs host DB |
| 3 | Medium | `src/components/JobHarness.tsx` | The demo form takes the recipient wallet from user input. In production an editable recipient lets anyone pay an arbitrary address. | Delete the harness. Render `<SettlementFlow job={...}>` with a job loaded from the Hiring Desk API that returns the agent's verified wallet. | Demo only |
| 4 | Medium | `src/settlement/adapter.ts` (`abandon`) and `StatusPanels.tsx` | "Release stuck payment" frees a submitted job. If the original transaction later confirms, the job could be paid twice. | Remove the button for end users, or make `abandon` require a server call that first runs `verifySettlement` and refuses while the hash is still pending or confirmed. | Mitigated: confirm prompt, mismatched payments never auto-release |
| 5 | Low | `src/settlement/config.ts` (`requiredConfirmations: 1`), `verify.ts` | One confirmation is enough only if Arc finality is deterministic. Head block and receipt may come from different nodes behind a load balancer. | Raise `requiredConfirmations` for any chain without deterministic finality, or require `blockTag: 'finalized'`. Keep 1 on Arc Testnet after confirming finality in Arc docs. | Accepted |
| 6 | Low | `src/settlement/receipt.ts` | The native-view mirror log (`0xff…fe`) was observed on live receipts, not taken from official docs. It is tolerated when absent and rejected when it disagrees. | Once Arc documents the log, require it when present in config. No code change needed until then. | Accepted |
| 7 | Low | `src/settlement/verify.ts` | `ledger` is optional, so a caller that omits it loses cross-job replay protection (one `txHash` reused for a second job). | Always pass `ledger`; add a DB unique index on `tx_hash` as in finding 2. | Open: needs host DB |
| 8 | Info | `src/settlement/adapter.ts` | A browser-local ledger can be edited by the user. It is never used to prove success: every `confirmed` result is re-derived from the chain. | None. | By design |
| 9 | Fixed in review | `src/settlement/receipt.ts` | The chain-id check passed when a transaction had no `chainId`. | Now `transaction.chainId` must equal the configured chain, or verification fails. | Fixed |
| 10 | Fixed in review | `src/settlement/adapter.ts` | Balance check ignored the network fee. On Arc, fees are paid from the same USDC pool, so the amount alone can fit but the payment still fail in the wallet. | Pre-signing check now requires amount + estimated fee (both in the 18-decimal native view via `toNativeView`) to fit the balance. | Fixed |
| 11 | Fixed in review | `src/settlement/adapter.ts` | A mined-but-mismatched payment would have been marked failed and freed the job for a second payment. | Only `REVERTED` frees a job. Mismatches stay blocked until a human calls `abandon`. | Fixed |

## Checklist coverage

| Area | Result | Where |
| --- | --- | --- |
| Wrong chain or wrong token | Blocked. Allow-list of one chain and one token; token must equal config; live `eth_chainId`, `decimals()` and `symbol()` are checked; `tx.chainId` must match. | `request.ts`, `config.ts`, `adapter.ts`, `receipt.ts` |
| Incorrect USDC decimals | Single source: `token.decimals` in config. No literal 6 elsewhere. Amounts are `bigint`; excess decimals are rejected, never rounded. | `config.ts`, `amount.ts` |
| Native vs ERC-20 confusion | ERC-20 `transfer` only. Receipt must have `value = 0`, `to = token`, token calldata. Native-view mirror cross-checked as amount x 10^12 and never counted as the transfer. | `receipt.ts` |
| Duplicate payment records | One ledger entry per job, one job per tx hash, in-flight guard, reload resumes the stored hash instead of paying again. Authoritative uniqueness must live in the host DB (findings 2, 7). | `ledger.ts`, `adapter.ts` |
| False success before confirmation | `confirmed` is produced only by `verifySettlement` after `validateReceipt` passes. A wallet hash alone returns `pending`. | `verify.ts`, `adapter.ts` |
| Wrong recipient | Checked in calldata and in the Transfer log. Checksummed, zero address and token address rejected. | `request.ts`, `receipt.ts` |
| Wrong sender | Receipt, transaction and connected wallet must agree; self-payment rejected. | `receipt.ts`, `adapter.ts` |
| Replay or reused payment | Tx hash bound to one job in the ledger; `verifySettlement` rejects a hash owned by another job when given a ledger. | `ledger.ts`, `verify.ts` |
| Private-key exposure | None. No key input, no `privateKeyToAccount`, no server signer, no key in env or storage. | whole tree (grep clean) |
| RPC failure | Before sending: failed, retryable. After sending: stays `pending` with a warning and Check again. Never reported as success or failure. | `verify.ts`, `adapter.ts` |
| Transaction rejection | `USER_REJECTED`, retryable, no ledger entry. | `errors.ts` |
| Insufficient funds | Checked before signing (amount and fee); wallet-level errors also classified. | `adapter.ts`, `errors.ts` |
| Reverted transactions | Dry-run simulation before signing; reverted receipts return `REVERTED` and free the job. | `adapter.ts`, `verify.ts` |
| UI, receipt and explorer mismatch | Confirmed screen shows values from the verified receipt, not the request. Explorer links are built from config, not user input. Deliverable link must be `https:`. | `StatusPanels.tsx`, `config.ts` |
