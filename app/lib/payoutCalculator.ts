/**
 * Payout Calculator
 * Calculates actual VMF payouts for daily and weekly winners
 */

import { readContract, getPublicClient } from '@wagmi/core'
import { parseAbiItem } from 'viem'
import { wagmiConfig } from '../components/config/wagmiConfig'
import { PIZZA_PARTY_ADDRESS, PIZZA_PARTY_ABI } from './constants'

const BASE_CHAIN_ID = 8453

interface DailyPayout {
  winner: string
  amount: bigint
  isFirstPlayer: boolean
}

interface WeeklyPayout {
  winner: string
  amount: bigint
  toppingsClaimed: bigint
}

/**
 * Fetch daily game settlement event to get actual payouts
 * Event: DailyGameSettled(uint256 indexed gameId, address[] winners, uint256 pot)
 */
export async function fetchDailyPayouts(gameId: bigint): Promise<Map<string, bigint>> {
  try {
    const client = getPublicClient(wagmiConfig, { chainId: BASE_CHAIN_ID })
    if (!client) throw new Error('No public client')

    const logs = await client.getLogs({
      address: PIZZA_PARTY_ADDRESS as `0x${string}`,
      event: parseAbiItem('event DailyGameSettled(uint256 indexed gameId, address[] winners, uint256 pot)'),
      args: {
        gameId,
      },
      fromBlock: 'earliest',
      toBlock: 'latest',
    })

    if (logs.length === 0) {
      return new Map()
    }

    const log = logs[0]
    const { winners, pot } = log.args as { winners: string[]; pot: bigint }

    const game = (await readContract(wagmiConfig, {
      address: PIZZA_PARTY_ADDRESS as `0x${string}`,
      abi: PIZZA_PARTY_ABI,
      functionName: 'dailyGames',
      args: [gameId],
      chainId: BASE_CHAIN_ID,
    })) as any

    const firstPlayer = game.firstPlayer as string

    const FIRST_PLAYER_BONUS_BPS = 100n
    const firstPlayerBonus = (pot * FIRST_PLAYER_BONUS_BPS) / 10000n
    const remainingPot = pot - firstPlayerBonus
    const baseShare = remainingPot / BigInt(winners.length)

    const payoutMap = new Map<string, bigint>()

    if (firstPlayer && firstPlayer !== '0x0000000000000000000000000000000000000000') {
      const currentPayout = payoutMap.get(firstPlayer.toLowerCase()) || 0n
      payoutMap.set(firstPlayer.toLowerCase(), currentPayout + firstPlayerBonus)
    }

    winners.forEach((winner, idx) => {
      const winnerKey = winner.toLowerCase()
      const currentPayout = payoutMap.get(winnerKey) || 0n
      let payout = baseShare

      if (idx === 0) {
        const totalPaid = firstPlayerBonus + baseShare * BigInt(winners.length)
        const remainder = pot - totalPaid
        payout += remainder
      }

      payoutMap.set(winnerKey, currentPayout + payout)
    })

    return payoutMap
  } catch (error) {
    console.error('Failed to fetch daily payouts:', error)
    return new Map()
  }
}

/**
 * Fetch weekly game settlement event to get actual payouts
 * Event: WeeklyGameSettled(uint256 indexed weekId, address[] winners, uint256 pot)
 */
export async function fetchWeeklyPayouts(weekId: bigint): Promise<Map<string, bigint>> {
  try {
    const client = getPublicClient(wagmiConfig, { chainId: BASE_CHAIN_ID })
    if (!client) throw new Error('No public client')

    const logs = await client.getLogs({
      address: PIZZA_PARTY_ADDRESS as `0x${string}`,
      event: parseAbiItem('event WeeklyGameSettled(uint256 indexed weekId, address[] winners, uint256 pot)'),
      args: {
        weekId,
      },
      fromBlock: 'earliest',
      toBlock: 'latest',
    })

    if (logs.length === 0) {
      return new Map()
    }

    const log = logs[0]
    const { winners, pot } = log.args as { winners: string[]; pot: bigint }

    const payoutEach = pot / BigInt(winners.length)
    const remainder = pot - payoutEach * BigInt(winners.length)

    const payoutMap = new Map<string, bigint>()

    winners.forEach((winner, idx) => {
      const winnerKey = winner.toLowerCase()
      let payout = payoutEach

      if (idx === 0) {
        payout += remainder
      }

      payoutMap.set(winnerKey, payout)
    })

    return payoutMap
  } catch (error) {
    console.error('Failed to fetch weekly payouts:', error)
    return new Map()
  }
}

/**
 * Get human-readable payout for a specific winner
 */
export function formatPayout(amount: bigint): string {
  const vmf = Number(amount) / 1e18
  return vmf.toFixed(1)
}

/**
 * Fetch all daily payouts with winner details
 */
export async function getDailyWinnerPayouts(gameId: bigint): Promise<DailyPayout[]> {
  try {
    const winners = (await readContract(wagmiConfig, {
      address: PIZZA_PARTY_ADDRESS as `0x${string}`,
      abi: PIZZA_PARTY_ABI,
      functionName: 'getDailyGameWinners',
      args: [gameId],
      chainId: BASE_CHAIN_ID,
    })) as string[]

    if (!winners || winners.length === 0) {
      return []
    }

    const payoutMap = await fetchDailyPayouts(gameId)

    const game = (await readContract(wagmiConfig, {
      address: PIZZA_PARTY_ADDRESS as `0x${string}`,
      abi: PIZZA_PARTY_ABI,
      functionName: 'dailyGames',
      args: [gameId],
      chainId: BASE_CHAIN_ID,
    })) as any

    const firstPlayer = (game.firstPlayer as string).toLowerCase()

    return winners.map(winner => ({
      winner,
      amount: payoutMap.get(winner.toLowerCase()) || 0n,
      isFirstPlayer: winner.toLowerCase() === firstPlayer,
    }))
  } catch (error) {
    console.error('Failed to get daily winner payouts:', error)
    return []
  }
}

/**
 * Fetch all weekly payouts with winner details
 */
export async function getWeeklyWinnerPayouts(weekId: bigint): Promise<WeeklyPayout[]> {
  try {
    const winners = (await readContract(wagmiConfig, {
      address: PIZZA_PARTY_ADDRESS as `0x${string}`,
      abi: PIZZA_PARTY_ABI,
      functionName: 'getWeeklyGameWinners',
      args: [weekId],
      chainId: BASE_CHAIN_ID,
    })) as string[]

    if (!winners || winners.length === 0) {
      return []
    }

    const payoutMap = await fetchWeeklyPayouts(weekId)

    const toppingsPromises = winners.map(winner =>
      readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'weeklyPlayers',
        args: [weekId, winner],
        chainId: BASE_CHAIN_ID,
      })
        .then((data: any) => data.toppingsClaimed as bigint)
        .catch(() => 0n)
    )

    const toppingsArray = await Promise.all(toppingsPromises)

    return winners.map((winner, idx) => ({
      winner,
      amount: payoutMap.get(winner.toLowerCase()) || 0n,
      toppingsClaimed: toppingsArray[idx],
    }))
  } catch (error) {
    console.error('Failed to get weekly winner payouts:', error)
    return []
  }
}

/**
 * Get current or most recent settled game ID
 */
export async function getLastSettledDailyGame(): Promise<bigint> {
  try {
    const currentId = (await readContract(wagmiConfig, {
      address: PIZZA_PARTY_ADDRESS as `0x${string}`,
      abi: PIZZA_PARTY_ABI,
      functionName: 'dailyGameId',
      chainId: BASE_CHAIN_ID,
    })) as bigint

    const game = (await readContract(wagmiConfig, {
      address: PIZZA_PARTY_ADDRESS as `0x${string}`,
      abi: PIZZA_PARTY_ABI,
      functionName: 'dailyGames',
      args: [currentId],
      chainId: BASE_CHAIN_ID,
    })) as any

    if (game.settled) {
      return currentId
    }

    return currentId > 1n ? currentId - 1n : currentId
  } catch (error) {
    console.error('Failed to get last settled daily game:', error)
    return 1n
  }
}

/**
 * Get current or most recent settled week ID
 */
export async function getLastSettledWeeklyGame(): Promise<bigint> {
  try {
    const currentId = (await readContract(wagmiConfig, {
      address: PIZZA_PARTY_ADDRESS as `0x${string}`,
      abi: PIZZA_PARTY_ABI,
      functionName: 'weeklyGameId',
      chainId: BASE_CHAIN_ID,
    })) as bigint

    const week = (await readContract(wagmiConfig, {
      address: PIZZA_PARTY_ADDRESS as `0x${string}`,
      abi: PIZZA_PARTY_ABI,
      functionName: 'weeklyGames',
      args: [currentId],
      chainId: BASE_CHAIN_ID,
    })) as any

    if (week.settled) {
      return currentId
    }

    return currentId > 1n ? currentId - 1n : currentId
  } catch (error) {
    console.error('Failed to get last settled weekly game:', error)
    return 1n
  }
}
