'use client'

// TipBalancePanel — shown ONLY to FID-allowlisted testers (until public launch).
//
// Displays:
//   - Current tip balance (read from vault)
//   - Withdraw to wallet button (calls vault.withdraw)
//   - Vault paused indicator
//   - Limit info
//
// Polls the API every 30 seconds. Refetches immediately after withdraw confirms.

import { useEffect, useState, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import {
  PIZZA_TIPPING_VAULT_ADDRESS,
  PIZZA_TIPPING_VAULT_ABI,
} from '@/app/lib/constants'
import { canTip } from '@/app/lib/constants/tipAccess'

interface TipBalanceResponse {
  balance: string         // wei
  balanceWhole: string    // PIZZA
  paused: boolean
  limits: { minTip: string; maxTipPerCast: string; maxCreditPerTx: string }
  lifetime?: {
    sent: string
    sentWhole: string
    received: string
    receivedWhole: string
    sentCount: string
    receivedCount: string
  }
  vaultAddress: string
  vaultDeployed: boolean
}

interface Props {
  userFid: number | null | undefined
}

export function TipBalancePanel({ userFid }: Props) {
  const { address } = useAccount()
  const [data, setData] = useState<TipBalanceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')

  const { writeContract, data: txHash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const fetchBalance = useCallback(async () => {
    if (!address) return
    setLoading(true)
    try {
      const res = await fetch(`/api/tip/balance/${address}`)
      if (!res.ok) return
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('[TipBalancePanel] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [address])

  // Poll every 30s
  useEffect(() => {
    if (!address) return
    fetchBalance()
    const id = setInterval(fetchBalance, 30_000)
    return () => clearInterval(id)
  }, [address, fetchBalance])

  // Refetch after a successful tx
  useEffect(() => {
    if (isSuccess) {
      fetchBalance()
      setWithdrawAmount('')
      reset()
    }
  }, [isSuccess, fetchBalance, reset])

  // Hide entirely for non-allowlisted FIDs (private until public launch)
  if (!canTip(userFid)) return null

  // No wallet connected
  if (!address) return null

  // Loading state — don't flash "0"
  if (!data) {
    return (
      <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-3 my-3">
        <p className="text-purple-700 text-xs flex items-center gap-2"
           style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
          <Loader2 className="animate-spin" size={14} /> Loading tip balance…
        </p>
      </div>
    )
  }

  // Vault not deployed yet — show a soft notice for testers
  if (!data.vaultDeployed) {
    return (
      <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-3 my-3">
        <p className="text-purple-700 text-xs"
           style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
          Tip Vault: not deployed yet (testers only)
        </p>
      </div>
    )
  }

  const balanceWhole = BigInt(data.balanceWhole || '0')

  const handleWithdraw = () => {
    const amount = withdrawAmount.trim()
    if (!amount || !/^\d+$/.test(amount)) return
    const amountWhole = BigInt(amount)
    if (amountWhole <= 0n) return
    if (amountWhole > balanceWhole) return
    const amountWei = amountWhole * 10n ** 18n

    writeContract({
      address: PIZZA_TIPPING_VAULT_ADDRESS as `0x${string}`,
      abi: PIZZA_TIPPING_VAULT_ABI,
      functionName: 'withdraw',
      args: [amountWei],
    })
  }

  return (
    <div className="bg-gradient-to-br from-purple-100 to-pink-100 border-4 border-purple-400 rounded-xl p-3 my-3 shadow-md">
      <div className="flex justify-between items-center mb-2">
        <div>
          <p className="text-purple-800 text-xs uppercase"
             style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
            Tip Balance (Tester Mode)
          </p>
          <p className="text-purple-900 font-bold text-2xl"
             style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
            {balanceWhole.toLocaleString()} PIZZA
          </p>
        </div>
        {data.paused && (
          <span className="text-orange-600 text-xs font-bold">PAUSED</span>
        )}
      </div>

      <div className="bg-white/70 rounded-lg p-2 mb-2 text-[10px] text-purple-700 space-y-0.5"
           style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
        <p>Min tip: {Number(data.limits.minTip).toLocaleString()} PIZZA</p>
        <p>Max per tip: {Number(data.limits.maxTipPerCast).toLocaleString()} PIZZA</p>
        <p>Cast: <code>1000 🍕</code> or <code>1000 $pizza</code> as a reply</p>
      </div>

      {/* Lifetime stats — written-once accumulators on chain */}
      {data.lifetime && (
        <div className="bg-purple-200/60 rounded-lg p-2 mb-2 text-[10px] text-purple-900 space-y-0.5"
             style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
          <p className="font-bold uppercase">Lifetime stats (on-chain)</p>
          <div className="flex justify-between">
            <span>Tips sent:</span>
            <span>{Number(data.lifetime.sentWhole).toLocaleString()} PIZZA across {data.lifetime.sentCount} tip{data.lifetime.sentCount === '1' ? '' : 's'}</span>
          </div>
          <div className="flex justify-between">
            <span>Tips received:</span>
            <span>{Number(data.lifetime.receivedWhole).toLocaleString()} PIZZA across {data.lifetime.receivedCount} tip{data.lifetime.receivedCount === '1' ? '' : 's'}</span>
          </div>
        </div>
      )}

      {balanceWhole > 0n && (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Amount to withdraw"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^\d]/g, ''))}
            className="flex-1 min-w-0 px-2 py-1 rounded border border-purple-300 text-sm"
            disabled={isPending || isConfirming}
          />
          <Button
            onClick={handleWithdraw}
            className="flex-shrink-0 !bg-purple-600 hover:!bg-purple-700 text-white text-xs px-3"
            disabled={isPending || isConfirming || !withdrawAmount}
            style={{ fontFamily: 'var(--font-luckiest-guy)' }}
          >
            {isPending || isConfirming ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              'WITHDRAW'
            )}
          </Button>
        </div>
      )}
      {loading && balanceWhole > 0n && (
        <p className="text-purple-600 text-[10px] mt-1"
           style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
          Refreshing…
        </p>
      )}
    </div>
  )
}
