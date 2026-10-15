import { describe, it, expect, beforeEach, vi } from 'vitest'

// Re-import module fresh for each test to reset in-memory state
let checkRateLimit: typeof import('../../lib/rateLimit').checkRateLimit
let checkLoginRateLimit: typeof import('../../lib/rateLimit').checkLoginRateLimit
let getClientIp: typeof import('../../lib/rateLimit').getClientIp
let checkSubscribeRateLimit: typeof import('../../lib/rateLimit').checkSubscribeRateLimit

beforeEach(async () => {
  vi.resetModules()
  const mod = await import('../../lib/rateLimit')
  checkRateLimit = mod.checkRateLimit
  checkLoginRateLimit = mod.checkLoginRateLimit
  getClientIp = mod.getClientIp
  checkSubscribeRateLimit = mod.checkSubscribeRateLimit
})

describe('checkSubscribeRateLimit', () => {
  it('allows 10 then blocks the 11th, independently of the submission limiter', () => {
    for (let i = 0; i < 10; i++) expect(checkSubscribeRateLimit('9.9.9.9').allowed).toBe(true)
    const blocked = checkSubscribeRateLimit('9.9.9.9')
    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    expect(checkRateLimit('9.9.9.9').allowed).toBe(true)
  })
})

// ── checkRateLimit ────────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  it('allows the first request from an IP', () => {
    expect(checkRateLimit('1.2.3.4').allowed).toBe(true)
  })

  it('allows up to 5 requests from the same IP', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('10.0.0.1').allowed).toBe(true)
    }
  })

  it('blocks the 6th request from the same IP', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('10.0.0.2')
    const result = checkRateLimit('10.0.0.2')
    expect(result.allowed).toBe(false)
  })

  it('includes a retryAfterSeconds value when blocked', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('10.0.0.3')
    const result = checkRateLimit('10.0.0.3')
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0)
    }
  })

  it('does not affect other IPs', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('10.0.0.4')
    checkRateLimit('10.0.0.4') // blocked
    // Different IP should still be allowed
    expect(checkRateLimit('10.0.0.5').allowed).toBe(true)
  })
})

// ── checkLoginRateLimit ───────────────────────────────────────────────────────

describe('checkLoginRateLimit', () => {
  it('allows up to 10 login attempts', () => {
    for (let i = 0; i < 10; i++) {
      expect(checkLoginRateLimit('20.0.0.1').allowed).toBe(true)
    }
  })

  it('blocks the 11th login attempt', () => {
    for (let i = 0; i < 10; i++) checkLoginRateLimit('20.0.0.2')
    expect(checkLoginRateLimit('20.0.0.2').allowed).toBe(false)
  })
})

// ── getClientIp ───────────────────────────────────────────────────────────────

describe('getClientIp', () => {
  function makeRequest(headers: Record<string, string>): Request {
    return new Request('https://example.com', { headers })
  }

  it('extracts the first IP from x-forwarded-for', () => {
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' })
    expect(getClientIp(req)).toBe('203.0.113.1')
  })

  it('handles a single IP in x-forwarded-for', () => {
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.2' })
    expect(getClientIp(req)).toBe('203.0.113.2')
  })

  it('returns "unknown" when no header is present', () => {
    const req = makeRequest({})
    expect(getClientIp(req)).toBe('unknown')
  })
})
