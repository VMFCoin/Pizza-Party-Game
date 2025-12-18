'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits, parseUnits, isAddress } from 'viem'
import { PARLOR_MANAGER_ADDRESS, PARLOR_MANAGER_ABI, PIZZA_TOKEN_ADDRESS, PIZZA_TOKEN_ABI, PIZZA_PARTY_ADDRESS, PIZZA_PARTY_ABI } from '../lib/constants'

// Parlor price in USD - this is the fixed dollar amount
const PARLOR_PRICE_USD = 50

interface PizzaParlorPageProps {
  onBack?: () => void
  onNavigateToDaily?: () => void
  onNavigateToWeekly?: () => void
  onNavigateToLeaderboard?: () => void
  onNavigateToHome?: () => void
}

const PARLORS_EXPLAINED = [
  'Own a Pizza Parlor franchise for $50 of PIZZA tokens',
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

// Farcaster user search result
interface FarcasterUser {
  fid: number
  username: string
  displayName: string
  pfpUrl: string
  walletAddress: string
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
  const [farcasterResults, setFarcasterResults] = useState<FarcasterUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState<FarcasterUser | null>(null)

  // Transaction states
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isDistributing, setIsDistributing] = useState(false)
  const [isSendingSlice, setIsSendingSlice] = useState(false)

  // Price state - fetched from DEX
  const [pizzaPrice, setPizzaPrice] = useState<number | null>(null)
  const [priceLoading, setPriceLoading] = useState(true)

  // ============ Contract Reads ============

  // Global contract data
  const { data: contractData, refetch: refetchContractData } = useReadContracts({
    contracts: [
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
      {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'dailyGameId',
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
  const totalParlors = contractData?.[0]?.result as bigint | undefined
  const pendingFeesRaw = contractData?.[1]?.result as bigint | undefined
  const dailyGameId = contractData?.[2]?.result as bigint | undefined

  const userParlorCount = userData?.[0]?.result as bigint | undefined
  const slicesRemaining = userData?.[1]?.result as bigint | undefined
  const currentAllowance = userData?.[2]?.result as bigint | undefined

  // Calculate $50 worth of PIZZA based on live DEX price
  // $50 USD / price per PIZZA = number of PIZZA tokens needed
  const parlorPriceInPizza = pizzaPrice && pizzaPrice > 0
    ? PARLOR_PRICE_USD / pizzaPrice
    : null

  // Convert to wei (bigint with 18 decimals) - round up to ensure enough
  const parlorPriceWei = parlorPriceInPizza
    ? parseUnits(Math.ceil(parlorPriceInPizza).toString(), 18)
    : null

  // Formatted values
  const parlorsOwned = userParlorCount ? Number(userParlorCount) : 0
  const maxParlorsPerWallet = 5
  const maxTotalParlors = 100
  const totalParlorsSold = totalParlors ? Number(totalParlors) : 0
  const parlorsRemaining = maxTotalParlors - totalParlorsSold
  const slicesRemainingNum = slicesRemaining ? Number(slicesRemaining) : 0
  const pendingFeesFormatted = pendingFeesRaw ? Number(formatUnits(pendingFeesRaw, 18)) : 0
  const parlorPriceFormatted = parlorPriceInPizza ? Math.ceil(parlorPriceInPizza) : null

  // Check if approval is needed
  const needsApproval = parlorPriceWei && currentAllowance !== undefined && currentAllowance < parlorPriceWei

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

  // Store user for cast after tx confirms
  const [sliceSentToUser, setSliceSentToUser] = useState<FarcasterUser | null>(null)

  // Handle transaction success
  useEffect(() => {
    if (isConfirmed) {
      // Refetch data after successful transaction
      refetchContractData()
      refetchUserData()
      setIsPurchasing(false)
      setIsApproving(false)
      setIsDistributing(false)

      // Handle successful slice send - open Warpcast compose
      if (isSendingSlice && sliceSentToUser) {
        const castText = `🍕 Hey @${sliceSentToUser.username}! I just sent you a FREE slice of Pizza Party!\n\nClaim your free game entry:\nhttps://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party`
        const composeUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}`
        window.open(composeUrl, '_self')
        setSliceSentToUser(null)
      }

      // Clear slice input on success
      if (isSendingSlice) {
        setRecipientInput('')
        setSelectedUser(null)
      }
      setIsSendingSlice(false)
      resetWrite()
    }
  }, [isConfirmed, refetchContractData, refetchUserData, resetWrite, isSendingSlice, sliceSentToUser])

  // ============ Action Handlers ============

  const handleApprove = async () => {
    if (!parlorPriceWei) return
    setIsApproving(true)
    try {
      writeContract({
        address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
        abi: PIZZA_TOKEN_ABI,
        functionName: 'approve',
        args: [PARLOR_MANAGER_ADDRESS as `0x${string}`, parlorPriceWei],
      })
    } catch (error) {
      console.error('Approval error:', error)
      setIsApproving(false)
    }
  }

  const handlePurchaseParlor = async () => {
    if (!parlorPriceWei) return
    setIsPurchasing(true)
    try {
      writeContract({
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'purchaseParlor',
        args: [parlorPriceWei],
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

    // Store selected user for cast notification after tx confirms
    if (selectedUser) {
      setSliceSentToUser(selectedUser)
    }

    try {
      writeContract({
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'tipSlice',
        args: [resolvedAddress],
      })

      // Save recipient with username label if from Farcaster
      const label = selectedUser ? `@${selectedUser.username}` : recipientInput
      saveRecipient(label, resolvedAddress)
    } catch (error) {
      console.error('Send slice error:', error)
      setIsSendingSlice(false)
      setSliceSentToUser(null)
    }
  }

  // ============ Recipient Management ============

  const resolveRecipient = (input: string): `0x${string}` | null => {
    // If a user was selected from Farcaster search, use their wallet
    if (selectedUser?.walletAddress && isAddress(selectedUser.walletAddress)) {
      return selectedUser.walletAddress as `0x${string}`
    }

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

  // Search Farcaster users via Neynar API
  const searchFarcasterUsers = useCallback(async (query: string) => {
    if (!query || query.length < 1 || query.startsWith('0x')) {
      setFarcasterResults([])
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`)
      const data = await response.json()
      if (data.success && data.users) {
        setFarcasterResults(data.users)
      } else {
        setFarcasterResults([])
      }
    } catch (error) {
      console.error('Farcaster search error:', error)
      setFarcasterResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Debounce search
  useEffect(() => {
    const trimmed = recipientInput.trim()
    // Don't search if it's a wallet address or empty
    if (!trimmed || trimmed.startsWith('0x') || isAddress(trimmed)) {
      setFarcasterResults([])
      return
    }

    // Clear selected user if input changed manually
    if (selectedUser && recipientInput !== `@${selectedUser.username}`) {
      setSelectedUser(null)
    }

    const timer = setTimeout(() => {
      searchFarcasterUsers(trimmed)
    }, 300) // 300ms debounce

    return () => clearTimeout(timer)
  }, [recipientInput, searchFarcasterUsers, selectedUser])

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

  // Fetch live PIZZA price from DEX
  const fetchPrice = useCallback(async () => {
    try {
      setPriceLoading(true)
      const response = await fetch('/api/price')
      const data = await response.json()
      if (data.success && data.priceUsd) {
        setPizzaPrice(data.priceUsd)
      } else {
        // Fallback price if API fails
        setPizzaPrice(data.priceUsd || 0.001)
      }
    } catch (error) {
      console.error('Failed to fetch price:', error)
      // Fallback to a default price
      setPizzaPrice(0.001)
    } finally {
      setPriceLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrice()
    // Refresh price every 30 seconds
    const interval = setInterval(fetchPrice, 30000)
    return () => clearInterval(interval)
  }, [fetchPrice])

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

  const canBuyParlor = isConnected && parlorsOwned < maxParlorsPerWallet && totalParlorsSold < maxTotalParlors && parlorPriceWei !== null && !priceLoading
  const canDistribute = pendingFeesRaw && pendingFeesRaw > 0n
  const canSendSlice = isConnected && parlorsOwned > 0 && slicesRemainingNum > 0 && resolveRecipient(recipientInput) !== null

  const buyButtonText = () => {
    if (!isConnected) return '🍍 CONNECT WALLET 🍍'
    if (priceLoading || !parlorPriceWei) return '🍍 LOADING PRICE... 🍍'
    if (parlorsOwned >= maxParlorsPerWallet) return '🍍 MAX OWNED 🍍'
    if (totalParlorsSold >= maxTotalParlors) return '🍍 SOLD OUT 🍍'
    if (isApproving || (isConfirming && isApproving)) return '🍍 APPROVING... 🍍'
    if (isPurchasing || (isConfirming && isPurchasing)) return '🍍 BUYING... 🍍'
    if (needsApproval) return `🍍 BUY A PARLOR 🍍`
    return `🍍 BUY A PARLOR - $${PARLOR_PRICE_USD} 🍍`
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
            <div className="relative rounded-2xl overflow-hidden">
                <Image
                src="/images/Pizza-Parlor2.png"
                  alt="Own Your Pizza Parlor"
                width={500}
                height={500}
                className="w-full h-auto block transform scale-[1.08]"
                  priority
                />
              {/* Game ID overlay at bottom - inside the image */}
              <div className="absolute bottom-4 left-0 right-0">
                <p className="text-center text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '14px' }}>
                  Game ID #{dailyGameId ? dailyGameId.toString() : '...'}
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
                        Price: ${PARLOR_PRICE_USD} = {priceLoading ? '...' : parlorPriceFormatted?.toLocaleString() || '...'} PIZZA
                      </p>
                      {pizzaPrice && !priceLoading && (
                        <p className="text-orange-600" style={{ ...customFontStyle, fontSize: 10 }}>
                          (1 PIZZA = ${pizzaPrice.toFixed(6)})
                        </p>
                      )}
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
                        placeholder="Search @username or enter 0x..."
                        value={recipientInput}
                        onChange={(e) => {
                          setRecipientInput(e.target.value)
                          setShowSuggestions(true)
                          if (selectedUser) setSelectedUser(null)
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        className="w-full p-2 rounded-xl border-2 border-blue-400 text-blue-900"
                        style={{ ...customFontStyle, fontSize: 14 }}
                      />

                      {/* Selected User Display */}
                      {selectedUser && (
                        <div className="mt-2 p-2 bg-blue-200 rounded-lg flex items-center gap-2">
                          {selectedUser.pfpUrl && (
                            <Image
                              src={selectedUser.pfpUrl}
                              alt={selectedUser.username}
                              width={24}
                              height={24}
                              className="rounded-full"
                            />
                          )}
                          <span className="text-blue-900" style={{ ...customFontStyle, fontSize: 12 }}>
                            @{selectedUser.username}
                          </span>
                          <span className="text-blue-600 text-xs truncate flex-1">
                            {selectedUser.walletAddress.slice(0, 6)}...{selectedUser.walletAddress.slice(-4)}
                          </span>
                        </div>
                      )}

                      {/* Search Loading Indicator */}
                      {isSearching && (
                        <div className="absolute top-full left-0 right-0 bg-white border-2 border-blue-400 rounded-b-xl shadow-lg z-10 p-2 text-center">
                          <span className="text-blue-600" style={{ ...customFontStyle, fontSize: 12 }}>Searching...</span>
                        </div>
                      )}

                      {/* Farcaster Search Results */}
                      {showSuggestions && !isSearching && farcasterResults.length > 0 && !selectedUser && (
                        <div className="absolute top-full left-0 right-0 bg-white border-2 border-blue-400 rounded-b-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                          {farcasterResults.map((user) => (
                            <button
                              key={user.fid}
                              onClick={() => {
                                setSelectedUser(user)
                                setRecipientInput(`@${user.username}`)
                                setShowSuggestions(false)
                                setFarcasterResults([])
                              }}
                              className="w-full p-2 text-left hover:bg-blue-100 flex items-center gap-2"
                            >
                              {user.pfpUrl && (
                                <Image
                                  src={user.pfpUrl}
                                  alt={user.username}
                                  width={32}
                                  height={32}
                                  className="rounded-full"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-blue-900 font-bold truncate" style={{ ...customFontStyle, fontSize: 13 }}>
                                  @{user.username}
                                </p>
                                <p className="text-blue-600 text-xs truncate">
                                  {user.displayName}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Recent Recipients (only when no Farcaster results and not searching) */}
                      {showSuggestions && !isSearching && farcasterResults.length === 0 && !selectedUser && getSuggestions(recipientInput).length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border-2 border-blue-400 rounded-b-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                          <p className="px-2 pt-1 text-blue-500" style={{ ...customFontStyle, fontSize: 10 }}>Recent:</p>
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
