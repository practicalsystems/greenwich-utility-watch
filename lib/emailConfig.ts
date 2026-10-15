/**
 * Whether outbound email to the public (subscribers) is possible.
 *
 * Admin alerts can fall back to Resend's onboarding sender, which only
 * delivers to the account owner. Anything sent to a resident needs a verified
 * sending domain, i.e. EMAIL_FROM set to an address on it. Every subscriber
 * surface checks this and degrades (form hidden, API 503, sends skipped).
 */
export function isEmailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim()) && Boolean(env.EMAIL_FROM?.trim())
}
