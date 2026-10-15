/**
 * Generic HMAC-SHA256 signed tokens, shared by every one-tap / one-click link
 * (admin quick actions, subscriber confirm and unsubscribe, draft approvals).
 *
 * Token format: base64url(JSON payload) + "." + hex(HMAC-SHA256(payload, ADMIN_SECRET))
 *
 * Web Crypto only, so it works in Node and the Edge runtime. Rotating
 * ADMIN_SECRET invalidates every outstanding link at once, which is the
 * intended kill switch.
 */

export interface SignedPayload {
  /** Expiry as epoch ms; null means the token does not expire (used for unsubscribe). */
  exp: number | null
}

function getSecret(): string {
  const secret = process.env.ADMIN_SECRET
  if (!secret) throw new Error('ADMIN_SECRET environment variable is not set.')
  return secret
}

async function importKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  )
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await importKey(secret, 'sign')
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacVerify(data: string, sig: string, secret: string): Promise<boolean> {
  if (sig.length % 2 !== 0 || !/^[0-9a-f]+$/.test(sig)) return false
  const key = await importKey(secret, 'verify')
  const sigBytes = new Uint8Array(sig.length / 2)
  for (let i = 0; i < sig.length; i += 2) sigBytes[i / 2] = parseInt(sig.slice(i, i + 2), 16)
  return globalThis.crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data))
}

export function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (str.length % 4)) % 4)
  return atob(padded)
}

/** Sign an arbitrary JSON-serialisable payload that carries an `exp`. */
export async function signToken<T extends SignedPayload>(payload: T): Promise<string> {
  const json = JSON.stringify(payload)
  const sig = await hmacSign(json, getSecret())
  return toBase64Url(json) + '.' + sig
}

/**
 * Verify a token and return its payload, or null when the signature is wrong,
 * the token is malformed, or it has expired. `check` lets callers reject
 * payloads of the wrong shape (e.g. a subscriber token used on an admin route).
 */
export async function verifyToken<T extends SignedPayload>(
  token: string,
  check: (p: unknown) => p is T,
  now: number = Date.now()
): Promise<T | null> {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null
    const json = fromBase64Url(token.slice(0, dot))
    if (!(await hmacVerify(json, token.slice(dot + 1), getSecret()))) return null
    const payload: unknown = JSON.parse(json)
    if (!check(payload)) return null
    if (payload.exp !== null && now > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
