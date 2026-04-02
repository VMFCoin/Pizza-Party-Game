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
const SLICE_COUNT = 8
const SLICE_ANGLE = 360 / SLICE_COUNT // 45°
const SLICE_OFFSET = SLICE_ANGLE / 2   // 22.5°

const SHARE_SPIN_OUTCOMES = [
  { name: 'Nothing'    as const, slices: [1, 3, 5, 7], color: 'bg-gray-700',   border: 'border-gray-500'   },
  { name: 'Free Slice' as const, slices: [2, 4, 6],    color: 'bg-orange-500', border: 'border-orange-300' },
  { name: 'Gold'       as const, slices: [0],           color: 'bg-yellow-500', border: 'border-yellow-300' },
]

function getTargetRotation(sliceIndex: number, fullSpins = 4): number {
  const sliceCenterAngle = sliceIndex * SLICE_ANGLE + SLICE_OFFSET
  return fullSpins * 360 + (360 - sliceCenterAngle)
}

function getSliceFromRotation(rotation: number): number {
  const normalizedAngle = ((rotation % 360) + 360) % 360
  const adjustedAngle = (normalizedAngle + SLICE_OFFSET) % 360
  return Math.floor(adjustedAngle / SLICE_ANGLE) % SLICE_COUNT
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
  wheelImageSrc = '/images/pizza_wheel.png',
}: ShareAndSpinModalProps) {
  const { address }  = useAccount()
  const publicClient = usePublicClient()

  const [step, setStep]               = useState<Step>('compose')
  const [castHash, setCastHash]       = useState<string | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [spinOutcome, setSpinOutcome] = useState<typeof SHARE_SPIN_OUTCOMES[number] | null>(null)
  const [rotation, setRotation]       = useState(0)
  const [isSpinning, setIsSpinning]   = useState(false)

  // Refs for wheel animation, tick sound, haptics
  const wheelRef = useRef<HTMLDivElement>(null)
  const tickAudioRef = useRef<HTMLAudioElement | null>(null)
  const lastTickSliceRef = useRef<number>(-1)
  const animationFrameRef = useRef<number | null>(null)

  // Calculate reward amount from live price
  const claimedRewardWei = pizzaUsdPrice > 0
    ? BigInt(Math.floor(0.01 / pizzaUsdPrice * 1e18))
    : 0n

  // Preload tick sound
  useEffect(() => {
    tickAudioRef.current = new Audio('/sounds/pizza-tick.mp3')
    tickAudioRef.current.volume = 0.3
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  // Haptic feedback
  const triggerHaptic = useCallback(async (intensity: 'light' | 'medium' | 'heavy' = 'light') => {
    try {
      await sdk.haptics.impactOccurred(intensity)
    } catch {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        const duration = intensity === 'heavy' ? 20 : intensity === 'medium' ? 12 : 8
        navigator.vibrate(duration)
      }
    }
  }, [])

  // Play tick sound
  const playTick = useCallback(() => {
    if (tickAudioRef.current) {
      const tick = tickAudioRef.current.cloneNode() as HTMLAudioElement
      tick.volume = 0.3
      tick.play().catch(() => {})
    }
  }, [])

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
    console.log('[ShareAndSpin] recordShare confirmed! TX:', shareHash)
    console.log('[ShareAndSpin] Waiting 2s before calling recordShareSpin...')

    const timer = setTimeout(() => {
      resetShare()
      refetchShareInfo()

      const bytes32 = castHashToBytes32(castHash)
      console.log('[ShareAndSpin] Calling recordShareSpin with castHash:', bytes32)
      writeSpin({
        address: SHARE_AND_SPIN_ADDRESS as `0x${string}`,
        abi: SHARE_AND_SPIN_ABI,
        functionName: 'recordShareSpin',
        args: [bytes32],
        gas: 150_000n,
      })
    }, 2000)

    return () => clearTimeout(timer)
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
              console.log('[ShareAndSpin] On-chain outcome:', outcomeIndex,
                ['Nothing', 'Free Slice', 'Gold'][outcomeIndex])
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

  // ── Spin animation (adapted from StakingPage) ─────────────────
  const runSpinAnimation = useCallback((outcomeIndex: number) => {
    setStep('spinning')
    const outcome = SHARE_SPIN_OUTCOMES[outcomeIndex] ?? SHARE_SPIN_OUTCOMES[0]
    const slices  = outcome.slices
    const target  = slices[Math.floor(Math.random() * slices.length)]
    const fullSpins = 3 + Math.floor(Math.random() * 3)
    const rot     = getTargetRotation(target, fullSpins)

    // Reset to 0 instantly
    setRotation(0)

    // Start spinning on next frame
    requestAnimationFrame(() => {
      setIsSpinning(true)
      setRotation(rot)
    })

    // Tick sound + haptic loop during spin
    lastTickSliceRef.current = -1
    const startTime = performance.now()
    const animationDuration = 3000

    const tickLoop = () => {
      const elapsed = performance.now() - startTime
      if (elapsed >= animationDuration) {
        animationFrameRef.current = null
        return
      }

      if (wheelRef.current) {
        const style = window.getComputedStyle(wheelRef.current)
        const transform = style.transform
        if (transform && transform !== 'none') {
          const values = transform.match(/matrix\(([^)]+)\)/)
          if (values) {
            const parts = values[1].split(',').map(Number)
            const angle = Math.atan2(parts[1], parts[0]) * (180 / Math.PI)
            const normalizedAngle = ((angle % 360) + 360) % 360
            const currentSlice = getSliceFromRotation(normalizedAngle)

            if (currentSlice !== lastTickSliceRef.current && lastTickSliceRef.current !== -1) {
              playTick()
              triggerHaptic()
            }
            lastTickSliceRef.current = currentSlice
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(tickLoop)
    }

    animationFrameRef.current = requestAnimationFrame(tickLoop)

    // After animation completes
    setTimeout(() => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      setIsSpinning(false)
      setSpinOutcome(outcome)
      setStep('spin_result')
      triggerHaptic('heavy')
    }, 3000)
  }, [playTick, triggerHaptic])

  // ── Handlers ─────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    try {
      const result = await sdk.actions.composeCast({
        text: SHARE_TEXT,
        embeds: [SHARE_EMBED],
      })
      console.log('[ShareAndSpin] composeCast result:', JSON.stringify(result))
      const hash = (result as { cast?: { hash?: string } | null })?.cast?.hash ?? null
      console.log('[ShareAndSpin] cast hash:', hash)
      setCastHash(hash)
    } catch (err) {
      console.error('[ShareAndSpin] composeCast error:', err)
    }
    setStep('posted')
  }, [])

  const handleVerify = useCallback(async () => {
    if (!address || !userFid) return
    setStep('verifying')
    setVerifyError(null)

    await new Promise(r => setTimeout(r, 2000))

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

  // Post-spin share
  const handleShareResult = useCallback(async (outcomeName: string) => {
    const resultText: Record<string, string> = {
      'Nothing': "I just spun the Pizza Wheel \u{1F355}\nDidn\u2019t hit the big one this time\u2026 but I still walked away with free $PIZZA and a topping just for sharing \u{1F60F}\nThat topping goes straight into my weekly jackpot odds too\u2026 so every spin is building something bigger.\nThis game really pays you to show up.",
      'Free Slice': "Just landed a FREE SLICE on the Pizza Wheel \u{1F355}\u{1F525}\nStacked some $PIZZA, grabbed a topping, and boosted my weekly odds all in one spin\nEvery time I play it feels like I\u2019m leveling up my chances\nThis thing really adds up fast",
      'Gold': "Just spun the GOLD SLICE \u{1F3C6}\u{1F355}\nGot real pizza IRL, $PIZZA rewards, and stacked toppings all from one play\nStarted with a simple share and ended up hitting big\nNot gonna lie\u2026 this game actually pays people to play \u{1F633}\u{1F525}",
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

              {/* Wheel preview (static) */}
              <div className="relative mx-auto" style={{ width: 200, height: 200 }}>
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <Image src="/images/Pizza-Ring.png" alt="Ring" width={200} height={200} priority />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Image src={wheelImageSrc} alt="Share Spin Wheel" width={178} height={178} priority />
                </div>
              </div>

              <p className="text-gray-500 text-xs text-center">
                Every share earns ~$0.01 PIZZA + 1 Topping
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

              {/* Wheel — same layout as StakingPage */}
              <div className="relative mx-auto mb-4" style={{ width: 260, height: 260 }}>
                {/* Static outer ring with pointer at 12 o'clock */}
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <Image src="/images/Pizza-Ring.png" alt="Spin Ring" width={260} height={260} priority />
                </div>
                {/* Spinning wheel */}
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
                  <Image src={wheelImageSrc} alt="Pizza Wheel" width={232} height={232} priority />
                </div>
              </div>

              {step === 'spinning' && (
                <p className="text-yellow-400 text-center text-xl animate-pulse" style={F}>SPINNING...</p>
              )}

              {step === 'spin_result' && spinOutcome && (
                <div className="space-y-3">

                  {/* Nothing */}
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

                  {/* Free Slice */}
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

                  {/* Gold — with pizza rain celebration */}
                  {spinOutcome.name === 'Gold' && (
                    <>
                      <div className="relative overflow-hidden rounded-xl">
                        {/* Pizza rain */}
                        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-xl">
                          {Array.from({ length: 12 }).map((_, i) => (
                            <span
                              key={i}
                              className="absolute text-2xl animate-pizza-rain"
                              style={{
                                left: `${(i * 8.3) + Math.random() * 5}%`,
                                animationDelay: `${i * 0.3}s`,
                                animationDuration: `${2 + Math.random() * 1.5}s`,
                              }}
                            >
                              {'\u{1F355}'}
                            </span>
                          ))}
                        </div>
                        <div className="rounded-xl p-5 text-center text-white border-4 border-yellow-400 animate-jackpot-glow"
                          style={{
                            background: 'linear-gradient(135deg, #065f46, #047857, #10b981)',
                            boxShadow: '0 8px 32px rgba(234, 88, 12, 0.6), 0 4px 16px rgba(220, 38, 38, 0.4)',
                          }}>
                          <p className="text-3xl mb-1">{'\u{1F3C6}\u{1F355}\u{1F3C6}'}</p>
                          <p className="font-bold text-sm text-green-200 uppercase tracking-widest mb-1" style={F}>Congratulations!</p>
                          <p className="font-bold text-3xl text-yellow-300" style={F}>GOLD SLICE!</p>
                          <p className="text-lg text-yellow-200 mt-1" style={F}>REAL PIZZA IRL</p>
                          <p className="text-yellow-100 text-sm mt-2">@vmfcoin has been notified and will reach out.</p>
                          <p className="text-yellow-200/70 text-xs mt-1">Your win is permanently recorded on Base.</p>
                        </div>
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
              <div className="bg-green-900/30 border border-green-600 rounded-xl p-3 space-y-1 text-sm">
                <p className="text-green-300 font-bold" style={F}>Earned this share:</p>
                <p className="text-green-200">{'\u2713'} ~$0.01 PIZZA</p>
                <p className="text-green-200">{'\u2713'} +1 Topping toward weekly jackpot</p>
                {spinOutcome?.name === 'Free Slice' && (
                  <p className="text-orange-300">{'\u2713'} Free daily game entry</p>
                )}
                {spinOutcome?.name === 'Gold' && (
                  <p className="text-yellow-300">{'\u2713'} Real Pizza IRL - @vmfcoin notified!</p>
                )}
                <p className="text-gray-400 text-xs mt-2">
                  {shareInfo.sharesUsed}/3 shares used this week
                </p>
              </div>
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
