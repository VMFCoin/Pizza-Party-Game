'use client'

import { StickerFindData } from './StickerMap'

const customFontStyle = {
  fontFamily: 'var(--font-luckiest-guy)',
  fontWeight: 'bold' as const,
  textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[date.getMonth()]} ${date.getDate()}`
}

interface StickerGalleryProps {
  finds: StickerFindData[]
  onSelectFind: (find: StickerFindData) => void
  selectedId: string | null
}

export default function StickerGallery({ finds, onSelectFind, selectedId }: StickerGalleryProps) {
  const top20 = finds.slice(0, 20)

  if (top20.length === 0) {
    return (
      <div className="bg-red-800/80 backdrop-blur-md rounded-2xl border-4 border-black p-6 shadow-2xl text-center">
        <h3 className="text-xl text-white mb-2" style={customFontStyle}>
          Recent Finds
        </h3>
        <p className="text-white/70 text-sm">
          No stickers found yet. Be the first to discover one!
        </p>
      </div>
    )
  }

  return (
    <div className="bg-red-800/80 backdrop-blur-md rounded-2xl border-4 border-black p-4 shadow-2xl">
      <h3 className="text-xl text-white mb-3 text-center" style={customFontStyle}>
        Recent Finds
      </h3>
      <div className="grid grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
        {top20.map((find) => (
          <button
            key={find.id}
            onClick={() => onSelectFind(find)}
            className={`rounded-xl overflow-hidden border-2 transition-all transform hover:scale-105 text-left ${
              selectedId === find.id
                ? 'border-yellow-500 shadow-lg ring-2 ring-yellow-400'
                : 'border-red-300 hover:border-red-500'
            }`}
          >
            <div className="relative">
              <img
                src={find.imageUrl}
                alt={find.city || 'Sticker find'}
                className="w-full h-24 object-cover"
                loading="lazy"
              />
            </div>
            <div className="p-2 bg-white">
              <p className="text-xs font-bold text-red-800 truncate" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                {find.businessName || find.city || 'Unknown Location'}
              </p>
              <p className="text-[10px] text-gray-500 truncate">
                {find.city}{find.country ? `, ${find.country}` : ''} &middot; {formatDate(find.createdAt)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
