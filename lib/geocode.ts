/**
 * Geocoding utilities using the Nominatim OpenStreetMap API.
 * Free to use with reasonable request rates; results biased toward Greenwich, CT.
 * Nominatim terms of use: https://operations.osmfoundation.org/policies/nominatim/
 */

export type GeocodeResult = {
  place_id: number
  display_name: string
  lat: string
  lon: string
  address: {
    house_number?: string
    road?: string
    neighbourhood?: string
    city?: string
    town?: string
    village?: string
    state?: string
    postcode?: string
  }
}

// Nominatim viewbox format: west,north,east,south
const GREENWICH_VIEWBOX = '-73.85,41.15,-73.45,40.95'
const NOMINATIM_HEADERS = { 'Accept-Language': 'en-US,en' }

/** Search for addresses matching `query`, biased toward Greenwich CT. */
export async function searchAddress(query: string): Promise<GeocodeResult[]> {
  if (query.trim().length < 3) return []
  const params = new URLSearchParams({
    q: `${query}, Greenwich, CT`,
    format: 'json',
    addressdetails: '1',
    countrycodes: 'us',
    viewbox: GREENWICH_VIEWBOX,
    bounded: '0',
    limit: '5',
  })
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: NOMINATIM_HEADERS,
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

/** Reverse geocode lat/lng to a structured result. */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lng.toString(),
    format: 'json',
    addressdetails: '1',
  })
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: NOMINATIM_HEADERS,
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

/** Build a short street address from a geocoding result. */
export function formatAddress(result: GeocodeResult): string {
  const { house_number, road } = result.address
  if (road) return [house_number, road].filter(Boolean).join(' ')
  // Fall back to the first segment of the full display name
  return result.display_name.split(',')[0].trim()
}
