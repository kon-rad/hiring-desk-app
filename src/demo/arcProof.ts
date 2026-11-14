import { createPublicClient, decodeEventLog, decodeFunctionData, erc20Abi, http, parseAbiItem } from 'viem'
import { arcTestnet } from 'viem/chains'

export const ARC_PROOF = {
  hash: '0x9025c05fe6da1ebd5b88faa402af75e208fb2a141d45e56f8e61bb4e5aa250ac',
  sender: '0x26443703F6dF2fD599B86a0bC9c652088411C0c6',
  recipient: '0x7019b3e88472593b59902e31ed61749B62BdDe92',
  token: '0x3600000000000000000000000000000000000000',
  amountAtomic: 10_000n,
  amountUSDC: '0.01',
  explorer: 'https://explorer.testnet.arc.io/tx/0x9025c05fe6da1ebd5b88faa402af75e208fb2a141d45e56f8e61bb4e5aa250ac',
} as const

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Read-only proof. This transfer is not a Hiring Desk job payment. */
export async function verifyArcProof() {
  const client = createPublicClient({ chain: arcTestnet, transport: http('https://rpc.drpc.testnet.arc.io') })
  const [chainId, transaction, receipt, head] = await Promise.all([
    client.getChainId(),
    client.getTransaction({ hash: ARC_PROOF.hash }),
    client.getTransactionReceipt({ hash: ARC_PROOF.hash }),
    client.getBlockNumber(),
  ])
  if (chainId !== 5042002 || receipt.status !== 'success' || !same(transaction.from, ARC_PROOF.sender) || !transaction.to || !same(transaction.to, ARC_PROOF.token)) {
    throw new Error('Arc chain, sender, token or receipt mismatch')
  }
  const call = decodeFunctionData({ abi: erc20Abi, data: transaction.input })
  if (call.functionName !== 'transfer' || !same(call.args[0], ARC_PROOF.recipient) || call.args[1] !== ARC_PROOF.amountAtomic) {
    throw new Error('USDC transfer calldata mismatch')
  }
  const matches = receipt.logs.filter((log) => {
    if (!same(log.address, ARC_PROOF.token)) return false
    try {
      const event = decodeEventLog({ abi: [transferEvent], data: log.data, topics: log.topics })
      return event.eventName === 'Transfer' && same(event.args.from, ARC_PROOF.sender) && same(event.args.to, ARC_PROOF.recipient) && event.args.value === ARC_PROOF.amountAtomic
    } catch {
      return false
    }
  })
  if (matches.length !== 1) throw new Error(`Expected one exact USDC Transfer log, found ${matches.length}`)
  return { blockNumber: Number(receipt.blockNumber), confirmations: Number(head - receipt.blockNumber + 1n), logIndex: Number(matches[0].logIndex) }
}
