'use client'

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface StickerFindData {
  id: string
  latitude: number
  longitude: number
  city: string | null
  address: string | null
  businessName: string | null
  country: string | null
  imageUrl: string
  finderAddress: string | null
  finderFid: number | null
  finderName: string | null
  txHash: string | null
  createdAt: string
}

export interface StickerMapHandle {
  flyTo: (lat: number, lng: number) => void
}

// Custom pizza logo marker icon (lazy init to avoid SSR issues)
let _pizzaIcon: L.Icon | null = null
function getPizzaIcon() {
  if (!_pizzaIcon) {
    _pizzaIcon = new L.Icon({
      iconUrl: '/images/logo.png',
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40],
      className: 'pizza-marker',
    })
  }
  return _pizzaIcon
}

// Fix partial tile loading — invalidate size when map becomes visible or on resize
function InvalidateSizeFix({ visible }: { visible?: boolean }) {
  const map = useMap()

  useEffect(() => {
    if (visible !== false) {
      // Invalidate at multiple intervals to catch all rendering scenarios
      map.invalidateSize()
      const t1 = setTimeout(() => map.invalidateSize(), 100)
      const t2 = setTimeout(() => map.invalidateSize(), 300)
      const t3 = setTimeout(() => map.invalidateSize(), 600)
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
    }
  }, [map, visible])

  useEffect(() => {
    const handleResize = () => map.invalidateSize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [map])

  return null
}

// Component to handle map fly-to from external triggers
function FlyToHandler({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap()

  useEffect(() => {
    if (target) {
      // Zoom level ~13 is roughly 10 mile radius bird's eye view
      map.flyTo([target.lat, target.lng], 13, { duration: 1.5 })
    }
  }, [target, map])

  return null
}

function getDirectionsUrl(lat: number, lng: number) {
  // Google Maps with all transport modes
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=transit`
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

interface StickerMapProps {
  finds: StickerFindData[]
  flyTarget: { lat: number; lng: number } | null
  visible?: boolean
}

const StickerMap = forwardRef<StickerMapHandle, StickerMapProps>(({ finds, flyTarget, visible }, ref) => {
  const mapRef = useRef<L.Map | null>(null)

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number) => {
      if (mapRef.current) {
        mapRef.current.flyTo([lat, lng], 13, { duration: 1.5 })
      }
    },
  }))

  return (
    <div className="w-full rounded-2xl overflow-hidden border-4 border-red-800 shadow-2xl" style={{ height: '400px' }}>
      <MapContainer
        center={[20, 0]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        ref={(map) => { if (map) mapRef.current = map }}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <InvalidateSizeFix visible={visible} />
        <FlyToHandler target={flyTarget} />

        {finds.map((find) => (
          <Marker
            key={find.id}
            position={[find.latitude, find.longitude]}
            icon={getPizzaIcon()}
          >
            <Popup maxWidth={280}>
              <div style={{ fontFamily: 'var(--font-luckiest-guy)', textAlign: 'center' }}>
                <img
                  src={find.imageUrl}
                  alt="Sticker find"
                  style={{
                    width: '100%',
                    maxHeight: '150px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    border: '2px solid #991B1B',
                  }}
                />
                {find.businessName && (
                  <p style={{ fontWeight: 'bold', fontSize: '14px', margin: '4px 0', color: '#991B1B' }}>
                    {find.businessName}
                  </p>
                )}
                {find.city && (
                  <p style={{ fontSize: '12px', margin: '2px 0', color: '#333' }}>
                    {find.city}{find.country ? `, ${find.country}` : ''}
                  </p>
                )}
                {find.address && (
                  <p style={{ fontSize: '11px', margin: '2px 0', color: '#666' }}>
                    {find.address}
                  </p>
                )}
                <p style={{ fontSize: '11px', color: '#888', margin: '4px 0' }}>
                  Found {formatDate(find.createdAt)}
                  {find.finderName ? ` by ${find.finderName}` : ''}
                </p>
                {find.txHash && (
                  <a
                    href={`https://basescan.org/tx/${find.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '10px', color: '#2563EB' }}
                  >
                    View on-chain proof
                  </a>
                )}
                <div style={{ marginTop: '8px' }}>
                  <a
                    href={getDirectionsUrl(find.latitude, find.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      background: '#DC2626',
                      color: 'white',
                      padding: '6px 16px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      textDecoration: 'none',
                      border: '2px solid #991B1B',
                    }}
                  >
                    Get Directions
                  </a>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
})

StickerMap.displayName = 'StickerMap'

export default StickerMap
