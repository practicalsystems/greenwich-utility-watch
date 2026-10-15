import { describe, it, expect } from 'vitest'
import { neighborhoodFor, NEIGHBORHOODS } from '@/lib/neighborhoods'

describe('neighborhoodFor', () => {
  it('returns Unknown without coordinates', () => {
    expect(neighborhoodFor(null, null)).toBe('Unknown')
    expect(neighborhoodFor(41.03, undefined)).toBe('Unknown')
    expect(neighborhoodFor(NaN, -73.6)).toBe('Unknown')
  })

  it('assigns village centres to themselves', () => {
    expect(neighborhoodFor(41.036, -73.599)).toBe('Cos Cob')
    expect(neighborhoodFor(41.033, -73.581)).toBe('Riverside')
    expect(neighborhoodFor(41.023, -73.565)).toBe('Old Greenwich')
    expect(neighborhoodFor(41.004, -73.656)).toBe('Byram')
    expect(neighborhoodFor(41.03, -73.627)).toBe('Central Greenwich')
  })

  it('treats everything north of the Merritt as backcountry', () => {
    expect(neighborhoodFor(41.09, -73.63)).toBe('Backcountry')
    expect(neighborhoodFor(41.12, -73.58)).toBe('Backcountry')
  })

  it('assigns a known Cos Cob street (Loughlin Ave) to Cos Cob', () => {
    expect(neighborhoodFor(41.0315, -73.6005)).toBe('Cos Cob')
  })

  it('only ever returns a listed name or Unknown', () => {
    const names = new Set<string>([...NEIGHBORHOODS, 'Unknown'])
    for (let lat = 40.95; lat <= 41.15; lat += 0.013) {
      for (let lng = -73.85; lng <= -73.45; lng += 0.017) {
        expect(names.has(neighborhoodFor(lat, lng))).toBe(true)
      }
    }
  })
})
