/**
 * Minimal EXIF GPS extractor for JPEG images.
 * Reads GPS latitude/longitude from photo EXIF metadata entirely client-side.
 */

export type ExifGps = { lat: number; lng: number }

/** Extract GPS coordinates from a JPEG File, or return null if unavailable. */
export async function extractExifGps(file: File): Promise<ExifGps | null> {
  try {
    const buf = await file.slice(0, 128 * 1024).arrayBuffer() // read first 128KB (EXIF is near the start)
    return parseJpegGps(new DataView(buf))
  } catch {
    return null
  }
}

function parseJpegGps(view: DataView): ExifGps | null {
  // Verify JPEG SOI marker
  if (view.byteLength < 14 || view.getUint16(0) !== 0xFFD8) return null

  // Scan for APP1 (EXIF) marker
  let offset = 2
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset)
    if (marker === 0xFFE1) {
      // Found APP1
      const exifOffset = offset + 4
      // Check for "Exif\0\0" header
      if (
        view.getUint8(exifOffset) === 0x45 && // E
        view.getUint8(exifOffset + 1) === 0x78 && // x
        view.getUint8(exifOffset + 2) === 0x69 && // i
        view.getUint8(exifOffset + 3) === 0x66 && // f
        view.getUint8(exifOffset + 4) === 0x00 &&
        view.getUint8(exifOffset + 5) === 0x00
      ) {
        return parseTiff(view, exifOffset + 6)
      }
      return null
    }
    if ((marker & 0xFF00) !== 0xFF00) return null // not a valid marker
    const segLen = view.getUint16(offset + 2)
    offset += 2 + segLen
  }
  return null
}

function parseTiff(view: DataView, tiffStart: number): ExifGps | null {
  if (tiffStart + 8 > view.byteLength) return null

  const endian = view.getUint16(tiffStart)
  const le = endian === 0x4949 // little-endian ("II")
  if (!le && endian !== 0x4D4D) return null // must be "II" or "MM"

  const g16 = (o: number) => view.getUint16(tiffStart + o, le)
  const g32 = (o: number) => view.getUint32(tiffStart + o, le)

  // Verify TIFF magic number
  if (g16(2) !== 0x002A) return null

  const ifd0Offset = g32(4)

  // Find the GPS IFD pointer in IFD0
  const gpsIfdOffset = findTag(view, tiffStart, le, ifd0Offset, 0x8825) // GPSInfoIFDPointer
  if (gpsIfdOffset === null) return null

  // Parse GPS IFD entries
  return parseGpsIfd(view, tiffStart, le, gpsIfdOffset)
}

/** Find a tag value (assumed LONG) in an IFD, return null if not found. */
function findTag(
  view: DataView, tiffStart: number, le: boolean, ifdOffset: number, targetTag: number
): number | null {
  const abs = tiffStart + ifdOffset
  if (abs + 2 > view.byteLength) return null
  const count = view.getUint16(abs, le)
  for (let i = 0; i < count; i++) {
    const entryOffset = abs + 2 + i * 12
    if (entryOffset + 12 > view.byteLength) return null
    const tag = view.getUint16(entryOffset, le)
    if (tag === targetTag) {
      return view.getUint32(entryOffset + 8, le)
    }
  }
  return null
}

function parseGpsIfd(
  view: DataView, tiffStart: number, le: boolean, gpsOffset: number
): ExifGps | null {
  const abs = tiffStart + gpsOffset
  if (abs + 2 > view.byteLength) return null
  const count = view.getUint16(abs, le)

  let latRef = '', lngRef = ''
  let latRationals: number[] | null = null
  let lngRationals: number[] | null = null

  for (let i = 0; i < count; i++) {
    const entryOffset = abs + 2 + i * 12
    if (entryOffset + 12 > view.byteLength) break
    const tag = view.getUint16(entryOffset, le)
    const type = view.getUint16(entryOffset + 2, le)

    switch (tag) {
      case 0x0001: // GPSLatitudeRef
        latRef = String.fromCharCode(view.getUint8(entryOffset + 8))
        break
      case 0x0002: // GPSLatitude (3 RATIONAL values)
        if (type === 5) latRationals = readRationals(view, tiffStart, le, entryOffset)
        break
      case 0x0003: // GPSLongitudeRef
        lngRef = String.fromCharCode(view.getUint8(entryOffset + 8))
        break
      case 0x0004: // GPSLongitude (3 RATIONAL values)
        if (type === 5) lngRationals = readRationals(view, tiffStart, le, entryOffset)
        break
    }
  }

  if (!latRationals || !lngRationals || !latRef || !lngRef) return null

  let lat = latRationals[0] + latRationals[1] / 60 + latRationals[2] / 3600
  let lng = lngRationals[0] + lngRationals[1] / 60 + lngRationals[2] / 3600

  if (latRef === 'S') lat = -lat
  if (lngRef === 'W') lng = -lng

  // Sanity check — valid coordinates
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null

  return { lat, lng }
}

/** Read 3 RATIONAL (unsigned) values from the offset pointed to by an IFD entry. */
function readRationals(
  view: DataView, tiffStart: number, le: boolean, entryOffset: number
): number[] | null {
  const dataOffset = tiffStart + view.getUint32(entryOffset + 8, le)
  if (dataOffset + 24 > view.byteLength) return null
  const values: number[] = []
  for (let i = 0; i < 3; i++) {
    const num = view.getUint32(dataOffset + i * 8, le)
    const den = view.getUint32(dataOffset + i * 8 + 4, le)
    if (den === 0) return null
    values.push(num / den)
  }
  return values
}
