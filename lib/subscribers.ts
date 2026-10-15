/**
 * Email subscribers: double opt-in, one-click unsubscribe, monthly send and
 * per-pole watch notifications.
 *
 * Table public.subscribers (migration 20261015000001), service role only.
 * Pure helpers are exported for tests; the DB functions are thin.
 */

import { createServerClient } from '@/lib/supabase'
import { signToken, verifyToken, type SignedPayload } from '@/lib/signedToken'
import { getSiteUrl } from '@/lib/site'
import { isEmailConfigured } from '@/lib/emailConfig'
import { sendMonthlyReportEmail, sendPoleUpdateEmail, sendSubscribeConfirmation } from '@/lib/email'
import type { MonthlyReportData } from '@/lib/monthlyReport'
import type { PublicReport } from '@/lib/publicReport'
import type { PoleChange } from '@/lib/emailTemplates'

export type SubscribeSource = 'site' | 'submission' | 'reports' | 'pole'

export interface SubscriberRow {
  id: string
  email: string
  source: SubscribeSource
  submission_id: string | null
  created_at: string
  confirmation_sent_at: string | null
  confirmed_at: string | null
  unsubscribed_at: string | null
  last_sent_at: string | null
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Resend free tier: 100 emails/day. Leave headroom for alerts and confirmations. */
export const DAILY_SEND_BUDGET = 80

/** Don't re-send a confirmation more often than this. */
export const CONFIRMATION_RESEND_MS = 10 * 60 * 1000

export function shouldResendConfirmation(row: Pick<SubscriberRow, 'confirmed_at' | 'confirmation_sent_at'>, now: number): boolean {
  if (row.confirmed_at) return false
  if (!row.confirmation_sent_at) return true
  return now - new Date(row.confirmation_sent_at).getTime() > CONFIRMATION_RESEND_MS
}

export function isActive(row: Pick<SubscriberRow, 'confirmed_at' | 'unsubscribed_at'>): boolean {
  return Boolean(row.confirmed_at) && !row.unsubscribed_at
}

/**
 * Recipients for a monthly report: confirmed, not unsubscribed, not yet sent
 * this snapshot (last_sent_at before generated_at), one per address.
 */
export function pickMonthlyRecipients(
  rows: SubscriberRow[],
  generatedAt: string,
  budget: number = DAILY_SEND_BUDGET
): SubscriberRow[] {
  const gen = new Date(generatedAt).getTime()
  const seen = new Set<string>()
  const out: SubscriberRow[] = []
  for (const r of rows) {
    if (!isActive(r)) continue
    if (r.last_sent_at && new Date(r.last_sent_at).getTime() >= gen) continue
    const key = normalizeEmail(r.email)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
    if (out.length >= budget) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

interface SubscriberToken extends SignedPayload {
  kind: 'subscriber'
  action: 'confirm' | 'unsubscribe'
  id: string
}

function isSubscriberToken(p: unknown): p is SubscriberToken {
  if (!p || typeof p !== 'object') return false
  const o = p as Record<string, unknown>
  return (
    o.kind === 'subscriber' &&
    (o.action === 'confirm' || o.action === 'unsubscribe') &&
    typeof o.id === 'string' &&
    (typeof o.exp === 'number' || o.exp === null)
  )
}

const CONFIRM_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export async function createConfirmUrl(subscriberId: string): Promise<string> {
  const token = await signToken<SubscriberToken>({ kind: 'subscriber', action: 'confirm', id: subscriberId, exp: Date.now() + CONFIRM_MAX_AGE_MS })
  return `${getSiteUrl()}/subscribe/confirm?token=${encodeURIComponent(token)}`
}

/** Unsubscribe links never expire: an old email must always be able to opt out. */
export async function createUnsubscribeUrl(subscriberId: string, path = '/subscribe/unsubscribe'): Promise<string> {
  const token = await signToken<SubscriberToken>({ kind: 'subscriber', action: 'unsubscribe', id: subscriberId, exp: null })
  return `${getSiteUrl()}${path}?token=${encodeURIComponent(token)}`
}

export async function verifySubscriberToken(token: string, action: 'confirm' | 'unsubscribe'): Promise<string | null> {
  const p = await verifyToken<SubscriberToken>(token, isSubscriberToken)
  return p && p.action === action ? p.id : null
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export type SubscribeOutcome = 'confirmation_sent' | 'already_subscribed' | 'recently_sent' | 'unavailable' | 'error'

/**
 * Create or refresh a subscription and send the confirmation. Idempotent per
 * (email, pole). Never reveals to the caller whether the address existed.
 */
export async function subscribe(opts: {
  email: string
  source: SubscribeSource
  submissionId?: string | null
}): Promise<SubscribeOutcome> {
  if (!isEmailConfigured()) return 'unavailable'
  const supabase = createServerClient()
  const email = normalizeEmail(opts.email)
  const submissionId = opts.submissionId ?? null

  // Addresses are stored normalized (lower-cased), so exact match is correct.
  // Never use LIKE/ILIKE here: '_' and '%' are legal in email local parts.
  let query = supabase.from('subscribers').select('*').eq('email', email)
  query = submissionId ? query.eq('submission_id', submissionId) : query.is('submission_id', null)
  const { data: existing, error: selErr } = await query.maybeSingle()
  if (selErr) {
    console.error('[subscribers] select failed:', selErr.message)
    return 'error'
  }

  let row = existing as SubscriberRow | null
  if (row && isActive(row)) return 'already_subscribed'

  const now = Date.now()
  if (row && !shouldResendConfirmation(row, now) && !row.unsubscribed_at) return 'recently_sent'

  if (row) {
    // Re-subscribing after an unsubscribe, or re-requesting a confirmation.
    const { error } = await supabase
      .from('subscribers')
      .update({ unsubscribed_at: null, confirmed_at: null, source: opts.source })
      .eq('id', row.id)
    if (error) {
      console.error('[subscribers] update failed:', error.message)
      return 'error'
    }
  } else {
    const { data, error } = await supabase
      .from('subscribers')
      .insert({ email, source: opts.source, submission_id: submissionId })
      .select('*')
      .single()
    if (error || !data) {
      console.error('[subscribers] insert failed:', error?.message)
      return 'error'
    }
    row = data as SubscriberRow
  }

  let poleLocation: string | null = null
  if (submissionId) {
    const { data: sub } = await supabase.from('submissions').select('address').eq('id', submissionId).maybeSingle()
    poleLocation = (sub as { address: string | null } | null)?.address ?? 'the pole you reported'
  }

  const confirmUrl = await createConfirmUrl(row.id)
  const sent = await sendSubscribeConfirmation(email, { confirmUrl, poleLocation })
  if (sent) {
    await supabase.from('subscribers').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', row.id)
  }
  return sent ? 'confirmation_sent' : 'error'
}

export async function confirmSubscriber(id: string): Promise<'confirmed' | 'already' | 'not_found'> {
  const supabase = createServerClient()
  const { data } = await supabase.from('subscribers').select('id, confirmed_at').eq('id', id).maybeSingle()
  if (!data) return 'not_found'
  if ((data as { confirmed_at: string | null }).confirmed_at) return 'already'
  const { error } = await supabase
    .from('subscribers')
    .update({ confirmed_at: new Date().toISOString(), unsubscribed_at: null })
    .eq('id', id)
  return error ? 'not_found' : 'confirmed'
}

/** Unsubscribe every row for the address behind this subscriber id. */
export async function unsubscribeById(id: string): Promise<boolean> {
  const supabase = createServerClient()
  const { data } = await supabase.from('subscribers').select('email').eq('id', id).maybeSingle()
  if (!data) return false
  const email = normalizeEmail((data as { email: string }).email)
  const { error } = await supabase
    .from('subscribers')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('email', email)
    .is('unsubscribed_at', null)
  return !error
}

export async function countActiveSubscribers(): Promise<number> {
  const supabase = createServerClient()
  const { count } = await supabase
    .from('subscribers')
    .select('id', { count: 'exact', head: true })
    .not('confirmed_at', 'is', null)
    .is('unsubscribed_at', null)
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Sends
// ---------------------------------------------------------------------------

/**
 * Send the latest published monthly report to every active subscriber who
 * has not received it yet, within the daily budget. Safe to call from both
 * crons: the monthly one right after publishing, the daily digest as the
 * retry/continuation. Returns how many were sent and how many remain.
 */
export async function flushMonthlySends(
  snapshot: { data: MonthlyReportData; generated_at: string } | null
): Promise<{ sent: number; remaining: number; skipped?: string }> {
  if (!snapshot) return { sent: 0, remaining: 0, skipped: 'no snapshot' }
  if (!isEmailConfigured()) return { sent: 0, remaining: 0, skipped: 'email not configured (EMAIL_FROM / RESEND_API_KEY)' }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('subscribers')
    .select('*')
    .not('confirmed_at', 'is', null)
    .is('unsubscribed_at', null)
  if (error) {
    console.error('[subscribers] load failed:', error.message)
    return { sent: 0, remaining: 0, skipped: error.message }
  }
  const rows = (data ?? []) as SubscriberRow[]
  const eligible = pickMonthlyRecipients(rows, snapshot.generated_at, Number.MAX_SAFE_INTEGER)
  const batch = eligible.slice(0, DAILY_SEND_BUDGET)
  const site = getSiteUrl()

  let sent = 0
  for (const r of batch) {
    const unsubscribeUrl = await createUnsubscribeUrl(r.id)
    const oneClickUrl = await createUnsubscribeUrl(r.id, '/api/subscribe/unsubscribe')
    const ok = await sendMonthlyReportEmail(r.email, snapshot.data, site, unsubscribeUrl, oneClickUrl)
    if (ok) {
      sent++
      const stamp = new Date().toISOString()
      // Mark every row for this address so duplicates are not re-sent by the next flush.
      await supabase.from('subscribers').update({ last_sent_at: stamp }).eq('email', normalizeEmail(r.email))
    }
  }
  return { sent, remaining: eligible.length - sent }
}

/** Notify everyone watching one pole. Fire-and-forget from admin routes. */
export async function notifyPoleWatchers(report: PublicReport, change: PoleChange): Promise<number> {
  if (!isEmailConfigured()) return 0
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('subscribers')
    .select('*')
    .eq('submission_id', report.id)
    .not('confirmed_at', 'is', null)
    .is('unsubscribed_at', null)
  if (error || !data) return 0
  let sent = 0
  for (const r of data as SubscriberRow[]) {
    const unsubscribeUrl = await createUnsubscribeUrl(r.id)
    const oneClickUrl = await createUnsubscribeUrl(r.id, '/api/subscribe/unsubscribe')
    if (await sendPoleUpdateEmail(r.email, report, change, unsubscribeUrl, oneClickUrl)) sent++
  }
  return sent
}
