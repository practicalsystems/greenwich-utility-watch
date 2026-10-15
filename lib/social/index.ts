/**
 * Publish an approved draft through its channel's official API.
 *
 * Every adapter is behind a credential check so the queue works before any
 * account exists: an approved draft for an unconfigured channel is kept as
 * "approved" and published later by publishApprovedDrafts() once the env
 * vars appear.
 */

import { blueskyCredsFromEnv, publishToBluesky, type PublishFailure, type PublishResult } from '@/lib/social/bluesky'
import { publishToX, xCredsFromEnv } from '@/lib/social/x'
import type { DraftChannel } from '@/lib/drafts'
import { isEmailConfigured } from '@/lib/emailConfig'
import { sendAssociationNote } from '@/lib/email'

export type PublishOutcome = PublishResult | PublishFailure | { ok: false; notConfigured: true; missing: string }

export function associationRecipients(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ASSOCIATION_RECIPIENTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function channelConfigured(channel: DraftChannel, env: Record<string, string | undefined> = process.env): { ok: true } | { ok: false; missing: string } {
  switch (channel) {
    case 'bluesky':
      return blueskyCredsFromEnv(env) ? { ok: true } : { ok: false, missing: 'BLUESKY_HANDLE and BLUESKY_APP_PASSWORD' }
    case 'x':
      return xCredsFromEnv(env) ? { ok: true } : { ok: false, missing: 'X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_SECRET' }
    case 'association':
      if (!isEmailConfigured(env)) return { ok: false, missing: 'EMAIL_FROM (verified sending domain)' }
      if (associationRecipients(env).length === 0) return { ok: false, missing: 'ASSOCIATION_RECIPIENTS' }
      return { ok: true }
  }
}

/** Split "Subject: …\n\n<body>" into its parts. */
export function splitSubject(body: string): { subject: string; text: string } {
  const m = /^Subject:\s*(.+)\n\n?/.exec(body)
  if (!m) return { subject: 'Greenwich Utility Watch — monthly note', text: body }
  return { subject: m[1].trim(), text: body.slice(m[0].length) }
}

export async function publishDraft(channel: DraftChannel, body: string): Promise<PublishOutcome> {
  const conf = channelConfigured(channel)
  if (!conf.ok) return { ok: false, notConfigured: true, missing: conf.missing }
  switch (channel) {
    case 'bluesky':
      return publishToBluesky(body, blueskyCredsFromEnv()!)
    case 'x':
      return publishToX(body, xCredsFromEnv()!)
    case 'association': {
      const { subject, text } = splitSubject(body)
      const recipients = associationRecipients()
      const sent = await sendAssociationNote(recipients, subject, text)
      return sent
        ? { ok: true, id: `email:${recipients.length}`, url: `mailto:${recipients.join(',')}` }
        : { ok: false, error: 'Association email send failed' }
    }
  }
}
