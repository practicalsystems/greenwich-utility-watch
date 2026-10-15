/**
 * "State of the Poles" monthly report, computed from the public record.
 *
 * Pure functions only. The cron route (app/api/cron/monthly-report) loads
 * the approved reports, calls buildMonthlyReport, stores the result as a
 * snapshot, and the /reports pages render either the snapshot or a live
 * computation through the same type. Keeping the build pure means the whole
 * report is unit-tested against fixtures.
 */

import {
  ageInDays,
  oldestReports,
  summarizeReports,
  type CountEntry,
  type PublicReport,
} from '@/lib/publicReport'

export const FIRST_MONTH = '2026-03' // first report on the record

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isValidMonth(m: string): boolean {
  return MONTH_RE.test(m)
}

/** 'YYYY-MM' in UTC for a date. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** The month before the one containing `now` (what the cron publishes on the 1st). */
export function previousMonth(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return monthKey(d)
}

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return monthKey(new Date(Date.UTC(y, m, 1)))
}

/** [start, end) bounds of a month as UTC instants. */
export function monthBounds(month: string): { start: Date; end: Date } {
  if (!isValidMonth(month)) throw new Error(`Invalid month: ${month}`)
  const [y, m] = month.split('-').map(Number)
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) }
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

/** Every month from FIRST_MONTH through `through`, newest first. */
export function monthsThrough(through: string): string[] {
  const out: string[] = []
  let m = FIRST_MONTH
  while (m <= through) {
    out.push(m)
    m = nextMonth(m)
  }
  return out.reverse()
}

export interface ReportLine {
  id: string
  url: string
  location: string
  neighborhood: string
  problem_type: string | null
  created_at: string
  age_days: number
  photo: string | null
}

export interface ResponseLine extends ReportLine {
  reported_to: string | null
  reported_at: string | null
  official_response: string | null
  resolved_at: string | null
}

export interface MonthlyReportData {
  version: 1
  month: string
  /** Human label, e.g. "September 2026". */
  label: string
  /** ISO instant the numbers are as of (end of month, or generation time for the current month). */
  asOf: string
  totals: {
    total: number
    newThisMonth: number
    withPhotos: number
    withGps: number
    oldestDays: number
    resolvedThisMonth: number
  }
  byType: CountEntry[]
  byNeighborhood: CountEntry[]
  oldest: ReportLine[]
  newReports: ReportLine[]
  responses: ResponseLine[]
}

function line(r: PublicReport, asOf: number): ReportLine {
  return {
    id: r.id,
    url: r.url,
    location: r.location,
    neighborhood: r.neighborhood,
    problem_type: r.problem_type,
    created_at: r.created_at,
    age_days: ageInDays(r.created_at, asOf),
    photo: r.photos[0] ?? null,
  }
}

function inMonth(iso: string | null | undefined, start: Date, end: Date): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= start.getTime() && t < end.getTime()
}

/**
 * Build the report for `month` from every approved report, as of the end of
 * that month (or `now`, if the month is still in progress).
 */
export function buildMonthlyReport(
  reports: PublicReport[],
  month: string,
  now: Date = new Date()
): MonthlyReportData {
  const { start, end } = monthBounds(month)
  const asOfMs = Math.min(end.getTime(), now.getTime())
  const asOf = new Date(asOfMs)

  // Only reports that existed by the as-of instant count.
  const existing = reports.filter((r) => new Date(r.created_at).getTime() < asOfMs)
  const summary = summarizeReports(existing)
  const oldest = oldestReports(existing, 10).map((r) => line(r, asOfMs))
  const newReports = existing
    .filter((r) => inMonth(r.created_at, start, end))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((r) => line(r, asOfMs))

  const responses: ResponseLine[] = existing
    .filter((r) => r.reported_to || r.official_response || r.resolved_at)
    .sort((a, b) => (b.reported_at ?? b.created_at).localeCompare(a.reported_at ?? a.created_at))
    .map((r) => ({
      ...line(r, asOfMs),
      reported_to: r.reported_to ?? null,
      reported_at: r.reported_at ?? null,
      official_response: r.official_response ?? null,
      resolved_at: r.resolved_at ?? null,
    }))

  const resolvedThisMonth = existing.filter((r) =>
    r.resolved_at ? inMonth(`${r.resolved_at}T00:00:00Z`, start, end) : false
  ).length

  return {
    version: 1,
    month,
    label: formatMonth(month),
    asOf: asOf.toISOString(),
    totals: {
      total: summary.total,
      newThisMonth: newReports.length,
      withPhotos: summary.withPhotos,
      withGps: summary.withGps,
      oldestDays: summary.oldest ? ageInDays(summary.oldest.created_at, asOfMs) : 0,
      resolvedThisMonth,
    },
    byType: summary.byType,
    byNeighborhood: summary.byNeighborhood,
    oldest,
    newReports,
    responses,
  }
}

/**
 * Drop lines for reports that are no longer approved (rejected or deleted
 * after the snapshot was taken). A snapshot is a record of what was
 * published, but a takedown must win: the stored totals stay as published,
 * the per-report lines are filtered at render time, and `pruned` says how
 * many were removed so the page can footnote it.
 */
export function pruneSnapshot(
  d: MonthlyReportData,
  approvedIds: ReadonlySet<string>
): { data: MonthlyReportData; pruned: number } {
  const keep = <T extends { id: string }>(xs: T[]) => xs.filter((x) => approvedIds.has(x.id))
  const oldest = keep(d.oldest)
  const newReports = keep(d.newReports)
  const responses = keep(d.responses)
  const pruned =
    d.oldest.length - oldest.length +
    (d.newReports.length - newReports.length) +
    (d.responses.length - responses.length)
  return { data: { ...d, oldest, newReports, responses }, pruned }
}

/**
 * Plain-text rendering, used for the email text part and as the seed for
 * social drafts. No markup, no names.
 */
export function renderMonthlyReportText(d: MonthlyReportData, siteUrl: string): string {
  const lines: string[] = []
  lines.push(`State of the Poles — ${d.label}`)
  lines.push(`Greenwich Utility Watch · ${siteUrl}/reports/${d.month}`)
  lines.push('')
  lines.push(`${d.totals.total} utility pole problems on the public record in Greenwich.`)
  lines.push(`${d.totals.newThisMonth} new this month. Oldest has waited ${d.totals.oldestDays} days.`)
  if (d.totals.resolvedThisMonth > 0) lines.push(`${d.totals.resolvedThisMonth} marked resolved this month.`)
  lines.push('')
  if (d.byType.length) {
    lines.push('By problem type:')
    for (const t of d.byType) lines.push(`  ${t.count}  ${t.label}`)
    lines.push('')
  }
  if (d.byNeighborhood.length) {
    lines.push('By neighborhood (approximate, from GPS):')
    for (const n of d.byNeighborhood) lines.push(`  ${n.count}  ${n.label}`)
    lines.push('')
  }
  if (d.oldest.length) {
    lines.push('Longest-standing reports:')
    for (const o of d.oldest) lines.push(`  ${o.age_days} days  ${o.location} — ${o.problem_type ?? 'uncategorized'}  ${o.url}`)
    lines.push('')
  }
  lines.push(
    d.responses.length
      ? `Official responses recorded: ${d.responses.length}.`
      : 'No official response has been recorded for any report.'
  )
  lines.push('')
  lines.push(`Report a pole: ${siteUrl}  ·  Data: ${siteUrl}/press`)
  return lines.join('\n')
}
