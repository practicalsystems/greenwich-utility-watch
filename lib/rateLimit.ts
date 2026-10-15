/**
 * Simple sliding-window rate limiter for the public submission endpoint.
 *
 * Uses an in-memory Map keyed by IP address. This is sufficient for a
 * single-process deployment (Vercel serverless functions share memory only
 * within the same instance). For high-traffic or multi-region deployments,
 * replace the store with Vercel KV, Redis, or Upstash.
 *
 * Limits: MAX_REQUESTS submissions per IP within WINDOW_MS milliseconds.
 */

const MAX_REQUESTS = 5
const WINDOW_MS = 60 * 60 * 1000 // 1 hour

// Stricter limits for the admin login endpoint
const LOGIN_MAX_REQUESTS = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

// Subscribe endpoint: generous enough for a household, tight enough to stop
// someone using the confirmation email as a mail cannon.
const SUBSCRIBE_MAX_REQUESTS = 10
const SUBSCRIBE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

// timestamp arrays keyed by IP
const store = new Map<string, number[]>()
const loginStore = new Map<string, number[]>()
const subscribeStore = new Map<string, number[]>()

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now()
  const windowStart = now - WINDOW_MS

  const timestamps = (store.get(ip) ?? []).filter((t) => t > windowStart)

  if (timestamps.length >= MAX_REQUESTS) {
    const oldest = timestamps[0]
    const retryAfterSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000)
    return { allowed: false, retryAfterSeconds }
  }

  timestamps.push(now)
  store.set(ip, timestamps)

  // Periodically prune entries for IPs that haven't submitted recently
  // to keep memory bounded. Run ~1% of the time to avoid overhead.
  if (Math.random() < 0.01) pruneStore(windowStart)

  return { allowed: true }
}

/** Stricter rate limiter for the admin login endpoint (10 attempts / 15 min). */
export function checkLoginRateLimit(ip: string): RateLimitResult {
  const now = Date.now()
  const windowStart = now - LOGIN_WINDOW_MS

  const timestamps = (loginStore.get(ip) ?? []).filter((t) => t > windowStart)

  if (timestamps.length >= LOGIN_MAX_REQUESTS) {
    const oldest = timestamps[0]
    const retryAfterSeconds = Math.ceil((oldest + LOGIN_WINDOW_MS - now) / 1000)
    return { allowed: false, retryAfterSeconds }
  }

  timestamps.push(now)
  loginStore.set(ip, timestamps)

  if (Math.random() < 0.01) pruneLoginStore(windowStart)

  return { allowed: true }
}

/** Rate limiter for POST /api/subscribe (10 per IP per hour). */
export function checkSubscribeRateLimit(ip: string): RateLimitResult {
  const now = Date.now()
  const windowStart = now - SUBSCRIBE_WINDOW_MS
  const timestamps = (subscribeStore.get(ip) ?? []).filter((t) => t > windowStart)
  if (timestamps.length >= SUBSCRIBE_MAX_REQUESTS) {
    const oldest = timestamps[0]
    return { allowed: false, retryAfterSeconds: Math.ceil((oldest + SUBSCRIBE_WINDOW_MS - now) / 1000) }
  }
  timestamps.push(now)
  subscribeStore.set(ip, timestamps)
  if (Math.random() < 0.01) {
    for (const [k, ts] of subscribeStore) {
      const fresh = ts.filter((t) => t > windowStart)
      if (fresh.length === 0) subscribeStore.delete(k)
      else subscribeStore.set(k, fresh)
    }
  }
  return { allowed: true }
}

function pruneStore(windowStart: number) {
  for (const [ip, timestamps] of store) {
    const fresh = timestamps.filter((t) => t > windowStart)
    if (fresh.length === 0) {
      store.delete(ip)
    } else {
      store.set(ip, fresh)
    }
  }
}

function pruneLoginStore(windowStart: number) {
  for (const [ip, timestamps] of loginStore) {
    const fresh = timestamps.filter((t) => t > windowStart)
    if (fresh.length === 0) {
      loginStore.delete(ip)
    } else {
      loginStore.set(ip, fresh)
    }
  }
}

/** Extract the real client IP from Next.js request headers. */
export function getClientIp(request: Request): string {
  // Vercel sets x-forwarded-for; fall back to a placeholder
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'unknown'
}
