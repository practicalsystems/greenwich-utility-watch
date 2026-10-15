/**
 * Lightweight notification system for admin alerts.
 *
 * Set NOTIFY_WEBHOOK_URL in your environment to receive a message whenever
 * a new submission arrives or when an API route encounters an unexpected error.
 *
 * Works out of the box with:
 *   - Discord webhooks  (discord.com/api/webhooks/...)
 *   - Slack webhooks    (hooks.slack.com/services/...)
 *   - ntfy.sh           (ntfy.sh/<topic>)
 *   - Any HTTP endpoint that accepts a JSON POST body
 *
 * For full error tracking with stack traces and source maps, add Sentry:
 *   https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import { getSiteUrl } from '@/lib/site'

export interface SubmissionNotification {
  address: string | null
  description: string
  problemType: string | null
  photoCount: number
}

export async function notifyNewSubmission(payload: SubmissionNotification): Promise<void> {
  const webhookUrl = process.env.NOTIFY_WEBHOOK_URL
  if (!webhookUrl) return

  const dashboardLink = `${getSiteUrl()}/admin/dashboard`

  const lines = [
    `📬 **New report submitted**`,
    `📍 ${payload.address || 'GPS location'}`,
    payload.problemType ? `🔧 ${payload.problemType}` : null,
    `📝 ${payload.description.slice(0, 200)}${payload.description.length > 200 ? '…' : ''}`,
    payload.photoCount > 0 ? `📷 ${payload.photoCount} photo${payload.photoCount > 1 ? 's' : ''}` : null,
    `🔗 ${dashboardLink}`,
  ]
    .filter(Boolean)
    .join('\n')

  await sendWebhook(webhookUrl, lines)
}

export async function notifyServerError(context: string, err: unknown): Promise<void> {
  const webhookUrl = process.env.NOTIFY_WEBHOOK_URL
  if (!webhookUrl) return

  const message = err instanceof Error ? err.message : String(err)
  const text = `🚨 **Server error** in \`${context}\`\n\`\`\`\n${message.slice(0, 500)}\n\`\`\``

  await sendWebhook(webhookUrl, text)
}

async function sendWebhook(url: string, text: string): Promise<void> {
  try {
    const isDiscord = url.includes('discord.com/api/webhooks')
    const isSlack = url.includes('hooks.slack.com')

    let body: string
    if (isDiscord) {
      body = JSON.stringify({ content: text })
    } else if (isSlack) {
      body = JSON.stringify({ text })
    } else {
      // Generic — send both keys so most services work
      body = JSON.stringify({ text, content: text })
    }

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    // Webhook failure must never affect the main request
    console.error('Notification webhook failed:', err)
  }
}
