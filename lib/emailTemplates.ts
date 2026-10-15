/**
 * HTML + text renderers for subscriber email. Pure functions so the content
 * (no personal names, correct links, unsubscribe in every message) is tested.
 */

import type { MonthlyReportData } from '@/lib/monthlyReport'
import { renderMonthlyReportText } from '@/lib/monthlyReport'
import type { PublicReport } from '@/lib/publicReport'
import { CONTACT_EMAIL } from '@/lib/site'

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const FONT = "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"

function shell(body: string, footer: string): string {
  return `<div style="${FONT} max-width: 560px; margin: 0 auto; padding: 20px; color: #334155;">
${body}
<p style="margin: 28px 0 0; color: #94a3b8; font-size: 12px; text-align: center; line-height: 1.6;">
  Greenwich Utility Watch · a community record, not affiliated with any utility or the Town of Greenwich<br/>
  ${footer}
</p>
</div>`
}

function unsubFooter(unsubscribeUrl: string): string {
  return `<a href="${escapeHtml(unsubscribeUrl)}" style="color: #94a3b8;">Unsubscribe</a> · Questions: <a href="mailto:${CONTACT_EMAIL}" style="color: #94a3b8;">${CONTACT_EMAIL}</a>`
}

export interface ConfirmationContext {
  confirmUrl: string
  /** When the subscription is a watch on one pole. */
  poleLocation?: string | null
}

export function renderConfirmationEmail(ctx: ConfirmationContext): { subject: string; html: string; text: string } {
  const what = ctx.poleLocation
    ? `updates about the pole at ${ctx.poleLocation}, plus the monthly State of the Poles report`
    : 'the monthly State of the Poles report'
  const subject = 'Confirm your Greenwich Utility Watch subscription'
  const html = shell(
    `<h2 style="margin: 0 0 8px; font-size: 18px; color: #1e293b;">One more step</h2>
<p style="font-size: 14px; line-height: 1.6;">You asked to receive ${escapeHtml(what)} from Greenwich Utility Watch. Confirm below; nothing is sent until you do.</p>
<p style="text-align: center; margin: 24px 0;">
  <a href="${escapeHtml(ctx.confirmUrl)}" style="display: inline-block; background: #1e293b; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">Confirm subscription</a>
</p>
<p style="font-size: 12px; color: #64748b;">If you did not request this, ignore this email and nothing further will be sent. The link expires in 7 days.</p>`,
    `Questions: <a href="mailto:${CONTACT_EMAIL}" style="color: #94a3b8;">${CONTACT_EMAIL}</a>`
  )
  const text = `You asked to receive ${what} from Greenwich Utility Watch.\n\nConfirm: ${ctx.confirmUrl}\n\nIf you did not request this, ignore this email. The link expires in 7 days.\n\nQuestions: ${CONTACT_EMAIL}`
  return { subject, html, text }
}

export function renderMonthlyReportEmail(
  d: MonthlyReportData,
  siteUrl: string,
  unsubscribeUrl: string
): { subject: string; html: string; text: string } {
  const reportUrl = `${siteUrl}/reports/${d.month}`
  const subject = `State of the Poles — ${d.label}: ${d.totals.total} on record, oldest ${d.totals.oldestDays} days`
  const rows = (xs: { label: string; count: number }[]) =>
    xs
      .map(
        (x) =>
          `<tr><td style="padding: 3px 0; color: #475569;">${escapeHtml(x.label)}</td><td style="padding: 3px 0; text-align: right; font-weight: 600;">${x.count}</td></tr>`
      )
      .join('')
  const oldest = d.oldest
    .slice(0, 5)
    .map(
      (o) =>
        `<li style="margin: 4px 0;"><a href="${escapeHtml(o.url)}" style="color: #b45309;">${escapeHtml(o.location)}</a> — ${o.age_days} days${o.problem_type ? `, ${escapeHtml(o.problem_type)}` : ''}</li>`
    )
    .join('')
  const html = shell(
    `<p style="margin: 0 0 4px; color: #b45309; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em;">State of the Poles</p>
<h2 style="margin: 0 0 12px; font-size: 20px; color: #1e293b;">${escapeHtml(d.label)}</h2>
<table style="width: 100%; font-size: 14px; border-collapse: collapse; margin-bottom: 16px;">
  <tr><td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0;">Problem poles on the public record</td><td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700; font-size: 18px;">${d.totals.total}</td></tr>
  <tr><td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0;">New in ${escapeHtml(d.label)}</td><td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${d.totals.newThisMonth}</td></tr>
  <tr><td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0;">Longest wait</td><td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${d.totals.oldestDays} days</td></tr>
  <tr><td style="padding: 6px 0;">Official responses recorded</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${d.responses.length}</td></tr>
</table>
${d.byType.length ? `<p style="margin: 12px 0 4px; font-size: 13px; font-weight: 600; color: #1e293b;">By problem type</p><table style="width: 100%; font-size: 13px; border-collapse: collapse;">${rows(d.byType)}</table>` : ''}
${d.byNeighborhood.length ? `<p style="margin: 12px 0 4px; font-size: 13px; font-weight: 600; color: #1e293b;">By neighborhood (approximate)</p><table style="width: 100%; font-size: 13px; border-collapse: collapse;">${rows(d.byNeighborhood)}</table>` : ''}
${oldest ? `<p style="margin: 12px 0 4px; font-size: 13px; font-weight: 600; color: #1e293b;">Longest-standing</p><ul style="margin: 0; padding-left: 18px; font-size: 13px;">${oldest}</ul>` : ''}
<p style="text-align: center; margin: 24px 0 8px;">
  <a href="${escapeHtml(reportUrl)}" style="display: inline-block; background: #1e293b; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">Read the full report</a>
</p>
<p style="text-align: center; font-size: 13px;"><a href="${escapeHtml(siteUrl)}" style="color: #b45309;">Report a pole</a> · <a href="${escapeHtml(siteUrl)}/press" style="color: #b45309;">Data</a></p>`,
    unsubFooter(unsubscribeUrl)
  )
  const text = `${renderMonthlyReportText(d, siteUrl)}\n\nUnsubscribe: ${unsubscribeUrl}`
  return { subject, html, text }
}

export type PoleChange =
  | { kind: 'approved' }
  | { kind: 'follow_up' }
  | { kind: 'resolved' }

export function describeChange(c: PoleChange): string {
  switch (c.kind) {
    case 'approved':
      return 'is now on the public record'
    case 'resolved':
      return 'has been marked resolved'
    case 'follow_up':
      return 'has an official follow-up recorded'
  }
}

export function renderPoleUpdateEmail(
  r: PublicReport,
  change: PoleChange,
  unsubscribeUrl: string
): { subject: string; html: string; text: string } {
  const what = describeChange(change)
  const subject = `Pole update: ${r.location} ${what}`
  const followUp =
    r.reported_to || r.official_response || r.resolved_at
      ? `<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 13px; margin: 12px 0;">
${r.reported_to ? `<p style="margin: 0 0 4px;">Reported to <strong>${escapeHtml(r.reported_to)}</strong>${r.reported_at ? ` on ${escapeHtml(r.reported_at)}` : ''}.</p>` : ''}
${r.official_response ? `<p style="margin: 0 0 4px; white-space: pre-wrap;">${escapeHtml(r.official_response)}</p>` : ''}
${r.resolved_at ? `<p style="margin: 0; color: #15803d; font-weight: 600;">Resolved ${escapeHtml(r.resolved_at)}.</p>` : ''}
</div>`
      : ''
  const html = shell(
    `<h2 style="margin: 0 0 8px; font-size: 18px; color: #1e293b;">${escapeHtml(r.location)}</h2>
<p style="font-size: 14px; line-height: 1.6;">The pole you are watching ${escapeHtml(what)}.${r.problem_type ? ` Problem type: ${escapeHtml(r.problem_type)}.` : ''} On the record for ${r.age_days} days.</p>
${followUp}
<p style="text-align: center; margin: 20px 0 0;">
  <a href="${escapeHtml(r.url)}" style="display: inline-block; background: #1e293b; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">View the report</a>
</p>`,
    unsubFooter(unsubscribeUrl)
  )
  const text = `${r.location} ${what}.\n${r.url}\n\nUnsubscribe: ${unsubscribeUrl}`
  return { subject, html, text }
}
