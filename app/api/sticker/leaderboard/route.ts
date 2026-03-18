import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'

/**
 * Sticker leaderboard - top 20 finders by number of sticker finds
 */
export async function GET() {
  try {
    // Group by finder and count finds
    // Use raw query for groupBy with multiple fields
    const leaderboard = await prisma.stickerFind.groupBy({
      by: ['finderAddress', 'finderFid', 'finderName'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    })

    // Get unique cities and countries per finder
    const enriched = await Promise.all(
      leaderboard.map(async (entry) => {
        const where = entry.finderAddress
          ? { finderAddress: entry.finderAddress }
          : entry.finderFid
          ? { finderFid: entry.finderFid }
          : { finderName: entry.finderName }

        const [cities, countries] = await Promise.all([
          prisma.stickerFind.findMany({
            where,
            select: { city: true },
            distinct: ['city'],
          }),
          prisma.stickerFind.findMany({
            where,
            select: { country: true },
            distinct: ['country'],
          }),
        ])

        return {
          finderAddress: entry.finderAddress,
          finderFid: entry.finderFid,
          finderName: entry.finderName || (entry.finderAddress ? `${entry.finderAddress.slice(0, 6)}...${entry.finderAddress.slice(-4)}` : 'Anonymous'),
          totalFinds: entry._count.id,
          uniqueCities: cities.filter((c) => c.city).length,
          uniqueCountries: countries.filter((c) => c.country).length,
        }
      })
    )

    // Global stats
    const [totalFinds, totalFinders, totalCities, totalCountries] = await Promise.all([
      prisma.stickerFind.count(),
      prisma.stickerFind.findMany({
        select: { finderAddress: true },
        distinct: ['finderAddress'],
      }),
      prisma.stickerFind.findMany({
        select: { city: true },
        distinct: ['city'],
      }),
      prisma.stickerFind.findMany({
        select: { country: true },
        distinct: ['country'],
      }),
    ])

    return NextResponse.json({
      success: true,
      leaderboard: enriched,
      stats: {
        totalFinds,
        totalFinders: totalFinders.length,
        totalCities: totalCities.filter((c) => c.city).length,
        totalCountries: totalCountries.filter((c) => c.country).length,
      },
    })
  } catch (error) {
    console.error('[Sticker Leaderboard] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard' },
      { status: 500 }
    )
  }
}
