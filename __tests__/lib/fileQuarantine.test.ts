import { describe, it, expect } from 'vitest'
import { validateFile, validateFilesBatch, MAX_FILES, MAX_FILE_BYTES } from '../../lib/fileQuarantine'

// ── Magic byte fixtures ───────────────────────────────────────────────────────

function makeFile(bytes: number[], name: string, type = 'image/jpeg'): File {
  const buffer = Buffer.from(bytes)
  const blob = new Blob([buffer], { type })
  return new File([blob], name, { type })
}

// Pad to at least 12 bytes so all format checks can run
function pad(bytes: number[]): number[] {
  return [...bytes, ...Array(Math.max(0, 12 - bytes.length)).fill(0x00)]
}

const JPEG_MAGIC = pad([0xff, 0xd8, 0xff, 0xe0])
const PNG_MAGIC = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const GIF_MAGIC = pad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) // GIF89a
const WEBP_MAGIC = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]
const HEIC_MAGIC = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63] // ftyp heic

// ── validateFile ──────────────────────────────────────────────────────────────

describe('validateFile — accepted formats', () => {
  it('accepts a JPEG file', async () => {
    const result = await validateFile(makeFile(JPEG_MAGIC, 'photo.jpg', 'image/jpeg'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mimeType).toBe('image/jpeg')
  })

  it('accepts a PNG file', async () => {
    const result = await validateFile(makeFile(PNG_MAGIC, 'photo.png', 'image/png'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mimeType).toBe('image/png')
  })

  it('accepts a GIF file', async () => {
    const result = await validateFile(makeFile(GIF_MAGIC, 'photo.gif', 'image/gif'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mimeType).toBe('image/gif')
  })

  it('accepts a WebP file', async () => {
    const result = await validateFile(makeFile(WEBP_MAGIC, 'photo.webp', 'image/webp'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mimeType).toBe('image/webp')
  })

  it('accepts a HEIC file', async () => {
    const result = await validateFile(makeFile(HEIC_MAGIC, 'photo.heic', 'image/heic'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mimeType).toBe('image/heic')
  })
})

describe('validateFile — magic byte enforcement', () => {
  it('rejects a file with JPEG extension but wrong magic bytes', async () => {
    const result = await validateFile(makeFile(pad([0x00, 0x01, 0x02, 0x03]), 'evil.jpg', 'image/jpeg'))
    expect(result.ok).toBe(false)
  })

  it('rejects a file claiming to be image/jpeg but is actually a ZIP', async () => {
    // ZIP magic: PK (0x50 0x4B)
    const zip = pad([0x50, 0x4b, 0x03, 0x04])
    const result = await validateFile(makeFile(zip, 'not-an-image.jpg', 'image/jpeg'))
    expect(result.ok).toBe(false)
  })

  it('rejects a file with no recognisable image signature', async () => {
    const result = await validateFile(makeFile(pad([0x3c, 0x73, 0x63, 0x72]), 'script.jpg'))
    expect(result.ok).toBe(false)
  })

  it('rejects a file with fewer than 12 bytes', async () => {
    const result = await validateFile(makeFile([0xff, 0xd8], 'tiny.jpg'))
    expect(result.ok).toBe(false)
  })
})

describe('validateFile — size enforcement', () => {
  it('rejects a file over MAX_FILE_BYTES', async () => {
    // Create a file that exceeds the limit by using a large Blob
    const oversized = new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' })
    const result = await validateFile(oversized)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/2 MB/i)
  })

  it('accepts a file right at the size limit with valid magic bytes', async () => {
    // Build a buffer at exactly MAX_FILE_BYTES with a JPEG header
    const buf = new Uint8Array(MAX_FILE_BYTES)
    buf.set([0xff, 0xd8, 0xff, 0xe0])
    const file = new File([buf], 'max.jpg', { type: 'image/jpeg' })
    const result = await validateFile(file)
    expect(result.ok).toBe(true)
  })
})

// ── validateFilesBatch ────────────────────────────────────────────────────────

describe('validateFilesBatch', () => {
  function makeValidJpeg(name = 'photo.jpg'): File {
    return makeFile(JPEG_MAGIC, name, 'image/jpeg')
  }

  it('accepts an empty batch', async () => {
    const result = await validateFilesBatch([])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.validated).toHaveLength(0)
  })

  it('accepts a batch within the file limit', async () => {
    const files = Array.from({ length: MAX_FILES }, (_, i) => makeValidJpeg(`photo${i}.jpg`))
    const result = await validateFilesBatch(files)
    expect(result.ok).toBe(true)
  })

  it(`rejects a batch of more than ${MAX_FILES} files`, async () => {
    const files = Array.from({ length: MAX_FILES + 1 }, (_, i) => makeValidJpeg(`photo${i}.jpg`))
    const result = await validateFilesBatch(files)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/maximum/i)
  })

  it('rejects a batch containing a file with bad magic bytes', async () => {
    const good = makeValidJpeg()
    const bad = makeFile(pad([0x00, 0x01, 0x02, 0x03]), 'evil.jpg')
    const result = await validateFilesBatch([good, bad])
    expect(result.ok).toBe(false)
  })

  it('skips zero-size files', async () => {
    const empty = new File([], 'empty.jpg', { type: 'image/jpeg' })
    const valid = makeValidJpeg()
    const result = await validateFilesBatch([empty, valid])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.validated).toHaveLength(1)
  })
})
