'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import { X, Loader2, Share2, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi'
import { decodeEventLog } from 'viem'
import { sdk } from '@farcaster/miniapp-sdk'
import {
  SHARE_AND_SPIN_ADDRESS,
  SHARE_AND_SPIN_ABI,
} from '@/app/lib/constants'

// ── Wheel geometry ──────────────────────────────────────────────
const SHARE_SPIN_OUTCOMES = [
  { name: 'Nothing'    as const, slices: [1, 3, 5, 7], color: 'bg-gray-700',   border: 'border-gray-500'   },
  { name: 'Free Slice' as const, slices: [2, 4, 6],    color: 'bg-orange-500', border: 'border-orange-300' },
  { name: 'Gold'       as const, slices: [0],           color: 'bg-yellow-500', border: 'border-yellow-300' },
]

function getTargetRotation(sliceIndex: number, fullSpins = 4): number {
  const sliceCenterAngle = sliceIndex * 45 + 22.5
  return fullSpins * 360 + (360 - sliceCenterAngle)
}

function castHashToBytes32(castHash: string | null): `0x${string}` {
  const empty = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
  if (!castHash) return empty
  const clean  = castHash.startsWith('0x') ? castHash.slice(2) : castHash
  const padded = clean.padEnd(64, '0').slice(0, 64)
  return `0x${padded}` as `0x${string}`
}

const SHARE_TEXT = `\u{1F525}\u{1F355} This pie doesn't sit under a heat lamp.

Fresh Daily and Weekly Jackpots paid in $PIZZA. Every topping grows the pot. Every spin adds flavor.

Stake it. Spin it. Slice it.

Play Pizza Party and get your slice.

The more we play, the bigger the pie.

Come eat \u{1F355}\u{1F525}`

const SHARE_EMBED = 'https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party'
const F = { fontFamily: 'var(--font-luckiest-guy)', fontWeight: 'bold' as const }

type Step =
  | 'compose'
  | 'posted'
  | 'verifying'
  | 'verify_failed'
  | 'claiming_share'
  | 'spinning'
  | 'spin_result'
  | 'claiming_slice'
  | 'done'

interface ShareAndSpinModalProps {
  userFid?:       number | null
  onClose:        () => void
  onGoToDaily:    () => void
  isBanned?:      boolean
  pizzaUsdPrice?: number
  wheelImageSrc?: string
}

export default function ShareAndSpinModal({
  userFid,
  onClose,
  onGoToDaily,
  isBanned,
  pizzaUsdPrice = 0.000001,
  wheelImageSrc = '/images/share_spin_wheel.png',
}: ShareAndSpinModalProps) {
  const { address }  = useAccount()
  const publicClient = usePublicClient()

  const [step, setStep]               = useState<Step>('compose')
  const [castHash, setCastHash]       = useState<string | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [spinOutcome, setSpinOutcome] = useState<typeof SHARE_SPIN_OUTCOMES[number] | null>(null)
  const [rotation, setRotation]       = useState(0)
  const [isSpinning, setIsSpinning]   = useState(false)
  const wheelRef = useRef<HTMLDivElement>(null)

  // Calculate reward amount from live price
  const claimedRewardWei = pizzaUsdPrice > 0
    ? BigInt(Math.floor(0.01 / pizzaUsdPrice * 1e18))
    : 0n

  // ── Read share info ──────────────────────────────────────────
  const { data: shareInfoRaw, refetch: refetchShareInfo } = useReadContract({
    address: SHARE_AND_SPIN_ADDRESS as `0x${string}`,
    abi: SHARE_AND_SPIN_ABI,
    functionName: 'getShareInfo',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const shareInfo = shareInfoRaw
    ? {
        sharesUsed:  Number((shareInfoRaw as [bigint, boolean, bigint])[0]),
        canShareNow: Boolean((shareInfoRaw as [bigint, boolean, bigint])[1]),
        nextShareAt: Number((shareInfoRaw as [bigint, boolean, bigint])[2]),
      }
    : { sharesUsed: 0, canShareNow: true, nextShareAt: 0 }

  // ── recordShare tx ───────────────────────────────────────────
  const {
    writeContract: writeShare,
    data: shareHash,
    isPending: sharePending,
    reset: resetShare,
  } = useWriteContract()

  const { isLoading: shareConfirming, isSuccess: shareConfirmed } =
    useWaitForTransactionReceipt({ hash: shareHash })

  useEffect(() => {
    if (!shareConfirmed) return
    resetShare()
    refetchShareInfo()

    const bytes32 = castHashToBytes32(castHash)
    writeSpin({
      address: SHARE_AND_SPIN_ADDRESS as `0x${string}`,
      abi: SHARE_AND_SPIN_ABI,
      functionName: 'recordShareSpin',
      args: [bytes32],
      gas: 150_000n,
    })
  }, [shareConfirmed]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── recordShareSpin tx ───────────────────────────────────────
  const {
    writeContract: writeSpin,
    data: spinTxHash,
    reset: resetSpin,
  } = useWriteContract()

  const { isLoading: spinConfirming, isSuccess: spinConfirmed } =
    useWaitForTransactionReceipt({ hash: spinTxHash, pollingInterval: 1_000 })

  useEffect(() => {
    if (!spinConfirmed || !publicClient || !spinTxHash) return

    const go = async () => {
      resetSpin()
      let outcomeIndex = 0

      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: spinTxHash })
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: SHARE_AND_SPIN_ABI,
              data: log.data,
              topics: log.topics,
            })
            if (decoded.eventName === 'ShareSpinRecorded') {
              outcomeIndex = Number((decoded.args as { outcome: number }).outcome)
              break
            }
          } catch { /* not this log */ }
        }
      } catch (err) {
        console.error('[ShareAndSpin] receipt read failed:', err)
      }

      if (address) {
        fetch('/api/share/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            castHash,
            playerAddress: address,
            playerFid: userFid ?? 0,
            outcome: outcomeIndex,
            txHash: spinTxHash,
          }),
        }).catch(console.error)
      }

      runSpinAnimation(outcomeIndex)
    }

    go()
  }, [spinConfirmed, publicClient, spinTxHash]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Spin animation ───────────────────────────────────────────
  const runSpinAnimation = useCallback((outcomeIndex: number) => {
    setStep('spinning')
    const outcome = SHARE_SPIN_OUTCOMES[outcomeIndex] ?? SHARE_SPIN_OUTCOMES[0]
    const slices  = outcome.slices
    const target  = slices[Math.floor(Math.random() * slices.length)]
    const rot     = getTargetRotation(target, 3 + Math.floor(Math.random() * 3))

    setRotation(0)
    requestAnimationFrame(() => {
      setIsSpinning(true)
      setRotation(rot)
    })

    setTimeout(() => {
      setIsSpinning(false)
      setSpinOutcome(outcome)
      setStep('spin_result')
    }, 3000)
  }, [])

  // ── Handlers ─────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    try {
      const result = await sdk.actions.composeCast({
        text: SHARE_TEXT,
        embeds: [SHARE_EMBED],
      })
      const hash = (result as { cast?: { hash?: string } | null })?.cast?.hash ?? null
      setCastHash(hash)
    } catch (err) {
      console.error('[ShareAndSpin] composeCast:', err)
    }
    setStep('posted')
  }, [])

  const handleVerify = useCallback(async () => {
    if (!address || !userFid) return
    setStep('verifying')
    setVerifyError(null)

    try {
      const res = await fetch('/api/share/verify-cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ castHash, playerAddress: address, playerFid: userFid }),
      })
      const data = await res.json()

      if (data.blocked) {
        setVerifyError(data.reason ?? 'Verification failed.')
        setStep('verify_failed')
        return
      }

      setStep('claiming_share')
      writeShare({
        address: SHARE_AND_SPIN_ADDRESS as `0x${string}`,
        abi: SHARE_AND_SPIN_ABI,
        functionName: 'recordShare',
        args: [claimedRewardWei],
        gas: 200_000n,
      })
    } catch (err) {
      console.error('[ShareAndSpin] verify error:', err)
      setStep('claiming_share')
      writeShare({
        address: SHARE_AND_SPIN_ADDRESS as `0x${string}`,
        abi: SHARE_AND_SPIN_ABI,
        functionName: 'recordShare',
        args: [claimedRewardWei],
        gas: 200_000n,
      })
    }
  }, [address, userFid, castHash, writeShare, claimedRewardWei])

  // Post-spin share — optional, no reward, just virality
  const handleShareResult = useCallback(async (outcomeName: string) => {
    const resultText: Record<string, string> = {
      'Nothing': "I spun the Pizza Wheel and got... nothing this time! \u{1F605}\u{1F355} Come join the hottest Party on Base and grab a slice of Pizza with us!",
      'Free Slice': "I spun the Pizza Wheel and won a FREE SLICE! \u{1F355}\u{1F525} Come join the hottest Party on Base and grab a slice of Pizza with us!",
      'Gold': "I spun the Pizza Wheel and hit GOLD! \u{1F3C6}\u{1F355} Real Pizza IRL! Come join the hottest Party on Base and grab a slice of Pizza with us!",
    }
    try {
      await sdk.actions.composeCast({
        text: resultText[outcomeName] ?? resultText['Nothing'],
        embeds: [SHARE_EMBED],
      })
    } catch (err) {
      console.error('[ShareAndSpin] post-spin composeCast:', err)
    }
  }, [])

  // ── claimFreeSlice tx ────────────────────────────────────────
  const {
    writeContract: writeClaimSlice,
    data: claimSliceHash,
    isPending: claimSlicePending,
    reset: resetClaimSlice,
  } = useWriteContract()

  const { isLoading: claimSliceConfirming, isSuccess: claimSliceConfirmed } =
    useWaitForTransactionReceipt({ hash: claimSliceHash })

  useEffect(() => {
    if (!claimSliceConfirmed) return
    resetClaimSlice()
    setStep('done')
  }, [claimSliceConfirmed]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClaimFreeSlice = useCallback(() => {
    if (!pizzaUsdPrice || pizzaUsdPrice <= 0) return
    const entryFeeAmount = BigInt(Math.floor((1 / pizzaUsdPrice) * 1e18))
    setStep('claiming_slice')
    writeClaimSlice({
      address: SHARE_AND_SPIN_ADDRESS as `0x${string}`,
      abi: SHARE_AND_SPIN_ABI,
      functionName: 'claimFreeSlice',
      args: [entryFeeAmount],
      gas: 300_000n,
    })
  }, [pizzaUsdPrice, writeClaimSlice])

  const anyPending = sharePending || shareConfirming || spinConfirming || claimSlicePending || claimSliceConfirming

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div
        className="bg-black rounded-2xl border-4 border-red-800 max-w-md w-full max-h-[92vh] overflow-y-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center z-10"
        >
          <X size={18} className="text-gray-700" />
        </button>

        <div className="p-5 space-y-4">

          {/* ── compose ─────────────────────────────────────── */}
          {step === 'compose' && (
            <>
              <p className="text-orange-400 text-center" style={{ ...F, fontSize: 32 }}>
                SHARE & SPIN
              </p>
              <p className="text-gray-500 text-xs text-center">
                Every share also earns ~$0.01 PIZZA + 1 Topping
              </p>
              <p className="text-gray-400 text-xs text-center">
                {shareInfo.sharesUsed}/3 shares used this week
              </p>

              {!shareInfo.canShareNow ? (
                <div className="bg-gray-800 rounded-xl p-4 text-center">
                  <p className="text-gray-300 text-sm" style={F}>
                    {shareInfo.sharesUsed >= 3
                      ? 'Max 3 shares reached this week'
                      : 'Already shared this game'}
                  </p>
                </div>
              ) : (
                <Button
                  onClick={handleShare}
                  disabled={isBanned}
                  className="w-full !bg-red-600 hover:!bg-red-700 text-white font-bold py-3 rounded-xl border-2 border-red-800 disabled:opacity-50"
                  style={{ ...F, fontSize: 18 }}
                >
                  <Share2 size={18} className="inline mr-2" />
                  SHARE & SPIN
                </Button>
              )}
            </>
          )}

          {/* ── posted ──────────────────────────────────────── */}
          {step === 'posted' && (
            <>
              <p className="text-green-400 text-center" style={{ ...F, fontSize: 26 }}>
                Posted it?
              </p>
              <p className="text-gray-400 text-sm text-center">
                After posting on Farcaster, tap below to verify and spin.
              </p>
              {castHash ? (
                <div className="bg-green-900/20 border border-green-700 rounded-lg px-3 py-2 flex items-center gap-2">
                  <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                  <p className="text-green-300 text-xs truncate">
                    Cast detected: {castHash.slice(0, 22)}...
                  </p>
                </div>
              ) : (
                <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg px-3 py-2">
                  <p className="text-yellow-300 text-xs">
                    No cast detected yet - make sure you posted before claiming.
                  </p>
                </div>
              )}
              <Button
                onClick={handleVerify}
                disabled={isBanned || anyPending}
                className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-3 rounded-xl border-2 border-green-800 disabled:opacity-50"
                style={F}
              >
                VERIFY & SPIN
              </Button>
              <Button
                onClick={() => { setStep('compose'); setCastHash(null) }}
                disabled={anyPending}
                className="w-full !bg-gray-700 hover:!bg-gray-600 text-gray-300 font-bold py-2 rounded-xl"
                style={F}
              >
                Go Back
              </Button>
            </>
          )}

          {/* ── verifying ───────────────────────────────────── */}
          {step === 'verifying' && (
            <div className="text-center py-8 space-y-3">
              <Loader2 className="animate-spin mx-auto text-blue-400" size={36} />
              <p className="text-blue-400" style={F}>Verifying your cast...</p>
              <p className="text-gray-500 text-xs">Checking Farcaster for your post</p>
            </div>
          )}

          {/* ── verify_failed ───────────────────────────────── */}
          {step === 'verify_failed' && (
            <>
              <div className="bg-red-900/30 border border-red-600 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-300 font-bold text-sm" style={F}>Verification failed</p>
                  <p className="text-red-400 text-xs mt-1">{verifyError}</p>
                </div>
              </div>
              <Button
                onClick={() => { setStep('compose'); setCastHash(null); setVerifyError(null) }}
                className="w-full !bg-gray-700 hover:!bg-gray-600 text-gray-300 font-bold py-2 rounded-xl"
                style={F}
              >
                Try Again
              </Button>
            </>
          )}

          {/* ── claiming_share ──────────────────────────────── */}
          {step === 'claiming_share' && (
            <div className="text-center py-8 space-y-3">
              <Loader2 className="animate-spin mx-auto text-yellow-400" size={36} />
              <p className="text-yellow-400" style={F}>Claiming your reward...</p>
              <p className="text-gray-500 text-xs">
                ~$0.01 PIZZA + 1 Topping, then spinning the wheel
              </p>
            </div>
          )}

          {/* ── spinning + spin_result ──────────────────────── */}
          {(step === 'spinning' || step === 'spin_result') && (
            <>
              <p className="text-orange-400 text-center" style={{ ...F, fontSize: 28 }}>
                SPIN THE PIE
              </p>
              <div className="relative mx-auto" style={{ width: 260, height: 260 }}>
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <Image src="/images/Pizza-Ring.png" alt="Ring" width={260} height={260} priority />
                </div>
                <div
                  ref={wheelRef}
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    transitionProperty: 'transform',
                    transitionDuration: isSpinning ? '3s' : '0s',
                    transitionTimingFunction: 'cubic-bezier(0.17, 0.67, 0.12, 0.99)',
                  }}
                >
                  <Image src={wheelImageSrc} alt="Share Spin Wheel" width={232} height={232} priority />
                </div>
              </div>

              {step === 'spinning' && (
                <p className="text-yellow-400 text-center text-xl" style={F}>SPINNING...</p>
              )}

              {step === 'spin_result' && spinOutcome && (
                <div className="space-y-3">
                  {spinOutcome.name === 'Nothing' && (
                    <>
                      <div className="bg-gray-700 border-2 border-gray-500 rounded-xl p-4 text-center">
                        <p className="text-gray-200 text-2xl font-bold" style={F}>Better luck next time!</p>
                        <p className="text-gray-400 text-sm mt-1">You still earned ~$0.01 PIZZA + 1 Topping for sharing.</p>
                      </div>
                      <Button onClick={() => handleShareResult('Nothing')} className="w-full !bg-purple-600 hover:!bg-purple-700 text-white font-bold py-2 rounded-xl border-2 border-purple-800" style={F}>
                        <Share2 size={16} className="inline mr-2" />Share Result
                      </Button>
                      <Button onClick={onGoToDaily} className="w-full !bg-red-600 hover:!bg-red-700 text-white font-bold py-3 rounded-xl border-2 border-red-800" style={{ ...F, fontSize: 18 }}>
                        BACK TO DAILY GAME
                      </Button>
                    </>
                  )}
                  {spinOutcome.name === 'Free Slice' && (
                    <>
                      <div className="bg-orange-500 border-4 border-orange-300 rounded-xl p-4 text-center">
                        <p className="text-white text-3xl font-bold" style={F}>FREE SLICE!</p>
                        <p className="text-orange-100 text-sm mt-1">Free entry into today&apos;s daily game!</p>
                        <p className="text-orange-200 text-xs mt-1">$1.00 of $PIZZA added to the jackpot from treasury</p>
                      </div>
                      <Button onClick={() => handleShareResult('Free Slice')} className="w-full !bg-purple-600 hover:!bg-purple-700 text-white font-bold py-2 rounded-xl border-2 border-purple-800" style={F}>
                        <Share2 size={16} className="inline mr-2" />Share Result
                      </Button>
                      <Button
                        onClick={handleClaimFreeSlice}
                        disabled={claimSlicePending || claimSliceConfirming || isBanned}
                        className="w-full !bg-orange-500 hover:!bg-orange-600 text-white font-bold py-3 rounded-xl border-2 border-orange-700 disabled:opacity-50"
                        style={{ ...F, fontSize: 18 }}
                      >
                        {(claimSlicePending || claimSliceConfirming)
                          ? <Loader2 className="animate-spin mx-auto" size={20} />
                          : 'CLAIM FREE SLICE'}
                      </Button>
                    </>
                  )}
                  {spinOutcome.name === 'Gold' && (
                    <>
                      <div className="bg-yellow-500 border-4 border-yellow-300 rounded-xl p-5 text-center">
                        <p className="text-yellow-900 text-4xl font-bold" style={F}>YOU WON!</p>
                        <p className="text-yellow-800 text-xl font-bold mt-1" style={F}>REAL PIZZA IRL</p>
                        <p className="text-yellow-700 text-sm mt-2">@vmfcoin has been notified and will reach out.</p>
                        <p className="text-yellow-600 text-xs mt-1">Your win is permanently recorded on Base.</p>
                      </div>
                      <Button onClick={() => handleShareResult('Gold')} className="w-full !bg-purple-600 hover:!bg-purple-700 text-white font-bold py-2 rounded-xl border-2 border-purple-800" style={F}>
                        <Share2 size={16} className="inline mr-2" />Share Result
                      </Button>
                      <Button onClick={onGoToDaily} className="w-full !bg-red-600 hover:!bg-red-700 text-white font-bold py-3 rounded-xl border-2 border-red-800" style={{ ...F, fontSize: 18 }}>
                        BACK TO DAILY GAME
                      </Button>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── claiming_slice ──────────────────────────────── */}
          {step === 'claiming_slice' && (
            <div className="text-center py-8 space-y-3">
              <Loader2 className="animate-spin mx-auto text-orange-400" size={36} />
              <p className="text-orange-400" style={F}>Entering the daily game...</p>
              <p className="text-gray-500 text-xs">$1.00 of $PIZZA from treasury added to the jackpot</p>
            </div>
          )}

          {/* ── done ────────────────────────────────────────── */}
          {step === 'done' && (
            <>
              <p className="text-green-400 text-center" style={{ ...F, fontSize: 32 }}>All done!</p>
              <Button onClick={onGoToDaily} className="w-full !bg-red-600 hover:!bg-red-700 text-white font-bold py-3 rounded-xl border-2 border-red-800" style={{ ...F, fontSize: 18 }}>
                BACK TO DAILY GAME
              </Button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
