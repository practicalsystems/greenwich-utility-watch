/**
 * X (Twitter) API v2 posting with OAuth 1.0a user context. Official API, no
 * SDK: one signed POST to /2/tweets. Signature per RFC 5849 using node:crypto.
 */

import { createHmac, randomBytes } from 'node:crypto'
import type { PublishFailure, PublishResult } from '@/lib/social/bluesky'

export interface XCreds {
  apiKey: string
  apiSecret: string
  accessToken: string
  accessSecret: string
}

export function xCredsFromEnv(env: Record<string, string | undefined> = process.env): XCreds | null {
  const apiKey = env.X_API_KEY?.trim()
  const apiSecret = env.X_API_SECRET?.trim()
  const accessToken = env.X_ACCESS_TOKEN?.trim()
  const accessSecret = env.X_ACCESS_SECRET?.trim()
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null
  return { apiKey, apiSecret, accessToken, accessSecret }
}

/** RFC 3986 percent-encoding, which encodeURIComponent almost but not quite is. */
export function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

export interface OAuthParams {
  nonce: string
  timestamp: string
}

/**
 * Build the Authorization header for an OAuth 1.0a request. `params` are the
 * request's query/form parameters (a JSON body contributes none).
 */
export function buildOAuth1Header(
  method: string,
  url: string,
  params: Record<string, string>,
  creds: XCreds,
  o: OAuthParams
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: o.nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: o.timestamp,
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  }
  const all = { ...params, ...oauth }
  const paramString = Object.keys(all)
    .map((k) => [rfc3986(k), rfc3986(all[k])] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const base = [method.toUpperCase(), rfc3986(url), rfc3986(paramString)].join('&')
  const key = `${rfc3986(creds.apiSecret)}&${rfc3986(creds.accessSecret)}`
  const signature = createHmac('sha1', key).update(base).digest('base64')
  const header: Record<string, string> = { ...oauth, oauth_signature: signature }
  return (
    'OAuth ' +
    Object.keys(header)
      .sort()
      .map((k) => `${rfc3986(k)}="${rfc3986(header[k])}"`)
      .join(', ')
  )
}

const TWEETS_URL = 'https://api.x.com/2/tweets'

export async function publishToX(
  text: string,
  creds: XCreds,
  fetchImpl: typeof fetch = fetch,
  o: OAuthParams = { nonce: randomBytes(16).toString('hex'), timestamp: Math.floor(Date.now() / 1000).toString() }
): Promise<PublishResult | PublishFailure> {
  try {
    const res = await fetchImpl(TWEETS_URL, {
      method: 'POST',
      headers: {
        Authorization: buildOAuth1Header('POST', TWEETS_URL, {}, creds, o),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `X post failed (${res.status}): ${body.slice(0, 200)}` }
    }
    const out = (await res.json()) as { data?: { id: string } }
    const id = out.data?.id ?? ''
    return { ok: true, id, url: id ? `https://x.com/i/web/status/${id}` : 'https://x.com' }
  } catch (err) {
    return { ok: false, error: `X request threw: ${err instanceof Error ? err.message : String(err)}` }
  }
}
