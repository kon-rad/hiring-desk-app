/**
 * Settlement adapter. Generated in Arc Studio.
 *
 * Moves ERC-20 USDC from the connected client wallet to a recipient, then reports
 * `confirmed` only when verifySettlement has validated the mined receipt.
 *
 * Signing is client-side: the caller passes a viem WalletClient backed by the user's own
 * wallet. This module never receives, asks for, or stores a private key.
 */

import { erc20Abi, type Address, type Hash, type PublicClient, type WalletClient } from 'viem'
import { toNativeView } from './amount'
import { type SettlementNetworkConfig } from './config'
import { classifyError, SettlementError } from './errors'
import { createKeyValueLedger, createMemoryStore, type SettlementLedger } from './ledger'
import { normalizeRequest } from './request'
import type { SettlementOutcome, SettlementPreflight, SettlementProgress, SettlementRequest } from './types'
import { toFailed, verifySettlement } from './verify'

export interface SettlementAdapterOptions {
  publicClient: PublicClient
  /** Defaults to an in-memory ledger. Pass a durable one in production. */
  ledger?: SettlementLedger
  /** How long to wait for inclusion before returning `pending`. Default 120s. */
  receiptTimeoutMs?: number
}

export interface SettleOptions {
  onProgress?: (progress: SettlementProgress) => void
}

export interface SettlementAdapter {
  /** Checks that run before the wallet is asked to sign. Throws SettlementError. */
  preflight(request: SettlementRequest, wallet: WalletClient): Promise<SettlementPreflight>
  /** Runs the full payment. Never throws: always resolves to pending, confirmed or failed. */
  settle(request: SettlementRequest, wallet: WalletClient, options?: SettleOptions): Promise<SettlementOutcome>
  /** One-shot status check of a known transaction. */
  verify(request: SettlementRequest, txHash: Hash, expectedSender?: Address): Promise<SettlementOutcome>
  /** Re-checks a payment this ledger already knows about (for example after a page reload). */
  resume(request: SettlementRequest, options?: SettleOptions): Promise<SettlementOutcome | null>
  /** Releases a stuck `submitted` entry so the job can be paid again. Only do this after checking the explorer. */
  abandon(jobKey: string): Promise<void>
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

export function createSettlementAdapter(options: SettlementAdapterOptions): SettlementAdapter {
  const { publicClient } = options
  const ledger = options.ledger ?? createKeyValueLedger(createMemoryStore())
  const receiptTimeoutMs = options.receiptTimeoutMs ?? 120_000
  const inFlight = new Set<string>()
  const metadataChecked = new Set<number>()

  async function assertOnChainTokenMetadata(config: SettlementNetworkConfig): Promise<void> {
    if (metadataChecked.has(config.chainId)) return
    const live = await publicClient.getChainId()
    if (live !== config.chainId) {
      throw new SettlementError('WRONG_NETWORK', `The RPC endpoint is on chain ${live}, expected ${config.name} (${config.chainId}).`)
    }
    const [decimals, symbol] = await Promise.all([
      publicClient.readContract({ address: config.token.address, abi: erc20Abi, functionName: 'decimals' }),
      publicClient.readContract({ address: config.token.address, abi: erc20Abi, functionName: 'symbol' }),
    ])
    if (decimals !== config.token.decimals || symbol !== config.token.symbol) {
      throw new SettlementError(
        'TOKEN_METADATA_MISMATCH',
        `The token at ${config.token.address} reports ${symbol} with ${decimals} decimals, but ${config.token.symbol} with ${config.token.decimals} is configured.`,
      )
    }
    metadataChecked.add(config.chainId)
  }

  async function preflight(input: SettlementRequest, wallet: WalletClient): Promise<SettlementPreflight> {
    try {
      const { request, config } = normalizeRequest(input)
      const account = wallet.account
      if (!account) throw new SettlementError('WALLET_NOT_CONNECTED', 'Connect your wallet to continue.', { retryable: true })
      if (same(account.address, request.recipientAddress)) {
        throw new SettlementError('INVALID_REQUEST', 'The connected wallet is the recipient. Connect the client wallet that should pay.')
      }
      const walletChainId = await wallet.getChainId()
      if (walletChainId !== config.chainId) {
        throw new SettlementError('WRONG_NETWORK', `Your wallet is on chain ${walletChainId}. Switch to ${config.name} (${config.chainId}).`, { retryable: true })
      }
      await assertOnChainTokenMetadata(config)

      const senderBalance = await publicClient.readContract({
        address: config.token.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account.address],
      })
      if (senderBalance < request.amountBaseUnits) {
        throw new SettlementError('INSUFFICIENT_FUNDS', 'Your wallet does not hold enough USDC for this payment.', {
          retryable: true,
          details: { balance: senderBalance.toString(), required: request.amountBaseUnits.toString() },
        })
      }
      return { senderBalance, tokenSymbol: config.token.symbol, tokenDecimals: config.token.decimals }
    } catch (error) {
      throw classifyError(error)
    }
  }

  /** Waits for inclusion, then validates the receipt. A pending result is returned, never a guess. */
  async function waitAndVerify(request: SettlementRequest, config: SettlementNetworkConfig, txHash: Hash, sender: Address): Promise<SettlementOutcome> {
    let finalHash = txHash
    try {
      const mined = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: config.requiredConfirmations,
        timeout: receiptTimeoutMs,
        onReplaced: () => undefined,
      })
      finalHash = mined.transactionHash
    } catch {
      // Timeout or RPC trouble: fall through. verifySettlement reports pending without guessing.
    }

    if (!same(finalHash, txHash)) {
      // The user sped up or replaced the transaction in their wallet; follow the replacement.
      await ledger.markFailed(request.jobKey, txHash)
      await ledger.markSubmitted({ jobKey: request.jobKey, chainId: request.chainId, txHash: finalHash, sender })
    }

    const outcome = await verifySettlement(publicClient, request, finalHash, { expectedSender: sender, ledger })
    if (outcome.status === 'confirmed') await ledger.markConfirmed(request.jobKey, finalHash)
    // Only a revert (no USDC moved) frees the job for another attempt. A mined-but-mismatched
    // payment stays blocked until a human checks it and calls abandon().
    if (outcome.status === 'failed' && outcome.code === 'REVERTED') await ledger.markFailed(request.jobKey, finalHash)
    return outcome
  }

  async function settle(input: SettlementRequest, wallet: WalletClient, settleOptions: SettleOptions = {}): Promise<SettlementOutcome> {
    let txHash: Hash | null = null
    let claimedJobKey: string | null = null
    try {
      const { request, config } = normalizeRequest(input)

      if (inFlight.has(request.jobKey)) {
        throw new SettlementError('ALREADY_PAID', 'A payment for this job is already being processed.')
      }
      inFlight.add(request.jobKey)
      claimedJobKey = request.jobKey

      const existing = await ledger.get(request.jobKey)
      if (existing && existing.status !== 'failed') {
        // Never submit a second transfer: re-check the one we already know about.
        settleOptions.onProgress?.({ stage: 'confirming', txHash: existing.txHash })
        return await waitAndVerify(request, config, existing.txHash, existing.sender)
      }

      const checks = await preflight(request, wallet)
      const account = wallet.account
      if (!account) throw new SettlementError('WALLET_NOT_CONNECTED', 'Connect your wallet to continue.', { retryable: true })

      // Dry run: surfaces blacklists, paused tokens and similar reverts before the user signs.
      const simulation = await publicClient.simulateContract({
        account,
        address: config.token.address,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [request.recipientAddress, request.amountBaseUnits],
      })

      // On Arc the network fee is paid from the same USDC pool, so amount + fee must fit the balance.
      const [gas, gasPrice] = await Promise.all([
        publicClient.estimateContractGas({
          account,
          address: config.token.address,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [request.recipientAddress, request.amountBaseUnits],
        }),
        publicClient.getGasPrice(),
      ])
      const fee = gas * gasPrice
      const needed = toNativeView(request.chainId, request.amountBaseUnits) + fee
      if (toNativeView(request.chainId, checks.senderBalance) < needed) {
        throw new SettlementError('INSUFFICIENT_FUNDS', 'Your wallet cannot cover this payment plus the network fee, which is paid in the same USDC balance.', {
          retryable: true,
          details: { balance: checks.senderBalance.toString(), required: request.amountBaseUnits.toString(), estimatedFeeNative18: fee.toString() },
        })
      }

      settleOptions.onProgress?.({ stage: 'awaiting_signature' })
      txHash = await wallet.writeContract(simulation.request)

      let ledgerWarning: string | null = null
      try {
        await ledger.markSubmitted({ jobKey: request.jobKey, chainId: request.chainId, txHash, sender: account.address })
      } catch (error) {
        ledgerWarning = classifyError(error).message
      }

      settleOptions.onProgress?.({ stage: 'confirming', txHash })
      const outcome = await waitAndVerify(request, config, txHash, account.address)
      return outcome.status === 'pending' && ledgerWarning && !outcome.warning ? { ...outcome, warning: ledgerWarning } : outcome
    } catch (error) {
      return toFailed(error, input.jobKey, input.chainId, txHash)
    } finally {
      if (claimedJobKey) inFlight.delete(claimedJobKey)
    }
  }

  return {
    preflight,
    settle,
    verify: (input, txHash, expectedSender) => verifySettlement(publicClient, input, txHash, { expectedSender, ledger }),
    async resume(input, resumeOptions = {}) {
      try {
        const { request, config } = normalizeRequest(input)
        const existing = await ledger.get(request.jobKey)
        if (!existing || existing.status === 'failed') return null
        resumeOptions.onProgress?.({ stage: 'confirming', txHash: existing.txHash })
        return await waitAndVerify(request, config, existing.txHash, existing.sender)
      } catch (error) {
        return toFailed(error, input.jobKey, input.chainId, null)
      }
    },
    async abandon(jobKey) {
      const existing = await ledger.get(jobKey)
      if (existing?.status === 'submitted') await ledger.markFailed(jobKey, existing.txHash)
    },
  }
}
