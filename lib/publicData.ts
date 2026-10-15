/**
 * Server-side loader for the public record. The one place that queries
 * Supabase for public surfaces; everything else is pure.
 */

import { createServerClient } from '@/lib/supabase'
import { getSiteUrl } from '@/lib/site'
import {
  BASE_PUBLIC_COLUMNS,
  PUBLIC_COLUMNS,
  toPublicReports,
  type PublicReport,
  type PublicRow,
} from '@/lib/publicReport'
import type { MonthlyReportData } from '@/lib/monthlyReport'

type Client = ReturnType<typeof createServerClient>

/** Postgres "undefined_column": the follow-up migration has not been applied yet. */
const UNDEFINED_COLUMN = '42703'

/**
 * Select public columns, falling back to the pre-migration column set if the
 * database does not have the follow-up columns yet. This keeps every public
 * surface working whichever order the deploy and the migration happen in.
 */
async function selectPublic(supabase: Client, apply: (q: ReturnType<ReturnType<Client['from']>['select']>) => typeof q) {
  let res = await apply(supabase.from('submissions').select(PUBLIC_COLUMNS))
  if (res.error && res.error.code === UNDEFINED_COLUMN) {
    console.warn('[publicData] follow-up columns missing; apply migration 20261015000000. Falling back.')
    res = await apply(supabase.from('submissions').select(BASE_PUBLIC_COLUMNS))
  }
  return res
}

export async function loadApprovedReports(): Promise<PublicReport[]> {
  const supabase = createServerClient()
  const { data, error } = await selectPublic(supabase, (q) =>
    q.eq('status', 'approved').order('created_at', { ascending: false })
  )
  if (error) {
    console.error('[publicData] load failed:', error.message)
    return []
  }
  return toPublicReports((data ?? []) as unknown as PublicRow[], getSiteUrl(), Date.now())
}

export async function loadApprovedReport(id: string): Promise<PublicReport | null> {
  const supabase = createServerClient()
  const { data, error } = await selectPublic(supabase, (q) => q.eq('id', id).eq('status', 'approved'))
  if (error || !data) return null
  const rows = (Array.isArray(data) ? data : [data]) as unknown as PublicRow[]
  return toPublicReports(rows, getSiteUrl(), Date.now())[0] ?? null
}

// ---------------------------------------------------------------------------
// Monthly report snapshots (table public.monthly_reports, service role only)
// ---------------------------------------------------------------------------

export interface StoredMonthlyReport {
  month: string
  generated_at: string
  data: MonthlyReportData
}

export async function loadMonthlyReport(month: string): Promise<StoredMonthlyReport | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('month, generated_at, data')
    .eq('month', month)
    .maybeSingle()
  if (error || !data) return null
  return data as unknown as StoredMonthlyReport
}

export async function listMonthlyReports(): Promise<StoredMonthlyReport[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('month, generated_at, data')
    .order('month', { ascending: false })
  if (error) {
    console.error('[publicData] monthly_reports list failed:', error.message)
    return []
  }
  return (data ?? []) as unknown as StoredMonthlyReport[]
}

export async function loadLatestMonthlyReport(): Promise<StoredMonthlyReport | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('month, generated_at, data')
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return data as unknown as StoredMonthlyReport
}

export async function saveMonthlyReport(data: MonthlyReportData): Promise<{ error: string | null }> {
  const supabase = createServerClient()
  const { error } = await supabase
    .from('monthly_reports')
    .upsert({ month: data.month, generated_at: new Date().toISOString(), data }, { onConflict: 'month' })
  return { error: error ? error.message : null }
}
