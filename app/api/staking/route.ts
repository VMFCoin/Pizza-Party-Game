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
// Query params: ?wallet=0x... (optional, to check specific wallet)
// Returns: { canStake: boolean, existingPosition?: { wallet, stakedAt } }
export async function GET(request: NextRequest) {
  const fid = await getFidFromToken(request)
  if (!fid) {
    return json({ error: 'Unauthorized - valid Farcaster auth required' }, 401)
  }

  // Get wallet from query params (if provided)
  const wallet = request.nextUrl.searchParams.get('wallet')?.toLowerCase()

  try {
    // Check if this FID already has a staking position
    const existingPosition = await prisma.stakingPosition.findUnique({
      where: { fid },
    })

    if (existingPosition) {
      // If checking a specific wallet, allow if it's the same wallet
      if (wallet && existingPosition.wallet.toLowerCase() === wallet) {
        return json({
          canStake: true,
          registeredWallet: existingPosition.wallet,
        })
      }
      return json({
        canStake: false,
        reason: 'fid_already_staking',
        existingPosition: {
          wallet: existingPosition.wallet,
          stakedAt: existingPosition.stakedAt.toISOString(),
        },
      })
    }

    // If wallet provided, check if it's already registered to a different FID
    if (wallet) {
      const walletPosition = await prisma.stakingPosition.findFirst({
        where: { wallet },
      })

      if (walletPosition && walletPosition.fid !== fid) {
        return json({
          canStake: false,
          reason: 'wallet_already_registered',
          message: 'This wallet is already registered to a different Farcaster account'
        })
      }
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
    // Check if wallet is already registered to a DIFFERENT FID (anti-sybil)
    const walletPosition = await prisma.stakingPosition.findFirst({
      where: { wallet },
    })

    if (walletPosition && walletPosition.fid !== fid) {
      return json({
        success: false,
        error: 'Wallet already registered to different FID',
        reason: 'wallet_already_registered'
      }, 403)
    }

    // Check if FID already has a position
    const existingPosition = await prisma.stakingPosition.findUnique({
      where: { fid },
    })

    if (existingPosition) {
      // If same wallet, allow (idempotent - maybe previous stake tx failed)
      if (existingPosition.wallet.toLowerCase() === wallet.toLowerCase()) {
        return json({
          success: true,
          position: {
            fid: existingPosition.fid,
            wallet: existingPosition.wallet,
            stakedAt: existingPosition.stakedAt.toISOString(),
          },
        })
      }
      // Different wallet - NOT ALLOWED (prevents sybil switching)
      return json({
        success: false,
        error: 'FID already registered with different wallet',
        reason: 'fid_already_registered',
        existingWallet: existingPosition.wallet
      }, 403)
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
