export const STICKER_REGISTRY_ABI = [
  {
    name: 'recordFind',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_latitude', type: 'int256' },
      { name: '_longitude', type: 'int256' },
      { name: '_city', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'totalFinds',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'uniqueFinders',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getFinderFindCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_finder', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getFindById',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_findId', type: 'uint256' }],
    outputs: [
      { name: 'finder', type: 'address' },
      { name: 'latitude', type: 'int256' },
      { name: 'longitude', type: 'int256' },
      { name: 'city', type: 'string' },
      { name: 'timestamp', type: 'uint256' },
    ],
  },
  {
    name: 'getRecentFinds',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_offset', type: 'uint256' },
      { name: '_limit', type: 'uint256' },
    ],
    outputs: [
      {
        name: 'records',
        type: 'tuple[]',
        components: [
          { name: 'finder', type: 'address' },
          { name: 'latitude', type: 'int256' },
          { name: 'longitude', type: 'int256' },
          { name: 'city', type: 'string' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'StickerFound',
    type: 'event',
    inputs: [
      { name: 'findId', type: 'uint256', indexed: true },
      { name: 'finder', type: 'address', indexed: true },
      { name: 'latitude', type: 'int256', indexed: false },
      { name: 'longitude', type: 'int256', indexed: false },
      { name: 'city', type: 'string', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const

export const STICKER_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_STICKER_REGISTRY_ADDRESS as `0x${string}` | undefined
