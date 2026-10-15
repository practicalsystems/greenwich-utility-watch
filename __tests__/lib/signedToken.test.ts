import { describe, it, expect, beforeAll } from 'vitest'
import { signToken, verifyToken, type SignedPayload } from '@/lib/signedToken'
import { createQuickActionUrl, validateQuickActionToken } from '@/lib/quickActionToken'

interface P extends SignedPayload { kind: 'test'; v: number }
const isP = (p: unknown): p is P => !!p && typeof p === 'object' && (p as P).kind === 'test'

beforeAll(() => {
  process.env.ADMIN_SECRET = 'unit-test-secret-not-real-0123456789'
})

describe('signToken / verifyToken', () => {
  it('round-trips a payload', async () => {
    const t = await signToken<P>({ kind: 'test', v: 7, exp: Date.now() + 1000 })
    expect(await verifyToken(t, isP)).toMatchObject({ kind: 'test', v: 7 })
  })
  it('rejects tampering with payload or signature', async () => {
    const t = await signToken<P>({ kind: 'test', v: 7, exp: Date.now() + 1000 })
    const [body, sig] = t.split('.')
    expect(await verifyToken(body + 'x.' + sig, isP)).toBeNull()
    expect(await verifyToken(body + '.' + sig.replace(/^./, (c) => (c === '0' ? '1' : '0')), isP)).toBeNull()
    expect(await verifyToken('garbage', isP)).toBeNull()
    expect(await verifyToken('', isP)).toBeNull()
  })
  it('enforces expiry, and honours exp: null as non-expiring', async () => {
    const expired = await signToken<P>({ kind: 'test', v: 1, exp: Date.now() - 1 })
    expect(await verifyToken(expired, isP)).toBeNull()
    const forever = await signToken<P>({ kind: 'test', v: 1, exp: null })
    expect(await verifyToken(forever, isP, Date.now() + 10 * 365 * 24 * 3600 * 1000)).not.toBeNull()
  })
  it('rejects payloads of the wrong shape', async () => {
    const t = await signToken({ kind: 'other', exp: Date.now() + 1000 } as unknown as P)
    expect(await verifyToken(t, isP)).toBeNull()
  })
  it('a token signed with another secret does not verify', async () => {
    const t = await signToken<P>({ kind: 'test', v: 1, exp: Date.now() + 1000 })
    const saved = process.env.ADMIN_SECRET
    process.env.ADMIN_SECRET = 'a-different-secret-for-the-test-0000'
    expect(await verifyToken(t, isP)).toBeNull()
    process.env.ADMIN_SECRET = saved
  })
})

describe('quick action tokens', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  it('produces a URL on the quick-action route and validates back', async () => {
    const url = await createQuickActionUrl(id, 'approve')
    expect(url.startsWith(`/api/submissions/${id}/quick-action?token=`)).toBe(true)
    const token = decodeURIComponent(url.split('token=')[1])
    expect(await validateQuickActionToken(token)).toMatchObject({ id, action: 'approve' })
  })
  it('rejects a subscriber-style token on the admin route', async () => {
    const t = await signToken({ kind: 'subscriber', id, action: 'approve', exp: Date.now() + 1000 })
    expect(await validateQuickActionToken(t)).toBeNull()
  })
})
