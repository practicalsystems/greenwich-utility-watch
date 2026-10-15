/**
 * Bluesky (AT Protocol) publishing with an app password. Official API, no SDK:
 * two fetches. https://docs.bsky.app/docs/api/com-atproto-repo-create-record
 */

export interface BlueskyCreds {
  handle: string
  appPassword: string
  service?: string
}

export function blueskyCredsFromEnv(env: Record<string, string | undefined> = process.env): BlueskyCreds | null {
  const handle = env.BLUESKY_HANDLE?.trim()
  const appPassword = env.BLUESKY_APP_PASSWORD?.trim()
  if (!handle || !appPassword) return null
  return { handle, appPassword, service: env.BLUESKY_SERVICE?.trim() || 'https://bsky.social' }
}

export interface Facet {
  index: { byteStart: number; byteEnd: number }
  features: Array<{ $type: 'app.bsky.richtext.facet#link'; uri: string }>
}

/**
 * Bluesky does not auto-link URLs; a post needs link facets with UTF-8 byte
 * offsets. Trailing punctuation is excluded from the link.
 */
export function detectLinkFacets(text: string): Facet[] {
  const enc = new TextEncoder()
  const facets: Facet[] = []
  const re = /https?:\/\/[^\s<>"')\]]+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const url = m[0].replace(/[.,;:!?]+$/, '')
    if (!url) continue
    const start = enc.encode(text.slice(0, m.index)).byteLength
    const end = start + enc.encode(url).byteLength
    facets.push({ index: { byteStart: start, byteEnd: end }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }] })
  }
  return facets
}

export interface PublishResult {
  ok: true
  url: string
  id: string
}
export interface PublishFailure {
  ok: false
  error: string
}

export async function publishToBluesky(
  text: string,
  creds: BlueskyCreds,
  fetchImpl: typeof fetch = fetch
): Promise<PublishResult | PublishFailure> {
  const service = creds.service ?? 'https://bsky.social'
  try {
    const sessionRes = await fetchImpl(`${service}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: creds.handle, password: creds.appPassword }),
      signal: AbortSignal.timeout(15000),
    })
    if (!sessionRes.ok) return { ok: false, error: `Bluesky login failed (${sessionRes.status})` }
    const session = (await sessionRes.json()) as { accessJwt: string; did: string; handle: string }

    const record = {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: new Date().toISOString(),
      facets: detectLinkFacets(text),
      langs: ['en'],
    }
    const postRes = await fetchImpl(`${service}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessJwt}` },
      body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record }),
      signal: AbortSignal.timeout(15000),
    })
    if (!postRes.ok) {
      const body = await postRes.text().catch(() => '')
      return { ok: false, error: `Bluesky post failed (${postRes.status}): ${body.slice(0, 200)}` }
    }
    const out = (await postRes.json()) as { uri: string; cid: string }
    const rkey = out.uri.split('/').pop() ?? ''
    return { ok: true, id: out.uri, url: `https://bsky.app/profile/${session.handle || creds.handle}/post/${rkey}` }
  } catch (err) {
    return { ok: false, error: `Bluesky request threw: ${err instanceof Error ? err.message : String(err)}` }
  }
}
