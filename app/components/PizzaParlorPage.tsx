'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits, parseUnits, isAddress } from 'viem'
import { PARLOR_MANAGER_ADDRESS, PARLOR_MANAGER_ABI, PIZZA_TOKEN_ADDRESS, PIZZA_TOKEN_ABI } from '../lib/constants'

interface PizzaParlorPageProps {
  onBack?: () => void
  onNavigateToDaily?: () => void
  onNavigateToWeekly?: () => void
  onNavigateToLeaderboard?: () => void
  onNavigateToHome?: () => void
}

const PARLORS_EXPLAINED = [
  'Own a Pizza Parlor franchise for 50,000 PIZZA tokens',
  'Each parlor gives you 1 free daily slice to share with friends',
  'Earn 50% of owner fees distributed to all parlor owners',
  'Max 5 parlors per wallet, 100 total parlors available',
  'Send slices via direct tip or shareable links',
]

// Local storage key for recent recipients
const RECENT_RECIPIENTS_KEY = 'pizzaParlor_recentRecipients'

interface RecentRecipient {
  label: string
  address: `0x${string}`
  uses: number
  lastUsed: number
}

export default function PizzaParlorPage({
  onBack,
  onNavigateToDaily,
  onNavigateToWeekly,
  onNavigateToLeaderboard,
  onNavigateToHome,
}: PizzaParlorPageProps) {
  const customFontStyle = {
    fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
    fontWeight: "bold" as const,
  }

  const { address: userAddress, isConnected } = useAccount()

  const [isMobile, setIsMobile] = useState(false)
  const [buyParlorOpen, setBuyParlorOpen] = useState(false)
  const [collectFeesOpen, setCollectFeesOpen] = useState(false)
  const [sendSliceOpen, setSendSliceOpen] = useState(false)

  // Send Slice state
  const [recipientInput, setRecipientInput] = useState('')
  const [recentRecipients, setRecentRecipients] = useState<RecentRecipient[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Transaction states
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isDistributing, setIsDistributing] = useState(false)
  const [isSendingSlice, setIsSendingSlice] = useState(false)

  // ============ Contract Reads ============

  // Global contract data
  const { data: contractData, refetch: refetchContractData } = useReadContracts({
    contracts: [
      {
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'parlorPrice',
      },
      {
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'totalParlors',
      },
      {
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'pendingFees',
      },
    ],
  })

  // User-specific contract data
  const { data: userData, refetch: refetchUserData } = useReadContracts({
    contracts: [
      {
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'parlorCount',
        args: userAddress ? [userAddress] : undefined,
      },
      {
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'slicesRemainingToday',
        args: userAddress ? [userAddress] : undefined,
      },
      {
        address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
        abi: PIZZA_TOKEN_ABI,
        functionName: 'allowance',
        args: userAddress ? [userAddress, PARLOR_MANAGER_ADDRESS as `0x${string}`] : undefined,
      },
    ],
    query: {
      enabled: !!userAddress,
    },
  })

  // Extract values
  const parlorPrice = contractData?.[0]?.result as bigint | undefined
  const totalParlors = contractData?.[1]?.result as bigint | undefined
  const pendingFeesRaw = contractData?.[2]?.result as bigint | undefined

  const userParlorCount = userData?.[0]?.result as bigint | undefined
  const slicesRemaining = userData?.[1]?.result as bigint | undefined
  const currentAllowance = userData?.[2]?.result as bigint | undefined

  // Formatted values
  const parlorsOwned = userParlorCount ? Number(userParlorCount) : 0
  const maxParlorsPerWallet = 5
  const maxTotalParlors = 100
  const totalParlorsSold = totalParlors ? Number(totalParlors) : 0
  const parlorsRemaining = maxTotalParlors - totalParlorsSold
  const slicesRemainingNum = slicesRemaining ? Number(slicesRemaining) : 0
  const pendingFeesFormatted = pendingFeesRaw ? Number(formatUnits(pendingFeesRaw, 18)) : 0
  const parlorPriceFormatted = parlorPrice ? Number(formatUnits(parlorPrice, 18)) : 50000

  // Check if approval is needed
  const needsApproval = parlorPrice && currentAllowance !== undefined && currentAllowance < parlorPrice

  // Calculate estimated payout for user (50% to owners, split by parlor count)
  const estimatedPayout = pendingFeesRaw && totalParlors && userParlorCount && totalParlors > 0n
    ? (pendingFeesRaw * 5000n / 10000n / totalParlors) * userParlorCount
    : 0n
  const estimatedPayoutFormatted = estimatedPayout ? Number(formatUnits(estimatedPayout, 18)) : 0

  // ============ Contract Writes ============

  const { writeContract, data: txHash, reset: resetWrite } = useWriteContract()

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  // Handle transaction success
  useEffect(() => {
    if (isConfirmed) {
      // Refetch data after successful transaction
      refetchContractData()
      refetchUserData()
      setIsPurchasing(false)
      setIsApproving(false)
      setIsDistributing(false)
      setIsSendingSlice(false)
      resetWrite()
    }
  }, [isConfirmed, refetchContractData, refetchUserData, resetWrite])

  // ============ Action Handlers ============

  const handleApprove = async () => {
    if (!parlorPrice) return
    setIsApproving(true)
    try {
      writeContract({
        address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
        abi: PIZZA_TOKEN_ABI,
        functionName: 'approve',
        args: [PARLOR_MANAGER_ADDRESS as `0x${string}`, parlorPrice],
      })
    } catch (error) {
      console.error('Approval error:', error)
      setIsApproving(false)
    }
  }

  const handlePurchaseParlor = async () => {
    setIsPurchasing(true)
    try {
      writeContract({
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'purchaseParlor',
      })
    } catch (error) {
      console.error('Purchase error:', error)
      setIsPurchasing(false)
    }
  }

  const handleDistributeFees = async () => {
    setIsDistributing(true)
    try {
      writeContract({
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'distributeFranchiseFees',
      })
    } catch (error) {
      console.error('Distribute error:', error)
      setIsDistributing(false)
    }
  }

  const handleSendSlice = async () => {
    const resolvedAddress = resolveRecipient(recipientInput)
    if (!resolvedAddress) return

    setIsSendingSlice(true)
    try {
      writeContract({
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'tipSlice',
        args: [resolvedAddress],
      })

      // Update local storage on success (will happen in useEffect when confirmed)
      if (isConfirmed) {
        saveRecipient(recipientInput, resolvedAddress)
        setRecipientInput('')
      }
    } catch (error) {
      console.error('Send slice error:', error)
      setIsSendingSlice(false)
    }
  }

  // ============ Recipient Management ============

  const resolveRecipient = (input: string): `0x${string}` | null => {
    const trimmed = input.trim()
    if (isAddress(trimmed)) {
      return trimmed as `0x${string}`
    }
    // Check recent recipients for matching label
    const match = recentRecipients.find(r =>
      r.label.toLowerCase() === trimmed.toLowerCase() ||
      r.address.toLowerCase() === trimmed.toLowerCase()
    )
    return match?.address || null
  }

  const loadRecentRecipients = useCallback(() => {
    try {
      const stored = localStorage.getItem(RECENT_RECIPIENTS_KEY)
      if (stored) {
        setRecentRecipients(JSON.parse(stored))
      }
    } catch (error) {
      console.error('Failed to load recent recipients:', error)
    }
  }, [])

  const saveRecipient = (label: string, address: `0x${string}`) => {
    const existing = recentRecipients.find(r => r.address.toLowerCase() === address.toLowerCase())
    let updated: RecentRecipient[]

    if (existing) {
      updated = recentRecipients.map(r =>
        r.address.toLowerCase() === address.toLowerCase()
          ? { ...r, uses: r.uses + 1, lastUsed: Date.now(), label: label || r.label }
          : r
      )
    } else {
      updated = [...recentRecipients, {
        label: label || address.slice(0, 6) + '...' + address.slice(-4),
        address,
        uses: 1,
        lastUsed: Date.now(),
      }]
    }

    // Keep top 20 recipients
    updated = updated.sort((a, b) => b.uses - a.uses || b.lastUsed - a.lastUsed).slice(0, 20)
    setRecentRecipients(updated)
    localStorage.setItem(RECENT_RECIPIENTS_KEY, JSON.stringify(updated))
  }

  const getSuggestions = (prefix: string): RecentRecipient[] => {
    if (!prefix) return recentRecipients.slice(0, 5)
    const lower = prefix.toLowerCase()
    return recentRecipients
      .filter(r => r.label.toLowerCase().startsWith(lower) || r.address.toLowerCase().startsWith(lower))
      .sort((a, b) => b.uses - a.uses || b.lastUsed - a.lastUsed)
      .slice(0, 5)
  }

  // ============ Effects ============

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 960)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    loadRecentRecipients()
  }, [loadRecentRecipients])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (buyParlorOpen && !target.closest('.buy-parlor-dropdown')) {
        setBuyParlorOpen(false)
      }
      if (collectFeesOpen && !target.closest('.collect-fees-dropdown')) {
        setCollectFeesOpen(false)
      }
      if (sendSliceOpen && !target.closest('.send-slice-dropdown')) {
        setSendSliceOpen(false)
      }
      if (!target.closest('.recipient-suggestions')) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [buyParlorOpen, collectFeesOpen, sendSliceOpen])

  // ============ Navigation ============

  const navigateToDaily = () => {
    if (onNavigateToDaily) onNavigateToDaily()
  }

  const navigateToWeekly = () => {
    if (onNavigateToWeekly) onNavigateToWeekly()
  }

  const navigateToLeaderboard = () => {
    if (onNavigateToLeaderboard) onNavigateToLeaderboard()
  }

  const handleBack = () => {
    if (onNavigateToHome) {
      onNavigateToHome()
    } else if (onBack) {
      onBack()
    }
  }

  // ============ Computed States ============

  const canBuyParlor = isConnected && parlorsOwned < maxParlorsPerWallet && totalParlorsSold < maxTotalParlors
  const canDistribute = pendingFeesRaw && pendingFeesRaw > 0n
  const canSendSlice = isConnected && parlorsOwned > 0 && slicesRemainingNum > 0 && resolveRecipient(recipientInput) !== null

  const buyButtonText = () => {
    if (!isConnected) return '🍍 CONNECT WALLET 🍍'
    if (parlorsOwned >= maxParlorsPerWallet) return '🍍 MAX OWNED 🍍'
    if (totalParlorsSold >= maxTotalParlors) return '🍍 SOLD OUT 🍍'
    if (isApproving || (isConfirming && isApproving)) return '🍍 APPROVING... 🍍'
    if (isPurchasing || (isConfirming && isPurchasing)) return '🍍 BUYING... 🍍'
    if (needsApproval) return `🍍 APPROVE PIZZA 🍍`
    return `🍍 BUY A PARLOR - ${parlorPriceFormatted.toLocaleString()} PIZZA 🍍`
  }

  return (
    <div
      className="min-h-screen p-4"
      style={{
        backgroundImage: "url('/images/rotated-90-pizza-wallpaper.png')",
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
      }}
    >
      <div className="max-w-md mx-auto">
        <Button
          onClick={handleBack}
          className="mb-4 !bg-red-700 hover:!bg-red-800 text-white font-bold py-2 px-4 rounded-xl border-2 border-red-900 shadow-lg flex items-center gap-2"
          style={{ fontFamily: 'var(--font-luckiest-guy)' }}
        >
          <ArrowLeft size={20} />
          Back to Home
        </Button>

        <Card
          className="border-4 border-red-800 rounded-3xl shadow-2xl p-3 !bg-transparent"
          style={{
            backgroundImage: "url('/images/Pepperoni game modal background.JPG')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="space-y-3">
            {/* Own Your Pizza Parlor Header Image */}
            <div className="relative border-4 border-black rounded-2xl overflow-hidden">
                <Image
                src="/images/Pizza-Parlor2.png"
                  alt="Own Your Pizza Parlor"
                width={500}
                height={500}
                className="w-full h-auto block"
                  priority
                />
              {/* Game ID overlay at bottom - inside the image */}
              <div className="absolute bottom-0 left-0 right-0">
                <p className="text-center text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '14px' }}>
                  Game ID #2
                </p>
              </div>
            </div>

            {/* ============ OWN A PARLOR - Expandable ============ */}
            <div className="buy-parlor-dropdown">
              <Button
                onClick={() => setBuyParlorOpen(!buyParlorOpen)}
                className={`w-full !bg-orange-500 hover:!bg-orange-600 text-white font-bold py-2.5 border-4 border-orange-800 uppercase flex items-center justify-between ${buyParlorOpen ? 'rounded-t-xl rounded-b-none' : 'rounded-xl'}`}
                style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
              >
                <span className="flex-1 text-center">🍍 OWN A PARLOR 🍍</span>
                {buyParlorOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </Button>
              {buyParlorOpen && (
                <div className="bg-orange-100 border-4 border-t-0 border-orange-800 rounded-b-xl p-4">
                  <div className="space-y-3">
                    {/* Global Stats */}
                    <div className="flex justify-between items-center">
                      <span className="text-orange-800" style={{ ...customFontStyle, fontSize: 14 }}>Parlors Sold:</span>
                      <span className="text-orange-900" style={{ ...customFontStyle, fontSize: 14 }}>{totalParlorsSold} / {maxTotalParlors}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-orange-800" style={{ ...customFontStyle, fontSize: 14 }}>Remaining:</span>
                      <span className="text-orange-900" style={{ ...customFontStyle, fontSize: 14 }}>{parlorsRemaining}</span>
                    </div>

                    {/* Divider */}
                    <div className="border-t-2 border-orange-300" />

                    {/* Your Stats */}
                    <div className="flex justify-between items-center">
                      <span className="text-orange-800" style={{ ...customFontStyle, fontSize: 16 }}>Your Parlors:</span>
                      <span className="text-orange-900" style={{ ...customFontStyle, fontSize: 16 }}>{parlorsOwned} / {maxParlorsPerWallet}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-orange-800" style={{ ...customFontStyle, fontSize: 14 }}>Slices Today:</span>
                      <span className="text-orange-900" style={{ ...customFontStyle, fontSize: 14 }}>{slicesRemainingNum}</span>
                    </div>

                    {/* Price Info */}
                    <div className="bg-orange-200 rounded-lg p-2 text-center">
                      <p className="text-orange-800" style={{ ...customFontStyle, fontSize: 12 }}>
                        Price: {parlorPriceFormatted.toLocaleString()} PIZZA
                      </p>
                      <p className="text-orange-700" style={{ ...customFontStyle, fontSize: 10 }}>
                        50% burn | 30% treasury | 20% ops
                      </p>
                    </div>

                    {/* Buy Button */}
                    <Button
                      onClick={needsApproval ? handleApprove : handlePurchaseParlor}
                      className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-800 uppercase"
                      style={{ ...customFontStyle, fontSize: isMobile ? 14 : 16 }}
                      disabled={!canBuyParlor || isPurchasing || isApproving || isConfirming}
                    >
                      {buyButtonText()}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* ============ COLLECT OWNER FEES - Expandable ============ */}
            <div className="collect-fees-dropdown">
              <Button
                onClick={() => setCollectFeesOpen(!collectFeesOpen)}
                className={`w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2.5 border-4 border-yellow-800 uppercase flex items-center justify-between ${collectFeesOpen ? 'rounded-t-xl rounded-b-none' : 'rounded-xl'}`}
                style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
              >
                <span className="flex-1 text-center">💰 COLLECT OWNER FEES 💰</span>
                {collectFeesOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </Button>
              {collectFeesOpen && (
                <div className="bg-yellow-100 border-4 border-t-0 border-yellow-800 rounded-b-xl p-4">
                  <div className="space-y-3">
                    {/* Pool Info */}
                    <div className="flex justify-between items-center">
                      <span className="text-yellow-800" style={{ ...customFontStyle, fontSize: 14 }}>Pending Fees:</span>
                      <span className="text-green-600" style={{ ...customFontStyle, fontSize: 14 }}>{pendingFeesFormatted.toLocaleString()} PIZZA</span>
                    </div>

                    {/* Your Stats */}
                    <div className="flex justify-between items-center">
                      <span className="text-yellow-800" style={{ ...customFontStyle, fontSize: 14 }}>Your Parlors:</span>
                      <span className="text-yellow-900" style={{ ...customFontStyle, fontSize: 14 }}>{parlorsOwned}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-yellow-800" style={{ ...customFontStyle, fontSize: 14 }}>Total Parlors:</span>
                      <span className="text-yellow-900" style={{ ...customFontStyle, fontSize: 14 }}>{totalParlorsSold}</span>
                    </div>

                    {/* Estimated Payout */}
                    {parlorsOwned > 0 && (
                      <div className="bg-yellow-200 rounded-lg p-2">
                        <p className="text-yellow-800 text-center" style={{ ...customFontStyle, fontSize: 12 }}>
                          Your Est. Payout: ~{estimatedPayoutFormatted.toFixed(2)} PIZZA
                        </p>
                        <p className="text-yellow-700 text-center" style={{ ...customFontStyle, fontSize: 10 }}>
                          (50% owners pool / {totalParlorsSold} parlors) x {parlorsOwned}
                        </p>
                      </div>
                    )}

                    {/* Distribution Info */}
                    <div className="bg-yellow-200 rounded-lg p-2 text-center">
                      <p className="text-yellow-700" style={{ ...customFontStyle, fontSize: 10 }}>
                        Distribution: 50% owners | 30% treasury | 20% ops
                      </p>
                    </div>

                    {/* Collect Button */}
            <Button
                      onClick={handleDistributeFees}
                      className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-800 uppercase"
                      style={{ ...customFontStyle, fontSize: isMobile ? 14 : 16 }}
                      disabled={!canDistribute || isDistributing || isConfirming}
                    >
                      {isDistributing || (isConfirming && isDistributing)
                        ? '💰 DISTRIBUTING... 💰'
                        : pendingFeesFormatted <= 0
                          ? '💰 NO FEES TO COLLECT 💰'
                          : '💰 DISTRIBUTE FEES 💰'}
            </Button>
                  </div>
                </div>
              )}
            </div>

            {/* ============ SEND A SLICE - Expandable ============ */}
            <div className="send-slice-dropdown">
            <Button
                onClick={() => setSendSliceOpen(!sendSliceOpen)}
                className={`w-full !bg-blue-500 hover:!bg-blue-600 text-white font-bold py-2.5 border-4 border-blue-800 uppercase flex items-center justify-between ${sendSliceOpen ? 'rounded-t-xl rounded-b-none' : 'rounded-xl'}`}
                style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
                <span className="flex-1 text-center">🍕 SEND A SLICE 🍕</span>
                {sendSliceOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
            </Button>
              {sendSliceOpen && (
                <div className="bg-blue-100 border-4 border-t-0 border-blue-800 rounded-b-xl p-4">
                  <div className="space-y-3">
                    {/* Slices Info */}
                    <div className="flex justify-between items-center">
                      <span className="text-blue-800" style={{ ...customFontStyle, fontSize: 16 }}>Slices Remaining:</span>
                      <span className="text-blue-900" style={{ ...customFontStyle, fontSize: 16 }}>{slicesRemainingNum}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-blue-800" style={{ ...customFontStyle, fontSize: 14 }}>Your Parlors:</span>
                      <span className="text-blue-900" style={{ ...customFontStyle, fontSize: 14 }}>{parlorsOwned}</span>
                    </div>

                    {/* Info Box */}
                    <div className="bg-blue-200 rounded-lg p-2 text-center">
                      <p className="text-blue-700" style={{ ...customFontStyle, fontSize: 10 }}>
                        1 slice per parlor per day | A slice = free daily entry
                      </p>
                    </div>

                    {/* Recipient Input with Suggestions */}
                    <div className="relative recipient-suggestions">
                      <input
                        type="text"
                        placeholder="Enter wallet address"
                        value={recipientInput}
                        onChange={(e) => {
                          setRecipientInput(e.target.value)
                          setShowSuggestions(true)
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        className="w-full p-2 rounded-xl border-2 border-blue-400 text-blue-900"
                        style={{ ...customFontStyle, fontSize: 14 }}
                      />
                      {/* Suggestions Dropdown */}
                      {showSuggestions && getSuggestions(recipientInput).length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border-2 border-blue-400 rounded-b-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                          {getSuggestions(recipientInput).map((recipient, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                setRecipientInput(recipient.address)
                                setShowSuggestions(false)
                              }}
                              className="w-full p-2 text-left hover:bg-blue-100 text-blue-900 truncate"
                              style={{ ...customFontStyle, fontSize: 12 }}
                            >
                              {recipient.label} ({recipient.uses} uses)
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Send Button */}
            <Button
                      onClick={handleSendSlice}
                      className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-800 uppercase"
                      style={{ ...customFontStyle, fontSize: isMobile ? 14 : 16 }}
                      disabled={!canSendSlice || isSendingSlice || isConfirming}
                    >
                      {isSendingSlice || (isConfirming && isSendingSlice)
                        ? '🍕 SENDING... 🍕'
                        : parlorsOwned === 0
                          ? '🍕 OWN A PARLOR FIRST 🍕'
                          : slicesRemainingNum <= 0
                            ? '🍕 NO SLICES LEFT 🍕'
                            : '🍕 SEND SLICE 🍕'}
            </Button>
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={navigateToDaily}
              className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2.5 rounded-xl border-4 border-green-800 uppercase"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              🍕 GRAB A SLICE 🍕
            </Button>

            <Button
              onClick={navigateToWeekly}
              className="w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2.5 rounded-xl border-4 border-yellow-800 uppercase"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline mr-1" />
              WEEKLY JACKPOT
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline ml-1" />
            </Button>

            <Button
              onClick={navigateToLeaderboard}
              className="w-full !bg-red-700 hover:!bg-red-800 text-white font-bold py-2.5 rounded-xl border-4 border-red-900 uppercase"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline mr-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
              LEADERBOARD
              <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline ml-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
            </Button>

            {/* Parlors Explained Card */}
            <Card className="border-4 border-orange-600 rounded-2xl bg-white/95">
              <div className="px-3 pb-3 pt-1.5">
                <p className="text-orange-600 text-center mb-2" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '24px' }}>
                  Parlors Explained
                </p>
                <ul className="space-y-1.5 text-orange-800 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                  {PARLORS_EXPLAINED.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span>🍕</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>

          </div>
        </Card>
      </div>
    </div>
  )
}
