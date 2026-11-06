# Provenance

Built with [Arc Studio](https://studio.arc.io).

- Studio project URL: **paste the project URL from your Arc Studio address bar here before sharing for review** (the sandbox cannot read it, and it is not invented here).
- Session preview host (loads only inside Arc Studio): `i7fwbzmba5d6eqpvn1wb8.preview.studio.arc.io`
- Generated on: 2026-11-06

Every generated source file also carries a "Generated in Arc Studio" header comment.

## Generated in Studio (new files)

| Path | Role |
| --- | --- |
| `src/settlement/*` | Settlement module: config, types, errors, amount, request, client, receipt, verify, ledger, adapter, api, serialize, index |
| `src/hooks/useSettlement.ts` | wagmi to adapter glue |
| `src/lib/settlementRuntime.ts` | Browser wiring |
| `src/components/settlement/*` | Payment step UI |
| `src/components/JobHarness.tsx` | Demo stand-in for the Hiring Desk job |
| `tests/settlement.test.ts` | Unit tests |
| `README.md`, `docs/*` | Documentation |

## Shaped in Studio (scaffold files that were edited)

| Path | Change |
| --- | --- |
| `src/App.tsx` | Replaced the placeholder with the demo page |
| `src/config.ts` | Arc RPC passed explicitly from the onchain facts registry |
| `index.html`, `tailwind.config.js`, `src/index.css` | Fonts, colors, title |
| `package.json` | Added `test` script |

## Refactor 2026-11-06

The settlement module no longer imports Studio helper files. `config.ts` holds literal Arc Testnet values and `amount.ts` does its own exact bigint math, so `src/settlement/` depends only on `viem`. Added `src/settlement/api.ts`, `docs/INTEGRATION.md`, and the `WRONG_RECIPIENT`, `WRONG_SENDER`, `WRONG_AMOUNT` failure codes.

## Not Studio-generated

The Hiring Desk job lifecycle, database and deliverable storage. They stay in your application.
