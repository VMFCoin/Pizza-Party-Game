import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'

/**
 * Record a sticker find
 * Called after photo upload + geolocation + QR validation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      latitude,
      longitude,
      city,
      address,
      businessName,
      country,
      imageUrl,
      finderAddress,
      finderFid,
      finderName,
      txHash,
    } = body

    // Validate required fields
    if (!latitude || !longitude || !imageUrl) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields (latitude, longitude, imageUrl)' },
        { status: 400 }
      )
    }

    // Validate coordinates
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { success: false, error: 'Invalid coordinates' },
        { status: 400 }
      )
    }

    const stickerFind = await prisma.stickerFind.create({
      data: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        city: city || null,
        address: address || null,
        businessName: businessName || null,
        country: country || null,
        imageUrl,
        finderAddress: finderAddress ? finderAddress.toLowerCase() : null,
        finderFid: finderFid ? parseInt(finderFid) : null,
        finderName: finderName || null,
        txHash: txHash || null,
      },
    })

    console.log('[Sticker Report] New find recorded:', {
      id: stickerFind.id,
      city: stickerFind.city,
      country: stickerFind.country,
      finder: stickerFind.finderName || stickerFind.finderAddress || 'anonymous',
    })

    return NextResponse.json({
      success: true,
      find: {
        id: stickerFind.id,
        latitude: stickerFind.latitude,
        longitude: stickerFind.longitude,
        city: stickerFind.city,
        country: stickerFind.country,
        imageUrl: stickerFind.imageUrl,
        createdAt: stickerFind.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('[Sticker Report] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to record sticker find' },
      { status: 500 }
    )
  }
}

/**
 * Update a sticker find with on-chain tx hash
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { findId, txHash } = body

    if (!findId || !txHash) {
      return NextResponse.json(
        { success: false, error: 'Missing findId or txHash' },
        { status: 400 }
      )
    }

    const updated = await prisma.stickerFind.update({
      where: { id: findId },
      data: { txHash },
    })

    console.log('[Sticker Report] On-chain tx recorded:', { findId, txHash })

    return NextResponse.json({ success: true, find: { id: updated.id, txHash: updated.txHash } })
  } catch (error) {
    console.error('[Sticker Report] PATCH Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update find' },
      { status: 500 }
    )
  }
}
