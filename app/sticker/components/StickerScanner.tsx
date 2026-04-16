'use client'

import { useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import { useWriteContract } from 'wagmi'
import { STICKER_REGISTRY_ABI, STICKER_REGISTRY_ADDRESS } from '../lib/stickerRegistryAbi'

const customFontStyle = {
  fontFamily: 'var(--font-luckiest-guy)',
  fontWeight: 'bold' as const,
  textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
}

interface ReverseGeocodeResult {
  city: string | null
  address: string | null
  businessName: string | null
  country: string | null
}

async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': 'PizzaPartyStickers/1.0' } }
    )
    const data = await res.json()
    const addr = data.address || {}
    return {
      city: addr.city || addr.town || addr.village || addr.hamlet || null,
      address: data.display_name || null,
      businessName: addr.amenity || addr.shop || addr.tourism || addr.leisure || null,
      country: addr.country || null,
    }
  } catch {
    return { city: null, address: null, businessName: null, country: null }
  }
}

interface StickerScannerProps {
  onComplete: () => void
  walletAddress?: string
  userFid?: number | null
  userName?: string | null
}

type Step = 'camera' | 'verifying' | 'location' | 'saving' | 'success' | 'error'

export default function StickerScanner({ onComplete, walletAddress, userFid, userName }: StickerScannerProps) {
  const [step, setStep] = useState<Step>('camera')
  const [error, setError] = useState<string | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [locationData, setLocationData] = useState<ReverseGeocodeResult | null>(null)
  const [savedFindId, setSavedFindId] = useState<string | null>(null)
  const [savedCoords, setSavedCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [onChainRecording, setOnChainRecording] = useState(false)
  const [onChainTxHash, setOnChainTxHash] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { writeContractAsync } = useWriteContract()

  const handleRecordOnChain = useCallback(async () => {
    if (!savedCoords || !STICKER_REGISTRY_ADDRESS || !walletAddress) return

    setOnChainRecording(true)
    try {
      const latScaled = BigInt(Math.round(savedCoords.lat * 1_000_000))
      const lngScaled = BigInt(Math.round(savedCoords.lng * 1_000_000))
      const city = locationData?.city || 'Unknown'

      const hash = await writeContractAsync({
        address: STICKER_REGISTRY_ADDRESS,
        abi: STICKER_REGISTRY_ABI,
        functionName: 'recordFind',
        args: [latScaled, lngScaled, city],
      })

      setOnChainTxHash(hash)

      if (savedFindId) {
        await fetch('/api/sticker/report', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ findId: savedFindId, txHash: hash }),
        }).catch(() => {})
      }
    } catch (err) {
      console.error('On-chain recording failed:', err)
    } finally {
      setOnChainRecording(false)
    }
  }, [savedCoords, locationData, walletAddress, writeContractAsync, savedFindId])

  const handleCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setStep('verifying')
    setError(null)

    try {
      // Store captured image for display
      const reader = new FileReader()
      reader.onload = () => setCapturedImage(reader.result as string)
      reader.readAsDataURL(file)

      // Step 1: Upload to server — server verifies QR using ZXing + uploads to Pinata
      const formData = new FormData()
      formData.append('file', file)

      const uploadRes = await fetch('/api/sticker/upload', {
        method: 'POST',
        body: formData,
      })
      const uploadData = await uploadRes.json()

      if (!uploadData.success) {
        setStep('error')
        setError(uploadData.error || 'No valid Pizza Party QR sticker detected. Make sure the QR code is clearly visible in the photo.')
        return
      }

      // Step 2: Get location
      setStep('location')
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords
          setSavedCoords({ lat: latitude, lng: longitude })
          const geo = await reverseGeocode(latitude, longitude)
          setLocationData(geo)
          setStep('saving')

          // Step 3: Save the find to database
          const reportRes = await fetch('/api/sticker/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude,
              longitude,
              city: geo.city,
              address: geo.address,
              businessName: geo.businessName,
              country: geo.country,
              imageUrl: uploadData.imageUrl,
              finderAddress: walletAddress || null,
              finderFid: userFid || null,
              finderName: userName || null,
            }),
          })
          const reportData = await reportRes.json()

          if (!reportData.success) {
            setStep('error')
            setError('Failed to save your find. Please try again.')
            return
          }

          setSavedFindId(reportData.find?.id || null)
          setStep('success')
        },
        (geoError) => {
          setStep('error')
          setError(`Location access denied: ${geoError.message}. Please enable location permissions.`)
        },
        { enableHighAccuracy: true, timeout: 15000 }
      )
    } catch {
      setStep('error')
      setError('Something went wrong. Please try again.')
    }
  }, [walletAddress, userFid, userName])

  return (
    <div className="bg-red-800/80 backdrop-blur-md rounded-2xl border-4 border-black p-6 shadow-2xl">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        style={{ display: 'none' }}
      />

      {/* CAMERA STEP */}
      {step === 'camera' && (
        <div className="text-center">
          <h3
            className="text-2xl text-white mb-4"
            style={customFontStyle}
          >
            Found a Sticker?
          </h3>
          <p className="text-white/80 mb-6 text-sm">
            Take a photo of the Pizza Party QR sticker. Make sure the QR code is clearly visible!
          </p>
          <div className="mb-4">
            <Image
              src="/images/pizza-party-qr.png"
              alt="Pizza Party QR"
              width={80}
              height={80}
              className="mx-auto"
            />
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full !bg-red-600 hover:!bg-red-700 text-white py-3 px-6 rounded-xl border-4 border-red-900 shadow-lg transform hover:scale-105 transition-all"
            style={{ ...customFontStyle, letterSpacing: '1px', fontSize: '18px', fontWeight: '900' }}
          >
            Take Photo
          </button>
        </div>
      )}

      {/* VERIFYING — server-side QR check + upload */}
      {step === 'verifying' && (
        <div className="text-center py-8">
          <div className="animate-spin w-12 h-12 border-4 border-white border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-white" style={customFontStyle}>Verifying sticker...</p>
        </div>
      )}

      {/* GETTING LOCATION */}
      {step === 'location' && (
        <div className="text-center py-8">
          <div className="animate-spin w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-white" style={customFontStyle}>Getting your location...</p>
        </div>
      )}

      {/* SAVING */}
      {step === 'saving' && (
        <div className="text-center py-8">
          <div className="animate-spin w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-white" style={customFontStyle}>Saving your find...</p>
          {locationData?.city && (
            <p className="text-sm text-white/70 mt-2">
              {locationData.city}{locationData.country ? `, ${locationData.country}` : ''}
            </p>
          )}
        </div>
      )}

      {/* SUCCESS */}
      {step === 'success' && (
        <div className="text-center py-4">
          <div className="text-5xl mb-4">&#127829;</div>
          <h3
            className="text-2xl text-green-400 mb-2"
            style={customFontStyle}
          >
            Sticker Found!
          </h3>
          {capturedImage && (
            <img
              src={capturedImage}
              alt="Your find"
              className="w-full max-h-48 object-cover rounded-xl border-2 border-red-800 mb-4"
            />
          )}
          {locationData?.city && (
            <p className="text-white/80 mb-1">
              {locationData.businessName ? `${locationData.businessName}, ` : ''}
              {locationData.city}{locationData.country ? `, ${locationData.country}` : ''}
            </p>
          )}
          <p className="text-sm text-white/60 mb-4">
            Your discovery has been added to the global map!
          </p>

          {walletAddress && STICKER_REGISTRY_ADDRESS && !onChainTxHash && (
            <button
              onClick={handleRecordOnChain}
              disabled={onChainRecording}
              className="w-full !bg-orange-500 hover:!bg-orange-600 text-white py-3 px-6 rounded-xl border-4 border-orange-700 shadow-lg transform hover:scale-105 transition-all mb-3 disabled:opacity-50 disabled:pointer-events-none"
              style={{ ...customFontStyle, letterSpacing: '1px', fontSize: '16px', fontWeight: '900' }}
            >
              {onChainRecording ? 'Recording...' : 'Record On-Chain'}
            </button>
          )}

          {onChainTxHash && (
            <div className="mb-3 p-3 bg-green-800/60 rounded-xl border-2 border-green-500">
              <p className="text-green-300 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                Recorded on Base!
              </p>
              <a
                href={`https://basescan.org/tx/${onChainTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-300 underline"
              >
                View on Basescan
              </a>
            </div>
          )}

          <button
            onClick={onComplete}
            className="w-full !bg-green-600 hover:!bg-green-700 text-white py-3 px-6 rounded-xl border-4 border-green-900 shadow-lg transform hover:scale-105 transition-all"
            style={{ ...customFontStyle, letterSpacing: '1px', fontSize: '16px', fontWeight: '900' }}
          >
            View on Map
          </button>
        </div>
      )}

      {/* ERROR */}
      {step === 'error' && (
        <div className="text-center py-4">
          <div className="text-5xl mb-4">&#128533;</div>
          <h3
            className="text-xl text-red-300 mb-2"
            style={customFontStyle}
          >
            Oops!
          </h3>
          <p className="text-white/70 mb-4 text-sm">{error}</p>
          <button
            onClick={() => { setStep('camera'); setError(null); setCapturedImage(null) }}
            className="w-full !bg-red-600 hover:!bg-red-700 text-white py-3 px-6 rounded-xl border-4 border-red-900 shadow-lg transform hover:scale-105 transition-all"
            style={{ ...customFontStyle, letterSpacing: '1px', fontSize: '16px', fontWeight: '900' }}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  )
}
