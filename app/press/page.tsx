import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { format } from 'date-fns'
import { loadApprovedReports } from '@/lib/publicData'
import { summarizeReports, oldestReports, UNCATEGORIZED_LABEL } from '@/lib/publicReport'
import { CONTACT_EMAIL, getSiteUrl } from '@/lib/site'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Press & data',
  description:
    'Live numbers, the oldest documented poles, downloadable photos and open data from the Greenwich Utility Watch public record.',
}

export default async function PressPage() {
  const reports = await loadApprovedReports()
  const s = summarizeReports(reports)
  const exhibits = oldestReports(reports.filter((r) => r.photos.length > 0), 6)
  const site = getSiteUrl()
  const host = site.replace(/^https?:\/\//, '')
  const today = format(new Date(), 'MMMM d, yyyy')

  return (
    <div>
      <div className="bg-slate-900 text-white py-10 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">Press &amp; data</h1>
          <p className="text-slate-300">
            Everything on this page is generated from the live public record and may be quoted, linked or
            republished with attribution to Greenwich Utility Watch.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        {/* Numbers */}
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-3">The numbers, as of {today}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Reports on record" value={s.total} />
            <Stat label="Oldest report (days)" value={s.oldest ? s.oldest.age_days : 0} accent />
            <Stat label="With photos" value={s.withPhotos} />
            <Stat label="With GPS location" value={s.withGps} />
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <CountTable title="By problem type" rows={s.byType} />
            <CountTable title="By neighborhood (approximate, from GPS)" rows={s.byNeighborhood} />
          </div>
          {s.byType.some((t) => t.label === UNCATEGORIZED_LABEL) && (
            <p className="text-xs text-slate-500 mt-2">
              Reports filed before the problem-type field existed are listed as not categorized.
            </p>
          )}
        </section>

        {/* Boilerplate */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="text-lg font-bold text-slate-900">About the project, in one paragraph</h2>
          <p className="text-slate-700 leading-relaxed">
            Greenwich Utility Watch is an independent community record of problem utility poles in
            Greenwich, Connecticut: doubled &ldquo;sistered&rdquo; poles, leaning poles, low-hanging wires
            and damaged equipment. Residents submit a photo and a location from their phone; reports that
            pass basic checks are published to a public gallery, map and dashboard with the date they were
            first documented. Connecticut&apos;s utilities count more than 21,000 double poles statewide, and
            the 2026 bill to create an official resident reporting system (SB 421) died without a Senate
            vote, so this site fills that gap for one town. It is not affiliated with any utility company or
            the Town of Greenwich, and submitters are never named.
          </p>
          <p className="text-sm text-slate-500">
            Suggested citation: Greenwich Utility Watch, community record of problem utility poles,{' '}
            {host}, accessed {today}.
          </p>
        </section>

        {/* Exhibits */}
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Oldest documented poles</h2>
          <p className="text-sm text-slate-500 mb-4">
            The longest-standing entries with photos. Each links to a permanent page; photos may be
            reproduced with attribution to Greenwich Utility Watch.
          </p>
          {exhibits.length === 0 ? (
            <p className="text-slate-400">No photographed reports yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {exhibits.map((r) => (
                <div key={r.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <Link href={`/poles/${r.id}`} className="block aspect-video bg-slate-100 relative">
                    <Image
                      src={r.photos[0]}
                      alt={r.location}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </Link>
                  <div className="p-4 text-sm">
                    <p className="font-semibold text-slate-900 leading-snug">{r.location}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {r.problem_type ?? 'Utility pole report'} · {r.neighborhood}
                    </p>
                    <p className="text-xs text-slate-500">
                      Documented {format(new Date(r.created_at), 'MMM d, yyyy')} ·{' '}
                      <span className="font-semibold text-amber-700">{r.age_days} days</span>
                    </p>
                    <p className="mt-2 flex gap-3 text-xs">
                      <Link href={`/poles/${r.id}`} className="text-amber-700 hover:underline">
                        Permanent page
                      </Link>
                      <a href={r.photos[0]} target="_blank" rel="noreferrer" className="text-amber-700 hover:underline">
                        Full-size photo ↗
                      </a>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Data */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Open data</h2>
          <p className="text-sm text-slate-600 mb-4">
            Approved reports only, public columns only (no submitter details). Refreshed within five
            minutes of a change. Each report has a permanent page at <span className="font-mono text-xs">{host}/poles/&lt;id&gt;</span>.
          </p>
          <ul className="space-y-2 text-sm">
            <DataLink href="/data/reports.csv" label="CSV" note="spreadsheet-ready" />
            <DataLink href="/data/reports.json" label="JSON" note="with neighborhood, age in days and permalink per report" />
            <DataLink href="/feed.xml" label="RSS feed" note="one item per approved report; works with feed readers, newsletter tools and Slack" />
            <DataLink href="/reports" label="Monthly reports" note="State of the Poles, published on the 1st; RSS at /reports/feed.xml" />
            <DataLink href="/badge" label="Embeddable badge" note="live “N poles reported · oldest X days” image for association sites and newsletters" />
            <DataLink href="/dashboard" label="Impact dashboard" note="map and charts" />
          </ul>
        </section>

        {/* Contact */}
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-slate-700 space-y-2">
          <h2 className="text-lg font-bold text-slate-900">Contact</h2>
          <p>
            Questions, corrections, interview or data requests:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-amber-700 hover:underline">
              {CONTACT_EMAIL}
            </a>
            . The project is run by Greenwich residents on a volunteer basis; replies may take a few days.
          </p>
          <p className="text-slate-600">
            For the poles themselves: Eversource 1-800-286-2000 (pole and electric wires), Frontier
            1-800-921-8101 (communications wires), PURA complaints at portal.ct.gov/pura.
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
        <p className="text-sm text-slate-400">None yet</p>
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

function DataLink({ href, label, note }: { href: string; label: string; note: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <a href={href} className="font-semibold text-amber-700 hover:underline shrink-0">
        {label}
      </a>
      <span className="font-mono text-xs text-slate-500">{href}</span>
      <span className="text-slate-500">— {note}</span>
    </li>
  )
}
