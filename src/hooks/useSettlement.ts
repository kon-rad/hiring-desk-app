/** Generated in Arc Studio. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { erc20Abi } from 'viem'
import { arcTestnet } from 'viem/chains'
import { useAccount, useReadContract, useSwitchChain, useWalletClient } from 'wagmi'
import type { SettlementJob, SettlementPhase } from '@/components/settlement/types'
import { settlementAdapter } from '@/lib/settlementRuntime'
import type { ConfirmedSettlement, SettlementOutcome, SettlementProgress, SettlementRequest } from '@/settlement'
import { classifyError } from '@/settlement'

interface UseSettlementOptions {
  onSettled?: (settlement: ConfirmedSettlement) => void
}

/** Glue between wagmi (wallet) and the framework-free settlement adapter. Holds no payment logic. */
export function useSettlement(job: SettlementJob, options: UseSettlementOptions = {}) {
  const { address, chainId: walletChainId, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()

  const [outcome, setOutcome] = useState<SettlementOutcome | null>(null)
  const [progress, setProgress] = useState<SettlementProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const onSettledRef = useRef(options.onSettled)
  useEffect(() => {
    onSettledRef.current = options.onSettled
  })

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
    let cancelled = false
    void settlementAdapter.resume(request, { onProgress: (p) => !cancelled && setProgress(p) }).then((resumed) => {
      if (!cancelled && resumed) accept(resumed)
    })
    return () => {
      cancelled = true
    }
  }, [request, accept])

  const pay = useCallback(async () => {
    if (!walletClient) return
    setBusy(true)
    setOutcome(null)
    setProgress({ stage: 'awaiting_signature' })
    const result = await settlementAdapter.settle(request, walletClient, { onProgress: setProgress })
    accept(result)
    setProgress(null)
    setBusy(false)
  }, [walletClient, request, accept])

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
  if (outcome?.status === 'confirmed') phase = 'confirmed'
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
