import crypto from 'crypto'

/** Verify the submitted password against the env-configured admin password. */
export function verifyAdminPassword(password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) throw new Error('ADMIN_PASSWORD environment variable is not set.')

  // Timing-safe comparison to prevent timing-based enumeration
  const a = Buffer.from(password)
  const b = Buffer.from(adminPassword)
  if (a.length !== b.length) {
    // Still do a dummy comparison so the timing is consistent
    crypto.timingSafeEqual(b, b)
    return false
  }
  return crypto.timingSafeEqual(a, b)
}
