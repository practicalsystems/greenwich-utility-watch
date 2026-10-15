import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { loadApprovedReports, loadMonthlyReport } from '@/lib/publicData'
import {
  buildMonthlyReport,
  formatMonth,
  isValidMonth,
  monthKey,
  pruneSnapshot,
  FIRST_MONTH,
  type MonthlyReportData,
} from '@/lib/monthlyReport'
import { UNCATEGORIZED_LABEL } from '@/lib/publicReport'
import { CONTACT_EMAIL, getSiteUrl } from '@/lib/site'

export const revalidate = 300
export const dynamicParams = true

export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ month: string }> }

async function getReport(
  month: string
): Promise<{ data: MonthlyReportData; published: boolean; pruned: number } | null> {
  if (!isValidMonth(month)) return null
  const current = monthKey(new Date())
  if (month < FIRST_MONTH || month > current) return null
  const [stored, reports] = await Promise.all([loadMonthlyReport(month), loadApprovedReports()])
  if (stored) {
    // A report rejected or removed after publication must not keep appearing.
    const { data, pruned } = pruneSnapshot(stored.data, new Set(reports.map((r) => r.id)))
    return { data, published: true, pruned }
  }
  // No snapshot yet (the cron runs on the 1st): compute live, label it as such.
  return { data: buildMonthlyReport(reports, month, new Date()), published: false, pruned: 0 }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { month } = await params
  if (!isValidMonth(month)) return { title: 'Report not found' }
  const label = formatMonth(month)
  return {
    title: `State of the Poles — ${label}`,
    description: `Monthly summary of utility pole problems on the Greenwich public record: counts by type and neighborhood, the longest-standing reports, what was new in ${label}, and any official responses.`,
    alternates: { canonical: `${getSiteUrl()}/reports/${month}` },
  }
}

export default async function MonthlyReportPage({ params }: Props) {
  const { month } = await params
  const result = await getReport(month)
  if (!result) notFound()
  const { data: d, published, pruned } = result
  const asOf = format(new Date(d.asOf), 'MMMM d, yyyy')

  return (
    <div>
      <div className="bg-slate-900 text-white py-10 px-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-amber-400 text-sm font-medium mb-1">
            <Link href="/reports" className="hover:underline">State of the Poles</Link>
          </p>
          <h1 className="text-2xl font-bold mb-2">{d.label}</h1>
          <p className="text-slate-300">
            {d.totals.total} utility pole problem{d.totals.total !== 1 ? 's' : ''} on the public record
            in Greenwich as of {asOf}.{' '}
            {published ? null : (
              <span className="text-slate-400">Live preview; the report is published on the 1st of next month.</span>
            )}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="On record" value={d.totals.total} />
          <Stat label={`New in ${d.label.split(' ')[0]}`} value={d.totals.newThisMonth} accent={d.totals.newThisMonth > 0} />
          <Stat label="Oldest (days)" value={d.totals.oldestDays} accent />
          <Stat label="Resolved this month" value={d.totals.resolvedThisMonth} />
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <CountTable title="By problem type" rows={d.byType} />
          <CountTable title="By neighborhood (approximate, from GPS)" rows={d.byNeighborhood} />
        </section>
        {d.byType.some((t) => t.label === UNCATEGORIZED_LABEL) && (
          <p className="text-xs text-slate-500 -mt-6">
            Reports filed before the problem-type field existed are listed as not categorized.
          </p>
        )}

        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Longest-standing reports</h2>
          <p className="text-sm text-slate-500 mb-4">Days counted from the date each report was first documented.</p>
          <ReportList items={d.oldest} empty="No reports on record." showAge />
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-1">New in {d.label}</h2>
          <ReportList items={d.newReports} empty={`No new reports were filed in ${d.label}.`} />
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Official responses</h2>
          {d.responses.length === 0 ? (
            <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-xl p-4">
              No official response has been recorded for any report on the record. When a utility, the Town or
              PURA responds to a documented pole, it is recorded on that report&apos;s page and listed here.
            </p>
          ) : (
            <ul className="space-y-3">
              {d.responses.map((r) => (
                <li key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 text-sm">
                  <Link href={`/poles/${r.id}`} className="font-semibold text-slate-900 hover:underline">
                    {r.location}
                  </Link>
                  <p className="text-slate-600 mt-1">
                    {r.reported_to ? `Reported to ${r.reported_to}` : 'Reported'}
                    {r.reported_at ? ` on ${r.reported_at}` : ''}
                    {r.resolved_at ? ` · Resolved ${r.resolved_at}` : ''}
                  </p>
                  {r.official_response && (
                    <p className="text-slate-800 mt-2 whitespace-pre-wrap">{r.official_response}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-slate-700 space-y-2">
          {pruned > 0 && (
            <p className="text-slate-600">
              {pruned} entr{pruned === 1 ? 'y' : 'ies'} listed when this report was published {pruned === 1 ? 'has' : 'have'}{' '}
              since been removed from the public record and {pruned === 1 ? 'is' : 'are'} no longer shown.
            </p>
          )}
          <p>
            This report is generated automatically from the public record on the 1st of each month. Numbers are
            as of {asOf}. Permanent link: <span className="font-mono text-xs">{getSiteUrl()}/reports/{d.month}</span>
          </p>
          <p>
            <Link href="/" className="text-amber-700 hover:underline font-medium">Report a pole</Link>
            {' · '}
            <Link href="/press" className="text-amber-700 hover:underline font-medium">Press &amp; data</Link>
            {' · '}
            <a href="/reports/feed.xml" className="text-amber-700 hover:underline font-medium">RSS for these reports</a>
            {' · '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-amber-700 hover:underline font-medium">{CONTACT_EMAIL}</a>
          </p>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-bold text-2xl ${accent ? 'text-amber-600' : 'text-slate-900'}`}>{value}</div>
    </div>
  )
}

function CountTable({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">None</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-slate-100 first:border-t-0">
                <td className="py-1.5 text-slate-700">{r.label}</td>
                <td className="py-1.5 text-right font-semibold text-slate-900">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ReportList({
  items,
  empty,
  showAge,
}: {
  items: MonthlyReportData['oldest']
  empty: string
  showAge?: boolean
}) {
  if (items.length === 0) return <p className="text-sm text-slate-500">{empty}</p>
  return (
    <ol className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl">
      {items.map((r) => (
        <li key={r.id} className="flex items-center gap-4 p-3 text-sm">
          <Link href={`/poles/${r.id}`} className="relative w-16 h-12 bg-slate-100 rounded overflow-hidden shrink-0">
            {r.photo && <Image src={r.photo} alt="" fill className="object-cover" sizes="64px" />}
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={`/poles/${r.id}`} className="font-semibold text-slate-900 hover:underline block truncate">
              {r.location}
            </Link>
            <p className="text-xs text-slate-500 truncate">
              {r.problem_type ?? 'Not categorized'} · {r.neighborhood} · documented{' '}
              {format(new Date(r.created_at), 'MMM d, yyyy')}
            </p>
          </div>
          {showAge && (
            <div className="text-right shrink-0">
              <div className="font-bold text-amber-700">{r.age_days}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">days</div>
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
