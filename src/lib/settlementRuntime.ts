/**
 * Browser wiring for the settlement adapter (Arc Studio demo app).
 * One read-only client, one durable ledger, one adapter. No key material lives here.
 */

import { ARC_TESTNET_CHAIN_ID, createKeyValueLedger, createMemoryStore, createSettlementAdapter, createSettlementPublicClient } from '@/settlement'

const store = typeof window !== 'undefined' && window.localStorage ? window.localStorage : createMemoryStore()

export const settlementLedger = createKeyValueLedger(store)
export const settlementPublicClient = createSettlementPublicClient(ARC_TESTNET_CHAIN_ID)
export const settlementAdapter = createSettlementAdapter({ publicClient: settlementPublicClient, ledger: settlementLedger })
