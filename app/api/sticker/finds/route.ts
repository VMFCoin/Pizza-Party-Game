import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'

/**
 * Fetch all sticker finds for the map and gallery
 * Supports optional search query and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const limit = parseInt(searchParams.get('limit') || '200')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where = search
      ? {
          OR: [
            { city: { contains: search, mode: 'insensitive' as const } },
            { country: { contains: search, mode: 'insensitive' as const } },
            { businessName: { contains: search, mode: 'insensitive' as const } },
            { address: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}

    const [finds, total] = await Promise.all([
      prisma.stickerFind.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.stickerFind.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      finds: finds.map((f) => ({
        id: f.id,
        latitude: f.latitude,
        longitude: f.longitude,
        city: f.city,
        address: f.address,
        businessName: f.businessName,
        country: f.country,
        imageUrl: f.imageUrl,
        finderAddress: f.finderAddress,
        finderFid: f.finderFid,
        finderName: f.finderName,
        txHash: f.txHash,
        createdAt: f.createdAt.toISOString(),
      })),
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    })
  } catch (error) {
    console.error('[Sticker Finds] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch sticker finds' },
      { status: 500 }
    )
  }
}
