import { NextRequest, NextResponse } from 'next/server'

export async function GET(_request: NextRequest) {
  // PAUSED: Notifications temporarily disabled
  return NextResponse.json({
    success: true,
    paused: true,
    message: 'Notifications are temporarily paused'
  })
}
