/**
 * Image moderation for uploaded photos.
 *
 * Every photo must pass a moderation check before a submission can be
 * auto-approved. The decision is fail-safe for a civic site: anything that
 * is not a clean pass goes to the human review queue, nothing is ever
 * auto-rejected, and the upload itself is unchanged (photos are already in
 * storage by the time moderation runs, exactly as before).
 *
 *   No provider configured (OPENAI_API_KEY unset)  → queue, "Image moderation not configured"
 *   Provider error, non-2xx, or 5 s timeout         → queue, "Image moderation unavailable (…)"
 *   Any photo flagged                               → queue, "Photo N flagged by image moderation (…)"
 *   Every photo passes (or no photos)               → eligible for auto-approval
 *
 * Provider: OpenAI `omni-moderation-latest` with image input, see
 * https://developers.openai.com/api/docs/guides/moderation. Request shape:
 *
 *   POST https://api.openai.com/v1/moderations
 *   { "model": "omni-moderation-latest",
 *     "input": [{ "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,…" } }] }
 *
 * Response: { results: [{ flagged, categories, category_scores, category_applied_input_types }] }.
 * Per the docs only six categories are scored for images (sexual, violence,
 * violence/graphic, self-harm, self-harm/intent, self-harm/instructions);
 * the text-only ones (hate, harassment, illicit, sexual/minors) come back as
 * 0 for image-only input. They stay in the failing set so a model update that
 * starts scoring them for images is handled without a code change.
 *
 * One request per photo (the API returns a single combined result for a
 * multi-item input, which would lose which photo tripped), run in parallel,
 * each under the same timeout.
 */

// ── Categories and thresholds ─────────────────────────────────────────────────

export const MODERATION_CATEGORIES = [
  'sexual',
  'sexual/minors',
  'violence',
  'violence/graphic',
  'hate',
  'hate/threatening',
  'harassment',
  'harassment/threatening',
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
  'illicit',
  'illicit/violent',
] as const

export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number]

export type ModerationThresholds = Readonly<Record<ModerationCategory, number>>

/**
 * A photo fails a category when the provider's own boolean flag is set OR the
 * category score reaches the threshold. Thresholds therefore only tighten the
 * provider's calibration; they cannot loosen it below the provider flag.
 *
 * Defaults are deliberately conservative for a public gallery of utility
 * poles: a false positive costs one admin tap, a false negative is an
 * offensive photo on a civic site. Override per category with the
 * IMAGE_MODERATION_THRESHOLDS env var (JSON, e.g. {"violence":0.8}).
 */
export const DEFAULT_THRESHOLDS: ModerationThresholds = {
  sexual: 0.4,
  'sexual/minors': 0.1,
  violence: 0.7,
  'violence/graphic': 0.5,
  hate: 0.5,
  'hate/threatening': 0.3,
  harassment: 0.5,
  'harassment/threatening': 0.3,
  'self-harm': 0.4,
  'self-harm/intent': 0.3,
  'self-harm/instructions': 0.3,
  illicit: 0.5,
  'illicit/violent': 0.3,
}

/**
 * Parse IMAGE_MODERATION_THRESHOLDS (a JSON object of category → number in
 * [0, 1]) over the defaults. Unknown categories and out-of-range or
 * non-numeric values are ignored with a warning; malformed JSON falls back to
 * the defaults entirely. Never throws: a bad env var must not break uploads.
 */
export function parseThresholds(raw: string | undefined, warn: (msg: string) => void = console.warn): ModerationThresholds {
  if (!raw || raw.trim() === '') return DEFAULT_THRESHOLDS

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    warn('[imageModeration] IMAGE_MODERATION_THRESHOLDS is not valid JSON; using defaults')
    return DEFAULT_THRESHOLDS
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    warn('[imageModeration] IMAGE_MODERATION_THRESHOLDS must be a JSON object; using defaults')
    return DEFAULT_THRESHOLDS
  }

  const known = new Set<string>(MODERATION_CATEGORIES)
  const merged: Record<ModerationCategory, number> = { ...DEFAULT_THRESHOLDS }
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!known.has(key)) {
      warn(`[imageModeration] IMAGE_MODERATION_THRESHOLDS: unknown category "${key}" ignored`)
      continue
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      warn(`[imageModeration] IMAGE_MODERATION_THRESHOLDS: "${key}" must be a number in [0, 1]; ignored`)
      continue
    }
    merged[key as ModerationCategory] = value
  }
  return merged
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface ModerationImage {
  /** Validated bytes from lib/fileQuarantine (magic-byte checked). */
  buffer: Buffer
  /** Canonical MIME type from quarantine, never the user-supplied one. */
  mimeType: string
}

export type ImageVerdict =
  | { outcome: 'pass' }
  | { outcome: 'flagged'; categories: ModerationCategory[] }
  | { outcome: 'error'; message: string }

export interface ImageModerationProvider {
  readonly name: string
  /**
   * Classify one image. Must resolve to a verdict (never throw for provider
   * failures) and must honour `signal`, which aborts on timeout.
   */
  moderate(image: ModerationImage, signal: AbortSignal): Promise<ImageVerdict>
}

// ── OpenAI omni-moderation adapter ────────────────────────────────────────────

export const OPENAI_MODERATION_URL = 'https://api.openai.com/v1/moderations'
export const OPENAI_MODERATION_MODEL = 'omni-moderation-latest'

export interface OpenAIModerationOptions {
  apiKey: string
  thresholds?: ModerationThresholds
  /** Injectable for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch
  model?: string
  endpoint?: string
}

/** The subset of the OpenAI response this adapter reads. */
interface OpenAIModerationResponse {
  results?: Array<{
    flagged?: boolean
    categories?: Partial<Record<string, boolean | null>>
    category_scores?: Partial<Record<string, number | null>>
  }>
}

/**
 * Pure decision over one provider result: which categories fail, given the
 * provider's booleans, its scores and our thresholds. Exported for tests.
 */
export function failingCategories(
  result: { categories?: Partial<Record<string, boolean | null>>; category_scores?: Partial<Record<string, number | null>> },
  thresholds: ModerationThresholds
): ModerationCategory[] {
  const failing: ModerationCategory[] = []
  for (const category of MODERATION_CATEGORIES) {
    const providerFlag = result.categories?.[category] === true
    const score = result.category_scores?.[category]
    const overThreshold = typeof score === 'number' && score >= thresholds[category]
    if (providerFlag || overThreshold) failing.push(category)
  }
  return failing
}

export function createOpenAIImageModerationProvider(options: OpenAIModerationOptions): ImageModerationProvider {
  const {
    apiKey,
    thresholds = DEFAULT_THRESHOLDS,
    fetchImpl = fetch,
    model = OPENAI_MODERATION_MODEL,
    endpoint = OPENAI_MODERATION_URL,
  } = options

  return {
    name: 'openai',
    async moderate(image, signal) {
      const dataUrl = `data:${image.mimeType};base64,${image.buffer.toString('base64')}`

      let response: Response
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: [{ type: 'image_url', image_url: { url: dataUrl } }],
          }),
          signal,
        })
      } catch (err) {
        return { outcome: 'error', message: describeFetchError(err) }
      }

      if (!response.ok) {
        return { outcome: 'error', message: `OpenAI ${response.status}` }
      }

      let body: OpenAIModerationResponse
      try {
        body = (await response.json()) as OpenAIModerationResponse
      } catch {
        return { outcome: 'error', message: 'OpenAI returned a non-JSON body' }
      }

      const result = body.results?.[0]
      if (!result) {
        return { outcome: 'error', message: 'OpenAI returned no results' }
      }

      const failing = failingCategories(result, thresholds)
      return failing.length > 0 ? { outcome: 'flagged', categories: failing } : { outcome: 'pass' }
    },
  }
}

function describeFetchError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') return 'timed out'
    return err.message || err.name
  }
  return String(err)
}

// ── Environment ───────────────────────────────────────────────────────────────

/**
 * The configured provider, or null when OPENAI_API_KEY is unset. A null
 * provider never auto-approves a submission that has photos.
 */
export function getImageModerationProvider(
  env: Record<string, string | undefined> = process.env
): ImageModerationProvider | null {
  const apiKey = env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  return createOpenAIImageModerationProvider({
    apiKey,
    thresholds: parseThresholds(env.IMAGE_MODERATION_THRESHOLDS),
  })
}

// ── Decision ──────────────────────────────────────────────────────────────────

export const MODERATION_TIMEOUT_MS = 5000

export const NOT_CONFIGURED_REASON = 'Image moderation not configured'

/**
 * Formats that may auto-publish. GIF and WebP can carry several frames and a
 * classifier sees one of them while the gallery plays all of them, so those
 * (and anything else quarantine accepts, e.g. HEIC) always go to a human.
 * The submission form re-encodes every photo to JPEG on the phone, so this
 * only affects direct posts to the API.
 */
export const AUTO_PUBLISH_MIME_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png'])

export interface ImageModerationDecision {
  /** true only when every photo passed, or there were no photos to check. */
  passed: boolean
  /** Reasons for the review queue, in the wording the admin sees. Empty when passed. */
  reasons: string[]
}

/**
 * Run moderation over every photo of one submission and reduce to a single
 * auto-approval decision. Never throws and never rejects a submission: every
 * non-pass path returns `passed: false` with a reason for the queue.
 */
export async function moderateImages(
  images: ModerationImage[],
  provider: ImageModerationProvider | null,
  options: { timeoutMs?: number } = {}
): Promise<ImageModerationDecision> {
  if (images.length === 0) return { passed: true, reasons: [] }
  if (!provider) return { passed: false, reasons: [NOT_CONFIGURED_REASON] }

  const timeoutMs = options.timeoutMs ?? MODERATION_TIMEOUT_MS
  const verdicts = await Promise.all(images.map((image) => moderateWithTimeout(provider, image, timeoutMs)))

  const reasons: string[] = []
  verdicts.forEach((verdict, i) => {
    const label = images.length === 1 ? 'Photo' : `Photo ${i + 1}`
    if (!AUTO_PUBLISH_MIME_TYPES.has(images[i].mimeType)) {
      reasons.push(`${label} is ${images[i].mimeType}; only JPEG and PNG are auto-published`)
    }
    if (verdict.outcome === 'flagged') {
      reasons.push(`${label} flagged by image moderation (${verdict.categories.join(', ')})`)
    } else if (verdict.outcome === 'error') {
      reasons.push(`Image moderation unavailable (${verdict.message})`)
    }
  })

  // Collapse duplicate "unavailable" reasons (e.g. every photo timed out).
  const unique = Array.from(new Set(reasons))
  return { passed: unique.length === 0, reasons: unique }
}

async function moderateWithTimeout(
  provider: ImageModerationProvider,
  image: ModerationImage,
  timeoutMs: number
): Promise<ImageVerdict> {
  const controller = new AbortController()
  const timedOut: ImageVerdict = { outcome: 'error', message: `timed out after ${timeoutMs} ms` }
  let expired = false
  const timer = setTimeout(() => {
    expired = true
    controller.abort()
  }, timeoutMs)
  try {
    const verdict = await Promise.race<ImageVerdict>([
      provider.moderate(image, controller.signal),
      new Promise<ImageVerdict>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(timedOut))
      }),
    ])
    // Once the timer has fired the answer is "timed out", whatever a provider
    // resolves from inside its own abort handler.
    return expired ? timedOut : verdict
  } catch (err) {
    // A provider that throws instead of returning a verdict still queues.
    return expired ? timedOut : { outcome: 'error', message: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}
