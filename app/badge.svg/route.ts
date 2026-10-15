import { NextRequest } from 'next/server'
import { loadApprovedReports } from '@/lib/publicData'
import { summarizeReports } from '@/lib/publicReport'
import { renderBadgeSvg, type BadgeStyle } from '@/lib/badge'

/**
 * Embeddable badge. Dynamic (reads ?style=) but CDN-cached for 5 minutes via
 * s-maxage, so association sites can hot-link it without load concerns.
 */
export async function GET(request: NextRequest) {
  const style: BadgeStyle = request.nextUrl.searchParams.get('style') === 'dark' ? 'dark' : 'light'
  const reports = await loadApprovedReports()
  const s = summarizeReports(reports)
  const svg = renderBadgeSvg({ total: s.total, oldestDays: s.oldest?.age_days ?? 0, style })
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
      // Belt and braces: an SVG served as an image must never run script.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  })
}
