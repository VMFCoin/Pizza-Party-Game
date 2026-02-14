import { NextResponse } from 'next/server'
import { formatUnits, isAddress } from 'viem'
import { prisma } from '@/app/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddress = searchParams.get('address')

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json({ success: false, error: 'Valid address required' }, { status: 400 })
    }

    const addr = userAddress.toLowerCase()

    const record = await prisma.parlorLifetimeClaimed.findUnique({
      where: { wallet: addr },
    })

    const lifetimeClaimed = record
      ? formatUnits(BigInt(record.totalClaimed), 18)
      : '0'

    return NextResponse.json({ success: true, lifetimeClaimed })
  } catch (error) {
    console.error('Parlor lifetime API error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch lifetime claimed' },
      { status: 500 }
    )
  }
}
