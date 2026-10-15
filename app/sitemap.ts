import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site'
import { listMonthlyReports, loadApprovedReports } from '@/lib/publicData'

const SITE_URL = getSiteUrl()

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [reports, monthly] = await Promise.all([loadApprovedReports(), listMonthlyReports()])
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/gallery`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/dashboard`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/press`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/badge`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/reports`, changeFrequency: 'monthly', priority: 0.7 },
    ...monthly.map((m) => ({
      url: `${SITE_URL}/reports/${m.month}`,
      lastModified: new Date(m.generated_at),
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    })),
    ...reports.map((r) => ({
      url: r.url,
      lastModified: new Date(r.created_at),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
}
