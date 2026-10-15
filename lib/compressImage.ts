/**
 * Client-side image compression using the Canvas API.
 * Resizes and re-encodes photos to JPEG before upload, reducing typical
 * phone photos from 5-10MB to ~200-500KB. Works on all modern mobile
 * browsers (iOS Safari, Chrome Android, Samsung Internet, Firefox).
 *
 * HEIC/WebP/PNG inputs are automatically converted to JPEG by the
 * browser's canvas pipeline — no external libraries required.
 */

const DEFAULT_MAX_DIMENSION = 2048
const DEFAULT_QUALITY = 0.85

/**
 * Compress an image file by resizing and re-encoding as JPEG.
 * Returns the original file if compression fails for any reason.
 */
export async function compressImage(
  file: File,
  options?: { maxDimension?: number; quality?: number }
): Promise<File> {
  const maxDim = options?.maxDimension ?? DEFAULT_MAX_DIMENSION
  const quality = options?.quality ?? DEFAULT_QUALITY

  try {
    const img = await loadImage(file)
    const { width, height } = scaleDimensions(img.naturalWidth, img.naturalHeight, maxDim)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(img, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (!blob) return file

    // Derive a .jpg filename from the original name
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    // Canvas failed (rare) — return original so the upload still works
    return file
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
    img.src = url
  })
}

function scaleDimensions(
  w: number, h: number, maxDim: number
): { width: number; height: number } {
  if (w <= maxDim && h <= maxDim) return { width: w, height: h }
  const ratio = Math.min(maxDim / w, maxDim / h)
  return {
    width: Math.round(w * ratio),
    height: Math.round(h * ratio),
  }
}
