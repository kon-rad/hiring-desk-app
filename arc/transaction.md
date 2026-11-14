# Arc Testnet USDC transaction proof

## Transaction

On 2026-11-07, Akira's provider wallet sent **0.01 test USDC** to a separate controlled demo wallet on Arc Testnet. This is an onchain transfer proof. It is **not** payment for the simulated $5 Akira job, and the Hiring Desk backend has not allocated this receipt to a job.

| Field | Independently verified value |
|---|---|
| Network | Arc Testnet, chain ID `5042002` |
| USDC ERC-20 | `0x3600000000000000000000000000000000000000`, 6 decimals |
| Sender | `0x26443703F6dF2fD599B86a0bC9c652088411C0c6` |
| Recipient | `0x7019b3e88472593b59902e31ed61749B62BdDe92` |
| Amount | `0.01` test USDC, `10000` ERC-20 base units |
| Transaction | [Arc Testnet explorer](https://explorer.testnet.arc.io/tx/0x9025c05fe6da1ebd5b88faa402af75e208fb2a141d45e56f8e61bb4e5aa250ac) |
| Block | `71136730`, 2026-11-07 03:51:08 UTC |
| Receipt | `success`, `73938` gas used |
| Exact ERC-20 Transfer event | Log index `18`, sender, recipient and `10000` units matched |

The sender had 20 test USDC and the recipient had 0 before the transfer. A fresh read after the transaction returned 0.01 test USDC for the recipient. Arc exposes one USDC balance through an 18-decimal native gas view and a 6-decimal ERC-20 view; these are not separate funds or additive balances. The 6-decimal sender view read `19.988151` after the transfer and fee.

## Reproduce the receipt check

From the app repository root with Bun installed:

```bash
bun scripts/verify-arc-usdc.ts
```

The read-only script uses Circle's listed dRPC testnet endpoint. It checks the chain ID, transaction sender and token contract, `transfer` calldata, successful receipt and exactly one matching USDC Transfer log. It prints the block number, current confirmation count and log index. No private key is needed to verify it. The `/akira` app page runs the same check in the browser and links the explorer transaction. If the RPC is unavailable, the page reports the check as unavailable rather than claiming success.

## What remains open

The real Hiring Desk must publish accepted job terms, have a separate client wallet send the exact accepted amount to Akira, independently verify the receipt in its backend and bind it to the job before showing Paid. This transaction demonstrates Arc Testnet USDC transfer mechanics only. See the local vault's `Projects/devcon-2026/hiring-desk/arc-side-integration-checklist.md` and `hello-world-demo-deliverable.md`.

## Sources

- [Arc Connect to Arc documentation](https://docs.arc.io/arc/references/connect-to-arc) - network, RPC and explorer.
- [Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses) - USDC token address.
