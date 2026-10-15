import { describe, it, expect } from 'vitest'
import { buildRss, buildReportsFeed, escapeXml, reportToFeedItem } from '@/lib/feed'
import { toPublicReport, type PublicRow } from '@/lib/publicReport'

const SITE = 'https://example.org'
const NOW = Date.UTC(2026, 9, 14)

const base: PublicRow = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  created_at: '2026-03-16T12:00:00.000Z',
  address: 'Loughlin Ave & Valley Rd',
  cross_streets: null,
  pole_id: null,
  latitude: 41.0315,
  longitude: -73.6005,
  description: 'Rope <holding> the "pair" & more',
  status: 'approved',
  photos: ['https://abc.supabase.co/storage/v1/object/public/submission-photos/a.jpg'],
  problem_type: 'Double Poles / Sistered Pole',
  duration: null,
}

describe('escapeXml', () => {
  it('escapes the five XML specials', () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;')
  })
})

describe('buildRss', () => {
  it('produces a well-formed channel with self link and items', () => {
    const xml = buildRss(
      { title: 'T', link: 'https://x', feedUrl: 'https://x/feed.xml', description: 'D' },
      [{ title: 'I', link: 'https://x/1', guid: 'https://x/1', pubDate: '2026-01-02T00:00:00Z', description: '<p>hi</p>' }]
    )
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain('<atom:link href="https://x/feed.xml" rel="self"')
    expect(xml).toContain('<guid isPermaLink="true">https://x/1</guid>')
    expect(xml).toContain('<pubDate>Fri, 02 Jan 2026 00:00:00 GMT</pubDate>')
    expect(xml).toContain('<description>&lt;p&gt;hi&lt;/p&gt;</description>')
    expect(xml.trim().endsWith('</rss>')).toBe(true)
  })
})

describe('reportToFeedItem', () => {
  it('escapes user text and includes photo, type and neighborhood', () => {
    const item = reportToFeedItem(toPublicReport(base, SITE, NOW))
    expect(item.title).toBe('Double Poles / Sistered Pole: Loughlin Ave & Valley Rd')
    expect(item.link).toBe(`${SITE}/poles/${base.id}`)
    expect(item.description).toContain('Rope &lt;holding&gt; the &quot;pair&quot; &amp; more')
    expect(item.description).toContain('<img src="https://abc.supabase.co/')
    expect(item.categories).toEqual(['Double Poles / Sistered Pole', 'Cos Cob'])
    expect(item.imageUrl).toBe(base.photos![0])
  })

  it('uses a generic title for uncategorized reports and omits the image when none', () => {
    const item = reportToFeedItem(toPublicReport({ ...base, problem_type: null, photos: [] }, SITE, NOW))
    expect(item.title.startsWith('Utility pole report:')).toBe(true)
    expect(item.imageUrl).toBeUndefined()
    expect(item.description).not.toContain('<img')
  })
})

describe('buildReportsFeed', () => {
  it('orders newest first and never leaks raw angle brackets from content', () => {
    const older = toPublicReport(base, SITE, NOW)
    const newer = toPublicReport({ ...base, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', created_at: '2026-04-28T00:00:00Z' }, SITE, NOW)
    const xml = buildReportsFeed([older, newer], SITE)
    expect(xml.indexOf('bbbbbbbb')).toBeLessThan(xml.indexOf('aaaaaaaa'))
    expect(xml).not.toContain('<holding>')
    expect(xml).toContain(`<atom:link href="${SITE}/feed.xml"`)
  })
})
