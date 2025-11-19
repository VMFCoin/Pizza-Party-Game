/**
 * Profile Lookup Service
 * Fetches usernames and profile pictures from Farcaster and Basename
 */

export interface UserProfile {
  username: string
  pfpUrl: string
  source: 'farcaster' | 'basename' | 'address'
}

/**
 * Format address as fallback username
 */
function formatAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * Fetch Farcaster profile via Neynar API
 * Docs: https://docs.neynar.com/reference/user-bulk-by-address
 */
async function fetchFarcasterProfile(address: string): Promise<UserProfile | null> {
  try {
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`,
      {
        headers: {
          accept: 'application/json',
          api_key: process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
        },
      }
    )

    if (!response.ok) return null

    const data = await response.json()
    const user = data[address.toLowerCase()]?.[0]

    if (user) {
      return {
        username: user.username || user.display_name || formatAddress(address),
        pfpUrl: user.pfp_url || user.pfp?.url || '',
        source: 'farcaster',
      }
    }

    return null
  } catch (error) {
    console.error('Farcaster lookup failed:', error)
    return null
  }
}

/**
 * Fetch Basename via Base API
 * Docs: https://docs.base.org/docs/names/
 */
async function fetchBasename(address: string): Promise<UserProfile | null> {
  try {
    const response = await fetch(`https://api.basename.app/v1/reverse?address=${address}`, {
      headers: {
        accept: 'application/json',
      },
    })

    if (!response.ok) return null

    const data = await response.json()

    if (data.name) {
      return {
        username: data.name,
        pfpUrl: data.avatar || '',
        source: 'basename',
      }
    }

    return null
  } catch (error) {
    console.error('Basename lookup failed:', error)
    return null
  }
}

/**
 * Fetch Coinbase Verified Name (alternative)
 * Using Coinbase CDP API
 */
async function fetchCoinbaseVerifiedName(address: string): Promise<UserProfile | null> {
  try {
    const response = await fetch(`https://api.coinbase.com/v2/accounts/${address}/name`, {
      headers: {
        accept: 'application/json',
      },
    })

    if (!response.ok) return null

    const data = await response.json()

    if (data.data?.name) {
      return {
        username: data.data.name,
        pfpUrl: data.data.avatar_url || '',
        source: 'basename',
      }
    }

    return null
  } catch (error) {
    console.error('Coinbase name lookup failed:', error)
    return null
  }
}

/**
 * Main profile lookup with fallback strategy
 * Priority: Farcaster → Basename → Formatted Address
 */
export async function fetchUserProfile(address: string): Promise<UserProfile> {
  if (!address) {
    return {
      username: 'Unknown',
      pfpUrl: '',
      source: 'address',
    }
  }

  const farcasterProfile = await fetchFarcasterProfile(address)
  if (farcasterProfile) return farcasterProfile

  const basenameProfile = await fetchBasename(address)
  if (basenameProfile) return basenameProfile

  const coinbaseProfile = await fetchCoinbaseVerifiedName(address)
  if (coinbaseProfile) return coinbaseProfile

  return {
    username: formatAddress(address),
    pfpUrl: '',
    source: 'address',
  }
}

/**
 * Batch fetch profiles for multiple addresses (optimized)
 */
export async function fetchUserProfiles(addresses: string[]): Promise<Map<string, UserProfile>> {
  const profileMap = new Map<string, UserProfile>()
  const uniqueAddresses = [...new Set(addresses.map(a => a.toLowerCase()))]

  const profiles = await Promise.all(uniqueAddresses.map(addr => fetchUserProfile(addr)))

  uniqueAddresses.forEach((addr, idx) => {
    profileMap.set(addr, profiles[idx])
  })

  return profileMap
}

/**
 * Client-side cache for profiles (5 minutes TTL)
 */
const profileCache = new Map<string, { profile: UserProfile; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000

export async function fetchUserProfileCached(address: string): Promise<UserProfile> {
  const key = address.toLowerCase()
  const cached = profileCache.get(key)

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.profile
  }

  const profile = await fetchUserProfile(address)

  profileCache.set(key, {
    profile,
    timestamp: Date.now(),
  })

  return profile
}
