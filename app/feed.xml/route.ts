import { loadApprovedReports } from '@/lib/publicData'
import { buildReportsFeed } from '@/lib/feed'
import { getSiteUrl } from '@/lib/site'

// Regenerated at most every 5 minutes; approved reports appear within that window.
export const revalidate = 300

export async function GET() {
  const reports = await loadApprovedReports()
  const xml = buildReportsFeed(reports, getSiteUrl())
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  })
}
