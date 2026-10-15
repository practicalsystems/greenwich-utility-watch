/**
 * Canonical public URL for the site.
 *
 * NEXT_PUBLIC_SITE_URL may be set as a bare domain ("example.com") in some
 * environments; new URL() would throw on that at build time, so normalize
 * the scheme here and fall back to the production Vercel URL.
 */
const FALLBACK = 'https://greenwich-utility-watch.vercel.app'

/**
 * The only contact address the project ever publishes. The project speaks as
 * "Greenwich Utility Watch"; no individual is named on any public surface.
 */
export const CONTACT_EMAIL = 'contact@greenwichutilitywatch.org'

export function getSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim()
  if (!raw) return FALLBACK
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    return new URL(withScheme).origin
  } catch {
    return FALLBACK
  }
}
