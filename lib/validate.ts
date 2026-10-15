/**
 * Server-side input validation and sanitization.
 * All user-supplied text must pass through here before storage.
 */

// Allowed values from SubmissionForm.tsx — kept in sync manually
const ALLOWED_PROBLEM_TYPES = new Set([
  'Double Poles / Sistered Pole',
  'Leaning or Unstable Pole',
  'Low-Hanging Wires',
  'Pole in Sidewalk or Right-of-Way',
  'Damaged Equipment',
  'Other',
])

const ALLOWED_DURATIONS = new Set([
  'Less than a month',
  '1–6 months',
  '6–12 months',
  'More than a year',
  'Unknown',
])

// Rough bounding box for Greenwich, CT + small buffer
const GPS_BOUNDS = {
  lat: { min: 40.95, max: 41.15 },
  lng: { min: -73.85, max: -73.45 },
}

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

/** Email syntax check shared by the submission form and the subscribe endpoint. */
export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email)
}

/** Strip null bytes and non-printable control characters, then trim. */
function sanitizeText(value: string): string {
  return value
    .replace(/\0/g, '')                       // null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars except \t \n \r
    .trim()
}

/** Clamp a string to maxLength after sanitizing. Returns null for empty strings. */
function sanitizeField(
  raw: string | null | undefined,
  maxLength: number
): string | null {
  if (!raw) return null
  const cleaned = sanitizeText(raw).slice(0, maxLength)
  return cleaned || null
}

export type ValidationResult =
  | { ok: true; data: SanitizedSubmission }
  | { ok: false; error: string }

export interface SanitizedSubmission {
  address: string | null
  description: string
  cross_streets: string | null
  pole_id: string | null
  latitude: number | null
  longitude: number | null
  problem_type: string | null
  duration: string | null
  submitter_name: string | null
  submitter_email: string | null
}

export function validateSubmission(formData: FormData): ValidationResult {
  const rawAddress = formData.get('address') as string | null
  const rawDescription = formData.get('description') as string | null
  const rawProblemType = formData.get('problem_type') as string | null
  const rawDuration = formData.get('duration') as string | null
  const rawCrossStreets = formData.get('cross_streets') as string | null
  const rawPoleId = formData.get('pole_id') as string | null
  const rawLatitude = formData.get('latitude') as string | null
  const rawLongitude = formData.get('longitude') as string | null
  const rawName = formData.get('submitter_name') as string | null
  const rawEmail = formData.get('submitter_email') as string | null

  // Address: sanitize but allow null (validated together with GPS below)
  const address = sanitizeField(rawAddress, 300)

  const description = sanitizeField(rawDescription, 5000)
  if (!description) return { ok: false, error: 'Description is required.' }

  // Whitelist enum fields — reject anything not in the predefined lists
  let problem_type: string | null = null
  if (rawProblemType?.trim()) {
    if (!ALLOWED_PROBLEM_TYPES.has(rawProblemType.trim())) {
      return { ok: false, error: 'Invalid problem type.' }
    }
    problem_type = rawProblemType.trim()
  }

  let duration: string | null = null
  if (rawDuration?.trim()) {
    if (!ALLOWED_DURATIONS.has(rawDuration.trim())) {
      return { ok: false, error: 'Invalid duration value.' }
    }
    duration = rawDuration.trim()
  }

  // Optional text fields with length caps
  const cross_streets = sanitizeField(rawCrossStreets, 200)
  const pole_id = sanitizeField(rawPoleId, 50)
  const submitter_name = sanitizeField(rawName, 100)

  // Email: sanitize then regex-validate
  let submitter_email: string | null = null
  if (rawEmail?.trim()) {
    const email = sanitizeText(rawEmail).slice(0, 254)
    if (!EMAIL_RE.test(email)) {
      return { ok: false, error: 'Invalid email address.' }
    }
    submitter_email = email
  }

  // GPS: parse, bounds-check, reject if out of Greenwich area
  let latitude: number | null = null
  let longitude: number | null = null
  if (rawLatitude?.trim() && rawLongitude?.trim()) {
    const lat = parseFloat(rawLatitude)
    const lng = parseFloat(rawLongitude)
    if (isNaN(lat) || isNaN(lng)) {
      return { ok: false, error: 'Invalid GPS coordinates.' }
    }
    if (
      lat < GPS_BOUNDS.lat.min || lat > GPS_BOUNDS.lat.max ||
      lng < GPS_BOUNDS.lng.min || lng > GPS_BOUNDS.lng.max
    ) {
      return { ok: false, error: 'GPS coordinates are outside the expected area.' }
    }
    latitude = lat
    longitude = lng
  }

  // Require at least one form of location: a text address or valid GPS coordinates
  if (!address && (latitude === null || longitude === null)) {
    return { ok: false, error: 'Please provide a location — either use the GPS button or type an address.' }
  }

  return {
    ok: true,
    data: {
      address,
      description,
      cross_streets,
      pole_id,
      latitude,
      longitude,
      problem_type,
      duration,
      submitter_name,
      submitter_email,
    },
  }
}

const ALLOWED_REPORTED_TO = new Set(['Eversource', 'Frontier', 'Town of Greenwich', 'PURA', 'Other'])
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export interface FollowUp {
  reported_to: string | null
  reported_at: string | null
  official_response: string | null
  resolved_at: string | null
}

export type FollowUpResult = { ok: true; data: FollowUp } | { ok: false; error: string }

/**
 * Validate the public official-follow-up fields the admin can record on a
 * report. Empty strings clear a field. Dates are plain YYYY-MM-DD.
 */
export function validateFollowUp(body: Record<string, unknown>): FollowUpResult {
  const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : null)

  const rawTo = str(body.reported_to)
  const rawAt = str(body.reported_at)
  const rawResp = str(body.official_response)
  const rawRes = str(body.resolved_at)
  if (rawTo === null || rawAt === null || rawResp === null || rawRes === null) {
    return { ok: false, error: 'Follow-up fields must be strings.' }
  }

  const reported_to = rawTo.trim() || null
  if (reported_to && !ALLOWED_REPORTED_TO.has(reported_to)) {
    return { ok: false, error: 'Invalid "reported to" value.' }
  }
  const reported_at = rawAt.trim() || null
  if (reported_at && !DATE_RE.test(reported_at)) {
    return { ok: false, error: 'Reported date must be YYYY-MM-DD.' }
  }
  const resolved_at = rawRes.trim() || null
  if (resolved_at && !DATE_RE.test(resolved_at)) {
    return { ok: false, error: 'Resolved date must be YYYY-MM-DD.' }
  }
  const official_response = sanitizeField(rawResp, 2000)

  return { ok: true, data: { reported_to, reported_at, official_response, resolved_at } }
}

/** Sanitize admin notes stored server-side. */
export function sanitizeAdminNotes(raw: string | null | undefined): string | null {
  return sanitizeField(raw, 2000)
}

/** Validate a UUID-shaped submission ID to prevent injection via URL params. */
export function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

/**
 * Confirm that a photo URL is from the expected Supabase storage origin.
 * Filters out any URL that doesn't match the pattern configured in next.config.js,
 * protecting against stored non-Supabase URLs reaching <img> tags.
 */
export function isAllowedPhotoUrl(url: string): boolean {
  try {
    const { protocol, hostname, pathname } = new URL(url)
    return (
      protocol === 'https:' &&
      hostname.endsWith('.supabase.co') &&
      pathname.startsWith('/storage/v1/object/public/')
    )
  } catch {
    return false
  }
}

/** Filter a photos array to only include allowed Supabase URLs. */
export function sanitizePhotoUrls(urls: string[]): string[] {
  return urls.filter(isAllowedPhotoUrl)
}
