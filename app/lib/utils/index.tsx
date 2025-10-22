// utils/index.tsx
// Placeholder for utils module
// TODO: Implement real utility functions as needed

/**
 * Simple classNames utility
 * Joins truthy arguments into a single space-separated string
 */
export function cn(...args: Array<string | undefined | null | boolean>): string {
  return args.filter(Boolean).join(' ')
}

/**
 * Formats a wallet address for display
 * Example: "0x1234567890abcdef" -> "0x1234...cdef"
 */
export const formatWallet = (wallet: string | null, length = 6): string =>
  wallet ? `${wallet.slice(0, length)}...${wallet.slice(-4)}` : 'N/A';