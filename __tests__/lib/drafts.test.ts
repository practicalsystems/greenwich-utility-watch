import { describe, it, expect } from 'vitest'
import { generateDrafts, fitsChannel, xLength, graphemeLength, socialPost, CHANNEL_LIMITS } from '@/lib/drafts'
import { buildMonthlyReport } from '@/lib/monthlyReport'
import { toPublicReports, type PublicRow } from '@/lib/publicReport'

const SITE = 'https://greenwichutilitywatch.org'
const NOW = new Date('2026-10-01T13:00:00Z')

function row(i: number, over: Partial<PublicRow> = {}): PublicRow {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    created_at: `2026-0${(i % 6) + 3}-1${i % 9}T12:00:00Z`,
    address: `${10 + i} Loughlin Avenue`,
    cross_streets: null,
    pole_id: null,
    latitude: 41.036,
    longitude: -73.599,
    description: 'desc',
    status: 'approved',
    photos: [],
    problem_type: i % 3 === 0 ? 'Double Poles / Sistered Pole' : 'Leaning or Unstable Pole',
    duration: null,
    ...over,
  }
}

const reports = toPublicReports(Array.from({ length: 15 }, (_, i) => row(i)), SITE, NOW.getTime())
const data = buildMonthlyReport(reports, '2026-09', NOW)

describe('generateDrafts', () => {
  const drafts = generateDrafts(data, SITE)

  it('produces one draft per channel, each within its limit', () => {
    expect(drafts.map((d) => d.channel)).toEqual(['bluesky', 'x', 'association'])
    for (const d of drafts) expect(fitsChannel(d.channel, d.body)).toBe(true)
  })

  it('every draft links to the report and never names a person or leaves a placeholder', () => {
    for (const d of drafts) {
      expect(d.body).toContain(`${SITE}/reports/2026-09`)
      expect(d.body).not.toMatch(/\[(name|phone|contact|confirm|N)\]/i)
      expect(d.body).not.toMatch(/\bChris\b/)
      expect(d.body).not.toMatch(/\bI\b|\bmy\b|\bme\b/) // the project speaks, not a person
    }
  })

  it('social posts carry the headline numbers', () => {
    const bsky = drafts.find((d) => d.channel === 'bluesky')!.body
    expect(bsky).toContain('State of the Poles, September 2026:')
    expect(bsky).toMatch(/\d+ problem utility poles on the Greenwich public record/)
    expect(bsky).toMatch(/oldest has waited \d+ days/)
  })

  it('the association note signs as the project with the civic address', () => {
    const note = drafts.find((d) => d.channel === 'association')!.body
    expect(note).toContain('Greenwich Utility Watch\ncontact@greenwichutilitywatch.org')
    expect(note).toContain(`${SITE}/badge`)
    expect(note).toContain('not affiliated with any utility or the Town')
  })
})

describe('length rules', () => {
  it('xLength counts URLs as 23', () => {
    expect(xLength('see https://example.org/a/very/long/path/indeed/that/goes/on now')).toBe('see '.length + 23 + ' now'.length)
  })
  it('graphemeLength counts emoji as one', () => {
    expect(graphemeLength('a👍🏽b')).toBe(3)
  })
  it('socialPost trims optional lines to fit a tight limit but keeps the link', () => {
    const big = { ...data, totals: { ...data.totals, total: 123456, newThisMonth: 9999, oldestDays: 99999 }, responses: [data.responses[0] ?? { id: 'x', url: 'u', location: 'l', neighborhood: 'n', problem_type: null, created_at: '', age_days: 1, photo: null, reported_to: 'Eversource', reported_at: null, official_response: null, resolved_at: null }] }
    const post = socialPost(big, SITE, CHANNEL_LIMITS.x)
    expect(xLength(post)).toBeLessThanOrEqual(CHANNEL_LIMITS.x)
    expect(post).toContain(`${SITE}/reports/2026-09`)
  })
})
