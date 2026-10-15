import { describe, it, expect, vi } from 'vitest'
import { detectLinkFacets, publishToBluesky, blueskyCredsFromEnv } from '@/lib/social/bluesky'
import { buildOAuth1Header, publishToX, rfc3986, xCredsFromEnv } from '@/lib/social/x'

describe('bluesky facets', () => {
  it('computes UTF-8 byte offsets and strips trailing punctuation', () => {
    const text = 'Poles — see https://example.org/reports/2026-09.'
    const [f] = detectLinkFacets(text)
    expect(f.features[0].uri).toBe('https://example.org/reports/2026-09')
    const enc = new TextEncoder()
    expect(f.index.byteStart).toBe(enc.encode('Poles — see ').byteLength) // em dash is 3 bytes
    expect(f.index.byteEnd).toBe(f.index.byteStart + enc.encode('https://example.org/reports/2026-09').byteLength)
  })
  it('finds multiple links', () => {
    expect(detectLinkFacets('a https://x.org b https://y.org')).toHaveLength(2)
    expect(detectLinkFacets('no links')).toEqual([])
  })
  it('reads credentials from env', () => {
    expect(blueskyCredsFromEnv({})).toBeNull()
    expect(blueskyCredsFromEnv({ BLUESKY_HANDLE: 'h', BLUESKY_APP_PASSWORD: 'p' })).toEqual({ handle: 'h', appPassword: 'p', service: 'https://bsky.social' })
  })
})

describe('publishToBluesky', () => {
  const creds = { handle: 'greenwichutilitywatch.org', appPassword: 'app-pass' }
  it('logs in, creates the record with facets, and returns the post URL', async () => {
    const calls: Array<{ url: string; body: unknown; auth?: string }> = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      const headers = (init?.headers ?? {}) as Record<string, string>
      calls.push({ url: u, body: JSON.parse(String(init?.body)), auth: headers.Authorization })
      if (u.endsWith('createSession')) return new Response(JSON.stringify({ accessJwt: 'jwt', did: 'did:plc:abc', handle: creds.handle }), { status: 200 })
      return new Response(JSON.stringify({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz', cid: 'c' }), { status: 200 })
    }) as unknown as typeof fetch
    const r = await publishToBluesky('Hi https://example.org', creds, fetchImpl)
    expect(r).toEqual({ ok: true, id: 'at://did:plc:abc/app.bsky.feed.post/3kxyz', url: 'https://bsky.app/profile/greenwichutilitywatch.org/post/3kxyz' })
    expect(calls[1].auth).toBe('Bearer jwt')
    const rec = (calls[1].body as { record: { text: string; facets: unknown[] } }).record
    expect(rec.text).toBe('Hi https://example.org')
    expect(rec.facets).toHaveLength(1)
  })
  it('reports a failed login without throwing', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch
    const r = await publishToBluesky('x', creds, fetchImpl)
    expect(r).toEqual({ ok: false, error: 'Bluesky login failed (401)' })
  })
})

describe('x oauth 1.0a', () => {
  // The worked example from X's "Creating a signature" documentation.
  const creds = {
    apiKey: 'xvz1evFS4wEEPTGEFPHBog',
    apiSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
    accessToken: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
    accessSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
  }
  it('rfc3986 encodes the characters encodeURIComponent leaves alone', () => {
    expect(rfc3986("a!b'c(d)e*f")).toBe('a%21b%27c%28d%29e%2Af')
  })
  it('reproduces the documented signature', () => {
    const header = buildOAuth1Header(
      'POST',
      'https://api.twitter.com/1.1/statuses/update.json',
      { include_entities: 'true', status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
      creds,
      { nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', timestamp: '1318622958' }
    )
    expect(header).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"')
    expect(header.startsWith('OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"')).toBe(true)
  })
  it('reads credentials from env', () => {
    expect(xCredsFromEnv({ X_API_KEY: 'a' })).toBeNull()
    expect(xCredsFromEnv({ X_API_KEY: 'a', X_API_SECRET: 'b', X_ACCESS_TOKEN: 'c', X_ACCESS_SECRET: 'd' })).toEqual({ apiKey: 'a', apiSecret: 'b', accessToken: 'c', accessSecret: 'd' })
  })
  it('posts JSON to /2/tweets with an OAuth header and returns the status URL', async () => {
    let seen: { auth?: string; body?: string } = {}
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      seen = { auth: (init?.headers as Record<string, string>).Authorization, body: String(init?.body) }
      return new Response(JSON.stringify({ data: { id: '12345', text: 'x' } }), { status: 201 })
    }) as unknown as typeof fetch
    const r = await publishToX('hello', creds, fetchImpl, { nonce: 'n', timestamp: '1' })
    expect(r).toEqual({ ok: true, id: '12345', url: 'https://x.com/i/web/status/12345' })
    expect(seen.auth?.startsWith('OAuth ')).toBe(true)
    expect(seen.body).toBe('{"text":"hello"}')
  })
  it('surfaces API errors', async () => {
    const fetchImpl = (async () => new Response('{"title":"Forbidden"}', { status: 403 })) as unknown as typeof fetch
    const r = await publishToX('hello', creds, fetchImpl)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('403')
  })
})
