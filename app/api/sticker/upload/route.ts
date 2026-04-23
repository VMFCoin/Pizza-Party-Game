import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

export const maxDuration = 30

const VALID_QR_URLS = [
  'https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party',
  'https://pizza-party-game.vmfcoin.com',
  'https://pizza-party-game.vmfcoin.com/',
]

async function patternDensity(buffer: Buffer): Promise<number> {
  const SIZE = 150
  const { data } = await sharp(buffer)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let sum = 0
  for (let i = 0; i < SIZE * SIZE; i++) sum += data[i]
  const mean = sum / (SIZE * SIZE)
  let t = 0
  for (let y = 0; y < SIZE; y++) {
    let p = data[y * SIZE] >= mean ? 1 : 0
    for (let x = 1; x < SIZE; x++) {
      const c = data[y * SIZE + x] >= mean ? 1 : 0
      if (c !== p) t++
      p = c
    }
  }
  for (let x = 0; x < SIZE; x++) {
    let p = data[x] >= mean ? 1 : 0
    for (let y = 1; y < SIZE; y++) {
      const c = data[y * SIZE + x] >= mean ? 1 : 0
      if (c !== p) t++
      p = c
    }
  }
  return t / (SIZE * SIZE * 2)
}

interface ColorSig {
  red: number
  redLoose: number
  black: number
  white: number
}

async function colorSignature(buffer: Buffer): Promise<ColorSig> {
  const SIZE = 80
  const { data, info } = await sharp(buffer)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const ch = info.channels
  let red = 0, redLoose = 0, black = 0, white = 0
  const total = SIZE * SIZE
  for (let i = 0; i < total; i++) {
    const r = data[i * ch]
    const g = data[i * ch + 1]
    const b = data[i * ch + 2]
    if (r > 130 && r > g * 1.4 && r > b * 1.4) red++
    if (r > 100 && r > g * 1.15 && r > b * 1.15) redLoose++
    if (r < 70 && g < 70 && b < 70) black++
    if (r > 200 && g > 200 && b > 200) white++
  }
  return { red: red / total, redLoose: redLoose / total, black: black / total, white: white / total }
}

function strictMatch(d: number, c: ColorSig): { type: string; score: number } | null {
  if (d < 0.07) return null
  const isRed = c.red >= 0.15 && c.black >= 0.04
  const isBw = c.black >= 0.15 && c.white >= 0.30 && c.red < 0.08
  if (isRed) return { type: 'red', score: d * (c.red + c.black) }
  if (isBw) return { type: 'bw', score: d * (c.black + c.white) }
  return null
}

function looseMatch(d: number, c: ColorSig): { type: string; score: number } | null {
  if (d < 0.07) return null
  const isRed = c.redLoose >= 0.10 && c.black >= 0.05
  const isBw = c.black >= 0.20 && c.white >= 0.20 && c.red < 0.10
  if (isRed) return { type: 'red-loose', score: d * (c.redLoose + c.black) }
  if (isBw) return { type: 'bw-loose', score: d * (c.black + c.white) }
  return null
}

async function verifyStickerInPhoto(buffer: Buffer): Promise<boolean> {
  const meta = await sharp(buffer).metadata()
  const inMax = Math.max(meta.width || 1000, meta.height || 1000)
  const scaleDown = inMax > 1500 ? 1500 / inMax : 1
  const small = scaleDown < 1
    ? await sharp(buffer)
        .resize(Math.round((meta.width || 1000) * scaleDown), Math.round((meta.height || 1000) * scaleDown))
        .toBuffer()
    : buffer

  const sMeta = await sharp(small).metadata()
  const w = sMeta.width || 1000
  const h = sMeta.height || 1000
  const minDim = Math.min(w, h)

  const scales = [0.10, 0.15, 0.20, 0.30, 0.50, 1.0]
  const earlyExitScore = 0.05
  let bestStrictScore = 0
  let bestLooseScore = 0

  for (const scale of scales) {
    const cw = Math.round(minDim * scale)
    const ch = cw
    if (cw < 80) continue
    if (cw > Math.min(w, h)) continue
    const grid = scale <= 0.10 ? 7 : scale <= 0.20 ? 5 : scale <= 0.50 ? 3 : 1
    for (let gx = 0; gx < grid; gx++) {
      for (let gy = 0; gy < grid; gy++) {
        const left = grid === 1 ? 0 : Math.max(0, Math.min(Math.round((w - cw) * gx / (grid - 1)), w - cw))
        const top = grid === 1 ? 0 : Math.max(0, Math.min(Math.round((h - ch) * gy / (grid - 1)), h - ch))
        try {
          const crop = await sharp(small).extract({ left, top, width: cw, height: ch }).toBuffer()
          const d = await patternDensity(crop)
          if (d < 0.07) continue
          const c = await colorSignature(crop)
          const ms = strictMatch(d, c)
          if (ms) {
            if (ms.score > bestStrictScore) bestStrictScore = ms.score
            if (ms.score >= earlyExitScore) return true
          } else {
            const ml = looseMatch(d, c)
            if (ml && ml.score > bestLooseScore) bestLooseScore = ml.score
          }
        } catch {}
      }
    }
  }

  return bestStrictScore > 0 || bestLooseScore > 0
}

function isApprovedClientUrl(decoded: string | null | undefined): boolean {
  if (!decoded) return false
  return VALID_QR_URLS.some(url => decoded.includes(url) || url.includes(decoded))
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const clientDecodedUrl = (formData.get('clientDecodedUrl') as string | null) || null

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ success: false, error: 'File must be an image' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'File too large (max 10MB)' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Layer 1: client-decoded QR URL (fastest, most reliable when available)
    let verified = false
    let verifyMethod: 'client-qr' | 'visual' = 'visual'
    if (clientDecodedUrl && isApprovedClientUrl(clientDecodedUrl)) {
      verified = true
      verifyMethod = 'client-qr'
    }

    // Layer 2/3: server-side visual verification (strict + loose cascade)
    if (!verified) {
      verified = await verifyStickerInPhoto(buffer)
    }

    if (!verified) {
      return NextResponse.json(
        { success: false, error: 'No Pizza Party QR sticker detected in this photo. Make sure the sticker is clearly visible!' },
        { status: 400 }
      )
    }

    const PINATA_JWT = process.env.PINATA_JWT
    if (!PINATA_JWT) {
      console.error('[Sticker Upload] PINATA_JWT not configured')
      return NextResponse.json({ success: false, error: 'Upload service not configured' }, { status: 500 })
    }

    const pinataForm = new FormData()
    pinataForm.append('file', file)
    pinataForm.append('pinataMetadata', JSON.stringify({
      name: `sticker-find-${Date.now()}`,
    }))

    const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
      body: pinataForm,
    })

    if (!pinataRes.ok) {
      const errorText = await pinataRes.text()
      console.error('[Sticker Upload] Pinata error:', errorText)
      return NextResponse.json({ success: false, error: 'Failed to upload image' }, { status: 500 })
    }

    const pinataData = await pinataRes.json()
    const ipfsHash = pinataData.IpfsHash
    const imageUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`

    return NextResponse.json({ success: true, imageUrl, ipfsHash, verifyMethod })
  } catch (error) {
    console.error('[Sticker Upload] Error:', error)
    return NextResponse.json({ success: false, error: 'Failed to process image' }, { status: 500 })
  }
}
