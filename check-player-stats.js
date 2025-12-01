// Temporary script to check player stats from contract
// Run with: node check-player-stats.js <PLAYER_ADDRESS>

const { createPublicClient, http } = require('viem')
const { base } = require('viem/chains')

const PIZZA_PARTY_ADDRESS = '0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7'

const PIZZA_PARTY_ABI = [
  {
    type: 'function',
    name: 'getPlayerLifetimeStats',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'player' }],
    outputs: [{
      type: 'tuple',
      components: [
        { type: 'uint256', name: 'totalDailyWins' },
        { type: 'uint256', name: 'totalWeeklyWins' },
        { type: 'uint256', name: 'totalVmfWon' },
        { type: 'uint256', name: 'lifetimeToppings' },
        { type: 'uint256', name: 'lifetimeReferrals' }
      ]
    }]
  },
  {
    type: 'function',
    name: 'getDailyGameWinners',
    stateMutability: 'view',
    inputs: [{ type: 'uint256', name: 'gameId' }],
    outputs: [{ type: 'address[]' }]
  },
  {
    type: 'function',
    name: 'dailyGameId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }]
  }
]

async function checkPlayerStats(playerAddress) {
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org')
  })

  try {
    console.log(`\n🔍 Checking stats for player: ${playerAddress}\n`)
    
    const stats = await publicClient.readContract({
      address: PIZZA_PARTY_ADDRESS,
      abi: PIZZA_PARTY_ABI,
      functionName: 'getPlayerLifetimeStats',
      args: [playerAddress]
    })

    // Handle both tuple and object formats
    let totalDailyWins, totalWeeklyWins, totalVmfWon, lifetimeToppings, lifetimeReferrals
    
    if (Array.isArray(stats)) {
      [totalDailyWins, totalWeeklyWins, totalVmfWon, lifetimeToppings, lifetimeReferrals] = stats
    } else {
      totalDailyWins = stats.totalDailyWins
      totalWeeklyWins = stats.totalWeeklyWins
      totalVmfWon = stats.totalVmfWon
      lifetimeToppings = stats.lifetimeToppings
      lifetimeReferrals = stats.lifetimeReferrals
    }

    console.log('📊 Contract Lifetime Stats:')
    console.log('─'.repeat(50))
    console.log(`Total Daily Wins:    ${totalDailyWins.toString()}`)
    console.log(`Total Weekly Wins:   ${totalWeeklyWins.toString()}`)
    console.log(`Total VMF Won:       ${totalVmfWon.toString()} wei`)
    console.log(`Total VMF Won:       ${(Number(totalVmfWon) / 1e18).toFixed(2)} VMF`)
    console.log(`Lifetime Toppings:   ${lifetimeToppings.toString()}`)
    console.log(`Lifetime Referrals:  ${lifetimeReferrals.toString()}`)
    console.log('─'.repeat(50))
    console.log(`\n✅ Contract says totalVmfWon: ${(Number(totalVmfWon) / 1e18).toFixed(2)} VMF\n`)

  } catch (error) {
    console.error('❌ Error querying contract:', error.message)
  }
}

async function getRecentWinners() {
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org')
  })

  try {
    const currentGameId = await publicClient.readContract({
      address: PIZZA_PARTY_ADDRESS,
      abi: PIZZA_PARTY_ABI,
      functionName: 'dailyGameId'
    })

    const lastGameId = currentGameId > 1n ? currentGameId - 1n : currentGameId

    console.log(`\n🎯 Getting winners from game #${lastGameId.toString()}\n`)

    const winners = await publicClient.readContract({
      address: PIZZA_PARTY_ADDRESS,
      abi: PIZZA_PARTY_ABI,
      functionName: 'getDailyGameWinners',
      args: [lastGameId]
    })

    if (winners && winners.length > 0) {
      console.log(`Found ${winners.length} winner(s):\n`)
      for (let i = 0; i < Math.min(winners.length, 3); i++) {
        console.log(`${i + 1}. ${winners[i]}`)
      }
      return winners[0] // Return first winner
    } else {
      console.log('No winners found in last game')
      return null
    }
  } catch (error) {
    console.error('❌ Error getting winners:', error.message)
    return null
  }
}

async function main() {
  const playerAddress = process.argv[2]

  if (playerAddress) {
    // Check specific player
    await checkPlayerStats(playerAddress)
  } else {
    // Get a recent winner and check their stats
    console.log('No player address provided. Getting a recent winner...\n')
    const winnerAddress = await getRecentWinners()
    
    if (winnerAddress) {
      console.log(`\n📋 Checking stats for recent winner: ${winnerAddress}\n`)
      await checkPlayerStats(winnerAddress)
    } else {
      console.log('\n❌ Could not find a player to check. Please provide an address:')
      console.log('   node check-player-stats.js <PLAYER_ADDRESS>\n')
    }
  }
}

main().catch(console.error)

