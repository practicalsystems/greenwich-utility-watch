import { describe, it, expect, beforeAll } from 'vitest'
import { createDraftActionUrl, verifyDraftToken } from '@/lib/draftsQueue'
import { validateQuickActionToken } from '@/lib/quickActionToken'
import { verifySubscriberToken } from '@/lib/subscribers'
import { channelConfigured, associationRecipients, splitSubject } from '@/lib/social'

beforeAll(() => {
  process.env.ADMIN_SECRET = 'unit-test-secret-not-real-0123456789'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.org'
})

describe('draft tokens', () => {
  const id = '22222222-2222-4222-8222-222222222222'
  it('round-trip approve and skip, bound to the draft id and route', async () => {
    const a = await createDraftActionUrl(id, 'approve')
    const s = await createDraftActionUrl(id, 'skip')
    expect(a.startsWith(`https://example.org/api/drafts/${id}/quick-action?token=`)).toBe(true)
    const at = decodeURIComponent(new URL(a).searchParams.get('token')!)
    const st = decodeURIComponent(new URL(s).searchParams.get('token')!)
    expect(await verifyDraftToken(at)).toEqual({ id, action: 'approve' })
    expect(await verifyDraftToken(st)).toEqual({ id, action: 'skip' })
  })
  it('is not accepted by the admin or subscriber token verifiers', async () => {
    const a = await createDraftActionUrl(id, 'approve')
    const at = decodeURIComponent(new URL(a).searchParams.get('token')!)
    expect(await validateQuickActionToken(at)).toBeNull()
    expect(await verifySubscriberToken(at, 'confirm')).toBeNull()
    expect(await verifySubscriberToken(at, 'unsubscribe')).toBeNull()
  })
})

describe('channel configuration', () => {
  it('names the missing env vars per channel', () => {
    expect(channelConfigured('bluesky', {})).toEqual({ ok: false, missing: 'BLUESKY_HANDLE and BLUESKY_APP_PASSWORD' })
    expect(channelConfigured('x', {})).toEqual({ ok: false, missing: 'X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_SECRET' })
    expect(channelConfigured('association', {})).toEqual({ ok: false, missing: 'EMAIL_FROM (verified sending domain)' })
    expect(channelConfigured('association', { RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.c' })).toEqual({ ok: false, missing: 'ASSOCIATION_RECIPIENTS' })
    expect(channelConfigured('association', { RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.c', ASSOCIATION_RECIPIENTS: 'x@y.z' })).toEqual({ ok: true })
    expect(channelConfigured('bluesky', { BLUESKY_HANDLE: 'h', BLUESKY_APP_PASSWORD: 'p' })).toEqual({ ok: true })
  })
  it('parses recipients', () => {
    expect(associationRecipients({ ASSOCIATION_RECIPIENTS: ' a@x.org, b@y.org ,, ' })).toEqual(['a@x.org', 'b@y.org'])
    expect(associationRecipients({})).toEqual([])
  })
  it('splits the subject line off an association note', () => {
    expect(splitSubject('Subject: Hello there\n\nBody line')).toEqual({ subject: 'Hello there', text: 'Body line' })
    expect(splitSubject('No subject').subject).toBe('Greenwich Utility Watch — monthly note')
  })
})
