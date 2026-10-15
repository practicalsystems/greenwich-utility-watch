/**
 * The public shape of an approved report.
 *
 * Every public read surface (feed, export, press page, permalinks, badge,
 * monthly report) goes through here so the column list, derived fields and
 * photo URL sanitising are defined once. The columns match exactly what the
 * anon role is allowed to SELECT (migration 20261014000002); the server uses
 * the service role, so this file is the guard that keeps submitter name,
 * email and admin notes out of public output.
 */

import { displayLocation } from '@/lib/supabase'
import { sanitizePhotoUrls } from '@/lib/validate'
import { neighborhoodFor, type Neighborhood } from '@/lib/neighborhoods'

/** The twelve original public columns (anon grant, migration 20261014000002). */
export const BASE_PUBLIC_COLUMNS =
  'id, created_at, address, cross_streets, pole_id, latitude, longitude, description, status, photos, problem_type, duration'

/** Official follow-up columns added by migration 20261015000000 (also anon-readable). */
export const FOLLOW_UP_COLUMNS = 'reported_to, reported_at, official_response, resolved_at'

/** Select list for Supabase queries. Keep in sync with the anon column grants. */
export const PUBLIC_COLUMNS = `${BASE_PUBLIC_COLUMNS}, ${FOLLOW_UP_COLUMNS}`

export const REPORTED_TO_OPTIONS = ['Eversource', 'Frontier', 'Town of Greenwich', 'PURA', 'Other'] as const
export type ReportedTo = (typeof REPORTED_TO_OPTIONS)[number]

/** A row as returned by the database with PUBLIC_COLUMNS. */
export interface PublicRow {
  id: string
  created_at: string
  address: string | null
  cross_streets: string | null
  pole_id: string | null
  latitude: number | null
  longitude: number | null
  description: string
  status: string
  photos: string[] | null
  problem_type: string | null
  duration: string | null
  reported_to?: string | null
  reported_at?: string | null
  official_response?: string | null
  resolved_at?: string | null
}

export interface PublicReport {
  id: string
  created_at: string
  address: string | null
  cross_streets: string | null
  pole_id: string | null
  latitude: number | null
  longitude: number | null
  description: string
  problem_type: string | null
  duration: string | null
  /** Official follow-up, when the admin has recorded one. */
  reported_to: string | null
  reported_at: string | null
  official_response: string | null
  resolved_at: string | null
  photos: string[]
  /** Human-readable location: address, or "GPS: lat, lng". */
  location: string
  /** Approximate neighborhood derived from GPS. */
  neighborhood: Neighborhood
  /** Whole days since the report was filed, as of `now`. */
  age_days: number
  /** Absolute permalink. */
  url: string
}

export const MS_PER_DAY = 24 * 60 * 60 * 1000

export function ageInDays(createdAt: string, now: number): number {
  const t = new Date(createdAt).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((now - t) / MS_PER_DAY))
}

export function permalinkFor(siteUrl: string, id: string): string {
  return `${siteUrl}/poles/${id}`
}

export function toPublicReport(row: PublicRow, siteUrl: string, now: number): PublicReport {
  return {
    id: row.id,
    created_at: row.created_at,
    address: row.address,
    cross_streets: row.cross_streets,
    pole_id: row.pole_id,
    latitude: row.latitude,
    longitude: row.longitude,
    description: row.description,
    problem_type: row.problem_type,
    duration: row.duration,
    reported_to: row.reported_to ?? null,
    reported_at: row.reported_at ?? null,
    official_response: row.official_response ?? null,
    resolved_at: row.resolved_at ?? null,
    photos: sanitizePhotoUrls(row.photos ?? []),
    location: displayLocation(row),
    neighborhood: neighborhoodFor(row.latitude, row.longitude),
    age_days: ageInDays(row.created_at, now),
    url: permalinkFor(siteUrl, row.id),
  }
}

/** Only approved rows become public reports, whatever the caller selected. */
export function toPublicReports(rows: PublicRow[], siteUrl: string, now: number): PublicReport[] {
  return rows.filter((r) => r.status === 'approved').map((r) => toPublicReport(r, siteUrl, now))
}

export interface CountEntry {
  label: string
  count: number
}

export interface ReportSummary {
  total: number
  withPhotos: number
  withGps: number
  /** Oldest report, or null when there are none. */
  oldest: PublicReport | null
  newest: PublicReport | null
  byType: CountEntry[]
  byNeighborhood: CountEntry[]
}

export const UNCATEGORIZED_LABEL = 'Not categorized (older reports)'

function countBy(reports: PublicReport[], key: (r: PublicReport) => string): CountEntry[] {
  const map = new Map<string, number>()
  for (const r of reports) {
    const k = key(r)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function summarizeReports(reports: PublicReport[]): ReportSummary {
  const byAge = [...reports].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  return {
    total: reports.length,
    withPhotos: reports.filter((r) => r.photos.length > 0).length,
    withGps: reports.filter((r) => r.latitude != null && r.longitude != null).length,
    oldest: byAge[0] ?? null,
    newest: byAge[byAge.length - 1] ?? null,
    byType: countBy(reports, (r) => r.problem_type ?? UNCATEGORIZED_LABEL),
    byNeighborhood: countBy(reports, (r) => r.neighborhood),
  }
}

/** The N oldest reports, oldest first. */
export function oldestReports(reports: PublicReport[], n: number): PublicReport[] {
  return [...reports]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, n)
}
