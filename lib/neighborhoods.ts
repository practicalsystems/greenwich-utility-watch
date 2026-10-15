/**
 * Derive an approximate Greenwich neighborhood from GPS coordinates.
 *
 * Greenwich is a federation of distinct villages, and the monthly report,
 * export and badge all group by neighborhood. There is no authoritative
 * polygon set for these names, so this uses nearest-centroid assignment with
 * one latitude rule (north of the Merritt Parkway is "backcountry"). It is
 * deliberately coarse and labelled "approximate" wherever it is shown.
 *
 * Centroids are rough village centres read off OpenStreetMap. Adjust them if
 * a report is obviously mis-assigned; every consumer goes through this file.
 */

export const NEIGHBORHOODS = [
  'Byram',
  'Pemberwick / Glenville',
  'Belle Haven',
  'Central Greenwich',
  'Cos Cob',
  'Riverside',
  'Old Greenwich',
  'Backcountry',
] as const

export type Neighborhood = (typeof NEIGHBORHOODS)[number] | 'Unknown'

const CENTROIDS: ReadonlyArray<{ name: Neighborhood; lat: number; lng: number }> = [
  { name: 'Byram', lat: 41.004, lng: -73.656 },
  { name: 'Pemberwick / Glenville', lat: 41.04, lng: -73.663 },
  { name: 'Belle Haven', lat: 41.012, lng: -73.64 },
  { name: 'Central Greenwich', lat: 41.03, lng: -73.627 },
  { name: 'Cos Cob', lat: 41.036, lng: -73.599 },
  { name: 'Riverside', lat: 41.033, lng: -73.581 },
  { name: 'Old Greenwich', lat: 41.023, lng: -73.565 },
]

/** Everything north of this latitude (roughly the Merritt Parkway) is backcountry. */
const BACKCOUNTRY_LAT = 41.07

export function neighborhoodFor(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): Neighborhood {
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return 'Unknown'
  }
  if (latitude >= BACKCOUNTRY_LAT) return 'Backcountry'

  let best: Neighborhood = 'Unknown'
  let bestDist = Infinity
  for (const c of CENTROIDS) {
    // Scale longitude by cos(lat) so east-west and north-south distances compare fairly.
    const dLat = latitude - c.lat
    const dLng = (longitude - c.lng) * Math.cos((latitude * Math.PI) / 180)
    const d = dLat * dLat + dLng * dLng
    if (d < bestDist) {
      bestDist = d
      best = c.name
    }
  }
  return best
}
