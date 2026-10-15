import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { verifyAdminPassword } from '../../lib/auth'

const ORIGINAL_ENV = process.env

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, ADMIN_PASSWORD: 'correct-password' }
})

afterEach(() => {
  process.env = ORIGINAL_ENV
})

describe('verifyAdminPassword', () => {
  it('returns true for the correct password', () => {
    expect(verifyAdminPassword('correct-password')).toBe(true)
  })

  it('returns false for an incorrect password', () => {
    expect(verifyAdminPassword('wrong-password')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(verifyAdminPassword('')).toBe(false)
  })

  it('is case-sensitive', () => {
    expect(verifyAdminPassword('Correct-Password')).toBe(false)
  })

  it('returns false when password is a prefix of the correct password', () => {
    expect(verifyAdminPassword('correct')).toBe(false)
  })

  it('throws if ADMIN_PASSWORD env var is not set', () => {
    delete process.env.ADMIN_PASSWORD
    expect(() => verifyAdminPassword('anything')).toThrow('ADMIN_PASSWORD')
  })
})
