/**
 * File quarantine system for uploaded photos.
 *
 * Every uploaded file goes through a validation pipeline before it is
 * accepted. Only files that pass ALL checks are forwarded to storage.
 *
 * Pipeline:
 *   1. Count limit  — reject batch if more than MAX_FILES files are sent
 *   2. Size limit   — reject any individual file over MAX_FILE_BYTES
 *   3. Magic bytes  — read the actual file header and confirm it matches a
 *                     known safe image format, regardless of the declared
 *                     MIME type or file extension (both are attacker-controlled)
 *
 * Why magic bytes?
 * A malicious actor can rename "exploit.php" to "photo.jpg" and set
 * Content-Type: image/jpeg. Extension and MIME checks are trivially bypassed.
 * Only the raw byte signature embedded by the encoder is reliable.
 *
 * Future hardening (requires additional infrastructure):
 *   - Async virus/malware scanning (e.g. ClamAV webhook) with a true two-bucket
 *     quarantine: upload to a private "quarantine" bucket → scan → promote to
 *     the public bucket on pass or delete on fail.
 *   - Image re-encoding (strip EXIF, re-compress via Sharp) to neutralise
 *     pixel-flood and polyglot-image attacks.
 */

export const MAX_FILES = 5
export const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MB per file (photos are compressed client-side)

/** Magic-byte signatures for accepted image formats. */
const SIGNATURES: Array<{ label: string; mimeType: string; check: (b: Buffer) => boolean }> = [
  {
    label: 'JPEG',
    mimeType: 'image/jpeg',
    check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    label: 'PNG',
    mimeType: 'image/png',
    check: (b) =>
      b[0] === 0x89 &&
      b[1] === 0x50 && // P
      b[2] === 0x4e && // N
      b[3] === 0x47 && // G
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    label: 'GIF',
    mimeType: 'image/gif',
    check: (b) =>
      b[0] === 0x47 && // G
      b[1] === 0x49 && // I
      b[2] === 0x46 && // F
      b[3] === 0x38,   // 8
  },
  {
    label: 'WebP',
    mimeType: 'image/webp',
    // RIFF....WEBP
    check: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,  // WEBP
  },
  {
    label: 'HEIC/HEIF',
    mimeType: 'image/heic',
    // ISO Base Media File Format: bytes 4-7 are "ftyp", bytes 8-11 are the brand
    check: (b) => {
      if (b.length < 12) return false
      const ftyp =
        b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 // ftyp
      if (!ftyp) return false
      const brand = b.slice(8, 12).toString('ascii')
      return ['heic', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'MiHE', 'MiPr'].includes(brand)
    },
  },
]

export type QuarantineResult =
  | { ok: true; buffer: Buffer; mimeType: string; ext: string }
  | { ok: false; error: string }

/**
 * Validate a single File object.
 * Returns the file buffer and the canonical MIME type on success,
 * or an error string on failure.
 */
export async function validateFile(file: File): Promise<QuarantineResult> {
  // Size check
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `File "${truncateName(file.name)}" exceeds the 2 MB size limit.`,
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Magic-byte check — need at least 12 bytes to identify any format we support
  if (buffer.length < 12) {
    return { ok: false, error: `File "${truncateName(file.name)}" is too small to be a valid image.` }
  }

  const match = SIGNATURES.find((sig) => sig.check(buffer))
  if (!match) {
    return {
      ok: false,
      error: `File "${truncateName(file.name)}" is not a recognised image format (expected JPEG, PNG, GIF, WebP, or HEIC).`,
    }
  }

  const ext = extensionForMime(match.mimeType)
  return { ok: true, buffer, mimeType: match.mimeType, ext }
}

/**
 * Validate a batch of files from FormData.
 * Returns validated files or the first error encountered.
 */
export async function validateFilesBatch(
  files: File[]
): Promise<
  | { ok: true; validated: Array<{ buffer: Buffer; mimeType: string; ext: string }> }
  | { ok: false; error: string }
> {
  const nonEmpty = files.filter((f) => f.size > 0)

  if (nonEmpty.length > MAX_FILES) {
    return { ok: false, error: `Maximum ${MAX_FILES} photos allowed.` }
  }

  const validated: Array<{ buffer: Buffer; mimeType: string; ext: string }> = []

  for (const file of nonEmpty) {
    const result = await validateFile(file)
    if (!result.ok) return { ok: false, error: result.error }
    validated.push({ buffer: result.buffer, mimeType: result.mimeType, ext: result.ext })
  }

  return { ok: true, validated }
}

function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
  }
  return map[mime] ?? 'jpg'
}

/** Prevent excessively long filenames in error messages. */
function truncateName(name: string): string {
  return name.length > 40 ? name.slice(0, 37) + '...' : name
}
