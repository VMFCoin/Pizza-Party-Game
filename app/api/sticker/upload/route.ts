import { NextRequest, NextResponse } from 'next/server'
import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library'
import sharp from 'sharp'

const VALID_QR_URLS = [
  'https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party',
  'https://pizza-party-game.vmfcoin.com',
  'https://pizza-party-game.vmfcoin.com/',
]

/**
 * Server-side QR verification using ZXing (handles colorful/artistic QR codes).
 * Tries multiple sizes and crops to find the QR code in real-world photos.
 */
async function verifyQRInImage(buffer: Buffer): Promise<{ valid: boolean; url?: string }> {
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE])
  hints.set(DecodeHintType.TRY_HARDER, true)

  const reader = new MultiFormatReader()
  reader.setHints(hints)

  // Try scanning at different sizes and crops
  const attempts = [
    { width: 800, height: 800 },
    { width: 1200, height: 1200 },
    { width: 600, height: 600 },
    { width: 1500, height: 1500 },
  ]

  for (const size of attempts) {
    try {
      // Full image at this size
      const { data, info } = await sharp(buffer)
        .resize(size.width, size.height, { fit: 'inside', withoutEnlargement: false })
        .grayscale()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      const width = info.width
      const height = info.height

      const luminances = new Uint8ClampedArray(width * height)
      for (let i = 0; i < width * height; i++) {
        luminances[i] = data[i * 4] // Already grayscale, just take R channel
      }

      const source = new RGBLuminanceSource(luminances, width, height)
      const bitmap = new BinaryBitmap(new HybridBinarizer(source))
      const result = reader.decode(bitmap)
      const decoded = result.getText()

      if (decoded && VALID_QR_URLS.some(url => decoded.includes(url) || url.includes(decoded))) {
        return { valid: true, url: decoded }
      }
    } catch {
      // ZXing throws when it can't find a QR code — try next size
    }
  }

  // Try center crop (QR might be in the middle of a wider photo)
  for (const cropPct of [0.5, 0.6, 0.7]) {
    try {
      const metadata = await sharp(buffer).metadata()
      const w = metadata.width || 1000
      const h = metadata.height || 1000
      const cropW = Math.round(w * cropPct)
      const cropH = Math.round(h * cropPct)
      const left = Math.round((w - cropW) / 2)
      const top = Math.round((h - cropH) / 2)

      const { data, info } = await sharp(buffer)
        .extract({ left, top, width: cropW, height: cropH })
        .resize(800, 800, { fit: 'inside' })
        .grayscale()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      const luminances = new Uint8ClampedArray(info.width * info.height)
      for (let i = 0; i < info.width * info.height; i++) {
        luminances[i] = data[i * 4]
      }

      const source = new RGBLuminanceSource(luminances, info.width, info.height)
      const bitmap = new BinaryBitmap(new HybridBinarizer(source))
      const result = reader.decode(bitmap)
      const decoded = result.getText()

      if (decoded && VALID_QR_URLS.some(url => decoded.includes(url) || url.includes(decoded))) {
        return { valid: true, url: decoded }
      }
    } catch {
      // Try next crop
    }
  }

  // Try each quadrant
  try {
    const metadata = await sharp(buffer).metadata()
    const w = metadata.width || 1000
    const h = metadata.height || 1000
    const hw = Math.round(w / 2)
    const hh = Math.round(h / 2)
    const quadrants = [
      { left: 0, top: 0 },
      { left: hw, top: 0 },
      { left: 0, top: hh },
      { left: hw, top: hh },
    ]

    for (const q of quadrants) {
      try {
        const { data, info } = await sharp(buffer)
          .extract({ left: q.left, top: q.top, width: Math.min(hw, w - q.left), height: Math.min(hh, h - q.top) })
          .resize(800, 800, { fit: 'inside' })
          .grayscale()
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })

        const luminances = new Uint8ClampedArray(info.width * info.height)
        for (let i = 0; i < info.width * info.height; i++) {
          luminances[i] = data[i * 4]
        }

        const source = new RGBLuminanceSource(luminances, info.width, info.height)
        const bitmap = new BinaryBitmap(new HybridBinarizer(source))
        const result = reader.decode(bitmap)
        const decoded = result.getText()

        if (decoded && VALID_QR_URLS.some(url => decoded.includes(url) || url.includes(decoded))) {
          return { valid: true, url: decoded }
        }
      } catch {
        // Try next quadrant
      }
    }
  } catch {
    // metadata failed
  }

  return { valid: false }
}

/**
 * Upload sticker photo to Pinata IPFS + verify QR code server-side
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: 'File must be an image' },
        { status: 400 }
      )
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File too large (max 10MB)' },
        { status: 400 }
      )
    }

    // Convert file to buffer for QR verification
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Step 1: Verify QR code server-side using ZXing
    const qrResult = await verifyQRInImage(buffer)
    if (!qrResult.valid) {
      return NextResponse.json(
        { success: false, error: 'No valid Pizza Party QR sticker detected in this photo. Make sure the QR code is clearly visible.' },
        { status: 400 }
      )
    }

    // Step 2: Upload to Pinata
    const PINATA_JWT = process.env.PINATA_JWT
    if (!PINATA_JWT) {
      console.error('[Sticker Upload] PINATA_JWT not configured')
      return NextResponse.json(
        { success: false, error: 'Upload service not configured' },
        { status: 500 }
      )
    }

    const pinataForm = new FormData()
    pinataForm.append('file', file)
    pinataForm.append('pinataMetadata', JSON.stringify({
      name: `sticker-find-${Date.now()}`,
    }))

    const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: pinataForm,
    })

    if (!pinataRes.ok) {
      const errorText = await pinataRes.text()
      console.error('[Sticker Upload] Pinata error:', errorText)
      return NextResponse.json(
        { success: false, error: 'Failed to upload image' },
        { status: 500 }
      )
    }

    const pinataData = await pinataRes.json()
    const ipfsHash = pinataData.IpfsHash
    const imageUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`

    return NextResponse.json({
      success: true,
      imageUrl,
      ipfsHash,
      qrUrl: qrResult.url,
    })
  } catch (error) {
    console.error('[Sticker Upload] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process image' },
      { status: 500 }
    )
  }
}
