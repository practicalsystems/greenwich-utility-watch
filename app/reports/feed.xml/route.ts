import { listMonthlyReports } from '@/lib/publicData'
import { buildRss } from '@/lib/feed'
import { renderMonthlyReportText } from '@/lib/monthlyReport'
import { getSiteUrl } from '@/lib/site'

export const revalidate = 300

/** RSS of published monthly reports, one item per month. */
export async function GET() {
  const site = getSiteUrl()
  const stored = await listMonthlyReports()
  const xml = buildRss(
    {
      title: 'Greenwich Utility Watch — State of the Poles',
      link: `${site}/reports`,
      feedUrl: `${site}/reports/feed.xml`,
      description: 'Monthly summaries of utility pole problems on the Greenwich public record.',
    },
    stored.map((s) => ({
      title: `State of the Poles — ${s.data.label}`,
      link: `${site}/reports/${s.month}`,
      guid: `${site}/reports/${s.month}`,
      pubDate: s.generated_at,
      description: `<pre>${renderMonthlyReportText(s.data, site)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</pre>`,
      categories: ['Monthly report'],
    }))
  )
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  })
}
