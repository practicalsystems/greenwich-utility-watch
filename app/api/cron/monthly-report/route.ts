import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { loadApprovedReports, saveMonthlyReport } from '@/lib/publicData'
import { buildMonthlyReport, isValidMonth, previousMonth, renderMonthlyReportText } from '@/lib/monthlyReport'
import { getSiteUrl } from '@/lib/site'
import { flushMonthlySends } from '@/lib/subscribers'
import { createMonthlyDrafts, publishApprovedDrafts, sendDraftsForApproval } from '@/lib/draftsQueue'
import { getAlertSettings } from '@/lib/alertSettings'

/**
 * Monthly "State of the Poles" report. Vercel Cron calls this on the 1st of
 * each month (vercel.json). It builds the report for the month that just
 * ended, stores the snapshot in public.monthly_reports and revalidates the
 * /reports pages. Later PRs hang the subscriber send and the social drafts
 * off the same run.
 *
 * Query parameters (for manual runs with the cron secret):
 *   month=YYYY-MM   build a specific month instead of the previous one
 *   force=1         overwrite an existing snapshot
 */
export async function GET(request: NextRequest) {
  // Fail closed: this route writes to the database, so unlike the read-only
  // digest it refuses to run at all when CRON_SECRET is not configured.
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[monthly-report] CRON_SECRET is not set; refusing to run')
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const month = params.get('month') ?? previousMonth(new Date())
  if (!isValidMonth(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }

  const reports = await loadApprovedReports()
  const data = buildMonthlyReport(reports, month, new Date())

  const { error } = await saveMonthlyReport(data)
  if (error) {
    console.error('[monthly-report] save failed:', error)
    return NextResponse.json({ error: 'Could not store the report', detail: error }, { status: 500 })
  }

  revalidatePath('/reports')
  revalidatePath(`/reports/${month}`)
  revalidatePath('/reports/feed.xml')

  // Email the report to confirmed subscribers (skipped with a reason until
  // EMAIL_FROM is set). The daily digest cron continues any remainder.
  const sends = await flushMonthlySends({ data, generated_at: new Date().toISOString() })

  // Draft the month's social posts and association note, and email the admin
  // one Approve/Skip message. Existing decided drafts are never overwritten.
  const force = params.get('force') === '1'
  const drafts = await createMonthlyDrafts(data, { force })
  let draftsEmailed = false
  if (drafts.rows.length > 0) {
    const settings = await getAlertSettings()
    if (settings.alertEmail) draftsEmailed = await sendDraftsForApproval(settings.alertEmail, month, drafts.rows)
    else console.warn('[monthly-report] no alert email configured; drafts await approval in the admin dashboard')
  }
  // Publish anything approved earlier for a channel that has since been connected.
  const backlog = await publishApprovedDrafts()

  console.log(
    JSON.stringify({
      event: 'monthly_report',
      month,
      total: data.totals.total,
      new_this_month: data.totals.newThisMonth,
      oldest_days: data.totals.oldestDays,
      responses: data.responses.length,
      subscriber_sends: sends,
      drafts_created: drafts.created,
      drafts_pending: drafts.rows.length,
      drafts_emailed: draftsEmailed,
      drafts_backlog: backlog,
      timestamp: new Date().toISOString(),
    })
  )

  return NextResponse.json({
    message: 'Monthly report published',
    month,
    url: `${getSiteUrl()}/reports/${month}`,
    totals: data.totals,
    subscriberSends: sends,
    drafts: { created: drafts.created, pending: drafts.rows.length, emailed: draftsEmailed, error: drafts.error ?? null, backlog },
    text: renderMonthlyReportText(data, getSiteUrl()),
  })
}
