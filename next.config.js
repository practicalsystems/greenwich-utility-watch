/** @type {import('next').NextConfig} */

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : '*.supabase.co'

const ContentSecurityPolicy = [
  "default-src 'self'",
  // Next.js App Router requires 'unsafe-inline' for hydration scripts.
  // To use a strict CSP, configure a nonce via Next.js middleware instead.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  // blob: for client-side photo previews; data: for inline SVGs; OSM for map tiles
  `img-src 'self' data: blob: https://${supabaseHost} https://*.tile.openstreetmap.org`,
  `connect-src 'self' https://${supabaseHost} https://vitals.vercel-insights.com https://nominatim.openstreetmap.org`,
  "font-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  // Prevent the page being embedded in an iframe (clickjacking)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Stop browsers from MIME-sniffing responses away from the declared Content-Type
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send full URL only to same-origin requests; only origin to cross-origin
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Restrict browser features — geolocation only allowed on self (for GPS detection)
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'Content-Security-Policy', value: ContentSecurityPolicy },
]

const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

module.exports = nextConfig
