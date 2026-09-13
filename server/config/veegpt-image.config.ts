/**
 * VeeGPT image capability configuration.
 *
 * Nano Banana is NOT a separate product/model here — it is Google's native
 * Gemini image capability. These IDs map the Veefore "image capability" to the
 * current Gemini image models, in ONE place, and are env-overridable so we can
 * roll a new model id without touching code. If your Google API key does not
 * yet have access to the defaults below, set GEMINI_IMAGE_MODEL /
 * GEMINI_IMAGE_MODEL_PREMIUM to an id it does (e.g. "gemini-2.5-flash-image").
 *
 * The user never sees or selects these ids — routing is automatic (see
 * selectImageModel).
 */

export interface ImageAspectRatio {
  id: string
  label: string
  /** "W:H" ratio string passed to the model where supported. */
  ratio: string
  width: number
  height: number
}

/**
 * Default (fast, general-purpose) Gemini image model — "Nano Banana".
 * `gemini-2.5-flash-image` is the generally-available native image model that
 * works with a standard Google API key. Newer ids (e.g. a future
 * `gemini-3-pro-image-preview`) can be rolled in via env once the key has
 * access — no code change needed.
 */
export const GEMINI_IMAGE_MODEL_DEFAULT =
  process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'

/**
 * Premium (complex/high-fidelity) Gemini image model — "Nano Banana Pro".
 * Defaults to the same GA model so premium requests never fail on keys without
 * preview access; override with GEMINI_IMAGE_MODEL_PREMIUM when allowlisted.
 */
export const GEMINI_IMAGE_MODEL_PREMIUM =
  process.env.GEMINI_IMAGE_MODEL_PREMIUM ||
  process.env.GEMINI_IMAGE_MODEL ||
  'gemini-2.5-flash-image'

/** The key used to construct the image client. Reuses the existing Gemini key. */
export const GEMINI_IMAGE_API_KEY =
  process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || ''

/**
 * Ordered fallback image model ids. Google 404s some pinned ids on newer keys
 * ("no longer available to new users" / "not found"), so if the primary model
 * isn't available on this key we transparently retry the next known-good id.
 * De-duplicated against the primary at call time. Env-overridable via
 * GEMINI_IMAGE_MODEL_FALLBACKS (comma-separated).
 */
export const IMAGE_MODEL_FALLBACKS: string[] = (
  process.env.GEMINI_IMAGE_MODEL_FALLBACKS
    ? process.env.GEMINI_IMAGE_MODEL_FALLBACKS.split(',').map(s => s.trim())
    : [
        GEMINI_IMAGE_MODEL_DEFAULT,
        'gemini-2.5-flash-image',
        'gemini-2.5-flash-image-preview',
        'gemini-3-pro-image-preview',
      ]
).filter(Boolean)

/** Max reference/input images sent to the model in one call. */
export const MAX_IMAGE_INPUTS = 4

/** Max bytes for an input/reference image fetched for editing. */
export const MAX_IMAGE_INPUT_BYTES = 12 * 1024 * 1024 // 12MB

/** Supported input MIME types for editing/reference. */
export const SUPPORTED_IMAGE_INPUT_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

/**
 * Aspect ratios the platform understands. Used to map a social platform / user
 * request to a concrete output ratio. The model may not honour exact pixels, so
 * these are hints + the ratio string.
 */
export const IMAGE_ASPECT_RATIOS: Record<string, ImageAspectRatio> = {
  square: { id: 'square', label: 'Square (1:1)', ratio: '1:1', width: 1080, height: 1080 },
  portrait: { id: 'portrait', label: 'Portrait (4:5)', ratio: '4:5', width: 1080, height: 1350 },
  story: { id: 'story', label: 'Story/Reel (9:16)', ratio: '9:16', width: 1080, height: 1920 },
  landscape: { id: 'landscape', label: 'Landscape (16:9)', ratio: '16:9', width: 1920, height: 1080 },
  wide: { id: 'wide', label: 'Wide (1.91:1)', ratio: '1.91:1', width: 1200, height: 628 },
}

/** Map a social platform hint to a sensible default aspect ratio id. */
export function aspectForPlatform(platform?: string): string {
  const p = (platform || '').toLowerCase()
  if (/story|reel|tiktok|short/.test(p)) return 'story'
  if (/youtube|thumbnail/.test(p)) return 'landscape'
  if (/linkedin|facebook|twitter|x\b/.test(p)) return 'wide'
  if (/instagram|feed|post/.test(p)) return 'portrait'
  return 'square'
}

/**
 * Make an image URL fetchable by the SERVER itself.
 *
 * In local-storage mode, uploaded images are served from a root-relative path
 * (e.g. `/uploads/ai-images/…`). That renders fine in the browser (resolved
 * against the page origin) but Node's `fetch` cannot resolve a relative URL, so
 * reusing a previously-generated image for a multi-turn EDIT would fail with
 * "the image to edit could not be read". This rewrites a root-relative URL to an
 * absolute one the server can reach itself. Absolute (http/https/data) URLs —
 * e.g. S3 in production — are returned unchanged.
 *
 * @param url          the stored/attached image URL (may be relative)
 * @param selfBaseUrl  the server's own reachable origin, e.g. http://127.0.0.1:3000
 */
export function toServerFetchableImageUrl(url: string, selfBaseUrl: string): string {
  const u = (url || '').trim()
  if (!u) return u
  // Already absolute (http/https) or inline data — fetchable as-is.
  if (/^(https?:|data:)/i.test(u)) return u
  // Root-relative path served by this same server (local storage).
  if (u.startsWith('/')) {
    return `${(selfBaseUrl || '').replace(/\/+$/, '')}${u}`
  }
  return u
}

/**
 * The server's own reachable base origin, used to fetch its own locally-stored
 * files. Prefers an explicit override, else localhost on the configured PORT.
 * Never the public domain — that may not resolve back to this instance in dev.
 */
export function selfFetchBaseUrl(): string {
  const explicit = process.env.INTERNAL_SELF_URL || process.env.SELF_BASE_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  const port = process.env.PORT || '3000'
  return `http://127.0.0.1:${port}`
}

/** Model ids that are Gemini-backed even though the name isn't "gemini-…". */
const GEMINI_BACKED_IDS = new Set(['veegpt-hybrid', 'veegpt-auto', 'google-ai-studio'])

/**
 * True when the user's selected VeeGPT model is served by Gemini. Native image
 * generation is ALWAYS a Gemini capability, so a non-Gemini selection (GPT,
 * Claude, Perplexity) falls back to the Gemini image model rather than failing.
 */
export function isGeminiModel(preferredModel?: string): boolean {
  const id = (preferredModel || '').toLowerCase()
  if (!id) return true // no selection → app default is Gemini-backed
  return id.includes('gemini') || id.includes('google') || GEMINI_BACKED_IDS.has(id)
}

/**
 * Choose the concrete Gemini image model, DERIVED FROM the user's AI-config
 * model selection (spec: routing is automatic, the user never picks an image
 * model directly):
 *
 *  - The user's selected model is read from AI Configuration (preferredModel).
 *  - If they picked a NON-Gemini model (e.g. GPT), image generation still runs
 *    on Gemini — we fall back to the Gemini image model.
 *  - A premium/pro/3.x Gemini selection (or an explicit premium/complex request)
 *    routes to the premium image model; everything else uses the fast default.
 *
 * This is best quality/cost/latency — NOT max usage. Concrete ids come from the
 * env-overridable constants above, so no image model id is hardcoded here.
 */
export function selectImageModel(opts: {
  preferredModel?: string
  premiumRequested?: boolean
  complex?: boolean
}): string {
  const id = (opts.preferredModel || '').toLowerCase()
  const geminiPremiumTier =
    isGeminiModel(id) && /(-pro|pro-latest|3\.\d|3-|gpt-5\.5|ultra)/.test(id)
  const wantsPremium = opts.premiumRequested || opts.complex || geminiPremiumTier
  return wantsPremium ? GEMINI_IMAGE_MODEL_PREMIUM : GEMINI_IMAGE_MODEL_DEFAULT
}

// ── Image delivery (bandwidth offload) ───────────────────────────────────────
// The authenticated image proxy (`GET /api/chat/image/:assetId`) can serve
// bytes two ways:
//
//   • "stream"   — the server downloads the object from storage and pipes the
//                  bytes through itself. Simple, always works (local + S3), no
//                  CORS, stable URL — but every image byte uses server egress.
//
//   • "redirect" — after auth + per-user authorization pass, the server issues
//                  a short-lived pre-signed S3 URL and 302-redirects the browser
//                  to it, so the bytes flow S3 → browser directly and never
//                  touch server bandwidth. The bucket stays PRIVATE (the signed
//                  URL is time-boxed and only minted for an authorized caller).
//                  This is the standard way large products (incl. Google/AWS
//                  consoles) offload object delivery. Downloads (`?download=1`)
//                  always stream, so the file fetch stays same-origin.
//
// Env-gated so we can flip modes without a code change and always fall back to
// streaming when storage is local or presigning is unavailable.

//   • "cloudfront" — after auth, 302 to a short-lived CloudFront SIGNED URL so
//                  bytes flow from the nearest CDN edge (fastest globally,
//                  cheapest egress). The bucket stays PRIVATE (Origin Access
//                  Control) and CloudFront only serves URLs signed by our key.
export type ImageDeliveryMode = 'stream' | 'redirect' | 'cloudfront'

/** Selected delivery mode. Defaults to `stream`; `redirect`/`cloudfront` opt-in via env. */
export function imageDeliveryMode(): ImageDeliveryMode {
  const v = (process.env.IMAGE_DELIVERY || 'stream').trim().toLowerCase()
  if (v === 'cloudfront') return 'cloudfront'
  if (v === 'redirect') return 'redirect'
  return 'stream'
}

/**
 * CloudFront signing config, read from env. Returns null (→ caller falls back to
 * streaming) unless ALL three are present: domain, key pair id, private key.
 * The private key is stored in env with literal `\n` escapes, restored here.
 */
export function cloudFrontConfig(): { domain: string; keyPairId: string; privateKey: string } | null {
  const domain = (process.env.CLOUDFRONT_DOMAIN || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  const keyPairId = (process.env.CLOUDFRONT_KEY_PAIR_ID || '').trim()
  const privateKey = (process.env.CLOUDFRONT_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim()
  if (!domain || !keyPairId || !privateKey) return null
  return { domain, keyPairId, privateKey }
}

/** Build the base CloudFront URL for a storage key (no signature). */
export function cloudFrontUrlForKey(domain: string, storageKey: string): string {
  const key = String(storageKey || '').replace(/^\/+/, '')
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `https://${domain.replace(/\/+$/, '')}/${encoded}`
}

/** Min/default/max signed-URL lifetime (seconds). Capped to the storage cap. */
export const IMAGE_SIGNED_URL_TTL_MIN = 60
export const IMAGE_SIGNED_URL_TTL_MAX = 86400 // matches StorageService MAX_SIGNED_URL_EXPIRATION
export const IMAGE_SIGNED_URL_TTL_DEFAULT = 3600

/**
 * Signed-URL lifetime in seconds, from `IMAGE_SIGNED_URL_TTL`, clamped to
 * [MIN, MAX]. A malformed/absent value uses the default.
 */
export function imageSignedUrlTtlSeconds(): number {
  const raw = parseInt(String(process.env.IMAGE_SIGNED_URL_TTL || ''), 10)
  const n = Number.isFinite(raw) ? raw : IMAGE_SIGNED_URL_TTL_DEFAULT
  return Math.min(IMAGE_SIGNED_URL_TTL_MAX, Math.max(IMAGE_SIGNED_URL_TTL_MIN, n))
}

/**
 * Decide whether the proxy should 302-redirect to a pre-signed URL instead of
 * streaming. Pure so the route stays trivially testable.
 *
 *  - Only when delivery mode is "redirect".
 *  - Never for downloads (those stay same-origin streaming to avoid CORS).
 *  - Only when the signed URL is absolute http(s) — local storage returns a
 *    root-relative `/uploads/…` path, which must be streamed, not redirected.
 */
export function shouldRedirectImage(opts: {
  mode: ImageDeliveryMode
  isDownload: boolean
  signedUrl?: string
}): boolean {
  if (opts.mode !== 'redirect') return false
  if (opts.isDownload) return false
  return /^https?:\/\//i.test((opts.signedUrl || '').trim())
}
