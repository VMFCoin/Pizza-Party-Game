import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'

/**
 * Generate a simple perceptual hash (average hash) for an image region.
 * Returns a 64-bit hash as a hex string.
 */
async function getImageHash(buffer: Buffer): Promise<string> {
  // Resize to 8x8, convert to grayscale
  const { data } = await sharp(buffer)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Calculate average pixel value
  let sum = 0
  for (let i = 0; i < 64; i++) sum += data[i]
  const avg = sum / 64

  // Generate hash: 1 if above average, 0 if below
  let hash = ''
  for (let i = 0; i < 64; i++) {
    hash += data[i] >= avg ? '1' : '0'
  }

  return hash
}

/**
 * Compare two hashes — returns similarity as 0-1 (1 = identical)
 */
function hashSimilarity(hash1: string, hash2: string): number {
  let matches = 0
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] === hash2[i]) matches++
  }
  return matches / hash1.length
}

/**
 * Check if the uploaded photo contains a Pizza Party sticker.
 * Uses perceptual hashing to compare against known sticker reference images.
 * Also checks for dominant red color which all our stickers share.
 */
async function verifyStickerInPhoto(photoBuffer: Buffer): Promise<boolean> {
  // Load reference sticker images
  const publicDir = path.join(process.cwd(), 'public', 'images')
  const referenceFiles = [
    'pizza-party-qr.png',
    'pizza_party_BW_qr.png',
    'pizzaparty.com-qr.png',
    'pizza_party_BW_vmfcoin_qr.png',
  ]

  const referenceHashes: string[] = []
  for (const file of referenceFiles) {
    const filePath = path.join(publicDir, file)
    if (fs.existsSync(filePath)) {
      const refBuffer = fs.readFileSync(filePath)
      const hash = await getImageHash(refBuffer)
      referenceHashes.push(hash)
    }
  }

  // Try matching the full photo and various crops against reference stickers
  const photoHash = await getImageHash(photoBuffer)

  // Check full photo similarity
  for (const refHash of referenceHashes) {
    const sim = hashSimilarity(photoHash, refHash)
    if (sim >= 0.65) return true
  }

  // Try center crops at various sizes (sticker is usually the main subject)
  const metadata = await sharp(photoBuffer).metadata()
  const w = metadata.width || 1000
  const h = metadata.height || 1000

  const crops = [
    { pct: 0.5 }, // center 50%
    { pct: 0.6 }, // center 60%
    { pct: 0.7 }, // center 70%
    { pct: 0.4 }, // center 40%
  ]

  for (const crop of crops) {
    const cropW = Math.round(w * crop.pct)
    const cropH = Math.round(h * crop.pct)
    const left = Math.round((w - cropW) / 2)
    const top = Math.round((h - cropH) / 2)

    try {
      const croppedBuffer = await sharp(photoBuffer)
        .extract({ left, top, width: cropW, height: cropH })
        .toBuffer()

      const cropHash = await getImageHash(croppedBuffer)

      for (const refHash of referenceHashes) {
        const sim = hashSimilarity(cropHash, refHash)
        if (sim >= 0.60) return true
      }
    } catch {
      // skip invalid crop
    }
  }

  // Try quadrants
  const hw = Math.round(w / 2)
  const hh = Math.round(h / 2)
  const quadrants = [
    { left: 0, top: 0 },
    { left: Math.min(hw, w - 1), top: 0 },
    { left: 0, top: Math.min(hh, h - 1) },
    { left: Math.min(hw, w - 1), top: Math.min(hh, h - 1) },
  ]

  for (const q of quadrants) {
    try {
      const qw = Math.min(hw, w - q.left)
      const qh = Math.min(hh, h - q.top)
      if (qw <= 0 || qh <= 0) continue

      const quadBuffer = await sharp(photoBuffer)
        .extract({ left: q.left, top: q.top, width: qw, height: qh })
        .toBuffer()

      const quadHash = await getImageHash(quadBuffer)

      for (const refHash of referenceHashes) {
        const sim = hashSimilarity(quadHash, refHash)
        if (sim >= 0.60) return true
      }
    } catch {
      // skip invalid quadrant
    }
  }

  // Fallback: check for dominant red color (all our stickers have red backgrounds)
  // Sample a center region and check if red is dominant
  try {
    const centerW = Math.round(w * 0.5)
    const centerH = Math.round(h * 0.5)
    const centerLeft = Math.round((w - centerW) / 2)
    const centerTop = Math.round((h - centerH) / 2)

    const { data: colorData, info: colorInfo } = await sharp(photoBuffer)
      .extract({ left: centerLeft, top: centerTop, width: centerW, height: centerH })
      .resize(50, 50, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const channels = colorInfo.channels
    let redPixels = 0
    const totalPixels = 50 * 50

    for (let i = 0; i < totalPixels; i++) {
      const r = colorData[i * channels]
      const g = colorData[i * channels + 1]
      const b = colorData[i * channels + 2]
      // Check if pixel is "red-ish" (high red, lower green and blue)
      if (r > 150 && r > g * 1.5 && r > b * 1.5) {
        redPixels++
      }
    }

    const redRatio = redPixels / totalPixels
    // If >25% of center pixels are red, likely contains a sticker
    if (redRatio > 0.25) return true
  } catch {
    // color check failed
  }

  return false
}

/**
 * Upload sticker photo to Pinata IPFS with sticker verification.
 * Verifies the photo contains a Pizza Party sticker using perceptual hashing
 * and color analysis — no QR code scanning needed.
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

    // Convert to buffer for verification
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Verify the photo contains a Pizza Party sticker
    const isValidSticker = await verifyStickerInPhoto(buffer)
    if (!isValidSticker) {
      return NextResponse.json(
        { success: false, error: 'No Pizza Party sticker detected in this photo. Make sure the sticker is clearly visible!' },
        { status: 400 }
      )
    }

    // Upload to Pinata
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
    })
  } catch (error) {
    console.error('[Sticker Upload] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process image' },
      { status: 500 }
    )
  }
}
