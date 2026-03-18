import { NextRequest, NextResponse } from 'next/server'

/**
 * Upload sticker photo to Pinata IPFS
 * Accepts multipart form data with a single 'file' field
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

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: 'File must be an image' },
        { status: 400 }
      )
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File too large (max 10MB)' },
        { status: 400 }
      )
    }

    const PINATA_JWT = process.env.PINATA_JWT
    if (!PINATA_JWT) {
      console.error('[Sticker Upload] PINATA_JWT not configured')
      return NextResponse.json(
        { success: false, error: 'Upload service not configured' },
        { status: 500 }
      )
    }

    // Upload to Pinata
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
      { success: false, error: 'Failed to upload image' },
      { status: 500 }
    )
  }
}
