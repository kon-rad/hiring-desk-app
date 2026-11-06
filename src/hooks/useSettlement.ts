/** Generated in Arc Studio. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { erc20Abi, type Hash } from 'viem'
import { arcTestnet } from 'viem/chains'
import { useAccount, useReadContract, useSwitchChain, useWalletClient } from 'wagmi'
import type { SettlementJob, SettlementPhase } from '@/components/settlement/types'
import { settlementAdapter } from '@/lib/settlementRuntime'
import type { ConfirmedSettlement, SettlementOutcome, SettlementProgress, SettlementRequest } from '@/settlement'
import { classifyError } from '@/settlement'

interface UseSettlementOptions {
  /**
   * 'self' (demo): the browser waits for the receipt and reports confirmed itself.
   * 'external': the browser only signs and submits, then hands the hash to `onSubmitted`.
   * A server decides whether the payment is confirmed; this hook never reports paid.
   */
  mode?: 'self' | 'external'
  onSettled?: (settlement: ConfirmedSettlement) => void
  onSubmitted?: (txHash: Hash) => void
}

const sameAddress = (a?: string, b?: string): boolean => Boolean(a && b && a.toLowerCase() === b.toLowerCase())

/** Glue between wagmi (wallet) and the framework-free settlement adapter. Holds no payment logic. */
export function useSettlement(job: SettlementJob, options: UseSettlementOptions = {}) {
  const { address, chainId: walletChainId, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()

  const [outcome, setOutcome] = useState<SettlementOutcome | null>(null)
  const [progress, setProgress] = useState<SettlementProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [submittedHash, setSubmittedHash] = useState<Hash | null>(null)
  const external = options.mode === 'external'
  const onSettledRef = useRef(options.onSettled)
  const onSubmittedRef = useRef(options.onSubmitted)
  useEffect(() => {
    onSettledRef.current = options.onSettled
    onSubmittedRef.current = options.onSubmitted
  })

  const wrongClient = isConnected && Boolean(job.clientAddress) && !sameAddress(address, job.clientAddress)

  const request: SettlementRequest = useMemo(
    () => ({
      chainId: job.chainId,
      tokenAddress: job.tokenAddress,
      recipientAddress: job.recipientAddress,
      amountBaseUnits: job.amountBaseUnits,
      jobKey: job.jobKey,
    }),
    [job],
  )

  const balance = useReadContract({
    address: job.tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: job.chainId,
    query: { enabled: Boolean(address), refetchInterval: 10_000 },
  })

  const accept = useCallback((next: SettlementOutcome | null) => {
    setOutcome(next)
    if (next?.status === 'confirmed') onSettledRef.current?.(next)
  }, [])

  // A reload must never lose track of a payment that was already submitted.
  useEffect(() => {
    if (external) return
    let cancelled = false
    void settlementAdapter.resume(request, { onProgress: (p) => !cancelled && setProgress(p) }).then((resumed) => {
      if (!cancelled && resumed) accept(resumed)
    })
    return () => {
      cancelled = true
    }
  }, [request, accept, external])

  const pay = useCallback(async () => {
    if (!walletClient || wrongClient) return
    setBusy(true)
    setOutcome(null)
    setProgress({ stage: 'awaiting_signature' })
    if (external) {
      const submitted = await settlementAdapter.submit(request, walletClient, { onProgress: setProgress })
      if (submitted.status === 'submitted') {
        setSubmittedHash(submitted.txHash)
        onSubmittedRef.current?.(submitted.txHash)
      } else {
        setOutcome(submitted)
      }
      setProgress(null)
      setBusy(false)
      return
    }
    const result = await settlementAdapter.settle(request, walletClient, { onProgress: setProgress })
    accept(result)
    setProgress(null)
    setBusy(false)
  }, [walletClient, request, accept, external, wrongClient])

  const checkAgain = useCallback(async () => {
    setBusy(true)
    const result = await settlementAdapter.resume(request, { onProgress: setProgress })
    if (result) accept(result)
    setProgress(null)
    setBusy(false)
  }, [request, accept])

  const reset = useCallback(() => {
    setOutcome(null)
    setProgress(null)
  }, [])

  const abandonPending = useCallback(async () => {
    await settlementAdapter.abandon(job.jobKey)
    reset()
  }, [job.jobKey, reset])

  const switchNetwork = useCallback(async () => {
    setSwitchError(null)
    try {
      // Arc Testnet is the only allow-listed network, so the literal id is safe here.
      await switchChainAsync({ chainId: arcTestnet.id })
    } catch (error) {
      setSwitchError(classifyError(error).message)
    }
  }, [switchChainAsync])

  let phase: SettlementPhase = 'review'
  if (submittedHash) phase = 'submitted'
  else if (outcome?.status === 'confirmed') phase = 'confirmed'
  else if (outcome?.status === 'failed') phase = 'failed'
  else if (outcome?.status === 'pending' || progress?.stage === 'confirming') phase = 'pending'
  else if (busy) phase = 'signing'

  return {
    phase,
    outcome,
    progress,
    busy,
    isConnected,
    walletAddress: address,
    wrongClient,
    wrongNetwork: isConnected && walletChainId !== job.chainId,
    walletChainId,
    switchNetwork,
    isSwitching,
    switchError,
    balance: balance.data,
    balanceError: balance.isError,
    pay,
    checkAgain,
    reset,
    abandonPending,
  }
}
