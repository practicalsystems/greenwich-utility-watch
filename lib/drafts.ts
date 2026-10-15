/**
 * Monthly outbound drafts: social posts and the neighborhood-association note,
 * generated from the published State of the Poles. Pure.
 *
 * Voice rules (AGENTS.md "Product and owner preferences"): factual-neutral,
 * civic, no names, no jokes, no asks beyond "add the pole on your street".
 * Every draft is signed by a human via one-tap approval before it goes out.
 */

import type { MonthlyReportData } from '@/lib/monthlyReport'
import { CONTACT_EMAIL } from '@/lib/site'

export type DraftChannel = 'bluesky' | 'x' | 'association'

export const CHANNEL_LIMITS: Record<DraftChannel, number> = {
  bluesky: 300, // graphemes
  x: 280, // weighted chars; URLs count 23
  association: 4000,
}

export const CHANNEL_LABELS: Record<DraftChannel, string> = {
  bluesky: 'Bluesky post',
  x: 'X post',
  association: 'Neighborhood association note',
}

export interface DraftSpec {
  channel: DraftChannel
  body: string
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function headline(d: MonthlyReportData): string {
  const t = d.totals
  const parts = [`${plural(t.total, 'problem utility pole', 'problem utility poles')} on the Greenwich public record`]
  if (t.newThisMonth > 0) parts.push(`${t.newThisMonth} new in ${d.label.split(' ')[0]}`)
  if (t.oldestDays > 0) parts.push(`the oldest has waited ${plural(t.oldestDays, 'day', 'days')}`)
  return parts.join('; ') + '.'
}

function topType(d: MonthlyReportData): string | null {
  const t = d.byType.find((x) => !x.label.startsWith('Not categorized'))
  return t ? `${t.count} are ${t.label.toLowerCase()}.` : null
}

export function socialPost(d: MonthlyReportData, siteUrl: string, limit: number): string {
  const url = `${siteUrl}/reports/${d.month}`
  const lines = [`State of the Poles, ${d.label}:`, headline(d)]
  const tt = topType(d)
  if (tt) lines.push(tt)
  if (d.responses.length > 0) lines.push(`${plural(d.responses.length, 'official response', 'official responses')} recorded.`)
  lines.push(`Full report and a form to add the pole on your street: ${url}`)
  let text = lines.join('\n')
  // Trim optional lines until it fits. The URL is always kept.
  const optional = [tt, d.responses.length > 0 ? 'responses' : null].filter(Boolean).length
  for (let i = 0; i < optional && xLength(text) > limit; i++) {
    const idx = lines.length - 2 // last optional line sits just before the URL line
    lines.splice(idx, 1)
    text = lines.join('\n')
  }
  return text
}

/** X counts URLs as 23 regardless of length; everything else as its length. */
export function xLength(text: string): number {
  return text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length
}

export function graphemeLength(text: string): number {
  // Intl.Segmenter is available in Node 24 and modern browsers.
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(seg.segment(text)).length
}

export function associationNote(d: MonthlyReportData, siteUrl: string): string {
  const oldest = d.oldest.slice(0, 3)
  const byHood = d.byNeighborhood.filter((n) => n.label !== 'Unknown').slice(0, 4)
  const lines: string[] = []
  lines.push(`Subject: State of the Poles, ${d.label} — a short item for your newsletter`)
  lines.push('')
  lines.push('Hello,')
  lines.push('')
  lines.push(
    `Greenwich Utility Watch is an independent public record of problem utility poles in town: doubled "sistered" poles, leaning poles, low-hanging wires and damaged equipment. Residents add a photo and a location from their phone; approved reports are published with the date they were first documented.`
  )
  lines.push('')
  lines.push(`As of ${d.label}: ${headline(d)}`)
  if (byHood.length) {
    lines.push(`By neighborhood (approximate, from GPS): ${byHood.map((n) => `${n.label} ${n.count}`).join(', ')}.`)
  }
  if (oldest.length) {
    lines.push('')
    lines.push('Longest-standing:')
    for (const o of oldest) lines.push(`- ${o.location}, ${plural(o.age_days, 'day', 'days')}${o.problem_type ? ` (${o.problem_type})` : ''}: ${o.url}`)
  }
  lines.push('')
  lines.push(
    d.responses.length > 0
      ? `${plural(d.responses.length, 'official response has', 'official responses have')} been recorded so far.`
      : 'No official response has been recorded for any report so far.'
  )
  lines.push('')
  lines.push(`If it is useful to your members, a one-line item with the link is all it takes: "Problem utility pole on your street? Put it on the record at ${siteUrl}". A live badge for your website is at ${siteUrl}/badge and the full monthly report is at ${siteUrl}/reports/${d.month}.`)
  lines.push('')
  lines.push('The project is free, run by Greenwich residents on a volunteer basis, and not affiliated with any utility or the Town.')
  lines.push('')
  lines.push('Greenwich Utility Watch')
  lines.push(CONTACT_EMAIL)
  lines.push(siteUrl)
  return lines.join('\n')
}

export function generateDrafts(d: MonthlyReportData, siteUrl: string): DraftSpec[] {
  return [
    { channel: 'bluesky', body: socialPost(d, siteUrl, CHANNEL_LIMITS.bluesky) },
    { channel: 'x', body: socialPost(d, siteUrl, CHANNEL_LIMITS.x) },
    { channel: 'association', body: associationNote(d, siteUrl) },
  ]
}

/** Length check per channel's own counting rules. */
export function fitsChannel(channel: DraftChannel, body: string): boolean {
  if (channel === 'x') return xLength(body) <= CHANNEL_LIMITS.x
  if (channel === 'bluesky') return graphemeLength(body) <= CHANNEL_LIMITS.bluesky
  return body.length <= CHANNEL_LIMITS.association
}
