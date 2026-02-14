import { NextResponse } from 'next/server'
import { isAddress, parseUnits } from 'viem'
import { prisma } from '@/app/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { address, amount, txHash } = body

    if (!address || !isAddress(address)) {
      return NextResponse.json({ success: false, error: 'Valid address required' }, { status: 400 })
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json({ success: false, error: 'Valid amount required' }, { status: 400 })
    }

    const addr = address.toLowerCase()
    const claimWei = parseUnits(String(amount), 18)

    const existing = await prisma.parlorLifetimeClaimed.findUnique({
      where: { wallet: addr },
    })

    const newTotal = (existing ? BigInt(existing.totalClaimed) : 0n) + claimWei

    await prisma.parlorLifetimeClaimed.upsert({
      where: { wallet: addr },
      update: {
        totalClaimed: newTotal.toString(),
        lastClaimTxHash: txHash || null,
      },
      create: {
        wallet: addr,
        totalClaimed: newTotal.toString(),
        lastClaimTxHash: txHash || null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Record claim error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to record claim' },
      { status: 500 }
    )
  }
}
