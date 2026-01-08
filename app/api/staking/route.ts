import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { Errors, createClient } from '@farcaster/quick-auth'

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
      'access-control-allow-methods': 'GET, POST, OPTIONS',
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

// GET /api/staking - Check if current user can stake
// Returns: { canStake: boolean, existingPosition?: { wallet, stakedAt } }
export async function GET(request: NextRequest) {
  const fid = await getFidFromToken(request)
  if (!fid) {
    return json({ error: 'Unauthorized - valid Farcaster auth required' }, 401)
  }

  try {
    const existingPosition = await prisma.stakingPosition.findUnique({
      where: { fid },
    })

    if (existingPosition) {
      return json({
        canStake: false,
        reason: 'fid_already_staking',
        existingPosition: {
          wallet: existingPosition.wallet,
          stakedAt: existingPosition.stakedAt.toISOString(),
        },
      })
    }

    return json({ canStake: true })
  } catch (error) {
    console.error('[Staking API] Error checking staking eligibility:', error)
    return json({ error: 'Failed to check staking eligibility' }, 500)
  }
}

// POST /api/staking - Register a new staking position
// Body: { wallet: string }
// Called after successful on-chain stake transaction
export async function POST(request: NextRequest) {
  const fid = await getFidFromToken(request)
  if (!fid) {
    return json({ error: 'Unauthorized - valid Farcaster auth required' }, 401)
  }

  let body: { wallet?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const wallet = body.wallet?.toLowerCase()
  if (!wallet || !/^0x[a-f0-9]{40}$/i.test(wallet)) {
    return json({ error: 'Invalid wallet address' }, 400)
  }

  try {
    // Check if FID already has a position
    const existingPosition = await prisma.stakingPosition.findUnique({
      where: { fid },
    })

    if (existingPosition) {
      return json({
        error: 'FID already has a staking position',
        existingWallet: existingPosition.wallet,
      }, 409) // Conflict
    }

    // Create the staking position
    const position = await prisma.stakingPosition.create({
      data: { fid, wallet },
    })

    return json({
      success: true,
      position: {
        fid: position.fid,
        wallet: position.wallet,
        stakedAt: position.stakedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('[Staking API] Error registering staking position:', error)
    return json({ error: 'Failed to register staking position' }, 500)
  }
}

// DELETE /api/staking - Remove staking position (called after unstaking)
export async function DELETE(request: NextRequest) {
  const fid = await getFidFromToken(request)
  if (!fid) {
    return json({ error: 'Unauthorized - valid Farcaster auth required' }, 401)
  }

  try {
    const deleted = await prisma.stakingPosition.delete({
      where: { fid },
    }).catch(() => null) // Returns null if not found

    if (!deleted) {
      return json({ error: 'No staking position found for this FID' }, 404)
    }

    return json({ success: true })
  } catch (error) {
    console.error('[Staking API] Error removing staking position:', error)
    return json({ error: 'Failed to remove staking position' }, 500)
  }
}
