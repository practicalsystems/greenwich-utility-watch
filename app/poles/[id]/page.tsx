import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { isValidUUID } from '@/lib/validate'
import { loadApprovedReport } from '@/lib/publicData'
import { CONTACT_EMAIL } from '@/lib/site'
import SubscribeForm from '@/components/SubscribeForm'
import { isEmailConfigured } from '@/lib/emailConfig'

export const revalidate = 60
export const dynamicParams = true

// Pages are rendered on first request and cached; nothing is prerendered at build.
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  if (!isValidUUID(id)) return { title: 'Report not found' }
  const r = await loadApprovedReport(id)
  if (!r) return { title: 'Report not found' }
  const title = `${r.problem_type ?? 'Utility pole report'} — ${r.location}`
  const description = `${r.description.slice(0, 160)}${r.description.length > 160 ? '…' : ''} Reported ${format(new Date(r.created_at), 'MMMM d, yyyy')}, ${r.age_days} days ago.`
  return {
    title,
    description,
    alternates: { canonical: r.url },
    openGraph: {
      title,
      description,
      url: r.url,
      type: 'article',
      publishedTime: r.created_at,
      images: r.photos[0] ? [{ url: r.photos[0] }] : undefined,
    },
    twitter: { card: r.photos[0] ? 'summary_large_image' : 'summary', title, description },
  }
}

export default async function PolePage({ params }: Props) {
  const { id } = await params
  if (!isValidUUID(id)) notFound()
  const r = await loadApprovedReport(id)
  if (!r) notFound()

  const reported = format(new Date(r.created_at), 'MMMM d, yyyy')

  return (
    <div>
      <div className="bg-slate-900 text-white py-10 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-amber-400 text-sm font-medium mb-1">
            {r.problem_type ?? 'Utility pole report'}
          </p>
          <h1 className="text-2xl font-bold mb-2">{r.location}</h1>
          <p className="text-slate-300">
            On the public record since {reported} ·{' '}
            <span className="text-amber-400 font-semibold">{r.age_days} days</span>
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {r.photos.length > 0 && (
          <div className="grid gap-4">
            {r.photos.map((url, i) => (
              <figure key={url} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="relative bg-slate-900 h-72 sm:h-96">
                  <Image
                    src={url}
                    alt={`Photo ${i + 1} of ${r.photos.length}: ${r.location}`}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, 768px"
                    priority={i === 0}
                  />
                </div>
                <figcaption className="px-4 py-2 text-xs text-slate-500 flex justify-between">
                  <span>Photo {i + 1} of {r.photos.length}, as submitted</span>
                  <a href={url} target="_blank" rel="noreferrer" className="text-amber-700 hover:underline">
                    Open full size ↗
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        <article className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-xs text-slate-400 uppercase tracking-wide mb-1">Description</h2>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">{r.description}</p>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Reported</dt>
              <dd className="text-slate-900">{reported}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Days on record</dt>
              <dd className="text-slate-900 font-semibold">{r.age_days}</dd>
            </div>
            {r.duration && (
              <div>
                <dt className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Problem present for</dt>
                <dd className="text-slate-900">{r.duration}</dd>
              </div>
            )}
            {r.pole_id && (
              <div>
                <dt className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Pole ID</dt>
                <dd className="font-mono text-slate-900">#{r.pole_id}</dd>
              </div>
            )}
            {r.cross_streets && (
              <div>
                <dt className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Cross streets</dt>
                <dd className="text-slate-900">{r.cross_streets}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Neighborhood (approx.)</dt>
              <dd className="text-slate-900">{r.neighborhood}</dd>
            </div>
            {r.latitude != null && r.longitude != null && (
              <div className="col-span-2">
                <dt className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">GPS</dt>
                <dd className="font-mono text-xs text-slate-700">
                  {r.latitude}, {r.longitude}{' '}
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}&zoom=18`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-sans text-amber-700 hover:underline ml-2"
                  >
                    View on map ↗
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </article>

        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs text-slate-400 uppercase tracking-wide mb-2">Official follow-up</h2>
          {r.reported_to || r.official_response || r.resolved_at ? (
            <div className="text-sm text-slate-800 space-y-1">
              {r.reported_to && (
                <p>
                  Reported to <strong>{r.reported_to}</strong>
                  {r.reported_at ? ` on ${r.reported_at}` : ''}.
                </p>
              )}
              {r.official_response && <p className="whitespace-pre-wrap">{r.official_response}</p>}
              {r.resolved_at && <p className="text-green-700 font-medium">Resolved {r.resolved_at}.</p>}
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              No official response has been recorded for this pole. Responses from Eversource, Frontier, the Town
              or PURA are recorded here when received.
            </p>
          )}
        </section>

        {isEmailConfigured() && (
          <SubscribeForm
            source="pole"
            submissionId={r.id}
            heading="Tell me when this pole changes"
            description="One email when this report gets an official response or is marked resolved, plus the monthly State of the Poles. Unsubscribe any time."
          />
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-slate-700 space-y-2">
          <p className="font-semibold text-slate-800">Share or cite this report</p>
          <p>
            Permanent link: <span className="font-mono text-xs break-all">{r.url}</span>
          </p>
          <p>
            This is one entry in a community record maintained by Greenwich Utility Watch, not affiliated
            with any utility or the Town of Greenwich. Questions or corrections:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-amber-700 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
          <p>
            <Link href="/gallery" className="text-amber-700 hover:underline font-medium">
              All reports
            </Link>
            {' · '}
            <Link href="/" className="text-amber-700 hover:underline font-medium">
              Report a pole
            </Link>
            {' · '}
            <Link href="/press" className="text-amber-700 hover:underline font-medium">
              Press &amp; data
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
