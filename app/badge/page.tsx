import type { Metadata } from 'next'
import Link from 'next/link'
import { getSiteUrl } from '@/lib/site'
import { loadApprovedReports } from '@/lib/publicData'
import { summarizeReports } from '@/lib/publicReport'
import { badgeValueText } from '@/lib/badge'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Embeddable badge',
  description: 'A small live badge for neighborhood association sites and newsletters: how many problem poles are on the Greenwich record and how long the oldest has waited.',
}

export default async function BadgePage() {
  const site = getSiteUrl()
  const s = summarizeReports(await loadApprovedReports())
  const alt = `Greenwich Utility Watch: ${badgeValueText({ total: s.total, oldestDays: s.oldest?.age_days ?? 0 })}`
  const html = `<a href="${site}"><img src="${site}/badge.svg" alt="${alt}" height="20"></a>`
  const htmlDark = `<a href="${site}"><img src="${site}/badge.svg?style=dark" alt="${alt}" height="20"></a>`
  const md = `[![${alt}](${site}/badge.svg)](${site})`

  return (
    <div>
      <div className="bg-slate-900 text-white py-10 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">Embeddable badge</h1>
          <p className="text-slate-300">
            A small image that always shows the current numbers. Paste it into a neighborhood association site,
            a newsletter or a blog; it updates itself within five minutes of a change to the record.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Preview</h2>
          <div className="flex flex-wrap items-center gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/badge.svg" alt={alt} height={20} />
            <div className="bg-slate-900 rounded px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badge.svg?style=dark" alt={alt} height={20} />
            </div>
          </div>
          <p className="text-xs text-slate-500">Right now: {alt.replace('Greenwich Utility Watch: ', '')}.</p>
        </section>

        <Snippet title="HTML (most sites and newsletter editors)" code={html} />
        <Snippet title="HTML, dark variant" code={htmlDark} />
        <Snippet title="Markdown" code={md} />

        <section className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-slate-700 space-y-2">
          <p>
            The badge links back to the site. Numbers come from the public record of approved reports; nothing
            about who reported a pole is ever included. No tracking: the image is a plain SVG with no script
            and no cookies.
          </p>
          <p>
            <Link href="/press" className="text-amber-700 hover:underline font-medium">Press &amp; data</Link>
            {' · '}
            <Link href="/reports" className="text-amber-700 hover:underline font-medium">Monthly reports</Link>
          </p>
        </section>
      </div>
    </div>
  )
}

function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-800 mb-2">{title}</h3>
      <pre className="bg-slate-900 text-slate-100 text-xs rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all">
        <code>{code}</code>
      </pre>
    </section>
  )
}
