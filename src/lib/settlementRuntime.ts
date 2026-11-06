/**
 * Browser wiring for the settlement adapter. One read-only client, one adapter. No key material lives here.
 *
 * The ledger is browser localStorage and exists ONLY as a temporary hint so a reload can re-send an
 * already-signed transaction hash instead of asking the wallet to sign twice. It is not payment history,
 * is not durable, and never decides whether a job is paid. In the Hiring Desk flow, Argo owns payment
 * state, transaction reservation and duplicate protection.
 */

import { ARC_TESTNET_CHAIN_ID, createKeyValueLedger, createMemoryStore, createSettlementAdapter, createSettlementPublicClient } from '@/settlement'

const store = typeof window !== 'undefined' && window.localStorage ? window.localStorage : createMemoryStore()

/** Temporary UI resume hint only. Not a record of payment. */
export const settlementLedger = createKeyValueLedger(store)
export const settlementPublicClient = createSettlementPublicClient(ARC_TESTNET_CHAIN_ID)
export const settlementAdapter = createSettlementAdapter({ publicClient: settlementPublicClient, ledger: settlementLedger })
