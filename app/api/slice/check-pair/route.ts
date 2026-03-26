import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Pre-check: how many times has this sender sliced this recipient?
 * Called before the wallet transaction so the parlor owner can see a warning.
 */
export async function GET(request: NextRequest) {
  const senderFid = request.nextUrl.searchParams.get('senderFid')
  const recipientFid = request.nextUrl.searchParams.get('recipientFid')

  if (!senderFid || !recipientFid) {
    return NextResponse.json({ success: false, error: 'Missing params' }, { status: 400 })
  }

  const count = await prisma.sliceSend.count({
    where: {
      senderFid: parseInt(senderFid),
      recipientFid: parseInt(recipientFid),
    },
  })

  return NextResponse.json({
    success: true,
    count,
    blocked: count >= 2,
  })
}
