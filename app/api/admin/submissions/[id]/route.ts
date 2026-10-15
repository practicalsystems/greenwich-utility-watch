import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifySessionToken } from '@/lib/sessions'
import { isValidUUID, sanitizeAdminNotes, validateFollowUp } from '@/lib/validate'
import { getClientIp } from '@/lib/rateLimit'
import { loadApprovedReport } from '@/lib/publicData'
import { notifyPoleWatchers } from '@/lib/subscribers'
import type { PoleChange } from '@/lib/emailTemplates'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('admin_session')?.value
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid submission ID.' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { status, admin_notes } = body as Record<string, unknown>

  const validStatuses = ['pending', 'approved', 'rejected']
  if (typeof status !== 'string' || !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  }

  const sanitizedNotes = sanitizeAdminNotes(typeof admin_notes === 'string' ? admin_notes : null)

  // Optional public follow-up fields. Only written when the body carries at
  // least one of them, so older clients that send status + notes are unaffected.
  const bodyRec = body as Record<string, unknown>
  const hasFollowUp = ['reported_to', 'reported_at', 'official_response', 'resolved_at'].some(
    (k) => k in bodyRec
  )
  let followUp: Record<string, string | null> = {}
  if (hasFollowUp) {
    const fu = validateFollowUp(bodyRec)
    if (!fu.ok) return NextResponse.json({ error: fu.error }, { status: 400 })
    followUp = { ...fu.data }
  }

  const supabase = createServerClient()

  // Before-state, to work out what changed for pole watchers.
  const { data: before } = await supabase
    .from('submissions')
    .select('status, reported_to, official_response, resolved_at')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase
    .from('submissions')
    .update({ status, admin_notes: sanitizedNotes, ...followUp })
    .eq('id', id)

  if (error) {
    console.error('Admin update error:', error)
    return NextResponse.json({ error: 'Could not update submission.' }, { status: 500 })
  }

  // Audit log — visible in Vercel function logs
  console.log(
    JSON.stringify({
      event: 'admin_action',
      submission_id: id,
      status,
      has_notes: !!sanitizedNotes,
      has_follow_up: hasFollowUp,
      ip: getClientIp(request),
      ts: new Date().toISOString(),
    })
  )

  // Notify watchers of this pole (fire-and-forget; only when email is configured).
  const b = (before ?? {}) as { status?: string; reported_to?: string | null; official_response?: string | null; resolved_at?: string | null }
  let change: PoleChange | null = null
  if (status === 'approved' && b.status !== 'approved') change = { kind: 'approved' }
  else if (hasFollowUp && followUp.resolved_at && followUp.resolved_at !== (b.resolved_at ?? null)) change = { kind: 'resolved' }
  else if (
    hasFollowUp &&
    status === 'approved' &&
    ((followUp.reported_to ?? null) !== (b.reported_to ?? null) ||
      (followUp.official_response ?? null) !== (b.official_response ?? null))
  )
    change = { kind: 'follow_up' }
  if (change) {
    const c = change
    loadApprovedReport(id)
      .then((r) => (r ? notifyPoleWatchers(r, c) : 0))
      .catch((err) => console.error('[admin] watcher notify failed:', err))
  }

  return NextResponse.json({ success: true })
}
