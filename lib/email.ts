/**
 * Email notifications via Resend.
 *
 * Two email types:
 *   1. Pending alert — immediate, fires when a submission needs manual review
 *   2. Daily digest — cron-triggered summary of the last 24 hours
 *
 * Both are fire-and-forget. A failed email must never block a submission
 * or crash the digest cron. Same pattern as lib/notify.ts.
 */

import { Resend } from 'resend'
import { createQuickActionUrl } from '@/lib/quickActionToken'
import { CONTACT_EMAIL, getSiteUrl } from '@/lib/site'
import { isEmailConfigured } from '@/lib/emailConfig'
import {
  renderConfirmationEmail,
  renderMonthlyReportEmail,
  renderPoleUpdateEmail,
  type ConfirmationContext,
  type PoleChange,
} from '@/lib/emailTemplates'
import type { MonthlyReportData } from '@/lib/monthlyReport'
import type { PublicReport } from '@/lib/publicReport'

// Lazy init: the Resend constructor throws when the key is missing, which
// would crash next build's page-data collection for every route importing
// this module. Without a key, sends become warn-and-skip no-ops instead.
let _resend: Resend | null | undefined
function getResend(): Resend | null {
  if (_resend === undefined) {
    const key = process.env.RESEND_API_KEY
    _resend = key ? new Resend(key) : null
  }
  return _resend
}

// Resend free tier without a verified domain can only send from
// onboarding@resend.dev, and only to the Resend account owner's address.
// Set EMAIL_FROM after verifying a domain at resend.com/domains.
const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? 'Greenwich Utility Watch <onboarding@resend.dev>'

export interface PendingAlertPayload {
  id: string
  address: string | null
  description: string
  problemType: string | null
  photoCount: number
  reasons: string[]
}

export interface DigestSummary {
  autoApproved: number
  manuallyApproved: number
  rejected: number
  stillPending: number
  pendingItems: Array<{
    id: string
    address: string | null
    problemType: string | null
    createdAt: string
  }>
}

/**
 * Send an immediate alert when a submission goes to pending.
 * Includes the reasons it wasn't auto-approved and a link to the dashboard.
 */
export async function sendPendingAlert(
  to: string,
  payload: PendingAlertPayload
): Promise<void> {
  const siteUrl = getSiteUrl()
  const dashboardLink = `${siteUrl}/admin/dashboard`
  const location = payload.address || 'GPS location only'

  // Generate signed one-tap action URLs
  const approveUrl = siteUrl + await createQuickActionUrl(payload.id, 'approve')
  const rejectUrl = siteUrl + await createQuickActionUrl(payload.id, 'reject')

  const resend = getResend()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set; skipping pending alert')
    return
  }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Review needed: ${location}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px;">
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 24px; margin-bottom: 16px;">
            <h2 style="margin: 0 0 8px; font-size: 18px; color: #1e293b;">Submission needs review</h2>
            <p style="margin: 0 0 16px; color: #475569; font-size: 14px;">A new report didn't pass auto-approval.</p>

            <table style="width: 100%; font-size: 14px; color: #334155;">
              <tr><td style="padding: 4px 0; font-weight: 600;">Location</td><td style="padding: 4px 0;">${escapeHtml(location)}</td></tr>
              ${payload.problemType ? `<tr><td style="padding: 4px 0; font-weight: 600;">Type</td><td style="padding: 4px 0;">${escapeHtml(payload.problemType)}</td></tr>` : ''}
              <tr><td style="padding: 4px 0; font-weight: 600;">Photos</td><td style="padding: 4px 0;">${payload.photoCount}</td></tr>
            </table>

            <p style="margin: 16px 0 8px; color: #334155; font-size: 14px;"><strong>Description:</strong></p>
            <p style="margin: 0 0 16px; color: #475569; font-size: 14px; white-space: pre-wrap;">${escapeHtml(payload.description.slice(0, 300))}${payload.description.length > 300 ? '...' : ''}</p>

            <p style="margin: 16px 0 4px; color: #92400e; font-size: 13px; font-weight: 600;">Why it needs review:</p>
            <ul style="margin: 0 0 16px; padding-left: 20px; color: #92400e; font-size: 13px;">
              ${payload.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
            </ul>
          </div>

          <div style="text-align: center;">
            <a href="${approveUrl}" style="display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 4px;">
              Approve
            </a>
            <a href="${rejectUrl}" style="display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 4px;">
              Reject
            </a>
          </div>
          <div style="text-align: center; margin-top: 8px;">
            <a href="${dashboardLink}" style="color: #64748b; font-size: 13px; text-decoration: underline;">
              or open the dashboard
            </a>
          </div>

          <p style="margin: 24px 0 0; color: #94a3b8; font-size: 12px; text-align: center;">
            Greenwich Utility Watch — automated alert
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error('Pending alert email failed:', err)
  }
}

/**
 * Send a daily digest summarizing the last 24 hours of activity.
 * Skips sending if there were no submissions at all.
 */
export async function sendDailyDigest(
  to: string,
  summary: DigestSummary
): Promise<void> {
  const total = summary.autoApproved + summary.manuallyApproved + summary.rejected + summary.stillPending
  if (total === 0) return // no-op for empty periods

  const siteUrl = getSiteUrl()
  const dashboardLink = `${siteUrl}/admin/dashboard`

  const allClear = summary.stillPending === 0

  const resend = getResend()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set; skipping daily digest')
    return
  }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: allClear
        ? `Daily digest: ${total} reports, all clear`
        : `Daily digest: ${summary.stillPending} pending review`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px;">
          <h2 style="margin: 0 0 16px; font-size: 18px; color: #1e293b;">Daily Digest</h2>
          <p style="margin: 0 0 16px; color: #64748b; font-size: 14px;">Last 24 hours</p>

          <table style="width: 100%; font-size: 14px; color: #334155; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 0;">Auto-approved</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600;">${summary.autoApproved}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 0;">Manually approved</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600;">${summary.manuallyApproved}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 0;">Rejected</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600;">${summary.rejected}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: ${summary.stillPending > 0 ? '#dc2626' : '#16a34a'}; font-weight: 600;">
                Still pending
              </td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${summary.stillPending > 0 ? '#dc2626' : '#16a34a'};">
                ${summary.stillPending}
              </td>
            </tr>
          </table>

          ${allClear ? `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
              <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">Everything is running smoothly</p>
              <p style="margin: 4px 0 0; color: #15803d; font-size: 13px;">No submissions need your attention.</p>
            </div>
          ` : `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 0 0 8px; color: #991b1b; font-size: 14px; font-weight: 600;">${summary.stillPending} submission${summary.stillPending > 1 ? 's' : ''} pending review</p>
              ${summary.pendingItems.map((item) => `
                <p style="margin: 4px 0; color: #7f1d1d; font-size: 13px;">
                  ${escapeHtml(item.address || 'GPS location')} — ${escapeHtml(item.problemType || 'Unspecified')}
                </p>
              `).join('')}
            </div>
          `}

          <div style="text-align: center; margin-top: 16px;">
            <a href="${dashboardLink}" style="display: inline-block; background: #1e293b; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">
              Open Dashboard
            </a>
          </div>

          <p style="margin: 24px 0 0; color: #94a3b8; font-size: 12px; text-align: center;">
            Greenwich Utility Watch — daily digest
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error('Daily digest email failed:', err)
  }
}

// ---------------------------------------------------------------------------
// Subscriber email. Unlike admin alerts these go to residents, so they are
// only ever sent from a verified domain (isEmailConfigured) and every message
// carries List-Unsubscribe headers (RFC 8058 one-click) plus a footer link.
// ---------------------------------------------------------------------------

async function sendToSubscriber(opts: {
  to: string
  subject: string
  html: string
  text: string
  oneClickUnsubscribeUrl?: string
}): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.warn('[email] EMAIL_FROM / RESEND_API_KEY not set; skipping subscriber email')
    return false
  }
  const resend = getResend()
  if (!resend) return false
  try {
    const headers: Record<string, string> = {}
    if (opts.oneClickUnsubscribeUrl) {
      headers['List-Unsubscribe'] = `<${opts.oneClickUnsubscribeUrl}>`
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
    }
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: opts.to,
      replyTo: CONTACT_EMAIL,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      headers,
    })
    if (error) {
      console.error('[email] subscriber send failed:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('[email] subscriber send threw:', err)
    return false
  }
}

export async function sendSubscribeConfirmation(to: string, ctx: ConfirmationContext): Promise<boolean> {
  const { subject, html, text } = renderConfirmationEmail(ctx)
  return sendToSubscriber({ to, subject, html, text })
}

export async function sendMonthlyReportEmail(
  to: string,
  data: MonthlyReportData,
  siteUrl: string,
  unsubscribeUrl: string,
  oneClickUnsubscribeUrl: string
): Promise<boolean> {
  const { subject, html, text } = renderMonthlyReportEmail(data, siteUrl, unsubscribeUrl)
  return sendToSubscriber({ to, subject, html, text, oneClickUnsubscribeUrl })
}

export async function sendPoleUpdateEmail(
  to: string,
  report: PublicReport,
  change: PoleChange,
  unsubscribeUrl: string,
  oneClickUnsubscribeUrl: string
): Promise<boolean> {
  const { subject, html, text } = renderPoleUpdateEmail(report, change, unsubscribeUrl)
  return sendToSubscriber({ to, subject, html, text, oneClickUnsubscribeUrl })
}

// ---------------------------------------------------------------------------
// Approval queue: the monthly drafts email to the admin, and the association
// note sent from the project address once approved.
// ---------------------------------------------------------------------------

export interface DraftEmailItem {
  id: string
  channel: string
  label: string
  body: string
  approveUrl: string
  skipUrl: string
  configured: boolean
  missing: string | null
}

/**
 * One email per month to the alert address: every draft in full, each with
 * Approve and Skip buttons. Uses the admin sender (works before EMAIL_FROM is
 * set, since Resend delivers onboarding mail to the account owner).
 */
export async function sendDraftsEmail(to: string, month: string, items: DraftEmailItem[]): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set; skipping drafts email')
    return false
  }
  const siteUrl = getSiteUrl()
  const blocks = items
    .map(
      (it) => `
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 0 0 16px;">
          <p style="margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: .04em;">${escapeHtml(it.label)}</p>
          <pre style="margin: 0 0 12px; white-space: pre-wrap; font-family: inherit; font-size: 14px; line-height: 1.5; color: #334155;">${escapeHtml(it.body)}</pre>
          ${it.configured ? '' : `<p style="margin: 0 0 12px; font-size: 12px; color: #92400e;">Not connected yet: set ${escapeHtml(it.missing ?? '')} in Vercel. Approving now stores the approval; it publishes automatically once connected.</p>`}
          <div>
            <a href="${it.approveUrl}" style="display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 4px 4px 4px 0;">Approve</a>
            <a href="${it.skipUrl}" style="display: inline-block; background: #e2e8f0; color: #475569; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 4px;">Skip</a>
          </div>
        </div>`
    )
    .join('')
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Approve this month's posts (${month}): ${items.length} draft${items.length === 1 ? '' : 's'}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="margin: 0 0 4px; font-size: 18px; color: #1e293b;">State of the Poles, ${escapeHtml(month)}: drafts for approval</h2>
          <p style="margin: 0 0 20px; color: #64748b; font-size: 14px;">Each button opens a confirmation page showing the exact text. Links work for 7 days. Ignoring this email publishes nothing. Report: <a href="${siteUrl}/reports/${escapeHtml(month)}" style="color: #b45309;">${siteUrl}/reports/${escapeHtml(month)}</a></p>
          ${blocks}
          <p style="margin: 24px 0 0; color: #94a3b8; font-size: 12px; text-align: center;">Greenwich Utility Watch — automated drafts; nothing is posted without your approval</p>
        </div>`,
    })
    if (error) {
      console.error('[email] drafts email failed:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('[email] drafts email threw:', err)
    return false
  }
}

/** The approved association note, from the project address, to the configured recipients. */
export async function sendAssociationNote(recipients: string[], subject: string, text: string): Promise<boolean> {
  if (recipients.length === 0) return false
  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(text)}</div>`
  let ok = true
  for (const to of recipients) {
    if (!(await sendToSubscriber({ to, subject, html, text }))) ok = false
  }
  return ok
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
