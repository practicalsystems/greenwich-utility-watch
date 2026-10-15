/**
 * RSS 2.0 feed builders. Pure functions: no I/O, fully unit-tested.
 *
 * Why RSS and not only JSON: feed readers, newsletter tools (Mailchimp,
 * Buttondown, Substack), Zapier/IFTTT-style automations and Slack all consume
 * RSS natively. It is the one format that lets other people republish the
 * record with zero coordination.
 */

import type { PublicReport } from '@/lib/publicReport'

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function rfc822(iso: string): string {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toUTCString() : new Date(0).toUTCString()
}

export interface FeedItem {
  title: string
  link: string
  guid: string
  pubDate: string // ISO
  description: string // HTML, will be escaped
  categories?: string[]
  imageUrl?: string
}

export interface FeedOptions {
  title: string
  link: string
  feedUrl: string
  description: string
  lastBuildDate?: string // ISO
}

export function buildRss(opts: FeedOptions, items: FeedItem[]): string {
  const lastBuild = opts.lastBuildDate ?? items[0]?.pubDate ?? new Date(0).toISOString()
  const itemXml = items
    .map((it) => {
      const cats = (it.categories ?? [])
        .map((c) => `      <category>${escapeXml(c)}</category>`)
        .join('\n')
      const enclosure = it.imageUrl
        ? `\n      <enclosure url="${escapeXml(it.imageUrl)}" type="image/jpeg" length="0" />`
        : ''
      return `    <item>
      <title>${escapeXml(it.title)}</title>
      <link>${escapeXml(it.link)}</link>
      <guid isPermaLink="true">${escapeXml(it.guid)}</guid>
      <pubDate>${rfc822(it.pubDate)}</pubDate>
      <description>${escapeXml(it.description)}</description>${enclosure}
${cats}
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(opts.title)}</title>
    <link>${escapeXml(opts.link)}</link>
    <atom:link href="${escapeXml(opts.feedUrl)}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(opts.description)}</description>
    <language>en-us</language>
    <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>
${itemXml}
  </channel>
</rss>
`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function reportToFeedItem(r: PublicReport): FeedItem {
  const type = r.problem_type ?? 'Utility pole report'
  const parts = [
    `<p>${escapeHtml(r.description)}</p>`,
    `<p>${escapeHtml(r.location)}${r.cross_streets ? ` (${escapeHtml(r.cross_streets)})` : ''}` +
      `${r.pole_id ? ` · Pole #${escapeHtml(r.pole_id)}` : ''} · ${escapeHtml(r.neighborhood)} (approx.)</p>`,
  ]
  if (r.photos[0]) {
    parts.push(`<p><img src="${escapeHtml(r.photos[0])}" alt="${escapeHtml(r.location)}" /></p>`)
  }
  return {
    title: `${type}: ${r.location}`,
    link: r.url,
    guid: r.url,
    pubDate: r.created_at,
    description: parts.join(''),
    categories: [type, r.neighborhood],
    imageUrl: r.photos[0],
  }
}

export function buildReportsFeed(reports: PublicReport[], siteUrl: string): string {
  const sorted = [...reports].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  return buildRss(
    {
      title: 'Greenwich Utility Watch — approved reports',
      link: `${siteUrl}/gallery`,
      feedUrl: `${siteUrl}/feed.xml`,
      description:
        'Community-documented utility pole problems in Greenwich, CT. Each item is one approved public report.',
    },
    sorted.map(reportToFeedItem)
  )
}
