import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sendDailyDigest } from '@/lib/email'
import { getAlertSettings } from '@/lib/alertSettings'
import { flushMonthlySends } from '@/lib/subscribers'
import { loadLatestMonthlyReport } from '@/lib/publicData'
import { publishApprovedDrafts } from '@/lib/draftsQueue'

/**
 * Daily digest cron job. Triggered by Vercel Cron at ~8am ET.
 * Summarizes the last 24 hours of submission activity.
 * No-op if there were no submissions in the period.
 */
export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron invocation
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Continue any monthly-report subscriber sends left over from the daily
  // budget (lib/subscribers.ts). Independent of the admin digest below and
  // never allowed to break it.
  let monthlySends: { sent: number; remaining: number; skipped?: string } = { sent: 0, remaining: 0 }
  try {
    monthlySends = await flushMonthlySends(await loadLatestMonthlyReport())
  } catch (err) {
    console.error('[digest] monthly send continuation failed:', err)
  }
  // Publish drafts approved while their channel was unconfigured (lib/draftsQueue.ts).
  try {
    const backlog = await publishApprovedDrafts()
    if (backlog.published) console.log(JSON.stringify({ event: 'drafts_backlog_published', ...backlog }))
  } catch (err) {
    console.error('[digest] draft backlog publish failed:', err)
  }

  const settings = await getAlertSettings()
  if (!settings.alertEmail || !settings.dailyDigest) {
    return NextResponse.json({ message: 'Daily digest disabled or no email configured, skipping', monthlySends })
  }
  const alertEmail = settings.alertEmail

  const supabase = createServerClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Count submissions by status from the last 24 hours
  const { data: recent } = await supabase
    .from('submissions')
    .select('id, status, address, problem_type, created_at')
    .gte('created_at', since)

  if (!recent || recent.length === 0) {
    return NextResponse.json({ message: 'No submissions in the last 24 hours, skipping digest', monthlySends })
  }

  const autoApproved = recent.filter((s) => s.status === 'approved').length
  const rejected = recent.filter((s) => s.status === 'rejected').length

  // Get ALL pending submissions (not just last 24h) so the admin sees the full backlog
  const { data: allPending } = await supabase
    .from('submissions')
    .select('id, address, problem_type, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  // Count manually approved: submissions approved in the last 24h that were
  // created before the last 24h (i.e. they were pending, then approved today).
  // This is approximate since we don't track approval timestamp separately.
  // For now, just report the auto-approved count from this period.
  const manuallyApproved = 0

  console.log(JSON.stringify({
    event: 'daily_digest',
    period_since: since,
    auto_approved: autoApproved,
    rejected,
    still_pending: allPending?.length ?? 0,
    timestamp: new Date().toISOString(),
  }))

  await sendDailyDigest(alertEmail, {
    autoApproved,
    manuallyApproved,
    rejected,
    stillPending: allPending?.length ?? 0,
    pendingItems: (allPending ?? []).slice(0, 10).map((s) => ({
      id: s.id,
      address: s.address,
      problemType: s.problem_type,
      createdAt: s.created_at,
    })),
  })

  return NextResponse.json({
    message: 'Digest sent',
    monthlySends,
    stats: { autoApproved, manuallyApproved, rejected, stillPending: allPending?.length ?? 0 },
  })
}
