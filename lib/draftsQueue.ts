/**
 * The approval queue: rows in public.outbound_drafts, one-tap tokens, the
 * approval email to the admin, and publication through lib/social.
 */

import { createServerClient } from '@/lib/supabase'
import { signToken, verifyToken, type SignedPayload } from '@/lib/signedToken'
import { getSiteUrl } from '@/lib/site'
import { generateDrafts, CHANNEL_LABELS, type DraftChannel } from '@/lib/drafts'
import { channelConfigured, publishDraft } from '@/lib/social'
import { sendDraftsEmail } from '@/lib/email'
import type { MonthlyReportData } from '@/lib/monthlyReport'

export type DraftStatus = 'draft' | 'approved' | 'published' | 'skipped' | 'failed'

export interface DraftRow {
  id: string
  month: string
  channel: DraftChannel
  body: string
  status: DraftStatus
  created_at: string
  approved_at: string | null
  published_at: string | null
  result: Record<string, unknown> | null
  error: string | null
}

// ---------------------------------------------------------------------------
// Tokens (7 days: the cadence is monthly, so 72 hours is too short)
// ---------------------------------------------------------------------------

export type DraftAction = 'approve' | 'skip'

interface DraftToken extends SignedPayload {
  kind: 'draft'
  action: DraftAction
  id: string
  exp: number
}

function isDraftToken(p: unknown): p is DraftToken {
  if (!p || typeof p !== 'object') return false
  const o = p as Record<string, unknown>
  return o.kind === 'draft' && (o.action === 'approve' || o.action === 'skip') && typeof o.id === 'string' && typeof o.exp === 'number'
}

export const DRAFT_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export async function createDraftActionUrl(id: string, action: DraftAction): Promise<string> {
  const token = await signToken<DraftToken>({ kind: 'draft', action, id, exp: Date.now() + DRAFT_TOKEN_MAX_AGE_MS })
  return `${getSiteUrl()}/api/drafts/${id}/quick-action?token=${encodeURIComponent(token)}`
}

export async function verifyDraftToken(token: string): Promise<{ id: string; action: DraftAction } | null> {
  const p = await verifyToken<DraftToken>(token, isDraftToken)
  return p ? { id: p.id, action: p.action } : null
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export async function listDrafts(limit = 24): Promise<DraftRow[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('outbound_drafts')
    .select('*')
    .order('month', { ascending: false })
    .order('channel', { ascending: true })
    .limit(limit)
  if (error) {
    console.error('[drafts] list failed:', error.message)
    return []
  }
  return (data ?? []) as DraftRow[]
}

export async function getDraft(id: string): Promise<DraftRow | null> {
  const supabase = createServerClient()
  const { data } = await supabase.from('outbound_drafts').select('*').eq('id', id).maybeSingle()
  return (data as DraftRow | null) ?? null
}

/**
 * Create the month's drafts (idempotent: existing rows for the month are left
 * alone unless `force`, so a re-run never overwrites an approved or published
 * draft). Returns the rows that are still awaiting a decision.
 */
export async function createMonthlyDrafts(
  data: MonthlyReportData,
  opts: { force?: boolean } = {}
): Promise<{ rows: DraftRow[]; created: number; error?: string }> {
  const supabase = createServerClient()
  const specs = generateDrafts(data, getSiteUrl())

  const { data: existing, error: selErr } = await supabase.from('outbound_drafts').select('*').eq('month', data.month)
  if (selErr) return { rows: [], created: 0, error: selErr.message }
  const byChannel = new Map((existing as DraftRow[] | null ?? []).map((r) => [r.channel, r]))

  let created = 0
  for (const spec of specs) {
    const cur = byChannel.get(spec.channel)
    if (cur && !opts.force) continue
    if (cur && cur.status !== 'draft') continue // never clobber a decided draft
    const { error } = await supabase
      .from('outbound_drafts')
      .upsert({ month: data.month, channel: spec.channel, body: spec.body, status: 'draft' }, { onConflict: 'month,channel' })
    if (error) return { rows: [], created, error: error.message }
    created++
  }

  const { data: rows } = await supabase.from('outbound_drafts').select('*').eq('month', data.month).eq('status', 'draft')
  return { rows: (rows as DraftRow[] | null) ?? [], created }
}

/** Email the admin the month's pending drafts with Approve / Skip links. */
export async function sendDraftsForApproval(to: string, month: string, rows: DraftRow[]): Promise<boolean> {
  if (rows.length === 0) return false
  const items = []
  for (const r of rows) {
    const conf = channelConfigured(r.channel)
    items.push({
      id: r.id,
      channel: r.channel,
      label: CHANNEL_LABELS[r.channel],
      body: r.body,
      approveUrl: await createDraftActionUrl(r.id, 'approve'),
      skipUrl: await createDraftActionUrl(r.id, 'skip'),
      configured: conf.ok,
      missing: conf.ok ? null : conf.missing,
    })
  }
  return sendDraftsEmail(to, month, items)
}

export type DecisionOutcome =
  | { kind: 'published'; url: string }
  | { kind: 'approved_pending'; missing: string }
  | { kind: 'skipped' }
  | { kind: 'failed'; error: string }
  | { kind: 'already'; status: DraftStatus }
  | { kind: 'not_found' }

/** Apply a one-tap decision. Idempotent: a decided draft is reported, not re-published. */
export async function decideDraft(id: string, action: DraftAction): Promise<DecisionOutcome> {
  const supabase = createServerClient()
  const row = await getDraft(id)
  if (!row) return { kind: 'not_found' }
  if (row.status === 'published' || row.status === 'skipped') return { kind: 'already', status: row.status }

  if (action === 'skip') {
    await supabase.from('outbound_drafts').update({ status: 'skipped' }).eq('id', id)
    return { kind: 'skipped' }
  }

  const now = new Date().toISOString()
  await supabase.from('outbound_drafts').update({ status: 'approved', approved_at: row.approved_at ?? now }).eq('id', id)
  return publishRow({ ...row, status: 'approved', approved_at: row.approved_at ?? now })
}

async function publishRow(row: DraftRow): Promise<DecisionOutcome> {
  const supabase = createServerClient()
  const out = await publishDraft(row.channel, row.body)
  if ('notConfigured' in out) {
    return { kind: 'approved_pending', missing: out.missing }
  }
  if (out.ok) {
    await supabase
      .from('outbound_drafts')
      .update({ status: 'published', published_at: new Date().toISOString(), result: { id: out.id, url: out.url }, error: null })
      .eq('id', row.id)
    console.log(JSON.stringify({ event: 'draft_published', id: row.id, channel: row.channel, month: row.month, url: out.url }))
    return { kind: 'published', url: out.url }
  }
  await supabase.from('outbound_drafts').update({ status: 'failed', error: out.error }).eq('id', row.id)
  console.error('[drafts] publish failed:', row.channel, out.error)
  return { kind: 'failed', error: out.error }
}

/**
 * Publish drafts the admin approved while a channel was not yet configured.
 * Called by both crons, so credentials added later take effect without a
 * second approval. Never touches 'draft' rows.
 */
export async function publishApprovedDrafts(): Promise<{ published: number; pending: number; failed: number }> {
  const supabase = createServerClient()
  const { data, error } = await supabase.from('outbound_drafts').select('*').eq('status', 'approved')
  if (error || !data) return { published: 0, pending: 0, failed: 0 }
  let published = 0, pending = 0, failed = 0
  for (const row of data as DraftRow[]) {
    if (!channelConfigured(row.channel).ok) { pending++; continue }
    const out = await publishRow(row)
    if (out.kind === 'published') published++
    else if (out.kind === 'failed') failed++
    else pending++
  }
  return { published, pending, failed }
}
