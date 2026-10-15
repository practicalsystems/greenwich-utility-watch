import { describe, it, expect, beforeAll } from 'vitest'
import {
  normalizeEmail,
  shouldResendConfirmation,
  isActive,
  pickMonthlyRecipients,
  createConfirmUrl,
  createUnsubscribeUrl,
  verifySubscriberToken,
  DAILY_SEND_BUDGET,
  type SubscriberRow,
} from '@/lib/subscribers'
import { validateQuickActionToken } from '@/lib/quickActionToken'

beforeAll(() => {
  process.env.ADMIN_SECRET = 'unit-test-secret-not-real-0123456789'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.org'
})

function row(over: Partial<SubscriberRow> & { id: string; email: string }): SubscriberRow {
  return {
    source: 'site',
    submission_id: null,
    created_at: '2026-09-01T00:00:00Z',
    confirmation_sent_at: '2026-09-01T00:00:00Z',
    confirmed_at: '2026-09-01T00:05:00Z',
    unsubscribed_at: null,
    last_sent_at: null,
    ...over,
  }
}

describe('pure helpers', () => {
  it('normalizes email', () => {
    expect(normalizeEmail('  Foo@Example.ORG ')).toBe('foo@example.org')
  })
  it('decides when to resend a confirmation', () => {
    const now = Date.parse('2026-09-01T00:20:00Z')
    expect(shouldResendConfirmation({ confirmed_at: 'x', confirmation_sent_at: null }, now)).toBe(false)
    expect(shouldResendConfirmation({ confirmed_at: null, confirmation_sent_at: null }, now)).toBe(true)
    expect(shouldResendConfirmation({ confirmed_at: null, confirmation_sent_at: '2026-09-01T00:15:00Z' }, now)).toBe(false)
    expect(shouldResendConfirmation({ confirmed_at: null, confirmation_sent_at: '2026-09-01T00:05:00Z' }, now)).toBe(true)
  })
  it('isActive requires confirmed and not unsubscribed', () => {
    expect(isActive({ confirmed_at: 'x', unsubscribed_at: null })).toBe(true)
    expect(isActive({ confirmed_at: null, unsubscribed_at: null })).toBe(false)
    expect(isActive({ confirmed_at: 'x', unsubscribed_at: 'y' })).toBe(false)
  })
})

describe('pickMonthlyRecipients', () => {
  const gen = '2026-10-01T13:00:00Z'
  it('skips unconfirmed, unsubscribed, already-sent, and duplicate addresses; respects the budget', () => {
    const rows = [
      row({ id: '1', email: 'a@x.org' }),
      row({ id: '2', email: 'A@x.org', submission_id: 'pole-1' }), // same address, a watch
      row({ id: '3', email: 'b@x.org', confirmed_at: null }),
      row({ id: '4', email: 'c@x.org', unsubscribed_at: '2026-09-15T00:00:00Z' }),
      row({ id: '5', email: 'd@x.org', last_sent_at: '2026-10-01T13:30:00Z' }), // already got this one
      row({ id: '6', email: 'e@x.org', last_sent_at: '2026-09-01T13:30:00Z' }), // got last month's
      row({ id: '7', email: 'f@x.org' }),
    ]
    expect(pickMonthlyRecipients(rows, gen).map((r) => r.id)).toEqual(['1', '6', '7'])
    expect(pickMonthlyRecipients(rows, gen, 2).map((r) => r.id)).toEqual(['1', '6'])
  })
  it('keeps the budget under the Resend free daily cap', () => {
    expect(DAILY_SEND_BUDGET).toBeLessThan(100)
  })
})

describe('subscriber tokens', () => {
  it('confirm and unsubscribe URLs round-trip and are action-bound', async () => {
    const c = await createConfirmUrl('sub-1')
    const u = await createUnsubscribeUrl('sub-1')
    expect(c.startsWith('https://example.org/subscribe/confirm?token=')).toBe(true)
    expect(u.startsWith('https://example.org/subscribe/unsubscribe?token=')).toBe(true)
    const ct = decodeURIComponent(new URL(c).searchParams.get('token')!)
    const ut = decodeURIComponent(new URL(u).searchParams.get('token')!)
    expect(await verifySubscriberToken(ct, 'confirm')).toBe('sub-1')
    expect(await verifySubscriberToken(ct, 'unsubscribe')).toBeNull()
    expect(await verifySubscriberToken(ut, 'unsubscribe')).toBe('sub-1')
    expect(await verifySubscriberToken(ut, 'confirm')).toBeNull()
  })
  it('a subscriber token is not accepted as an admin quick-action token', async () => {
    const c = await createConfirmUrl('sub-1')
    const ct = decodeURIComponent(new URL(c).searchParams.get('token')!)
    expect(await validateQuickActionToken(ct)).toBeNull()
  })
  it('one-click path variant points at the API route', async () => {
    const u = await createUnsubscribeUrl('sub-1', '/api/subscribe/unsubscribe')
    expect(u.startsWith('https://example.org/api/subscribe/unsubscribe?token=')).toBe(true)
  })
})
