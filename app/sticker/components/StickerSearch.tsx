'use client'

import { useState } from 'react'
import { StickerFindData } from './StickerMap'

const customFontStyle = {
  fontFamily: 'var(--font-luckiest-guy)',
  fontWeight: 'bold' as const,
  textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
}

interface StickerSearchProps {
  onSearch: (query: string) => void
  onSelectFind: (find: StickerFindData) => void
  searchResults: StickerFindData[]
  isSearching: boolean
}

export default function StickerSearch({ onSearch, onSelectFind, searchResults, isSearching }: StickerSearchProps) {
  const [query, setQuery] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query.trim())
    }
  }

  const handleClear = () => {
    setQuery('')
    onSearch('')
  }

  return (
    <div className="bg-red-800/80 backdrop-blur-md rounded-2xl border-4 border-black p-4 shadow-2xl">
      <h3 className="text-xl text-white mb-3 text-center" style={customFontStyle}>
        Search Stickers
      </h3>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by city, country, or business..."
          className="flex-1 px-3 py-2 rounded-xl border-2 border-red-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/50 outline-none"
          style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '13px' }}
        />
        <button
          type="submit"
          className="!bg-red-600 hover:!bg-red-700 text-white px-4 py-2 rounded-xl border-2 border-red-900 shadow-md text-sm transition-all"
          style={{ fontFamily: 'var(--font-luckiest-guy)', fontWeight: '900' }}
        >
          Go
        </button>
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="!bg-gray-400 hover:!bg-gray-500 text-white px-3 py-2 rounded-xl border-2 border-gray-600 shadow-md text-sm transition-all"
            style={{ fontFamily: 'var(--font-luckiest-guy)', fontWeight: '900' }}
          >
            X
          </button>
        )}
      </form>

      {isSearching && (
        <div className="text-center py-4">
          <div className="animate-spin w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full mx-auto" />
        </div>
      )}

      {!isSearching && searchResults.length > 0 && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {searchResults.map((find) => (
            <button
              key={find.id}
              onClick={() => onSelectFind(find)}
              className="w-full flex items-center gap-3 p-2 rounded-xl border-2 border-red-200 hover:border-red-500 bg-white text-left transition-all hover:shadow-md"
            >
              <img
                src={find.imageUrl}
                alt={find.city || 'Sticker'}
                className="w-12 h-12 rounded-lg object-cover border border-red-300"
                loading="lazy"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-red-800 truncate" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                  {find.businessName || find.city || 'Unknown'}
                </p>
                <p className="text-[10px] text-gray-500 truncate">
                  {find.city}{find.country ? `, ${find.country}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {!isSearching && query && searchResults.length === 0 && (
        <p className="text-center text-gray-500 text-sm py-2">
          No stickers found matching &ldquo;{query}&rdquo;
        </p>
      )}
    </div>
  )
}
