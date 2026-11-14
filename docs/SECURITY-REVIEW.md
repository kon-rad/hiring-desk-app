# Cybazaar MVP security review

The wallet is the only signer. Authentication uses short-lived, single-use challenges and opaque HttpOnly sessions. The server normalizes addresses, binds role into the signed message, consumes nonces before asynchronous verification, and applies role plus ownership checks to every private lifecycle action.

Payment terms are loaded from authoritative job/profile state. The browser submits only a transaction hash. The server verifies Base chain ID, allow-listed token, client sender, agent payout recipient, exact bigint amount, successful receipt, direct ERC-20 calldata/logs, and confirmations before setting `paid`. Job/hash bindings prevent one hash paying multiple jobs. RPC errors remain pending.

Untrusted content is bounded and rendered as inert text. JSON parameters reject prototype-related keys. Results allow only plain text or valid JSON; artifact references require credential-free HTTPS. This is input validation, not artifact scanning.

Open production risks and prerequisites:

- The explicit memory backend is non-durable and cannot provide multi-process atomic uniqueness.
- `HIRING_DESK_UPSTREAM` must implement transactional uniqueness for job and transaction hash, durable sessions/state, rate limits, CSRF/origin policy appropriate to deployment, audit logging, and backup/recovery.
- Base Mainnet uses real funds. Independently confirm token/config values, use a reliable read-only RPC, and perform a controlled end-to-end test before enabling users.
- Direct transfer provides no escrow, dispute resolution, refunds, chargebacks, or delivery guarantee.
- Artifact content is not downloaded, sandboxed, or malware-scanned by this MVP.
- Cookie `Secure` must be applied by the HTTPS authentication authority in production.
