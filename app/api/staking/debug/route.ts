import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { createClient } from '@farcaster/quick-auth'

const client = createClient()
const DOMAIN = 'pizza-party-game.vmfcoin.com'

// Helper for JSON responses with CORS
function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, DELETE, OPTIONS',
    },
  })
}

// Handle CORS preflight
export async function OPTIONS() {
  return json({ ok: true })
}

// Extract and verify FID from auth token
async function getFidFromToken(request: NextRequest): Promise<number | null> {
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null

  const token = auth.slice('Bearer '.length).trim()
  try {
    const payload = await client.verifyJwt({ token, domain: DOMAIN })
    return Number(payload.sub)
  } catch {
    return null
  }
}

// GET /api/staking/debug - View what's in the database for this FID
export async function GET(request: NextRequest) {
  const fid = await getFidFromToken(request)
  if (!fid) {
    return json({ error: 'Unauthorized - valid Farcaster auth required' }, 401)
  }

  try {
    const position = await prisma.stakingPosition.findUnique({
      where: { fid },
    })

    return json({
      fid,
      hasPosition: !!position,
      position: position ? {
        id: position.id,
        wallet: position.wallet,
        stakedAt: position.stakedAt.toISOString(),
        updatedAt: position.updatedAt.toISOString(),
      } : null,
    })
  } catch (error) {
    console.error('[Staking Debug] Error:', error)
    return json({ error: 'Failed to query database' }, 500)
  }
}

// DELETE /api/staking/debug - Clear the database position for this FID (for testing)
export async function DELETE(request: NextRequest) {
  const fid = await getFidFromToken(request)
  if (!fid) {
    return json({ error: 'Unauthorized - valid Farcaster auth required' }, 401)
  }

  try {
    const deleted = await prisma.stakingPosition.delete({
      where: { fid },
    }).catch(() => null)

    if (!deleted) {
      return json({ success: true, message: 'No position found to delete' })
    }

    return json({
      success: true,
      message: 'Position deleted',
      deleted: {
        wallet: deleted.wallet,
        stakedAt: deleted.stakedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('[Staking Debug] Error deleting:', error)
    return json({ error: 'Failed to delete position' }, 500)
  }
}
