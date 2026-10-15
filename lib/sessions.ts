/**
 * Signed session tokens for admin authentication.
 *
 * Uses the Web Crypto API (globalThis.crypto.subtle) so tokens can be
 * created and verified in both Node.js 18+ (API routes, tests) and the
 * Next.js Edge runtime (proxy.ts route guard).
 *
 * Token format: `<random_hex_id>.<timestamp_ms>.<hmac_hex_signature>`
 *
 * The HMAC signs `id.timestamp` with ADMIN_SECRET, so:
 *   - Tokens cannot be forged without ADMIN_SECRET
 *   - Tokens expire after SESSION_MAX_AGE_MS based on the embedded timestamp
 *   - All sessions are immediately invalidated by rotating ADMIN_SECRET
 *
 * Limitation: there is no per-session revocation without a persistent store
 * (e.g. Vercel KV / Redis). To force-expire a specific session, rotate
 * ADMIN_SECRET in your environment variables and redeploy.
 */

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

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

function uint8ToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToUint8(hex: string): Uint8Array<ArrayBuffer> {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return arr
}

/** Create a new signed session token. */
export async function createSessionToken(): Promise<string> {
  const secret = getSecret()

  const randomBytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(randomBytes)
  const id = uint8ToHex(randomBytes.buffer)
  const ts = Date.now().toString()
  const payload = `${id}.${ts}`

  const key = await importKey(secret, 'sign')
  const sigBuf = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const sig = uint8ToHex(sigBuf)

  return `${payload}.${sig}`
}

/** Verify a session token. Returns true only if the signature is valid and the token has not expired. */
export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const secret = getSecret()

    const lastDot = token.lastIndexOf('.')
    if (lastDot === -1) return false

    const payload = token.slice(0, lastDot)
    const sig = token.slice(lastDot + 1)

    const parts = payload.split('.')
    if (parts.length !== 2) return false
    const ts = parseInt(parts[1], 10)
    if (isNaN(ts)) return false
    if (Date.now() - ts > SESSION_MAX_AGE_MS) return false

    // hex → Uint8Array; reject malformed hex before crypto
    if (sig.length % 2 !== 0 || !/^[0-9a-f]+$/.test(sig)) return false

    const key = await importKey(secret, 'verify')
    return await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      hexToUint8(sig),
      new TextEncoder().encode(payload)
    )
  } catch {
    return false
  }
}
