'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { formatUnits, parseUnits, isAddress, parseAbiItem } from 'viem'
import { PARLOR_MANAGER_ADDRESS, PARLOR_MANAGER_ABI, PIZZA_TOKEN_ADDRESS, PIZZA_TOKEN_ABI, PIZZA_PARTY_ADDRESS, PIZZA_PARTY_ABI } from '../lib/constants'
import { sdk } from '@farcaster/miniapp-sdk'
import { fetchProfilesByAddresses } from '../lib/farcasterProfiles'

// Parlor price in USD - this is the fixed dollar amount
const PARLOR_PRICE_USD = 50

interface PizzaParlorPageProps {
  onBack?: () => void
  onNavigateToDaily?: () => void
  onNavigateToWeekly?: () => void
  onNavigateToLeaderboard?: () => void
  onNavigateToHome?: () => void
  onNavigateToStaking?: () => void
}

const PARLORS_EXPLAINED = [
  'Buy a Pizza Parlor for $50 worth of PIZZA',
  'Each parlor gives you 1 free slice per day to give away',
  'Own 5 parlors? Get 7 slices per week (1 per day)!',
  'You can only send 1 slice per day (resets daily)',
  'Slices reset every Monday when the weekly game settles',
  'Free slices let NEW players enter the daily game for free',
  'If a sliced player wins, you earn 50% of their prize',
  'Max 5 parlors per wallet | Only 100 total parlors',
  'Half the PIZZA used to buy parlors is burned forever',
]

// Local storage keys
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

// Slice history entry (from on-chain events + enriched with profiles)
interface SliceHistoryEntry {
  recipient: `0x${string}`
  dailyGameId: bigint
  timestamp: number
  blockNumber: bigint
  txHash: `0x${string}`
  claimed: boolean
  // Enriched data from Farcaster/localStorage
  label?: string
  pfpUrl?: string
}

// Parlors are now available to everyone!

export default function PizzaParlorPage({
  onBack,
  onNavigateToDaily,
  onNavigateToWeekly,
  onNavigateToLeaderboard,
  onNavigateToHome,
  onNavigateToStaking,
}: PizzaParlorPageProps) {
  const customFontStyle = {
    fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
    fontWeight: "bold" as const,
  }

  const { address: userAddress, isConnected } = useAccount()
  const publicClient = usePublicClient()

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

  // Slice History state
  const [sliceHistoryOpen, setSliceHistoryOpen] = useState(false)
  const [sliceHistory, setSliceHistory] = useState<SliceHistoryEntry[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [refreshHistoryTrigger, setRefreshHistoryTrigger] = useState(0)

  // Transaction states
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isDistributing, setIsDistributing] = useState(false)
  const [isSendingSlice, setIsSendingSlice] = useState(false)
  const [isSettingName, setIsSettingName] = useState(false)

  // Parlor naming state
  const [showNamingModal, setShowNamingModal] = useState(false)
  const [parlorNameInput, setParlorNameInput] = useState('')

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
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'slicesRemainingThisWeek',
        args: userAddress ? [userAddress] : undefined,
      },
      {
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'weeklySliceAllowance',
        args: userAddress ? [userAddress] : undefined,
      },
      {
        address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
        abi: PIZZA_TOKEN_ABI,
        functionName: 'allowance',
        args: userAddress ? [userAddress, PARLOR_MANAGER_ADDRESS as `0x${string}`] : undefined,
      },
      {
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'claimableBalance',
        args: userAddress ? [userAddress] : undefined,
      },
      {
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'parlorName',
        args: userAddress ? [userAddress] : undefined,
      },
      {
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'hasParlorName',
        args: userAddress ? [userAddress] : undefined,
      },
    ],
    query: {
      enabled: !!userAddress,
    },
  })

  // Extract values
  const totalParlors = contractData?.[0]?.result as bigint | undefined
  const dailyGameId = contractData?.[1]?.result as bigint | undefined

  const userParlorCount = userData?.[0]?.result as bigint | undefined
  const slicesRemainingToday = userData?.[1]?.result as bigint | undefined
  const slicesRemainingThisWeek = userData?.[2]?.result as bigint | undefined
  const weeklySliceAllowance = userData?.[3]?.result as bigint | undefined
  const currentAllowance = userData?.[4]?.result as bigint | undefined
  const claimableBalanceRaw = userData?.[5]?.result as bigint | undefined
  const userParlorName = userData?.[6]?.result as string | undefined
  const userHasParlorName = userData?.[7]?.result as boolean | undefined

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
  const slicesTodayNum = slicesRemainingToday !== undefined ? Number(slicesRemainingToday) : 0
  const slicesThisWeekNum = slicesRemainingThisWeek !== undefined ? Number(slicesRemainingThisWeek) : 0
  const weeklyAllowanceNum = weeklySliceAllowance !== undefined ? Number(weeklySliceAllowance) : parlorsOwned
  const claimableFeesFormatted = claimableBalanceRaw ? Number(formatUnits(claimableBalanceRaw, 18)) : 0
  const parlorPriceFormatted = parlorPriceInPizza ? Math.ceil(parlorPriceInPizza) : null

  // Calculate pending and claimed slices for today from slice history
  const todaySlices = sliceHistory.filter(entry => dailyGameId && entry.dailyGameId === dailyGameId)
  const pendingTodayCount = todaySlices.filter(entry => !entry.claimed).length
  const claimedTodayCount = todaySlices.filter(entry => entry.claimed).length

  // Check if approval is needed
  const needsApproval = parlorPriceWei && currentAllowance !== undefined && currentAllowance < parlorPriceWei

  // ============ Contract Writes ============

  const { writeContract, data: txHash, reset: resetWrite, error: writeError, isError: isWriteError } = useWriteContract()

  const { isLoading: isConfirming, isSuccess: isConfirmed, data: txReceipt } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  // Check if transaction actually succeeded (status = 'success') vs reverted (status = 'reverted')
  const txSucceeded = isConfirmed && txReceipt?.status === 'success'

  // Store pending user until tx confirms (don't trigger cast until confirmed)
  // Only triggers notification/cast AFTER transaction is confirmed on-chain
  const [pendingSliceUser, setPendingSliceUser] = useState<FarcasterUser | null>(null)

  // Handle transaction errors (user rejected, tx failed, etc.)
  useEffect(() => {
    if (isWriteError && writeError) {
      console.error('Transaction error:', writeError.message)
      // Reset all pending states
      setIsPurchasing(false)
      setIsApproving(false)
      setIsDistributing(false)
      setIsSendingSlice(false)
      setIsSettingName(false)
      setPendingSliceUser(null)
      resetWrite()
    }
  }, [isWriteError, writeError, resetWrite])

  // Handle transaction success (only when tx succeeded, not when it reverted)
  useEffect(() => {
    if (txSucceeded) {
      // Refetch data after successful transaction
      refetchContractData()
      refetchUserData()

      // Show naming modal after purchase if user doesn't have a name yet
      if (isPurchasing && !userHasParlorName) {
        // Small delay to let contract data refetch, then show modal
        setTimeout(() => {
          setShowNamingModal(true)
        }, 500)
      }

      setIsPurchasing(false)
      setIsApproving(false)
      setIsDistributing(false)
      setIsSettingName(false)

      // Handle successful slice send - send notification and open compose
      // Only trigger if we have a pending user (set when tx was submitted)
      if (isSendingSlice && pendingSliceUser) {
        // Send push notification to recipient (fire and forget)
        fetch('/api/slice-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientFid: pendingSliceUser.fid,
            parlorName: userParlorName || 'A Pizza Parlor',
          }),
        }).catch(err => console.error('Failed to send slice notification:', err))

        const franchiseName = userParlorName || 'A Pizza Parlor'
        const castText = `Hey @${pendingSliceUser.username}!!! 🍕🔥\n${franchiseName} just hooked you up with a free hot slice. Come grab it and jump into Pizza Party – open the app and claim to be entered for the Daily Jackpot!\n\nDon't let this slice get cold... dive in and let's get saucy! 😏\nOpen your free slice here:`
        const embedUrl = 'https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party'

        // Use Farcaster SDK composeCast to stay in-app
        sdk.actions.composeCast({
          text: castText,
          embeds: [embedUrl],
        }).catch(err => console.error('composeCast failed:', err))

        setPendingSliceUser(null)
      }

      // Clear slice input on success and refresh history
      if (isSendingSlice) {
        setRecipientInput('')
        setSelectedUser(null)
        // Trigger slice history refresh to update pending/claimed counts
        setRefreshHistoryTrigger(prev => prev + 1)
      }
      setIsSendingSlice(false)
      resetWrite()
    }
  }, [txSucceeded, refetchContractData, refetchUserData, resetWrite, isSendingSlice, pendingSliceUser, isPurchasing, userHasParlorName, userParlorName])

  // Handle transaction revert (tx was mined but execution failed)
  useEffect(() => {
    if (isConfirmed && txReceipt?.status === 'reverted') {
      console.error('Transaction reverted on-chain')
      // Reset all pending states
      setIsPurchasing(false)
      setIsApproving(false)
      setIsDistributing(false)
      setIsSendingSlice(false)
      setIsSettingName(false)
      setPendingSliceUser(null)
      resetWrite()

      // Alert user that transaction failed
      alert('Transaction failed. Please check that you own a parlor and have slices remaining.')
    }
  }, [isConfirmed, txReceipt, resetWrite])

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

  const handleClaimFees = async () => {
    setIsDistributing(true)
    try {
      writeContract({
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'claimMyFees',
      })
    } catch (error) {
      console.error('Claim error:', error)
      setIsDistributing(false)
    }
  }

  const handleSetParlorName = async () => {
    if (!parlorNameInput.trim() || parlorNameInput.length > 20) return
    setIsSettingName(true)
    try {
      writeContract({
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        abi: PARLOR_MANAGER_ABI,
        functionName: 'setParlorName',
        args: [parlorNameInput.trim()],
      })
      // Close modal after transaction is sent (will be confirmed by effect)
      setShowNamingModal(false)
    } catch (error) {
      console.error('Set name error:', error)
      setIsSettingName(false)
    }
  }

  const handleSendSlice = async () => {
    const resolvedAddress = resolveRecipient(recipientInput)
    if (!resolvedAddress) return

    setIsSendingSlice(true)

    // Prepare user info for notification AFTER tx confirms
    // Store in pendingSliceUser - only used if tx succeeds
    let userForNotification: FarcasterUser | null = null

    if (selectedUser) {
      userForNotification = selectedUser
    } else {
      // Look up Farcaster profile for the address if no user was selected
      // This handles cases where user pasted an address directly
      try {
        const profiles = await fetchProfilesByAddresses([resolvedAddress])
        const profile = profiles.get(resolvedAddress.toLowerCase())
        if (profile?.username) {
          // Create a FarcasterUser object from the profile
          userForNotification = {
            fid: profile.fid || 0,
            username: profile.username,
            displayName: profile.displayName || profile.username,
            pfpUrl: profile.pfpUrl || '',
            walletAddress: resolvedAddress,
          }
        } else {
          // No Farcaster profile found - still trigger cast with address
          userForNotification = {
            fid: 0,
            username: resolvedAddress.slice(0, 6) + '...' + resolvedAddress.slice(-4),
            displayName: 'Pizza Fan',
            pfpUrl: '',
            walletAddress: resolvedAddress,
          }
        }
      } catch (err) {
        console.error('Failed to fetch profile for address:', err)
        // Fallback - still trigger cast with address
        userForNotification = {
          fid: 0,
          username: resolvedAddress.slice(0, 6) + '...' + resolvedAddress.slice(-4),
          displayName: 'Pizza Fan',
          pfpUrl: '',
          walletAddress: resolvedAddress,
        }
      }
    }

    // Store the user - will only be used if tx confirms successfully
    setPendingSliceUser(userForNotification)

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
      setPendingSliceUser(null)
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

  // Fetch slice history from on-chain events
  const fetchSliceHistory = useCallback(async () => {
    if (!publicClient || !userAddress) return

    setIsLoadingHistory(true)
    try {
      // Fetch SliceSent events where sponsor is the current user
      // Look back ~30 days worth of blocks (Base has ~2 sec block time)
      // 30 days × 24 hours × 60 min × 60 sec ÷ 2 sec/block = 1,296,000 blocks
      const currentBlock = await publicClient.getBlockNumber()
      const BLOCKS_PER_DAY = BigInt(43200) // 86400 seconds / 2 sec per block
      const fromBlock = currentBlock - (BLOCKS_PER_DAY * 30n) // ~30 days

      const sliceSentLogs = await publicClient.getLogs({
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        event: parseAbiItem('event SliceSent(address indexed sponsor, address indexed recipient, uint256 indexed dailyGameId)'),
        args: { sponsor: userAddress },
        fromBlock,
        toBlock: currentBlock,
      })

      // Fetch SliceClaimed events to check which slices were claimed
      const sliceClaimedLogs = await publicClient.getLogs({
        address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        event: parseAbiItem('event SliceClaimed(address indexed recipient, address indexed sponsor, uint256 indexed dailyGameId)'),
        args: { sponsor: userAddress },
        fromBlock,
        toBlock: currentBlock,
      })

      // Create a set of claimed slice keys for quick lookup
      const claimedSet = new Set(
        sliceClaimedLogs.map(log => `${log.args.recipient?.toLowerCase()}-${log.args.dailyGameId?.toString()}`)
      )

      // Get unique recipients for profile enrichment
      const recipientAddresses = [...new Set(sliceSentLogs.map(log => log.args.recipient as `0x${string}`))]

      // Fetch Farcaster profiles for recipients
      const profiles = await fetchProfilesByAddresses(recipientAddresses)

      // Build history entries
      const history: SliceHistoryEntry[] = await Promise.all(
        sliceSentLogs.map(async (log) => {
          const recipient = log.args.recipient as `0x${string}`
          const dailyGameId = log.args.dailyGameId as bigint
          const claimKey = `${recipient.toLowerCase()}-${dailyGameId.toString()}`

          // Try to get block timestamp
          let timestamp = Date.now()
          try {
            const block = await publicClient.getBlock({ blockNumber: log.blockNumber })
            timestamp = Number(block.timestamp) * 1000
          } catch {
            // Use current time as fallback
          }

          // Get profile or localStorage label
          const profile = profiles.get(recipient.toLowerCase())
          const localRecipient = recentRecipients.find(r => r.address.toLowerCase() === recipient.toLowerCase())

          // Build label: prefer Farcaster username, then localStorage label
          let label: string | undefined
          if (profile?.username) {
            label = `@${profile.username}`
          } else if (localRecipient?.label && !localRecipient.label.startsWith('0x')) {
            label = localRecipient.label
          }

          return {
            recipient,
            dailyGameId,
            timestamp,
            blockNumber: log.blockNumber,
            txHash: log.transactionHash as `0x${string}`,
            claimed: claimedSet.has(claimKey),
            label, // username or custom label (address shown separately in UI)
            pfpUrl: profile?.pfpUrl,
          }
        })
      )

      // Sort by most recent first
      history.sort((a, b) => b.timestamp - a.timestamp)
      setSliceHistory(history)
    } catch (error) {
      console.error('Failed to fetch slice history:', error)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [publicClient, userAddress, recentRecipients])

  // Refresh slice history when triggered (after successful slice send)
  useEffect(() => {
    if (refreshHistoryTrigger > 0) {
      fetchSliceHistory()
    }
  }, [refreshHistoryTrigger, fetchSliceHistory])

  // Listen for SliceClaimed events where we are the sponsor - updates instantly when claimed
  useEffect(() => {
    if (!publicClient || !userAddress) return

    const unwatch = publicClient.watchEvent({
      address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
      event: parseAbiItem('event SliceClaimed(address indexed recipient, address indexed sponsor, uint256 indexed dailyGameId)'),
      args: { sponsor: userAddress },
      onLogs: () => {
        // Our slice was claimed - refresh history
        fetchSliceHistory()
      },
    })

    return () => unwatch()
  }, [publicClient, userAddress, fetchSliceHistory])

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

  // Parlors are now available to everyone!
  const canBuyParlor = isConnected && parlorsOwned < maxParlorsPerWallet && totalParlorsSold < maxTotalParlors && parlorPriceWei !== null && !priceLoading
  const canClaimFees = claimableBalanceRaw && claimableBalanceRaw > 0n
  const hasSlicesAvailable = slicesTodayNum > 0 && slicesThisWeekNum > 0
  const canSendSlice = isConnected && parlorsOwned > 0 && hasSlicesAvailable && resolveRecipient(recipientInput) !== null

  const buyButtonText = () => {
    if (priceLoading || !parlorPriceWei) return '🍍 LOADING PRICE... 🍍'
    if (parlorsOwned >= maxParlorsPerWallet) return '🍍 MAX OWNED 🍍'
    if (totalParlorsSold >= maxTotalParlors) return '🍍 SOLD OUT 🍍'
    if (isApproving || (isConfirming && isApproving)) return '🍍 APPROVING... 🍍'
    if (isPurchasing || (isConfirming && isPurchasing)) return '🍍 BUYING... 🍍'
    return '🍍 BUY A PARLOR 🍍'
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
                      <span className="text-orange-800" style={{ ...customFontStyle, fontSize: 16 }}>
                        {userHasParlorName && userParlorName ? userParlorName : 'Your Parlors'}:
                      </span>
                      <span className="text-orange-900" style={{ ...customFontStyle, fontSize: 16 }}>{parlorsOwned} / {maxParlorsPerWallet}</span>
                    </div>

                    {/* Set Name Button - only if owns parlors but hasn't set name */}
                    {parlorsOwned > 0 && !userHasParlorName && (
                      <Button
                        onClick={() => setShowNamingModal(true)}
                        className="w-full !bg-purple-500 hover:!bg-purple-600 text-white font-bold py-1.5 rounded-lg border-2 border-purple-700"
                        style={{ ...customFontStyle, fontSize: 12 }}
                      >
                        ✨ Name Your Franchise ✨
                      </Button>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-orange-800" style={{ ...customFontStyle, fontSize: 14 }}>Slices Remaining:</span>
                      <span className="text-orange-900" style={{ ...customFontStyle, fontSize: 14 }}>{slicesThisWeekNum} / {weeklyAllowanceNum}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-orange-800" style={{ ...customFontStyle, fontSize: 14 }}>Today&apos;s Slices:</span>
                      <span className={`${claimedTodayCount > 0 ? 'text-green-600' : pendingTodayCount > 0 ? 'text-yellow-600' : 'text-orange-900'}`} style={{ ...customFontStyle, fontSize: 14 }}>
                        {claimedTodayCount > 0 ? `${claimedTodayCount} Claimed` : pendingTodayCount > 0 ? `${pendingTodayCount} Pending` : '0 Sent'}
                      </span>
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

                    {/* Buy Button - Available to everyone! */}
                    <Button
                      onClick={needsApproval ? handleApprove : handlePurchaseParlor}
                      className="w-full !bg-orange-600 hover:!bg-orange-700 text-white font-bold py-2 rounded-xl border-4 border-orange-800 uppercase"
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
                    {/* Claimable Balance */}
                    <div className="flex justify-between items-center">
                      <span className="text-yellow-800" style={{ ...customFontStyle, fontSize: 14 }}>Your Claimable Fees:</span>
                      <span className="text-green-600" style={{ ...customFontStyle, fontSize: 14 }}>{claimableFeesFormatted.toLocaleString()} PIZZA</span>
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

                    {/* Distribution Info */}
                    <div className="bg-yellow-200 rounded-lg p-2 text-center">
                      <p className="text-yellow-700" style={{ ...customFontStyle, fontSize: 10 }}>
                        Fees distributed: 50% owners | 30% treasury | 20% ops
                      </p>
                    </div>

                    {/* Collect Button */}
                    <Button
                      onClick={handleClaimFees}
                      className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-800 uppercase"
                      style={{ ...customFontStyle, fontSize: isMobile ? 14 : 16 }}
                      disabled={!canClaimFees || isDistributing || isConfirming}
                    >
                      {isDistributing || (isConfirming && isDistributing)
                        ? '💰 COLLECTING... 💰'
                        : claimableFeesFormatted <= 0
                          ? '💰 NO FEES TO COLLECT 💰'
                          : '💰 COLLECT FEES 💰'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* ============ SEND A SLICE - Expandable ============ */}
            <div className="send-slice-dropdown">
            <Button
                onClick={() => {
                  setSendSliceOpen(!sendSliceOpen)
                  // Fetch slice history when opening to show correct pending/claimed counts
                  if (!sendSliceOpen) {
                    fetchSliceHistory()
                  }
                }}
                className={`w-full !bg-blue-500 hover:!bg-blue-600 text-white font-bold py-2.5 border-4 border-blue-800 uppercase flex items-center justify-between ${sendSliceOpen ? 'rounded-t-xl rounded-b-none' : 'rounded-xl'}`}
                style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
                <span className="flex-1 text-center">🍕 SEND A SLICE 🍕</span>
                {sendSliceOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
            </Button>
              {sendSliceOpen && (
                <div className="bg-blue-100 border-4 border-t-0 border-blue-800 rounded-b-xl p-4">
                  <div className="space-y-3">
                    {/* No Parlors Warning */}
                    {parlorsOwned === 0 && (
                      <div className="bg-red-100 border-2 border-red-500 rounded-lg p-3 text-center">
                        <p className="text-red-700 font-bold" style={{ ...customFontStyle, fontSize: 14 }}>
                          ⚠️ No Parlors on This Wallet
                        </p>
                        <p className="text-red-600 mt-1" style={{ ...customFontStyle, fontSize: 12 }}>
                          You need to own a parlor to send free slices.
                        </p>
                      </div>
                    )}

                    {/* Slices Info */}
                    <div className="flex justify-between items-center">
                      <span className="text-blue-800" style={{ ...customFontStyle, fontSize: 16 }}>Slices Remaining:</span>
                      <span className="text-blue-900" style={{ ...customFontStyle, fontSize: 16 }}>{slicesThisWeekNum} / {weeklyAllowanceNum}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-blue-800" style={{ ...customFontStyle, fontSize: 14 }}>Today&apos;s Slices:</span>
                      <span className={`${claimedTodayCount > 0 ? 'text-green-600' : pendingTodayCount > 0 ? 'text-yellow-600' : 'text-blue-900'}`} style={{ ...customFontStyle, fontSize: 14 }}>
                        {claimedTodayCount > 0 ? `${claimedTodayCount} Claimed` : pendingTodayCount > 0 ? `${pendingTodayCount} Pending` : '0 Sent'}
                      </span>
                    </div>

                    {/* Info Box */}
                    <div className="bg-blue-200 rounded-lg p-2 text-center">
                      <p className="text-blue-700" style={{ ...customFontStyle, fontSize: 10 }}>
                        {parlorsOwned >= 5 ? '7 slices/week (5 parlor bonus!)' : '1 slice per parlor per WEEK'} | Max 1 claimed/day | Resets Monday
                      </p>
                    </div>

                    {/* Recipient Input with Suggestions */}
                    <div className="relative recipient-suggestions">
                      <input
                        type="text"
                        placeholder={parlorsOwned === 0 ? "You need to own a parlor first" : "Search @username or enter 0x..."}
                        value={recipientInput}
                        onChange={(e) => {
                          setRecipientInput(e.target.value)
                          setShowSuggestions(true)
                          if (selectedUser) setSelectedUser(null)
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        disabled={parlorsOwned === 0}
                        className={`w-full p-2 rounded-xl border-2 border-blue-400 text-blue-900 ${parlorsOwned === 0 ? 'bg-gray-200 cursor-not-allowed opacity-60' : ''}`}
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
                          : slicesTodayNum <= 0
                            ? '🍕 SLICE CLAIMED TODAY 🍕'
                            : slicesThisWeekNum <= 0
                              ? '🍕 WEEKLY LIMIT REACHED 🍕'
                              : '🍕 SEND SLICE 🍕'}
            </Button>

                    {/* Slice History Dropdown */}
                    <div className="pt-2 border-t border-blue-300 mt-3">
                      <button
                        onClick={() => {
                          setSliceHistoryOpen(!sliceHistoryOpen)
                          if (!sliceHistoryOpen && sliceHistory.length === 0) {
                            fetchSliceHistory()
                          }
                        }}
                        className="w-full flex items-center justify-between text-blue-700 hover:text-blue-900 py-1"
                        style={{ ...customFontStyle, fontSize: 14 }}
                      >
                        <span>Slice History:</span>
                        {sliceHistoryOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>

                      {sliceHistoryOpen && (
                        <div className="mt-2 bg-blue-50 rounded-lg p-2 max-h-64 overflow-y-auto">
                          {isLoadingHistory ? (
                            <p className="text-center text-blue-600 py-4" style={{ ...customFontStyle, fontSize: 12 }}>
                              Loading history...
                            </p>
                          ) : sliceHistory.length === 0 ? (
                            <p className="text-center text-blue-500 py-4" style={{ ...customFontStyle, fontSize: 12 }}>
                              No slices sent yet
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {sliceHistory.map((entry, idx) => (
                                <div
                                  key={`${entry.txHash}-${idx}`}
                                  className="flex items-center gap-2 p-2 bg-white rounded-lg border border-blue-200"
                                >
                                  {entry.pfpUrl ? (
                                    <Image
                                      src={entry.pfpUrl}
                                      alt="Profile"
                                      width={28}
                                      height={28}
                                      className="rounded-full"
                                    />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-blue-200 flex items-center justify-center text-blue-600 text-xs">
                                      🍕
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    {entry.label && (
                                      <p className="text-blue-900 truncate" style={{ ...customFontStyle, fontSize: 12 }}>
                                        {entry.label}
                                      </p>
                                    )}
                                    <p className="text-blue-600 truncate" style={{ fontSize: 10 }}>
                                      {entry.recipient.slice(0, 6)}...{entry.recipient.slice(-4)}
                                    </p>
                                    <p className="text-blue-400" style={{ fontSize: 9 }}>
                                      Game #{entry.dailyGameId.toString()} • {new Date(entry.timestamp).toLocaleDateString()}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    {(() => {
                                      // Determine status: Claimed, Pending (current game), or Expired (past game)
                                      const isExpired = !entry.claimed && dailyGameId && entry.dailyGameId < dailyGameId
                                      const statusClass = entry.claimed
                                        ? 'bg-green-100 text-green-700'
                                        : isExpired
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-yellow-100 text-yellow-700'
                                      const statusText = entry.claimed
                                        ? 'Claimed'
                                        : isExpired
                                          ? 'Expired'
                                          : 'Pending'
                                      return (
                                        <span
                                          className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}
                                          style={{ ...customFontStyle, fontSize: 10 }}
                                        >
                                          {statusText}
                                        </span>
                                      )
                                    })()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Refresh button */}
                          <button
                            onClick={fetchSliceHistory}
                            disabled={isLoadingHistory}
                            className="w-full mt-2 text-blue-600 hover:text-blue-800 text-center py-1"
                            style={{ ...customFontStyle, fontSize: 11 }}
                          >
                            {isLoadingHistory ? 'Refreshing...' : '🔄 Refresh'}
                          </button>
                        </div>
                      )}
                    </div>
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
              CLAIM TOPPINGS
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

            {/* Staking Button */}
            <Button
              onClick={onNavigateToStaking}
              className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2.5 rounded-xl border-4 border-green-900 uppercase cursor-pointer"
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              🍕 Spin & Stake 🍕
            </Button>

            {/* Parlors Explained Card */}
            <Card className="border-4 border-orange-600 rounded-2xl bg-white/95">
              <div className="px-3 pb-3 pt-1.5">
                <p className="text-orange-600 text-center mb-2" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '24px', textShadow: '2px 2px 0px #8B0000, 3px 3px 0px rgba(139, 0, 0, 0.5)' }}>
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

      {/* ============ NAMING MODAL - Shows after purchase ============ */}
      {showNamingModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div
            className="bg-white border-4 border-orange-600 rounded-3xl p-6 max-w-sm w-full shadow-2xl"
            style={{
              backgroundImage: "url('/images/Pepperoni game modal background.JPG')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="text-center space-y-4">
              <h2
                className="text-white text-3xl sm:text-4xl leading-tight"
                style={{ fontFamily: 'var(--font-luckiest-guy)' }}
              >
                Congratulations!
              </h2>
              <p
                className="text-white"
                style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: 14 }}
              >
                You now own a Pizza Parlor! Give your franchise a name:
              </p>

              {/* Name Input */}
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Enter franchise name..."
                  value={parlorNameInput}
                  onChange={(e) => setParlorNameInput(e.target.value.slice(0, 20))}
                  className="w-full p-3 rounded-xl border-3 border-orange-400 text-orange-900 text-center"
                  style={{ ...customFontStyle, fontSize: 16 }}
                  maxLength={20}
                  autoFocus
                />
                <p
                  className="text-white"
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: 10 }}
                >
                  {parlorNameInput.length}/20 characters • Cannot be changed later!
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-2">
                <Button
                  onClick={handleSetParlorName}
                  className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-3 rounded-xl border-4 border-green-800 uppercase"
                  style={{ ...customFontStyle, fontSize: 16 }}
                  disabled={!parlorNameInput.trim() || isSettingName || isConfirming}
                >
                  {isSettingName || isConfirming
                    ? '🍕 SAVING... 🍕'
                    : '🍕 SET NAME 🍕'}
                </Button>
                <Button
                  onClick={() => {
                    setShowNamingModal(false)
                    setParlorNameInput('')
                  }}
                  className="w-full !bg-gray-400 hover:!bg-gray-500 text-white font-bold py-2 rounded-xl border-4 border-gray-600"
                  style={{ ...customFontStyle, fontSize: 14 }}
                  disabled={isSettingName || isConfirming}
                >
                  Skip for Now
                </Button>
              </div>

              <p
                className="text-white"
                style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: 10 }}
              >
                Tip: You can set your name later from the parlor page
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
