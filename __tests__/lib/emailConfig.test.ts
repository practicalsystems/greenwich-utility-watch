import { describe, it, expect } from 'vitest'
import { isEmailConfigured } from '@/lib/emailConfig'

describe('isEmailConfigured', () => {
  it('needs both the API key and a verified-domain sender', () => {
    expect(isEmailConfigured({})).toBe(false)
    expect(isEmailConfigured({ RESEND_API_KEY: 're_x' })).toBe(false)
    expect(isEmailConfigured({ EMAIL_FROM: 'a@b.c' })).toBe(false)
    expect(isEmailConfigured({ RESEND_API_KEY: ' ', EMAIL_FROM: 'a@b.c' })).toBe(false)
    expect(isEmailConfigured({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'Greenwich Utility Watch <u@mail.example.org>' })).toBe(true)
  })
})
