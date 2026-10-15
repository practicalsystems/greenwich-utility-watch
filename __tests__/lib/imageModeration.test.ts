import { describe, it, expect, vi } from 'vitest'
import {
  DEFAULT_THRESHOLDS,
  MODERATION_CATEGORIES,
  NOT_CONFIGURED_REASON,
  OPENAI_MODERATION_MODEL,
  OPENAI_MODERATION_URL,
  createOpenAIImageModerationProvider,
  failingCategories,
  getImageModerationProvider,
  moderateImages,
  parseThresholds,
  type ImageModerationProvider,
  type ImageVerdict,
  type ModerationImage,
} from '@/lib/imageModeration'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const JPEG: ModerationImage = { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]), mimeType: 'image/jpeg' }
const PNG: ModerationImage = { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), mimeType: 'image/png' }

/** A provider whose verdicts are scripted per call. */
function scriptedProvider(verdicts: ImageVerdict[]): ImageModerationProvider {
  let i = 0
  return { name: 'scripted', moderate: async () => verdicts[i++] }
}

/** A clean OpenAI-shaped result with every score at zero. */
function cleanResult(overrides: Partial<{ categories: Record<string, boolean | null>; category_scores: Record<string, number> }> = {}) {
  const categories = Object.fromEntries(MODERATION_CATEGORIES.map((c) => [c, false]))
  const category_scores = Object.fromEntries(MODERATION_CATEGORIES.map((c) => [c, 0]))
  return {
    flagged: false,
    categories: { ...categories, ...overrides.categories },
    category_scores: { ...category_scores, ...overrides.category_scores },
    category_applied_input_types: {},
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// ── moderateImages: decision logic ────────────────────────────────────────────

describe('moderateImages — decision logic', () => {
  it('passes with no photos, even without a provider', async () => {
    expect(await moderateImages([], null)).toEqual({ passed: true, reasons: [] })
  })

  it('never auto-approves photos when no provider is configured (OPENAI_API_KEY unset)', async () => {
    const decision = await moderateImages([JPEG], null)
    expect(decision.passed).toBe(false)
    expect(decision.reasons).toEqual([NOT_CONFIGURED_REASON])
  })

  it('passes when every photo passes', async () => {
    const provider = scriptedProvider([{ outcome: 'pass' }, { outcome: 'pass' }])
    expect(await moderateImages([JPEG, PNG], provider)).toEqual({ passed: true, reasons: [] })
  })

  it('queues when any photo is flagged, naming the photo and the categories', async () => {
    const provider = scriptedProvider([
      { outcome: 'pass' },
      { outcome: 'flagged', categories: ['sexual', 'violence/graphic'] },
    ])
    const decision = await moderateImages([JPEG, PNG], provider)
    expect(decision.passed).toBe(false)
    expect(decision.reasons).toEqual(['Photo 2 flagged by image moderation (sexual, violence/graphic)'])
  })

  it('omits the index for a single photo', async () => {
    const provider = scriptedProvider([{ outcome: 'flagged', categories: ['sexual'] }])
    const decision = await moderateImages([JPEG], provider)
    expect(decision.reasons).toEqual(['Photo flagged by image moderation (sexual)'])
  })

  it('queues (does not fail the submission) on a provider error', async () => {
    const provider = scriptedProvider([{ outcome: 'error', message: 'OpenAI 500' }])
    const decision = await moderateImages([JPEG], provider)
    expect(decision.passed).toBe(false)
    expect(decision.reasons).toEqual(['Image moderation unavailable (OpenAI 500)'])
  })

  it('queues when the provider throws instead of returning a verdict', async () => {
    const provider: ImageModerationProvider = { name: 'broken', moderate: async () => { throw new Error('boom') } }
    const decision = await moderateImages([JPEG], provider)
    expect(decision.passed).toBe(false)
    expect(decision.reasons).toEqual(['Image moderation unavailable (boom)'])
  })

  it('queues on timeout and aborts the provider call', async () => {
    let aborted = false
    const provider: ImageModerationProvider = {
      name: 'slow',
      moderate: (_image, signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true
            resolve({ outcome: 'pass' }) // too late: the timeout verdict already won
          })
        }),
    }
    const decision = await moderateImages([JPEG], provider, { timeoutMs: 20 })
    expect(decision.passed).toBe(false)
    expect(decision.reasons).toEqual(['Image moderation unavailable (timed out after 20 ms)'])
    expect(aborted).toBe(true)
  })

  it('collapses identical unavailable reasons across photos', async () => {
    const provider = scriptedProvider([
      { outcome: 'error', message: 'OpenAI 503' },
      { outcome: 'error', message: 'OpenAI 503' },
    ])
    const decision = await moderateImages([JPEG, PNG], provider)
    expect(decision.reasons).toEqual(['Image moderation unavailable (OpenAI 503)'])
  })

  it('reports a flag and an error from different photos together', async () => {
    const provider = scriptedProvider([
      { outcome: 'flagged', categories: ['violence/graphic'] },
      { outcome: 'error', message: 'timed out' },
    ])
    const decision = await moderateImages([JPEG, PNG], provider)
    expect(decision.passed).toBe(false)
    expect(decision.reasons).toEqual([
      'Photo 1 flagged by image moderation (violence/graphic)',
      'Image moderation unavailable (timed out)',
    ])
  })
})

// ── failingCategories: thresholds ─────────────────────────────────────────────

describe('failingCategories', () => {
  it('returns nothing for a clean result', () => {
    expect(failingCategories(cleanResult(), DEFAULT_THRESHOLDS)).toEqual([])
  })

  it("honours the provider's own boolean flag regardless of score", () => {
    const result = cleanResult({ categories: { sexual: true }, category_scores: { sexual: 0.01 } })
    expect(failingCategories(result, DEFAULT_THRESHOLDS)).toEqual(['sexual'])
  })

  it('fails a category whose score reaches the threshold', () => {
    const result = cleanResult({ category_scores: { 'violence/graphic': DEFAULT_THRESHOLDS['violence/graphic'] } })
    expect(failingCategories(result, DEFAULT_THRESHOLDS)).toEqual(['violence/graphic'])
  })

  it('passes a category just under the threshold', () => {
    const result = cleanResult({ category_scores: { violence: DEFAULT_THRESHOLDS.violence - 0.01 } })
    expect(failingCategories(result, DEFAULT_THRESHOLDS)).toEqual([])
  })

  it('tolerates null booleans (illicit categories may be null) and missing scores', () => {
    const result = { categories: { illicit: null, 'illicit/violent': null }, category_scores: {} }
    expect(failingCategories(result, DEFAULT_THRESHOLDS)).toEqual([])
  })

  it('covers every category the brief names: sexual, violence, hate, harassment, self-harm, illicit', () => {
    const result = cleanResult({
      category_scores: {
        sexual: 1, 'violence/graphic': 1, hate: 1, harassment: 1, 'self-harm': 1, illicit: 1,
      },
    })
    expect(failingCategories(result, DEFAULT_THRESHOLDS)).toEqual([
      'sexual', 'violence/graphic', 'hate', 'harassment', 'self-harm', 'illicit',
    ])
  })
})

describe('parseThresholds', () => {
  it('returns the defaults when unset or blank', () => {
    expect(parseThresholds(undefined)).toBe(DEFAULT_THRESHOLDS)
    expect(parseThresholds('  ')).toBe(DEFAULT_THRESHOLDS)
  })

  it('overrides only the given categories', () => {
    const t = parseThresholds('{"violence":0.9}', () => {})
    expect(t.violence).toBe(0.9)
    expect(t.sexual).toBe(DEFAULT_THRESHOLDS.sexual)
  })

  it('ignores unknown categories and out-of-range values, with a warning', () => {
    const warn = vi.fn()
    const t = parseThresholds('{"nope":0.5,"sexual":2,"violence":"high","hate":0.2}', warn)
    expect(t.sexual).toBe(DEFAULT_THRESHOLDS.sexual)
    expect(t.violence).toBe(DEFAULT_THRESHOLDS.violence)
    expect(t.hate).toBe(0.2)
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('falls back to the defaults on malformed JSON or a non-object', () => {
    const warn = vi.fn()
    expect(parseThresholds('{not json', warn)).toBe(DEFAULT_THRESHOLDS)
    expect(parseThresholds('[0.5]', warn)).toBe(DEFAULT_THRESHOLDS)
    expect(parseThresholds('null', warn)).toBe(DEFAULT_THRESHOLDS)
    expect(warn).toHaveBeenCalledTimes(3)
  })
})

// ── OpenAI adapter (mocked fetch) ─────────────────────────────────────────────

describe('createOpenAIImageModerationProvider', () => {
  it('sends the documented request shape: model, bearer key, base64 data URL image item', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'modr-x', model: 'omni-moderation-latest', results: [cleanResult()] }))
    const provider = createOpenAIImageModerationProvider({ apiKey: 'sk-test', fetchImpl })

    const verdict = await provider.moderate(JPEG, new AbortController().signal)
    expect(verdict).toEqual({ outcome: 'pass' })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(OPENAI_MODERATION_URL)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.signal).toBeInstanceOf(AbortSignal)

    const body = JSON.parse(init.body as string)
    expect(body.model).toBe(OPENAI_MODERATION_MODEL)
    expect(body.input).toEqual([
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${JPEG.buffer.toString('base64')}` } },
    ])
  })

  it('flags on a failing category score', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ results: [cleanResult({ category_scores: { sexual: 0.95 } })] })
    )
    const provider = createOpenAIImageModerationProvider({ apiKey: 'sk-test', fetchImpl })
    const verdict = await provider.moderate(JPEG, new AbortController().signal)
    expect(verdict).toEqual({ outcome: 'flagged', categories: ['sexual'] })
  })

  it('applies custom thresholds', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ results: [cleanResult({ category_scores: { violence: 0.5 } })] }))
    const strict = createOpenAIImageModerationProvider({
      apiKey: 'sk-test', fetchImpl, thresholds: { ...DEFAULT_THRESHOLDS, violence: 0.5 },
    })
    const lax = createOpenAIImageModerationProvider({ apiKey: 'sk-test', fetchImpl })
    const signal = new AbortController().signal
    expect(await strict.moderate(JPEG, signal)).toEqual({ outcome: 'flagged', categories: ['violence'] })
    expect(await lax.moderate(JPEG, signal)).toEqual({ outcome: 'pass' })
  })

  it('returns an error verdict on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'bad key' } }, 401))
    const provider = createOpenAIImageModerationProvider({ apiKey: 'sk-bad', fetchImpl })
    expect(await provider.moderate(JPEG, new AbortController().signal)).toEqual({ outcome: 'error', message: 'OpenAI 401' })
  })

  it('returns an error verdict on a network failure', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed') })
    const provider = createOpenAIImageModerationProvider({ apiKey: 'sk-test', fetchImpl })
    expect(await provider.moderate(JPEG, new AbortController().signal)).toEqual({ outcome: 'error', message: 'fetch failed' })
  })

  it('returns an error verdict on a malformed or empty body', async () => {
    const signal = new AbortController().signal
    const noResults = createOpenAIImageModerationProvider({ apiKey: 'k', fetchImpl: vi.fn(async () => jsonResponse({ results: [] })) })
    expect(await noResults.moderate(JPEG, signal)).toEqual({ outcome: 'error', message: 'OpenAI returned no results' })

    const notJson = createOpenAIImageModerationProvider({
      apiKey: 'k', fetchImpl: vi.fn(async () => new Response('<html>', { status: 200 })),
    })
    expect(await notJson.moderate(JPEG, signal)).toEqual({ outcome: 'error', message: 'OpenAI returned a non-JSON body' })
  })

  it('times out through moderateImages when fetch honours the abort signal', async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
    ) as unknown as typeof fetch
    const provider = createOpenAIImageModerationProvider({ apiKey: 'sk-test', fetchImpl })
    const decision = await moderateImages([JPEG], provider, { timeoutMs: 20 })
    expect(decision.passed).toBe(false)
    expect(decision.reasons[0]).toMatch(/^Image moderation unavailable \(timed out/)
  })
})

// ── Environment wiring ────────────────────────────────────────────────────────

describe('getImageModerationProvider', () => {
  it('is null when OPENAI_API_KEY is unset or blank', () => {
    expect(getImageModerationProvider({})).toBeNull()
    expect(getImageModerationProvider({ OPENAI_API_KEY: '   ' })).toBeNull()
  })

  it('returns the OpenAI provider when the key is set', () => {
    const provider = getImageModerationProvider({ OPENAI_API_KEY: 'sk-test' })
    expect(provider?.name).toBe('openai')
  })
})
