import { sdk } from '@farcaster/miniapp-sdk'

export interface FarcasterProfile {
  fid?: number
  username?: string
  displayName?: string
  pfpUrl?: string
  address: string
}

const profileCache = new Map<string, FarcasterProfile>()
const CACHE_DURATION = 5 * 60 * 1000

interface CachedProfile {
  profile: FarcasterProfile
  timestamp: number
}

const cacheWithTimestamp = new Map<string, CachedProfile>()

export async function getCurrentUserProfile(): Promise<FarcasterProfile | null> {
  try {
    const context = await sdk.context

    if (!context.user) {
      return null
    }

    const profile: FarcasterProfile = {
      fid: context.user.fid,
      username: context.user.username,
      displayName: context.user.displayName,
      pfpUrl: context.user.pfpUrl,
      address: '',
    }

    return profile
  } catch (error) {
    console.error('Error getting current user profile:', error)
    return null
  }
}

export async function fetchProfilesByAddresses(addresses: string[]): Promise<Map<string, FarcasterProfile>> {
  const profiles = new Map<string, FarcasterProfile>()
  const now = Date.now()
  const addressesToFetch: string[] = []

  for (const address of addresses) {
    const cached = cacheWithTimestamp.get(address.toLowerCase())
    if (cached && now - cached.timestamp < CACHE_DURATION) {
      profiles.set(address.toLowerCase(), cached.profile)
    } else {
      addressesToFetch.push(address)
    }
  }

  if (addressesToFetch.length === 0) {
    return profiles
  }

  try {
    const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY

    if (!NEYNAR_API_KEY) {
      console.warn('NEYNAR_API_KEY not configured')
      return profiles
    }

    const batchSize = 100

    for (let i = 0; i < addressesToFetch.length; i += batchSize) {
      const batch = addressesToFetch.slice(i, i + batchSize)
      const addressParam = batch.join(',')

      const response = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addressParam}`,
        {
          headers: {
            api_key: NEYNAR_API_KEY,
          },
        }
      )

      if (!response.ok) {
        if (response.status === 429) {
          console.warn('Neynar rate limit hit, using cached data')
          // Don't continue, break to prevent more requests
          break
        }
        if (response.status === 404) {
          console.warn('Neynar endpoint not found, check API version')
          break
        }
        console.error('Neynar API error:', response.status, await response.text())
        continue
      }

      const data = await response.json()

      for (const address of batch) {
        const addressLower = address.toLowerCase()
        const userData = data[addressLower]

        if (userData && userData.length > 0) {
          const user = userData[0]
          const profile: FarcasterProfile = {
            fid: user.fid,
            username: user.username,
            displayName: user.display_name,
            pfpUrl: user.pfp_url,
            address: addressLower,
          }

          profiles.set(addressLower, profile)

          cacheWithTimestamp.set(addressLower, {
            profile,
            timestamp: now,
          })
        } else {
          const emptyProfile: FarcasterProfile = {
            address: addressLower,
          }
          profiles.set(addressLower, emptyProfile)
          cacheWithTimestamp.set(addressLower, {
            profile: emptyProfile,
            timestamp: now,
          })
        }
      }
    }
  } catch (error) {
    console.error('Error fetching Farcaster profiles:', error)
  }

  return profiles
}

export async function getProfile(address: string, currentUserAddress?: string): Promise<FarcasterProfile | null> {
  if (currentUserAddress && address.toLowerCase() === currentUserAddress.toLowerCase()) {
    const sdkProfile = await getCurrentUserProfile()
    if (sdkProfile) {
      sdkProfile.address = address.toLowerCase()
      return sdkProfile
    }
  }

  const cached = cacheWithTimestamp.get(address.toLowerCase())
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.profile
  }

  const profiles = await fetchProfilesByAddresses([address])
  return profiles.get(address.toLowerCase()) || null
}

export async function enrichLeaderboardWithProfiles<T extends { address: string }>(
  entries: T[],
  currentUserAddress?: string
): Promise<(T & { farcasterProfile?: FarcasterProfile })[]> {
  const currentUserEntry = entries.find(
    entry => currentUserAddress && entry.address.toLowerCase() === currentUserAddress.toLowerCase()
  )
  const otherEntries = entries.filter(
    entry => !currentUserAddress || entry.address.toLowerCase() !== currentUserAddress.toLowerCase()
  )

  let currentUserProfile: FarcasterProfile | null = null
  if (currentUserEntry && currentUserAddress) {
    currentUserProfile = await getCurrentUserProfile()
    if (currentUserProfile) {
      currentUserProfile.address = currentUserAddress.toLowerCase()
    }
  }

  const otherAddresses = otherEntries.map(entry => entry.address)
  const otherProfiles = await fetchProfilesByAddresses(otherAddresses)

  return entries.map(entry => {
    const addressLower = entry.address.toLowerCase()

    if (currentUserAddress && addressLower === currentUserAddress.toLowerCase()) {
      return {
        ...entry,
        farcasterProfile: currentUserProfile || undefined,
      }
    }

    return {
      ...entry,
      farcasterProfile: otherProfiles.get(addressLower) || undefined,
    }
  })
}

export async function preloadCommonProfiles(addresses: string[]): Promise<void> {
  fetchProfilesByAddresses(addresses).catch(console.error)
}

export function clearProfileCache(): void {
  cacheWithTimestamp.clear()
  profileCache.clear()
}
