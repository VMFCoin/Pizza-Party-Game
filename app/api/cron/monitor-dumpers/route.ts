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

// allowance(address owner, address spender) selector
const ALLOWANCE_SELECTOR = '0xdd62ed3e'

// Read an ERC20 allowance (used for treasury -> ShareAndSpin reward funding alerts)
async function getAllowance(owner: string, spender: string): Promise<bigint> {
  const paddedOwner = owner.slice(2).toLowerCase().padStart(64, '0')
  const paddedSpender = spender.slice(2).toLowerCase().padStart(64, '0')
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [
        { to: PIZZA_TOKEN, data: `${ALLOWANCE_SELECTOR}${paddedOwner}${paddedSpender}` },
        'latest',
      ],
      id: 1,
    }),
  })
  const json = await res.json()
  if (!json.result) return 0n
  return BigInt(json.result)
}

// Get the native ETH balance of a wallet (used for backend signer gas alerts)
async function getEthBalance(wallet: string): Promise<bigint> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [wallet, 'latest'],
      id: 1,
    }),
  })
  const json = await res.json()
  if (!json.result) return 0n
  return BigInt(json.result)
}

// Format wei → ETH string (e.g. "0.0012")
function formatEth(wei: bigint): string {
  const whole = Number(wei) / 1e18
  if (whole >= 1) return whole.toFixed(3)
  if (whole >= 0.001) return whole.toFixed(4)
  return whole.toFixed(6)
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

    // ============================================================
    // BACKEND SIGNER GAS BALANCE ALERTS
    // ============================================================
    // Threshold = 0.001 ETH (~$3). Below that, top up soon.
    const GAS_LOW_THRESHOLD = 1_000_000_000_000_000n // 0.001 ETH in wei
    const SIGNERS: Array<{ label: string; address: string | undefined }> = [
      { label: 'ShareAndSpin/Parlor signer', address: '0x528952ae107198011C2a1df8c05A82702D5778D6' },
      { label: 'Tipping signer', address: process.env.BACKEND_TIPPING_SIGNER_ADDRESS },
    ]

    const gasAlerts: string[] = []
    const gasResults: Record<string, string> = {}

    for (const s of SIGNERS) {
      if (!s.address) continue
      try {
        const ethBal = await getEthBalance(s.address)
        gasResults[s.label] = `${formatEth(ethBal)} ETH`
        if (ethBal < GAS_LOW_THRESHOLD) {
          gasAlerts.push(`${s.label} LOW GAS: ${formatEth(ethBal)} ETH (${s.address.slice(0, 10)}...)`)
        }
      } catch (e) {
        console.error(`[monitor-dumpers] gas check failed for ${s.label}:`, e)
      }
    }

    if (gasAlerts.length > 0 && ownerToken && ownerToken.enabled) {
      await sendNotifications({
        tokens: [{ token: ownerToken.token, url: ownerToken.url }],
        title: 'Backend Signer Low Gas',
        body: `${gasAlerts.join(' | ')}. Send ETH to top up.`,
        targetUrl: 'https://pizzaparty.com',
        notificationId: `signer-gas-low-${Date.now()}`,
      })
    }

    // ============================================================
    // SHARE & SPIN TREASURY ALLOWANCE ALERT
    // ============================================================
    // Treasury approves ShareAndSpin (capped 10M PIZZA) to pull share rewards.
    // When it depletes, recordShare reverts and Share & Spin breaks.
    // Alert when allowance drops below 500K PIZZA so it can be topped up.
    const TREASURY = '0xBfCA21E41D397C8B6beF0c348D394DA2c4826292'
    const SHARE_AND_SPIN = '0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C'
    const ALLOWANCE_LOW_THRESHOLD = 500_000n // 500K PIZZA (whole tokens)
    let shareAllowanceFormatted = 'n/a'

    try {
      const allowance = await getAllowance(TREASURY, SHARE_AND_SPIN)
      const allowanceWhole = allowance / BigInt(1e18)
      shareAllowanceFormatted = formatPizza(allowance)

      if (allowanceWhole < ALLOWANCE_LOW_THRESHOLD && ownerToken && ownerToken.enabled) {
        await sendNotifications({
          tokens: [{ token: ownerToken.token, url: ownerToken.url }],
          title: 'Share & Spin Funding Low',
          body: `Treasury allowance for Share & Spin is down to ${shareAllowanceFormatted} PIZZA. Re-run ApproveTreasuryForShareAndSpin to top up to 10M.`,
          targetUrl: 'https://pizzaparty.com',
          notificationId: `share-allowance-low-${Date.now()}`,
        })
      }
    } catch (e) {
      console.error('[monitor-dumpers] allowance check failed:', e)
    }

    return NextResponse.json({
      status: 'ok',
      alerts,
      results,
      totalRemaining: totalFormatted,
      gasResults,
      gasAlerts,
      shareAllowance: shareAllowanceFormatted,
    })
  } catch (error) {
    console.error('Monitor dumpers error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
