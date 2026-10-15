import { describe, it, expect } from 'vitest'
import {
  buildMonthlyReport,
  formatMonth,
  isValidMonth,
  monthBounds,
  monthKey,
  monthsThrough,
  nextMonth,
  previousMonth,
  pruneSnapshot,
  renderMonthlyReportText,
} from '@/lib/monthlyReport'
import { toPublicReports, type PublicRow } from '@/lib/publicReport'

const SITE = 'https://example.org'
const NOW = new Date('2026-10-01T13:00:00Z') // the cron moment on Oct 1

function row(over: Partial<PublicRow> & { id: string }): PublicRow {
  return {
    created_at: '2026-03-16T12:00:00Z',
    address: 'Somewhere',
    cross_streets: null,
    pole_id: null,
    latitude: 41.036,
    longitude: -73.599,
    description: 'desc',
    status: 'approved',
    photos: ['https://abc.supabase.co/storage/v1/object/public/p/x.jpg'],
    problem_type: 'Double Poles / Sistered Pole',
    duration: null,
    ...over,
  }
}

const rows: PublicRow[] = [
  row({ id: 'a', created_at: '2026-03-16T12:00:00Z' }),
  row({ id: 'b', created_at: '2026-04-28T12:00:00Z', problem_type: 'Damaged Equipment', photos: [] }),
  row({ id: 'c', created_at: '2026-09-05T12:00:00Z', latitude: 41.023, longitude: -73.565 }),
  row({ id: 'd', created_at: '2026-09-20T12:00:00Z', reported_to: 'Eversource', reported_at: '2026-09-22', official_response: 'Ticket opened', resolved_at: '2026-09-29' }),
  row({ id: 'e', created_at: '2026-10-01T09:00:00Z' }), // after the Sept period, before NOW
  row({ id: 'f', created_at: '2026-09-10T12:00:00Z', status: 'pending' }),
]
const reports = toPublicReports(rows, SITE, NOW.getTime())

describe('month helpers', () => {
  it('validates and formats months', () => {
    expect(isValidMonth('2026-09')).toBe(true)
    expect(isValidMonth('2026-13')).toBe(false)
    expect(isValidMonth('2026-9')).toBe(false)
    expect(formatMonth('2026-09')).toBe('September 2026')
  })
  it('computes keys, previous/next and bounds in UTC', () => {
    expect(monthKey(new Date('2026-01-31T23:59:59Z'))).toBe('2026-01')
    expect(previousMonth(NOW)).toBe('2026-09')
    expect(previousMonth(new Date('2027-01-15T00:00:00Z'))).toBe('2026-12')
    expect(nextMonth('2026-12')).toBe('2027-01')
    const b = monthBounds('2026-09')
    expect(b.start.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(b.end.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(() => monthBounds('nope')).toThrow()
  })
  it('lists months newest first from the first month on record', () => {
    expect(monthsThrough('2026-05')).toEqual(['2026-05', '2026-04', '2026-03'])
  })
})

describe('buildMonthlyReport', () => {
  const d = buildMonthlyReport(reports, '2026-09', NOW)

  it('counts only approved reports that existed by month end', () => {
    expect(d.totals.total).toBe(4) // a, b, c, d (not e: October; not f: pending)
    expect(d.asOf).toBe('2026-10-01T00:00:00.000Z')
    expect(d.label).toBe('September 2026')
  })

  it('finds the new reports for the month, newest first', () => {
    expect(d.newReports.map((r) => r.id)).toEqual(['d', 'c'])
    expect(d.totals.newThisMonth).toBe(2)
  })

  it('ages are as of month end, and oldest is first', () => {
    expect(d.oldest[0].id).toBe('a')
    expect(d.oldest[0].age_days).toBe(198) // Mar 16 12:00 → Oct 1 00:00 is 198.5 days, floored
    expect(d.totals.oldestDays).toBe(198)
  })

  it('groups by type and neighborhood', () => {
    expect(d.byType).toEqual([
      { label: 'Double Poles / Sistered Pole', count: 3 },
      { label: 'Damaged Equipment', count: 1 },
    ])
    expect(d.byNeighborhood).toEqual([
      { label: 'Cos Cob', count: 3 },
      { label: 'Old Greenwich', count: 1 },
    ])
    expect(d.totals.withPhotos).toBe(3)
  })

  it('surfaces recorded official responses and resolutions', () => {
    expect(d.responses).toHaveLength(1)
    expect(d.responses[0]).toMatchObject({ id: 'd', reported_to: 'Eversource', official_response: 'Ticket opened' })
    expect(d.totals.resolvedThisMonth).toBe(1)
  })

  it('uses now as the as-of for an in-progress month', () => {
    const cur = buildMonthlyReport(reports, '2026-10', NOW)
    expect(cur.asOf).toBe(NOW.toISOString())
    expect(cur.totals.total).toBe(5)
    expect(cur.newReports.map((r) => r.id)).toEqual(['e'])
  })

  it('handles an empty month gracefully', () => {
    const empty = buildMonthlyReport([], '2026-03', NOW)
    expect(empty.totals.total).toBe(0)
    expect(empty.oldest).toEqual([])
    expect(empty.totals.oldestDays).toBe(0)
  })
})

describe('renderMonthlyReportText', () => {
  it('produces a plain-text summary with the report link and no markup', () => {
    const txt = renderMonthlyReportText(buildMonthlyReport(reports, '2026-09', NOW), SITE)
    expect(txt).toContain('State of the Poles — September 2026')
    expect(txt).toContain(`${SITE}/reports/2026-09`)
    expect(txt).toContain('4 utility pole problems on the public record')
    expect(txt).toContain("198 days")
    expect(txt).toContain('Official responses recorded: 1.')
    expect(txt).not.toMatch(/<[a-z]/)
  })
  it('says plainly when nothing official has been recorded', () => {
    const txt = renderMonthlyReportText(buildMonthlyReport(reports.filter((r) => r.id !== 'd'), '2026-09', NOW), SITE)
    expect(txt).toContain('No official response has been recorded')
  })
})

describe('pruneSnapshot', () => {
  it('removes lines for reports no longer approved and counts them', () => {
    const d = buildMonthlyReport(reports, '2026-09', NOW)
    const { data, pruned } = pruneSnapshot(d, new Set(['a', 'b', 'c'])) // 'd' was taken down
    expect(pruned).toBe(3) // d appeared in oldest, newReports and responses
    expect(data.oldest.map((r) => r.id)).not.toContain('d')
    expect(data.newReports.map((r) => r.id)).toEqual(['c'])
    expect(data.responses).toEqual([])
    expect(data.totals).toEqual(d.totals) // published totals are kept as published
  })
  it('is a no-op when everything is still approved', () => {
    const d = buildMonthlyReport(reports, '2026-09', NOW)
    const { data, pruned } = pruneSnapshot(d, new Set(['a', 'b', 'c', 'd']))
    expect(pruned).toBe(0)
    expect(data).toEqual(d)
  })
})
