import { describe, it, expect } from 'vitest'
import {
  toPublicReport,
  toPublicReports,
  summarizeReports,
  oldestReports,
  ageInDays,
  PUBLIC_COLUMNS,
  UNCATEGORIZED_LABEL,
  type PublicRow,
} from '@/lib/publicReport'

const SITE = 'https://example.org'
const NOW = Date.UTC(2026, 9, 14) // 2026-10-14

function row(over: Partial<PublicRow> = {}): PublicRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    created_at: '2026-03-16T12:00:00.000Z',
    address: '12 Loughlin Ave',
    cross_streets: null,
    pole_id: '4521',
    latitude: 41.0315,
    longitude: -73.6005,
    description: 'Two poles held together with rope.',
    status: 'approved',
    photos: ['https://abc.supabase.co/storage/v1/object/public/submission-photos/a.jpg'],
    problem_type: 'Double Poles / Sistered Pole',
    duration: 'More than a year',
    ...over,
  }
}

describe('PUBLIC_COLUMNS', () => {
  it('never includes submitter or admin columns', () => {
    for (const forbidden of ['submitter_name', 'submitter_email', 'admin_notes']) {
      expect(PUBLIC_COLUMNS).not.toContain(forbidden)
    }
  })
})

describe('toPublicReport', () => {
  it('derives location, neighborhood, age and permalink', () => {
    const r = toPublicReport(row(), SITE, NOW)
    expect(r.location).toBe('12 Loughlin Ave')
    expect(r.neighborhood).toBe('Cos Cob')
    expect(r.age_days).toBe(ageInDays('2026-03-16T12:00:00.000Z', NOW))
    expect(r.age_days).toBeGreaterThan(200)
    expect(r.url).toBe(`${SITE}/poles/11111111-1111-4111-8111-111111111111`)
  })

  it('drops photo URLs that are not from Supabase storage', () => {
    const r = toPublicReport(
      row({ photos: ['https://evil.example/x.jpg', 'https://abc.supabase.co/storage/v1/object/public/p/b.jpg'] }),
      SITE,
      NOW
    )
    expect(r.photos).toEqual(['https://abc.supabase.co/storage/v1/object/public/p/b.jpg'])
  })

  it('falls back to GPS text when there is no address', () => {
    const r = toPublicReport(row({ address: null }), SITE, NOW)
    expect(r.location).toMatch(/^GPS: 41\.03150, -73\.60050$/)
  })

  it('does not carry any non-public field', () => {
    const r = toPublicReport({ ...row(), submitter_email: 'x@y.z' } as PublicRow, SITE, NOW)
    expect(JSON.stringify(r)).not.toContain('x@y.z')
  })
})

describe('toPublicReports', () => {
  it('filters out anything not approved even if selected', () => {
    const out = toPublicReports([row(), row({ id: 'b', status: 'pending' }), row({ id: 'c', status: 'rejected' })], SITE, NOW)
    expect(out.map((r) => r.id)).toEqual([row().id])
  })
})

describe('ageInDays', () => {
  it('floors to whole days and never goes negative', () => {
    expect(ageInDays('2026-10-13T00:00:00Z', NOW)).toBe(1)
    expect(ageInDays('2026-10-13T23:00:00Z', NOW)).toBe(0)
    expect(ageInDays('2027-01-01T00:00:00Z', NOW)).toBe(0)
    expect(ageInDays('garbage', NOW)).toBe(0)
  })
})

describe('summarizeReports / oldestReports', () => {
  const reports = toPublicReports(
    [
      row({ id: 'a', created_at: '2026-03-16T00:00:00Z' }),
      row({ id: 'b', created_at: '2026-04-01T00:00:00Z', problem_type: null, photos: [] }),
      row({ id: 'c', created_at: '2026-04-28T00:00:00Z', latitude: 41.023, longitude: -73.565 }),
    ],
    SITE,
    NOW
  )

  it('counts totals, photos, gps and picks oldest/newest', () => {
    const s = summarizeReports(reports)
    expect(s.total).toBe(3)
    expect(s.withPhotos).toBe(2)
    expect(s.withGps).toBe(3)
    expect(s.oldest?.id).toBe('a')
    expect(s.newest?.id).toBe('c')
  })

  it('groups by type with an explicit label for uncategorized, and by neighborhood', () => {
    const s = summarizeReports(reports)
    expect(s.byType).toEqual([
      { label: 'Double Poles / Sistered Pole', count: 2 },
      { label: UNCATEGORIZED_LABEL, count: 1 },
    ])
    expect(s.byNeighborhood).toEqual([
      { label: 'Cos Cob', count: 2 },
      { label: 'Old Greenwich', count: 1 },
    ])
  })

  it('handles an empty set', () => {
    const s = summarizeReports([])
    expect(s.total).toBe(0)
    expect(s.oldest).toBeNull()
    expect(s.byType).toEqual([])
  })

  it('returns the n oldest, oldest first', () => {
    expect(oldestReports(reports, 2).map((r) => r.id)).toEqual(['a', 'b'])
  })
})
