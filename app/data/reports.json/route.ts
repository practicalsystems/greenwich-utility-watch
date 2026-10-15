import { loadApprovedReports } from '@/lib/publicData'
import { getSiteUrl } from '@/lib/site'

export const revalidate = 300

/**
 * Public export of approved reports. Only the columns the anon role may read
 * (see lib/publicReport.ts) plus derived neighborhood, age and permalink.
 */
export async function GET() {
  const reports = await loadApprovedReports()
  const body = {
    source: 'Greenwich Utility Watch',
    site: getSiteUrl(),
    license: 'Public record; cite greenwichutilitywatch.org',
    generated_at: new Date().toISOString(),
    count: reports.length,
    reports,
  }
  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
