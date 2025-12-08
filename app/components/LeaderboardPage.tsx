'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft } from 'lucide-react'
import { useAccount, useReadContract } from 'wagmi'
import { enrichLeaderboardWithProfiles, FarcasterProfile } from '../lib/farcasterProfiles'
import { PIZZA_PARTY_ADDRESS, PIZZA_PARTY_ABI } from '../lib/constants'
import { formatUnits } from 'viem'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

// Create a client for direct RPC calls - use BlastAPI to avoid rate limits
const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.public.blastapi.io'),
})

// All historical stats have been migrated to the current contract
// No need to read from old contracts anymore

interface LeaderboardPageProps {
  onBack?: () => void
  onNavigateToDaily?: () => void
  onNavigateToWeekly?: () => void
  onNavigateToHome?: () => void
}

interface WinnerDisplay {
  address: string
  displayName: string
  thisGamePayout: string  // Amount won in THIS specific game
  lifetimeWins: number
  lifetimeVmfWon: string  // Total across ALL games
  farcasterProfile?: FarcasterProfile
  isPlaceholder?: boolean
}

const customFontStyle = {
  fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
  fontWeight: 'bold' as const,
}

function formatAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}


function getPositionStyle(position: number) {
  if (position === 1) {
    return {
      bg: 'bg-gradient-to-r from-yellow-400 to-yellow-500',
      border: 'border-yellow-600',
      textColor: 'text-yellow-900',
    }
  }
  if (position === 2) {
    return {
      bg: 'bg-gradient-to-r from-gray-300 to-gray-400',
      border: 'border-gray-500',
      textColor: 'text-gray-800',
    }
  }
  if (position === 3) {
    return {
      bg: 'bg-gradient-to-r from-orange-400 to-orange-500',
      border: 'border-orange-600',
      textColor: 'text-orange-900',
    }
  }
  return {
    bg: 'bg-white',
    border: 'border-gray-300',
    textColor: 'text-gray-800',
  }
}

export default function LeaderboardPage({
  onBack: _onBack,
  onNavigateToDaily,
  onNavigateToWeekly,
  onNavigateToHome,
}: LeaderboardPageProps) {
  const { address } = useAccount()
  const [dailyWinners, setDailyWinners] = useState<WinnerDisplay[]>([])
  const [weeklyWinners, setWeeklyWinners] = useState<WinnerDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 960)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const navigateToDaily = useCallback(() => {
    if (onNavigateToDaily) {
      onNavigateToDaily()
    } else if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }, [onNavigateToDaily])

  const navigateToWeekly = useCallback(() => {
    if (onNavigateToWeekly) {
      onNavigateToWeekly()
    } else if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }, [onNavigateToWeekly])

  // Game 16 Daily Winners (settled Dec 8, 2025 from old contract 0x10BEB7B8495E7daeAB06C2e10e77251FD9429adB)
  // 8 winners, 88.73 VMF each (verified from settlement tx 0x88cf2324...)
  const GAME_16_DAILY_WINNERS: WinnerDisplay[] = [
    { address: '0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66', displayName: '', thisGamePayout: '88.73', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x944Fa0f3f2168D4b27110f7f97972Ad9425C4f52', displayName: '', thisGamePayout: '88.73', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x86E36C9Ba3C6A2542Fd761bC2b4FD61A110ea6CD', displayName: '', thisGamePayout: '88.73', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0xffde42d40175b3b9349Dfb384439dCB811691E09', displayName: '', thisGamePayout: '88.73', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0xB1fadDeca6cBCCD536355a4eFe0E2d5517a1F04F', displayName: '', thisGamePayout: '88.73', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0xC77dA8cB158BA77BaC765625745a766Af3111A69', displayName: '', thisGamePayout: '88.73', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x8f6Ee583447d75E3B070d9c35DB6F685aa9cc319', displayName: '', thisGamePayout: '88.73', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x14E8FddFa4a7c709C19a8C7DA5205c3ae366355c', displayName: '', thisGamePayout: '88.73', lifetimeWins: 0, lifetimeVmfWon: '0' },
  ]

  // Weekly 2 Winners (from old contract settlement tx 0xf1e890ad...)
  // 10 winners, 91 VMF pot = 9.1 VMF each
  const WEEK_2_WINNERS: WinnerDisplay[] = [
    { address: '0xacbf90a3f03a34faa8235854ca6c3ee0cc8c7546', displayName: '', thisGamePayout: '9.1', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x108608f3f993bfd55fab50d9ef1a5c7e2c47f29b', displayName: '', thisGamePayout: '9.1', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0xdf13d712d58ef7f7abd4d29b398d503262ba4ac0', displayName: '', thisGamePayout: '9.1', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x1b49689db12080f5fcc5dc36f990599739487566', displayName: '', thisGamePayout: '9.1', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x257cbe89968495c3ae8c81bccb8be7f257cd5f66', displayName: '', thisGamePayout: '9.1', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0xc77da8cb158ba77bac765625745a766af3111a69', displayName: '', thisGamePayout: '9.1', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0xffde42d40175b3b9349dfb384439dcb811691e09', displayName: '', thisGamePayout: '9.1', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x65e3419e633833df1d602e7905cb9c7e541f0849', displayName: '', thisGamePayout: '9.1', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0xd68c5493e41f03fac90776ad0366376e245255e8', displayName: '', thisGamePayout: '9.1', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x12e31f706010ae0996a2d8247c432d9102e3c871', displayName: '', thisGamePayout: '9.1', lifetimeWins: 0, lifetimeVmfWon: '0' },
  ]

  // Weekly 3 Winners (settled Dec 8, 2024 from old contract 0x10BEB7B8495E7daeAB06C2e10e77251FD9429adB)
  // 10 winners, 2000 VMF pot = 200 VMF each
  const WEEK_3_WINNERS: WinnerDisplay[] = [
    { address: '0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66', displayName: '', thisGamePayout: '200', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765', displayName: '', thisGamePayout: '200', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0xC77dA8cB158BA77BaC765625745a766Af3111A69', displayName: '', thisGamePayout: '200', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x46E9BeEF5dC68dFf095EcA56DaDF90247f1Af7EF', displayName: '', thisGamePayout: '200', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x65e3419E633833Df1D602e7905Cb9C7e541f0849', displayName: '', thisGamePayout: '200', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x802F18765D6945b82075241e40b6214331ca3641', displayName: '', thisGamePayout: '200', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x14E8FddFa4a7c709C19a8C7DA5205c3ae366355c', displayName: '', thisGamePayout: '200', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0xffde42d40175b3b9349Dfb384439dCB811691E09', displayName: '', thisGamePayout: '200', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x9157Feb12812b253e84447C6B52C38651fd67FcA', displayName: '', thisGamePayout: '200', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0xD68C5493e41F03faC90776ad0366376E245255E8', displayName: '', thisGamePayout: '200', lifetimeWins: 0, lifetimeVmfWon: '0' },
  ]

  // Get current game IDs from new contract
  const { data: dailyGameId } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'dailyGameId',
  })

  const { data: weeklyGameId } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'weeklyGameId',
  })

  // Determine which game we're showing (previous settled game)
  // Note: Contract was deployed with dailyGameId=18 but we're actually on Game 17
  // So we subtract 2 to get the correct previous settled game (Game 16)
  const currentDailyId = dailyGameId ? Number(dailyGameId) - 1 : 17  // Actual current game
  const currentWeeklyId = weeklyGameId ? Number(weeklyGameId) : 4    // Weekly 4 is current
  const previousDailyGameId = currentDailyId - 1  // Game 16 (last settled)
  const previousWeeklyGameId = currentWeeklyId - 1 // Weekly 3 (last settled)

  // For Game 13+, read from new contract
  const { data: dailyWinnersAddresses } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'getDailyGameWinners',
    args: [BigInt(previousDailyGameId)],
    query: { enabled: previousDailyGameId >= 13 },
  })

  const { data: weeklyWinnersAddresses } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'getWeeklyGameWinners',
    args: [BigInt(previousWeeklyGameId)],
    query: { enabled: previousWeeklyGameId >= 4 },  // Week 2 and 3 use hardcoded data
  })

  const { data: previousDailyGame } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'dailyGames',
    args: [BigInt(previousDailyGameId)],
    query: { enabled: previousDailyGameId >= 13 },
  })

  const { data: previousWeeklyGame } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'weeklyGames',
    args: [BigInt(previousWeeklyGameId)],
    query: { enabled: previousWeeklyGameId >= 4 },  // Week 2 and 3 use hardcoded data
  })

  useEffect(() => {
    async function fetchLeaderboardData() {
      try {
        setLoading(true)

        let dailyPlayersData: WinnerDisplay[]
        let weeklyPlayersData: WinnerDisplay[]

        // Try to read from contract first, fallback to hardcoded Game 16 if no winners
        // Game 16 was settled on old contract 0x10BEB7B8... on Dec 8, 2025
        const dailyAddresses = (dailyWinnersAddresses as string[]) || []

        if (dailyAddresses.length > 0) {
          // We have winners from the new contract
          const dailyPot = previousDailyGame ? (previousDailyGame as { potAmount: bigint }).potAmount : 0n
          const dailyPayoutPerWinner = Number(formatUnits(BigInt(dailyPot) * 94n / 100n / BigInt(dailyAddresses.length), 18)).toFixed(1)

          dailyPlayersData = dailyAddresses.map((addr: string) => ({
            address: addr,
            displayName: formatAddress(addr),
            thisGamePayout: dailyPayoutPerWinner,
            lifetimeWins: 0,
            lifetimeVmfWon: '0',
          }))
        } else {
          // No winners from new contract - show Game 16 winners (last settled game from old contract)
          dailyPlayersData = [...GAME_16_DAILY_WINNERS]
        }

        // Use hardcoded data for Week 2 and Week 3 (settled on old contracts), otherwise read from contract
        if (previousWeeklyGameId === 2) {
          weeklyPlayersData = [...WEEK_2_WINNERS]
        } else if (previousWeeklyGameId === 3) {
          weeklyPlayersData = [...WEEK_3_WINNERS]
        } else if (previousWeeklyGameId >= 4) {
          const weeklyAddresses = (weeklyWinnersAddresses as string[]) || []
          const weeklyPot = previousWeeklyGame ? (previousWeeklyGame as { potAmount: bigint }).potAmount : 0n
          const weeklyPayoutPerWinner = weeklyAddresses.length > 0
            ? Number(formatUnits(BigInt(weeklyPot) / BigInt(weeklyAddresses.length), 18)).toFixed(1)
            : '0'

          weeklyPlayersData = weeklyAddresses.map((addr: string) => ({
            address: addr,
            displayName: formatAddress(addr),
            thisGamePayout: weeklyPayoutPerWinner,
            lifetimeWins: 0,
            lifetimeVmfWon: '0',
          }))
        } else {
          weeklyPlayersData = []
        }

        // Fetch lifetime stats for all players using multicall for efficiency
        const allAddresses = [...new Set([
          ...dailyPlayersData.map(p => p.address),
          ...weeklyPlayersData.map(p => p.address),
        ])]

        const statsMap = new Map<string, { wins: number; vmfWon: string }>()

        // Use multicall to batch all requests - all stats are now in current contract
        try {
          const contractCalls = allAddresses.map(addr => ({
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'getPlayerLifetimeStats',
            args: [addr as `0x${string}`],
          } as const))

          const results = await publicClient.multicall({ contracts: contractCalls, allowFailure: true })

          // Process results
          allAddresses.forEach((addr, i) => {
            const result = results[i]
            if (result.status === 'success' && result.result) {
              const stats = result.result as unknown as { totalDailyWins: bigint; totalWeeklyWins: bigint; totalVmfWon: bigint }
              statsMap.set(addr.toLowerCase(), {
                wins: Number(stats.totalDailyWins) + Number(stats.totalWeeklyWins),
                vmfWon: Number(formatUnits(stats.totalVmfWon, 18)).toFixed(1),
              })
            } else {
              statsMap.set(addr.toLowerCase(), { wins: 0, vmfWon: '0' })
            }
          })
        } catch (err) {
          console.error('Error fetching lifetime stats via multicall:', err)
          allAddresses.forEach(addr => {
            statsMap.set(addr.toLowerCase(), { wins: 0, vmfWon: '0' })
          })
        }

        // Update players with lifetime stats
        dailyPlayersData = dailyPlayersData.map(player => {
          const stats = statsMap.get(player.address.toLowerCase())
          return {
            ...player,
            lifetimeWins: stats?.wins || 0,
            lifetimeVmfWon: stats?.vmfWon || '0',
          }
        })

        weeklyPlayersData = weeklyPlayersData.map(player => {
          const stats = statsMap.get(player.address.toLowerCase())
          return {
            ...player,
            lifetimeWins: stats?.wins || 0,
            lifetimeVmfWon: stats?.vmfWon || '0',
          }
        })

        // Sort by lifetime wins (descending), then by VMF won (descending) as tiebreaker
        const sortByLifetimeStats = (a: WinnerDisplay, b: WinnerDisplay) => {
          // First sort by wins (more wins = higher rank)
          if (b.lifetimeWins !== a.lifetimeWins) {
            return b.lifetimeWins - a.lifetimeWins
          }
          // Tiebreaker: sort by VMF won (more VMF = higher rank)
          return parseFloat(b.lifetimeVmfWon) - parseFloat(a.lifetimeVmfWon)
        }

        dailyPlayersData.sort(sortByLifetimeStats)
        weeklyPlayersData.sort(sortByLifetimeStats)

        // Enrich with Farcaster profiles
        const [enrichedDaily, enrichedWeekly] = await Promise.all([
          enrichLeaderboardWithProfiles(dailyPlayersData, address),
          enrichLeaderboardWithProfiles(weeklyPlayersData, address),
        ])

        setDailyWinners(enrichedDaily)
        setWeeklyWinners(enrichedWeekly)
      } catch (error) {
        console.error('Failed to fetch leaderboard data:', error)
        setDailyWinners([])
        setWeeklyWinners([])
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboardData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, dailyWinnersAddresses, weeklyWinnersAddresses, previousDailyGame, previousWeeklyGame, previousDailyGameId, previousWeeklyGameId])

  const ProfilePicture = ({ 
    pfpUrl, 
    address, 
    isPlaceholder 
  }: { 
    pfpUrl?: string
    address: string
    isPlaceholder: boolean 
  }) => {
    const [imageError, setImageError] = useState(false)
    const [currentPfpUrl, setCurrentPfpUrl] = useState<string | undefined>(pfpUrl)
    
    useEffect(() => {
      if (pfpUrl !== currentPfpUrl) {
        setCurrentPfpUrl(pfpUrl)
        setImageError(false)
      }
    }, [pfpUrl, currentPfpUrl])
    
    const shouldShowImage = !isPlaceholder && currentPfpUrl && !imageError

    return (
      <div className="w-9 h-9 rounded-full bg-gray-200 border-2 border-gray-300 flex items-center justify-center overflow-hidden">
        {shouldShowImage ? (
          <Image
            key={currentPfpUrl}
            src={currentPfpUrl}
            alt="Profile"
            width={36}
            height={36}
            className="object-cover"
            unoptimized
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs font-bold">
            {isPlaceholder ? '⏳' : address.slice(2, 4).toUpperCase()}
          </div>
        )}
      </div>
    )
  }

  const renderWinnerRow = (winner: WinnerDisplay, position: number) => {
    const style = getPositionStyle(position)
    const isPlaceholder = !!winner.isPlaceholder
    const isCurrentUser = !isPlaceholder && address?.toLowerCase() === winner.address.toLowerCase()

    return (
      <div
        className={`flex items-center justify-between p-2 rounded-xl border-2 ${style.bg} ${style.border} shadow-md`}
      >
        <div className="flex items-center gap-3 flex-1">
          <div className="flex items-center gap-2 min-w-[60px]">
            <span className={`text-lg font-bold ${style.textColor}`} style={customFontStyle}>
              {position}.
            </span>
            <ProfilePicture
              key={`${winner.address}-${winner.farcasterProfile?.pfpUrl || 'no-pfp'}`}
              pfpUrl={winner.farcasterProfile?.pfpUrl}
              address={winner.address}
              isPlaceholder={isPlaceholder}
            />
          </div>
          <div className="flex flex-col">
            <span
              className={`font-bold text-base ${isPlaceholder ? 'text-gray-500' : isCurrentUser ? 'text-red-600' : style.textColor}`}
              style={customFontStyle}
            >
              {isPlaceholder
                ? winner.displayName
                : winner.farcasterProfile?.username
                ? `@${winner.farcasterProfile.username}`
                : formatAddress(winner.address)}
            </span>
            {isPlaceholder ? (
              <span className="text-xs text-gray-600" style={customFontStyle}>
                Awaiting winner…
              </span>
            ) : (
              <>
                <span className="text-xs text-gray-600" style={{ ...customFontStyle, whiteSpace: 'nowrap' }}>
                  Lifetime wins: {winner.lifetimeWins}
                </span>
                {/* ✅ LIFETIME TOTAL (gray) - Sum of ALL games ever */}
                <span className="text-xs text-gray-600" style={{ ...customFontStyle, whiteSpace: 'nowrap' }}>
                  {winner.lifetimeVmfWon} VMF
                </span>
              </>
            )}
          </div>
        </div>
        <div className="text-right leading-tight">
          {/* ✅ THIS GAME'S PAYOUT (green) - Amount won in THIS specific game */}
          <span className="block text-lg font-bold text-green-600" style={customFontStyle}>
            {winner.thisGamePayout}
          </span>
          <span className="block text-lg font-bold text-green-600" style={customFontStyle}>
            VMF
          </span>
        </div>
      </div>
    )
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
        {onNavigateToHome && (
          <Button
            onClick={onNavigateToHome}
            className="mb-4 !bg-red-700 hover:!bg-red-800 text-white font-bold py-2 px-4 rounded-xl border-2 border-red-900 shadow-lg flex items-center gap-2"
            style={customFontStyle}
          >
            <ArrowLeft size={20} />
            Back to Home
          </Button>
        )}
        <Card
          className="border-4 border-red-700 rounded-3xl shadow-2xl p-3 !bg-transparent"
          style={{
            backgroundImage: "url('/images/Pepperoni game modal background.JPG')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border-4 border-black relative overflow-hidden bg-white">
              <div className="relative w-full" style={{ height: isMobile ? '88px' : '100px' }}>
                <Image
                  src="/images/LeaderboardCard.png"
                  alt="LEADERBOARD - See who's winning the most VMF tokens!"
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 768px) 100vw, 640px"
                  style={{ objectPosition: 'center 47.5%' }}
                />
              </div>
            </div>

            <Card className="border-4 border-black rounded-2xl bg-blue-50/95 shadow-lg">
              <div className="px-4" style={{ paddingTop: '12px', paddingBottom: '12px' }}>
                <div className="flex items-center justify-center gap-1 mb-1 text-center">
                  <span className="text-2xl">🎯</span>
                  <h2
                    className="text-2xl font-bold text-center"
                    style={{ ...customFontStyle, fontSize: 'clamp(20px, 8vw, 28px)', color: '#16a34a' }}
                >
                  DAILY WINNERS
                  </h2>
                  <span className="text-2xl">🎯</span>
                </div>
                <p className="text-base font-semibold mb-2 text-center" style={{ ...customFontStyle, color: '#16a34a' }}>
                  Today&apos;s 8 lucky winners
                </p>
                {loading ? (
                  <p className="text-center text-gray-600 py-8" style={customFontStyle}>
                    Loading...
                  </p>
                ) : dailyWinners.length === 0 ? (
                  <p className="text-center text-gray-600 py-8" style={customFontStyle}>
                    🎮 Game in progress... Winners will appear when today&apos;s game settles at 12pm PST
                  </p>
                ) : (
                  <div className="space-y-3">
                    {dailyWinners.map((winner, index) => (
                      <div key={`daily-${winner.address}-${index}`}>
                        {renderWinnerRow(winner, index + 1)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card className="border-4 border-black rounded-2xl bg-purple-50/95 shadow-lg">
              <div className="px-4" style={{ paddingTop: '12px', paddingBottom: '12px' }}>
                <div className="flex items-center justify-center gap-2 mb-2 text-center">
                  <span className="text-2xl">🍕</span>
                  <h2
                    className="text-2xl font-bold text-center"
                    style={{ ...customFontStyle, fontSize: 'clamp(20px, 8vw, 28px)', color: '#16a34a' }}
                >
                  WEEKLY WINNERS
                  </h2>
                  <span className="text-2xl">🍕</span>
                </div>
                <p className="text-base font-semibold mb-4 text-center" style={{ ...customFontStyle, color: '#16a34a' }}>
                  This week&apos;s top 10 champions
                </p>
                {loading ? (
                  <p className="text-center text-gray-600 py-8" style={customFontStyle}>
                    Loading...
                  </p>
                ) : weeklyWinners.length === 0 ? (
                  <p className="text-center text-gray-600 py-8" style={customFontStyle}>
                    🎮 Weekly game in progress... Winners will appear when the game settles on Monday at 12pm PST
                  </p>
                ) : (
                  <div className="space-y-3">
                    {weeklyWinners.map((winner, index) => (
                      <div key={`weekly-${winner.address}-${index}`}>
                        {renderWinnerRow(winner, index + 1)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Button
            className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2.5 rounded-xl border-4 border-green-800 uppercase"
            style={{ ...customFontStyle, fontSize: 20 }}
            onClick={navigateToDaily}
          >
            <span style={{ fontSize: '24px', marginRight: '4px' }}>🍕</span>
            GRAB A SLICE
            <span style={{ fontSize: '24px', marginLeft: '4px' }}>🍕</span>
          </Button>

            <Button
              className="w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2.5 rounded-xl border-4 border-yellow-800 uppercase"
              style={{ ...customFontStyle, fontSize: 20, letterSpacing: '1px' }}
              onClick={navigateToWeekly}
            >
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline mr-1" />
              Weekly Jackpot
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline ml-1" />
            </Button>

            <Card className="border-4 border-red-500 rounded-2xl bg-white/95">
              <div className="p-3">
                <p
                  className="text-red-600 text-xl font-bold mb-2"
                  style={{ ...customFontStyle, textAlign: 'center' }}
                >
                  📊 How It Works
                </p>
                <ul className="space-y-1.5 text-red-700 text-sm font-semibold">
                  <li className="flex items-start gap-2">
                    <span>🍅</span>
                    <span><strong>DAILY WINNERS:</strong> Today&apos;s 8 lucky winners</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>🍅</span>
                    <span><strong>WEEKLY WINNERS:</strong> This week&apos;s top 10 champions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>🍅</span>
                    <span><strong>EARN MORE TOPPINGS:</strong> Play daily, refer friends, hold VMF coins.</span>
                  </li>
                </ul>
              </div>
            </Card>
          </div>
        </Card>
      </div>
    </div>
  )
}
