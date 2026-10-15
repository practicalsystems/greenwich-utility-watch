import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSessionToken, verifySessionToken } from '../../lib/sessions'

const ORIGINAL_ENV = process.env

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, ADMIN_SECRET: 'test-secret-32-chars-long-abcdef' }
})

afterEach(() => {
  process.env = ORIGINAL_ENV
})

describe('createSessionToken', () => {
  it('returns a string with exactly two dots (three parts)', async () => {
    const token = await createSessionToken()
    expect(token.split('.').length).toBe(3)
  })

  it('generates a different token on each call', async () => {
    const a = await createSessionToken()
    const b = await createSessionToken()
    expect(a).not.toBe(b)
  })

  it('throws if ADMIN_SECRET is not set', async () => {
    delete process.env.ADMIN_SECRET
    await expect(createSessionToken()).rejects.toThrow('ADMIN_SECRET')
  })
})

describe('verifySessionToken', () => {
  it('verifies a freshly created token', async () => {
    const token = await createSessionToken()
    expect(await verifySessionToken(token)).toBe(true)
  })

  it('rejects a completely invalid string', async () => {
    expect(await verifySessionToken('garbage')).toBe(false)
  })

  it('rejects an empty string', async () => {
    expect(await verifySessionToken('')).toBe(false)
  })

  it('rejects a token with a tampered payload', async () => {
    const token = await createSessionToken()
    const parts = token.split('.')
    parts[0] = 'tampered'
    expect(await verifySessionToken(parts.join('.'))).toBe(false)
  })

  it('rejects a token with a tampered timestamp', async () => {
    const token = await createSessionToken()
    const parts = token.split('.')
    parts[1] = '0'
    expect(await verifySessionToken(parts.join('.'))).toBe(false)
  })

  it('rejects a token with a forged signature', async () => {
    const token = await createSessionToken()
    const lastDot = token.lastIndexOf('.')
    const payload = token.slice(0, lastDot)
    expect(await verifySessionToken(payload + '.aabbccdd')).toBe(false)
  })

  it('rejects an expired token (timestamp older than 7 days)', async () => {
    const secret = process.env.ADMIN_SECRET!
    // Build a validly-signed token with an 8-day-old timestamp using Web Crypto
    const randomBytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(randomBytes)
    const id = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, '0')).join('')
    const oldTs = (Date.now() - 8 * 24 * 60 * 60 * 1000).toString()
    const payload = `${id}.${oldTs}`

    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sigBuf = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    const sig = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('')

    expect(await verifySessionToken(`${payload}.${sig}`)).toBe(false)
  })

  it('returns false (does not throw) when ADMIN_SECRET is missing', async () => {
    const token = await createSessionToken()
    delete process.env.ADMIN_SECRET
    expect(await verifySessionToken(token)).toBe(false)
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await createSessionToken()
    process.env.ADMIN_SECRET = 'a-completely-different-secret!!'
    expect(await verifySessionToken(token)).toBe(false)
  })
})
