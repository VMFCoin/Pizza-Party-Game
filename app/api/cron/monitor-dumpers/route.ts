import { NextRequest, NextResponse } from 'next/server'
import { sendNotifications } from '@/app/lib/notifications'
import { getNotificationToken } from '@/app/lib/kv-notifications'

export const maxDuration = 30

const OWNER_FID = 1013491

const PIZZA_TOKEN = '0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07'
const RPC_URL = 'https://mainnet.base.org'

// Wallets with special movement alerts (alert if balance drops at all)
const MOVEMENT_WATCH: Record<string, string> = {
  '0x982b560b649c785a523e08f44079a2979d998a47': 'tomdoecrypto (BANNED)',
}

// Known dumper wallets to monitor
const WATCHED_WALLETS: Record<string, string> = {
  '0xc1b1996dfb67a12c58d57b89105db9050c01cbee': '0xc1b1 (2.4B LP bot - TOP THREAT)',
  '0x28b2018489b5b6ed7d3f0697b5b1bb2123093358': '0x28B2 (0x57d5 network)',
  '0x13181f33c3b8e07df6a5f13e43b3d4113c5f4113': '0x1318 (0x57d5 network)',
  '0xece081ce3ae9c5be80a05e9ba7fa3f8c855b5533': '0xece0 (0x57d5 network)',
  '0xb23c2e7046dd29aa4a85cbf0da72e5b6b82f2610': '0xB23C (active seller)',
  '0x982b560b649c785a523e08f44079a2979d998a47': 'tomdoecrypto (BANNED)',
  '0x8eedc84e1e69cd9ddfa3da2aa176b9d0bfa0e869': '0x8eED (EIP-7702 bot)',
  '0x186ff660dbd2098fcb8bcb29cdeb6c2587fa1490': '0x186F (EIP-7702 bot)',
  '0xbb70129e065b65d38309e0d1be21e02cb9a115dc': '0xbb70 (EIP-7702 bot)',
  '0x34e836abdbbafc4da915b38a3c69b1585e006558': '0x34e8 (LP bot - active today)',
  '0xd5af1246946e9183bab39d37127eaf5fa8e5fb27': 'Exploit attacker',
}

// balanceOf(address) selector
const BALANCE_OF_SELECTOR = '0x70a08231'

async function getBalance(wallet: string): Promise<bigint> {
  const paddedAddr = wallet.slice(2).toLowerCase().padStart(64, '0')
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [
        { to: PIZZA_TOKEN, data: `${BALANCE_OF_SELECTOR}${paddedAddr}` },
        'latest',
      ],
      id: 1,
    }),
  })
  const json = await res.json()
  if (!json.result) return 0n
  return BigInt(json.result)
}

function formatPizza(wei: bigint): string {
  const whole = wei / BigInt(1e18)
  if (whole >= 1_000_000n) return `${(Number(whole) / 1e6).toFixed(1)}M`
  if (whole >= 1_000n) return `${(Number(whole) / 1e3).toFixed(1)}K`
  return whole.toString()
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronHeader = request.headers.get('x-vercel-cron')
  const cronSecret = process.env.CRON_SECRET

  if (cronHeader !== '1' && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const alerts: string[] = []
    const results: Record<string, string> = {}

    // Check all watched wallets
    const entries = Object.entries(WATCHED_WALLETS)
    const balances = await Promise.all(
      entries.map(([addr]) => getBalance(addr))
    )

    let totalRemaining = 0n

    for (let i = 0; i < entries.length; i++) {
      const [, label] = entries[i]
      const balance = balances[i]
      const pizzaAmount = formatPizza(balance)
      results[label] = pizzaAmount
      totalRemaining += balance

      // Alert if a wallet that had PIZZA now has 0 (they sold everything)
      if (balance === 0n) {
        alerts.push(`${label} is EMPTY`)
      }
    }

    // Special movement watch — alert if banned users move ANY PIZZA
    const movementEntries = Object.entries(MOVEMENT_WATCH)
    const movementBalances = await Promise.all(
      movementEntries.map(([addr]) => getBalance(addr))
    )
    for (let i = 0; i < movementEntries.length; i++) {
      const [addr, label] = movementEntries[i]
      const balance = movementBalances[i]
      const whole = balance / BigInt(1e18)
      results[`WATCH: ${label}`] = formatPizza(balance)
      // tomdoecrypto last known balance: ~793M. Alert if it drops at all.
      if (whole < 790_000_000n && whole > 0n) {
        alerts.push(`${label} moved PIZZA! Now ${formatPizza(balance)}. Check ${addr} for destination wallet and BAN IT.`)
      }
    }

    const totalFormatted = formatPizza(totalRemaining)

    // Always send a status update
    const ownerToken = await getNotificationToken(OWNER_FID)
    if (!ownerToken || !ownerToken.enabled) {
      return NextResponse.json({
        status: 'no_owner_token',
        results,
        totalRemaining: totalFormatted,
      })
    }

    if (alerts.length > 0) {
      // Urgent alert — a dumper wallet emptied
      await sendNotifications({
        tokens: [{ token: ownerToken.token, url: ownerToken.url }],
        title: 'Dumper Wallet Empty!',
        body: `${alerts.join(', ')}. Remaining: ${totalFormatted} PIZZA`,
        targetUrl: 'https://pizzaparty.com',
        notificationId: `dumper-alert-${Date.now()}`,
      })
    } else {
      // Regular status check — only notify if total remaining is low
      const totalWhole = totalRemaining / BigInt(1e18)
      if (totalWhole < 50_000_000n) {
        await sendNotifications({
          tokens: [{ token: ownerToken.token, url: ownerToken.url }],
          title: 'Dumper Overhang Low',
          body: `Only ${totalFormatted} PIZZA left across dumpers. Overhang clearing.`,
          targetUrl: 'https://pizzaparty.com',
          notificationId: `dumper-low-${Date.now()}`,
        })
      }
    }

    return NextResponse.json({
      status: 'ok',
      alerts,
      results,
      totalRemaining: totalFormatted,
    })
  } catch (error) {
    console.error('Monitor dumpers error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
