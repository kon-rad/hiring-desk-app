# Settlement integration

The active integration is Base Mainnet USDC. Import the framework-free API from `src/settlement/index.ts`. Browser callers use `createSettlementAdapter` with a wallet-backed viem client. Servers use `verifySettlement` with a read-only public client and job-derived `SettlementRequest`. Never accept chain, token, recipient, sender, or amount from the payment request body; that body contains only `txHash`.

See the README and architecture document for configuration, routes, checks, and production prerequisites.
