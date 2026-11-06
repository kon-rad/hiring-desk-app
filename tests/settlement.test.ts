/**
 * Unit tests for the settlement module's pure logic. Generated in Arc Studio.
 * Run: bun test tests
 */
import { describe, expect, test } from 'bun:test'
import { encodeAbiParameters, encodeFunctionData, erc20Abi, getAddress, pad, type Address, type Hash, type TransactionReceipt } from 'viem'
import {
  ARC_TESTNET_CONFIG,
  createKeyValueLedger,
  createMemoryStore,
  formatBaseUnits,
  normalizeRequest,
  toBaseUnits,
  toPaymentReceipt,
  toVerifyResponse,
  validateReceipt,
  verifySettlement,
  type SettlementRequest,
} from '@/settlement'

const config = ARC_TESTNET_CONFIG
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const sender = getAddress('0x00000000000000000000000000000000000000a1')
const recipient = getAddress('0x00000000000000000000000000000000000000b2')
const stranger = getAddress('0x00000000000000000000000000000000000000c3')
const hash = ('0x' + '11'.repeat(32)) as Hash
const AMOUNT = 1_500_000n

const request: SettlementRequest = {
  chainId: config.chainId,
  tokenAddress: config.token.address,
  recipientAddress: recipient,
  amountBaseUnits: AMOUNT,
  jobKey: 'JOB-1',
}

const input = (to: Address, amount: bigint): `0x${string}` => encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amount] })

function transferLog(address: Address, from: Address, to: Address, value: bigint, logIndex: number) {
  return {
    address,
    topics: [TRANSFER_TOPIC, pad(from, { size: 32 }), pad(to, { size: 32 })],
    data: encodeAbiParameters([{ type: 'uint256' }], [value]),
    logIndex,
    blockNumber: 10n,
    blockHash: hash,
    transactionHash: hash,
    transactionIndex: 0,
    removed: false,
  }
}

function receiptWith(overrides: Partial<Record<string, unknown>> = {}, logs?: ReturnType<typeof transferLog>[]): TransactionReceipt {
  return {
    transactionHash: hash,
    blockNumber: 10n,
    blockHash: hash,
    status: 'success',
    from: sender,
    to: config.token.address,
    gasUsed: 50_000n,
    effectiveGasPrice: 1n,
    logs: logs ?? [
      transferLog(config.nativeMirrorEmitter, sender, recipient, AMOUNT * 10n ** 12n, 0),
      transferLog(config.token.address, sender, recipient, AMOUNT, 1),
    ],
    ...overrides,
  } as unknown as TransactionReceipt
}

const tx = (overrides: Partial<{ to: Address; value: bigint; input: `0x${string}`; from: Address; chainId: number }> = {}) => ({
  hash,
  from: sender,
  to: config.token.address,
  value: 0n,
  input: input(recipient, AMOUNT),
  chainId: config.chainId,
  ...overrides,
})

const run = (over: { transaction?: ReturnType<typeof tx>; receipt?: TransactionReceipt; expectedSender?: Address } = {}) =>
  validateReceipt({ config, request, transaction: over.transaction ?? tx(), receipt: over.receipt ?? receiptWith(), expectedSender: over.expectedSender ?? sender })

describe('validateReceipt', () => {
  test('accepts an exact ERC-20 transfer and parses it', () => {
    const parsed = run()
    expect(parsed.transfer.value).toBe(AMOUNT)
    expect(parsed.from).toBe(sender)
    expect(parsed.nativeMirror?.valueNative).toBe(AMOUNT * 10n ** 12n)
  })

  test('rejects a reverted receipt', () => {
    expect(() => run({ receipt: receiptWith({ status: 'reverted' }) })).toThrow()
  })
  test('rejects a different chain id', () => {
    expect(() => run({ transaction: tx({ chainId: 1 }) })).toThrow()
  })
  test('rejects a native value transfer', () => {
    expect(() => run({ transaction: tx({ value: 1n }) })).toThrow()
  })
  test('rejects a call to another contract', () => {
    expect(() => run({ transaction: tx({ to: stranger }), receipt: receiptWith({ to: stranger }) })).toThrow()
  })
  test('rejects the wrong recipient in calldata', () => {
    expect(() => run({ transaction: tx({ input: input(stranger, AMOUNT) }) })).toThrow()
  })
  test('rejects the wrong amount in calldata', () => {
    expect(() => run({ transaction: tx({ input: input(recipient, AMOUNT + 1n) }) })).toThrow()
  })
  test('rejects a different sender than the connected wallet', () => {
    expect(() => run({ expectedSender: stranger })).toThrow()
  })
  test('rejects a receipt with no matching token Transfer log', () => {
    expect(() => run({ receipt: receiptWith({}, [transferLog(stranger, sender, recipient, AMOUNT, 1)]) })).toThrow()
  })
  test('rejects a Transfer log that moved a different amount', () => {
    expect(() => run({ receipt: receiptWith({}, [transferLog(config.token.address, sender, recipient, AMOUNT - 1n, 1)]) })).toThrow()
  })
  test('rejects two identical matching Transfer logs', () => {
    const log = transferLog(config.token.address, sender, recipient, AMOUNT, 1)
    expect(() => run({ receipt: receiptWith({}, [log, { ...log, logIndex: 2 }]) })).toThrow()
  })
  test('rejects a native-view mirror that disagrees with the ERC-20 amount', () => {
    const logs = [transferLog(config.nativeMirrorEmitter, sender, recipient, AMOUNT, 0), transferLog(config.token.address, sender, recipient, AMOUNT, 1)]
    expect(() => run({ receipt: receiptWith({}, logs) })).toThrow()
  })
  test('accepts a receipt without a native mirror log', () => {
    const parsed = run({ receipt: receiptWith({}, [transferLog(config.token.address, sender, recipient, AMOUNT, 1)]) })
    expect(parsed.nativeMirror).toBeNull()
  })
})

describe('typed failure codes and PaymentReceipt', () => {
  const codeOf = (fn: () => unknown): string => {
    try {
      fn()
    } catch (e) {
      return (e as { code?: string }).code ?? 'none'
    }
    return 'no-throw'
  }
  test('names the wrong recipient, amount and sender', () => {
    expect(codeOf(() => run({ transaction: tx({ input: input(stranger, AMOUNT) }) }))).toBe('WRONG_RECIPIENT')
    expect(codeOf(() => run({ transaction: tx({ input: input(recipient, AMOUNT + 1n) }) }))).toBe('WRONG_AMOUNT')
    expect(codeOf(() => run({ expectedSender: stranger }))).toBe('WRONG_SENDER')
  })
  test('builds a typed PaymentReceipt and a string-encoded response', () => {
    const parsed = run()
    const confirmed = {
      status: 'confirmed' as const, jobKey: 'JOB-1', txHash: hash, chainId: config.chainId, tokenAddress: parsed.to,
      sender: parsed.from, recipient: parsed.transfer.to, transferredAmount: parsed.transfer.value, receipt: parsed, explorerUrl: 'x',
    }
    const receipt = toPaymentReceipt(confirmed)
    expect(receipt.amountBaseUnits).toBe(AMOUNT)
    const response = toVerifyResponse(confirmed)
    expect(response.status === 'confirmed' && response.receipt.amountBaseUnits).toBe('1500000')
    expect(JSON.stringify(response)).not.toContain('n,')
  })
  test('verifySettlement never throws on a bad request', async () => {
    const outcome = await verifySettlement({} as never, { ...request, amountBaseUnits: 0n }, hash)
    expect(outcome.status).toBe('failed')
  })
})

describe('normalizeRequest', () => {
  test('accepts the verified request', () => {
    expect(normalizeRequest(request).request.jobKey).toBe('JOB-1')
  })
  test('rejects another chain', () => {
    expect(() => normalizeRequest({ ...request, chainId: 1 })).toThrow()
  })
  test('rejects another token', () => {
    expect(() => normalizeRequest({ ...request, tokenAddress: stranger })).toThrow()
  })
  test('rejects zero and negative amounts', () => {
    expect(() => normalizeRequest({ ...request, amountBaseUnits: 0n })).toThrow()
    expect(() => normalizeRequest({ ...request, amountBaseUnits: -1n })).toThrow()
  })
  test('rejects a bad checksum and a zero recipient', () => {
    const body = recipient.slice(2)
    const i = body.search(/[a-fA-F]/)
    const flipped = body[i] === body[i]?.toUpperCase() ? body[i]?.toLowerCase() : body[i]?.toUpperCase()
    const bad = `0x${body.slice(0, i)}${flipped}${body.slice(i + 1)}` as Address
    expect(() => normalizeRequest({ ...request, recipientAddress: bad })).toThrow()
    expect(() => normalizeRequest({ ...request, recipientAddress: '0x0000000000000000000000000000000000000000' })).toThrow()
  })
  test('rejects an empty job key', () => {
    expect(() => normalizeRequest({ ...request, jobKey: '  ' })).toThrow()
  })
})

describe('amounts', () => {
  test('parses and formats without floating point', () => {
    expect(toBaseUnits(config.chainId, '1.5')).toBe(1_500_000n)
    expect(toBaseUnits(config.chainId, '0.000001')).toBe(1n)
    expect(formatBaseUnits(config.chainId, 1_234_567n)).toBe('1.234567')
    expect(() => toBaseUnits(config.chainId, '1.0000001')).toThrow()
    expect(() => toBaseUnits(config.chainId, '1e6')).toThrow()
  })
})

describe('ledger', () => {
  const entry = { jobKey: 'JOB-1', chainId: config.chainId, txHash: hash, sender }
  test('blocks a second payment for the same job', async () => {
    const ledger = createKeyValueLedger(createMemoryStore())
    await ledger.markSubmitted(entry)
    await expect(ledger.markSubmitted({ ...entry, txHash: ('0x' + '22'.repeat(32)) as Hash })).rejects.toThrow()
  })
  test('blocks one tx hash being bound to two jobs', async () => {
    const ledger = createKeyValueLedger(createMemoryStore())
    await ledger.markSubmitted(entry)
    await expect(ledger.markSubmitted({ ...entry, jobKey: 'JOB-2' })).rejects.toThrow()
  })
  test('allows a retry after a failed attempt', async () => {
    const ledger = createKeyValueLedger(createMemoryStore())
    await ledger.markSubmitted(entry)
    await ledger.markFailed('JOB-1', hash)
    await ledger.markSubmitted({ ...entry, txHash: ('0x' + '22'.repeat(32)) as Hash })
    expect((await ledger.get('JOB-1'))?.status).toBe('submitted')
  })
})
