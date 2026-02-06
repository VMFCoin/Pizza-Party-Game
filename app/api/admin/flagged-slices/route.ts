import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Admin API key for authentication
const ADMIN_API_KEY = process.env.ADMIN_API_KEY

/**
 * Get flagged slices for admin review
 * Requires ADMIN_API_KEY header for authentication
 */
export async function GET(request: NextRequest) {
  // Check admin authentication
  const apiKey = request.headers.get('x-admin-key')
  if (!ADMIN_API_KEY || apiKey !== ADMIN_API_KEY) {
    return NextResponse.json({
      success: false,
      error: 'Unauthorized',
    }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const flaggedOnly = searchParams.get('flagged') !== 'false'
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  try {
    const [slices, total] = await Promise.all([
      prisma.sliceSend.findMany({
        where: flaggedOnly ? { flagged: true } : undefined,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.sliceSend.count({
        where: flaggedOnly ? { flagged: true } : undefined,
      }),
    ])

    // Get summary stats
    const stats = await prisma.sliceSend.groupBy({
      by: ['flagged'],
      _count: true,
    })

    const flaggedCount = stats.find(s => s.flagged)?._count || 0
    const totalCount = stats.reduce((sum, s) => sum + s._count, 0)

    return NextResponse.json({
      success: true,
      slices: slices.map(s => ({
        ...s,
        dailyGameId: s.dailyGameId.toString(), // BigInt -> string for JSON
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + slices.length < total,
      },
      stats: {
        totalSlices: totalCount,
        flaggedSlices: flaggedCount,
        flagRate: totalCount > 0 ? ((flaggedCount / totalCount) * 100).toFixed(2) + '%' : '0%',
      },
    })
  } catch (error) {
    console.error('Error fetching flagged slices:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch slices',
    }, { status: 500 })
  }
}

/**
 * Mark a slice as reviewed/unflagged
 */
export async function PATCH(request: NextRequest) {
  const apiKey = request.headers.get('x-admin-key')
  if (!ADMIN_API_KEY || apiKey !== ADMIN_API_KEY) {
    return NextResponse.json({
      success: false,
      error: 'Unauthorized',
    }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { sliceId, flagged, flagReason } = body

    if (!sliceId) {
      return NextResponse.json({
        success: false,
        error: 'sliceId is required',
      }, { status: 400 })
    }

    const updated = await prisma.sliceSend.update({
      where: { id: sliceId },
      data: {
        flagged: flagged ?? false,
        flagReason: flagReason ?? null,
      },
    })

    return NextResponse.json({
      success: true,
      slice: {
        ...updated,
        dailyGameId: updated.dailyGameId.toString(),
      },
    })
  } catch (error) {
    console.error('Error updating slice:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update slice',
    }, { status: 500 })
  }
}
