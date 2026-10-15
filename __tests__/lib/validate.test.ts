import { describe, it, expect } from 'vitest'
import {
  validateFollowUp,
  validateSubmission,
  sanitizeAdminNotes,
  isValidUUID,
  isAllowedPhotoUrl,
  sanitizePhotoUrls,
} from '../../lib/validate'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

function validBase(): Record<string, string> {
  return { address: '123 Main St', description: 'Leaning pole near curb' }
}

// ── validateSubmission ────────────────────────────────────────────────────────

describe('validateSubmission — required fields', () => {
  it('accepts a minimal valid submission', () => {
    const result = validateSubmission(makeFormData(validBase()))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.address).toBe('123 Main St')
      expect(result.data.description).toBe('Leaning pole near curb')
    }
  })

  it('rejects submission with neither address nor GPS', () => {
    const result = validateSubmission(makeFormData({ description: 'test' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/location/i)
  })

  it('rejects whitespace-only address when GPS is also missing', () => {
    const result = validateSubmission(makeFormData({ address: '   ', description: 'test' }))
    expect(result.ok).toBe(false)
  })

  it('accepts GPS-only submission (no address)', () => {
    const result = validateSubmission(makeFormData({
      description: 'Leaning pole',
      latitude: '41.0534',
      longitude: '-73.6285',
    }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.address).toBeNull()
      expect(result.data.latitude).toBeCloseTo(41.0534)
    }
  })

  it('accepts address-only submission (no GPS)', () => {
    const result = validateSubmission(makeFormData(validBase()))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.address).toBe('123 Main St')
      expect(result.data.latitude).toBeNull()
    }
  })

  it('rejects a missing description', () => {
    const result = validateSubmission(makeFormData({ address: '123 Main St' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/description/i)
  })
})

describe('validateSubmission — text sanitization', () => {
  it('strips null bytes from address', () => {
    const result = validateSubmission(makeFormData({ ...validBase(), address: '123\x00 Main St' }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.address).toBe('123 Main St')
  })

  it('strips control characters from description', () => {
    const result = validateSubmission(makeFormData({ ...validBase(), description: 'hello\x01world' }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.description).toBe('helloworld')
  })

  it('preserves newlines in description', () => {
    const result = validateSubmission(makeFormData({ ...validBase(), description: 'line1\nline2' }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.description).toContain('\n')
  })

  it('truncates address at 300 characters', () => {
    const long = 'A'.repeat(400)
    const result = validateSubmission(makeFormData({ ...validBase(), address: long }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.address!.length).toBe(300)
  })

  it('truncates description at 5000 characters', () => {
    const long = 'B'.repeat(6000)
    const result = validateSubmission(makeFormData({ ...validBase(), description: long }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.description.length).toBe(5000)
  })
})

describe('validateSubmission — problem_type whitelist', () => {
  it('accepts a valid problem type', () => {
    const result = validateSubmission(makeFormData({ ...validBase(), problem_type: 'Damaged Equipment' }))
    expect(result.ok).toBe(true)
  })

  it('rejects an arbitrary problem type', () => {
    const result = validateSubmission(makeFormData({ ...validBase(), problem_type: 'Hacked value' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/problem type/i)
  })

  it('accepts an empty problem_type (field is optional)', () => {
    const result = validateSubmission(makeFormData({ ...validBase(), problem_type: '' }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.problem_type).toBeNull()
  })
})

describe('validateSubmission — duration whitelist', () => {
  it('accepts a valid duration', () => {
    const result = validateSubmission(makeFormData({ ...validBase(), duration: 'More than a year' }))
    expect(result.ok).toBe(true)
  })

  it('rejects an invalid duration', () => {
    const result = validateSubmission(makeFormData({ ...validBase(), duration: 'forever' }))
    expect(result.ok).toBe(false)
  })

  it('accepts an empty duration (optional)', () => {
    const result = validateSubmission(makeFormData({ ...validBase(), duration: '' }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.duration).toBeNull()
  })
})

describe('validateSubmission — email', () => {
  it('accepts a valid email', () => {
    const result = validateSubmission(makeFormData({ ...validBase(), submitter_email: 'user@example.com' }))
    expect(result.ok).toBe(true)
  })

  it('rejects a malformed email', () => {
    const result = validateSubmission(makeFormData({ ...validBase(), submitter_email: 'notanemail' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/email/i)
  })

  it('accepts an empty email (optional)', () => {
    const result = validateSubmission(makeFormData({ ...validBase(), submitter_email: '' }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.submitter_email).toBeNull()
  })
})

describe('validateSubmission — GPS coordinates', () => {
  it('accepts coordinates inside Greenwich, CT', () => {
    const result = validateSubmission(makeFormData({
      ...validBase(),
      latitude: '41.0534',
      longitude: '-73.6285',
    }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.latitude).toBeCloseTo(41.0534)
      expect(result.data.longitude).toBeCloseTo(-73.6285)
    }
  })

  it('rejects coordinates outside the bounding box (e.g. London)', () => {
    const result = validateSubmission(makeFormData({
      ...validBase(),
      latitude: '51.5074',
      longitude: '-0.1278',
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/GPS/i)
  })

  it('rejects non-numeric latitude', () => {
    const result = validateSubmission(makeFormData({
      ...validBase(),
      latitude: 'abc',
      longitude: '-73.6285',
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects GPS-only submission with out-of-bounds coordinates', () => {
    const result = validateSubmission(makeFormData({
      description: 'Leaning pole',
      latitude: '51.5074',
      longitude: '-0.1278',
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/GPS/i)
  })

  it('accepts submission with no GPS (both fields empty)', () => {
    const result = validateSubmission(makeFormData(validBase()))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.latitude).toBeNull()
      expect(result.data.longitude).toBeNull()
    }
  })
})

// ── sanitizeAdminNotes ────────────────────────────────────────────────────────

describe('sanitizeAdminNotes', () => {
  it('returns null for empty input', () => {
    expect(sanitizeAdminNotes('')).toBeNull()
    expect(sanitizeAdminNotes(null)).toBeNull()
    expect(sanitizeAdminNotes(undefined)).toBeNull()
  })

  it('strips null bytes', () => {
    expect(sanitizeAdminNotes('hello\x00world')).toBe('helloworld')
  })

  it('truncates at 2000 characters', () => {
    expect(sanitizeAdminNotes('x'.repeat(3000))!.length).toBe(2000)
  })
})

// ── isValidUUID ───────────────────────────────────────────────────────────────

describe('isValidUUID', () => {
  it('accepts a valid v4 UUID', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('rejects a string that is too short', () => {
    expect(isValidUUID('550e8400')).toBe(false)
  })

  it('rejects a UUID with SQL injection payload', () => {
    expect(isValidUUID("'; DROP TABLE submissions; --")).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidUUID('')).toBe(false)
  })
})

// ── isAllowedPhotoUrl / sanitizePhotoUrls ────────────────────────────────────

describe('isAllowedPhotoUrl', () => {
  const valid = 'https://abcdefgh.supabase.co/storage/v1/object/public/submission-photos/file.jpg'

  it('accepts a valid Supabase storage URL', () => {
    expect(isAllowedPhotoUrl(valid)).toBe(true)
  })

  it('rejects an HTTP (non-HTTPS) URL', () => {
    expect(isAllowedPhotoUrl(valid.replace('https://', 'http://'))).toBe(false)
  })

  it('rejects a non-Supabase host', () => {
    expect(isAllowedPhotoUrl('https://evil.com/image.jpg')).toBe(false)
  })

  it('rejects a Supabase URL outside the storage path', () => {
    expect(isAllowedPhotoUrl('https://abcdefgh.supabase.co/rest/v1/submissions')).toBe(false)
  })

  it('rejects a data: URI', () => {
    expect(isAllowedPhotoUrl('data:image/png;base64,abc')).toBe(false)
  })

  it('rejects garbage input', () => {
    expect(isAllowedPhotoUrl('not a url')).toBe(false)
  })
})

describe('sanitizePhotoUrls', () => {
  it('filters out non-Supabase URLs and keeps valid ones', () => {
    const supabase = 'https://abc.supabase.co/storage/v1/object/public/photos/img.jpg'
    const evil = 'https://evil.com/tracker.gif'
    expect(sanitizePhotoUrls([supabase, evil, supabase])).toEqual([supabase, supabase])
  })

  it('returns an empty array if all URLs are invalid', () => {
    expect(sanitizePhotoUrls(['http://evil.com/img.jpg'])).toEqual([])
  })

  it('handles an empty array', () => {
    expect(sanitizePhotoUrls([])).toEqual([])
  })
})

describe('validateFollowUp', () => {
  it('accepts a full, valid follow-up', () => {
    const r = validateFollowUp({ reported_to: 'Eversource', reported_at: '2026-09-22', official_response: ' Ticket opened ', resolved_at: '2026-09-29' })
    expect(r).toEqual({ ok: true, data: { reported_to: 'Eversource', reported_at: '2026-09-22', official_response: 'Ticket opened', resolved_at: '2026-09-29' } })
  })
  it('treats empty strings and missing keys as clearing the field', () => {
    const r = validateFollowUp({ reported_to: '', official_response: '' })
    expect(r).toEqual({ ok: true, data: { reported_to: null, reported_at: null, official_response: null, resolved_at: null } })
  })
  it('rejects an unknown recipient and malformed dates', () => {
    expect(validateFollowUp({ reported_to: 'Comcast' }).ok).toBe(false)
    expect(validateFollowUp({ reported_at: '09/22/2026' }).ok).toBe(false)
    expect(validateFollowUp({ resolved_at: '2026-13-01' }).ok).toBe(false)
  })
  it('rejects non-string values', () => {
    expect(validateFollowUp({ official_response: 42 }).ok).toBe(false)
  })
  it('strips control characters and caps the response length', () => {
    const r = validateFollowUp({ official_response: 'a\u0000b' + 'x'.repeat(3000) })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.official_response?.startsWith('ab')).toBe(true)
      expect(r.data.official_response?.length).toBe(2000)
    }
  })
})
