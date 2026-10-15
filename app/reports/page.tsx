import type { Metadata } from 'next'
import Link from 'next/link'
import { format } from 'date-fns'
import { listMonthlyReports } from '@/lib/publicData'
import { formatMonth, monthKey, monthsThrough } from '@/lib/monthlyReport'
import SubscribeForm from '@/components/SubscribeForm'
import { isEmailConfigured } from '@/lib/emailConfig'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'State of the Poles — monthly reports',
  description:
    'Monthly summaries of utility pole problems on the Greenwich public record, generated automatically on the 1st of each month.',
}

export default async function ReportsIndexPage() {
  const stored = await listMonthlyReports()
  const publishedMonths = new Set(stored.map((s) => s.month))
  const current = monthKey(new Date())
  const months = monthsThrough(current)

  return (
    <div>
      <div className="bg-slate-900 text-white py-10 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">State of the Poles</h1>
          <p className="text-slate-300">
            A monthly summary of the public record: how many problem poles are documented, where, how long the
            oldest have waited, and what changed. Generated automatically on the 1st of each month.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {isEmailConfigured() && <SubscribeForm source="reports" />}
        <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {months.map((m) => {
            const snap = stored.find((s) => s.month === m)
            const isCurrent = m === current
            return (
              <li key={m} className="flex items-center justify-between p-4 text-sm">
                <div>
                  <Link href={`/reports/${m}`} className="font-semibold text-slate-900 hover:underline">
                    {formatMonth(m)}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {snap
                      ? `Published ${format(new Date(snap.generated_at), 'MMM d, yyyy')} · ${snap.data.totals.total} on record · ${snap.data.totals.newThisMonth} new`
                      : isCurrent
                        ? 'In progress; live preview'
                        : 'Not yet published; live view'}
                  </p>
                </div>
                <Link href={`/reports/${m}`} className="text-amber-700 hover:underline shrink-0">
                  Read →
                </Link>
              </li>
            )
          })}
        </ul>
        {publishedMonths.size === 0 && (
          <p className="text-xs text-slate-500">
            No report has been published yet; the first runs on the 1st of next month. Every month shows a live
            view in the meantime.
          </p>
        )}
        <p className="text-sm text-slate-600">
          Subscribe by RSS:{' '}
          <a href="/reports/feed.xml" className="text-amber-700 hover:underline font-medium">/reports/feed.xml</a>
          {' · '}
          All individual reports: <a href="/feed.xml" className="text-amber-700 hover:underline font-medium">/feed.xml</a>
        </p>
      </div>
    </div>
  )
}
