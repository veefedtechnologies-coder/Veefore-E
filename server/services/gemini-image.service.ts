/**
 * geminiImageService — the Gemini NATIVE image capability (generation + editing).
 *
 * This is intentionally a thin capability wrapper, NOT a separate "Nano Banana"
 * product or a second AI orchestrator. It talks to Gemini's native image
 * `generateContent` endpoint over REST — ONE path for both generation and
 * editing — so we can pass `generationConfig.imageConfig.aspectRatio` (the only
 * thing the model honours for non-square output). Normal text and
 * vision-understanding continue to run on the existing AIServiceManager path.
 *
 * Provider calls are server-side only; keys come from the existing env config.
 */

import {
  GEMINI_IMAGE_API_KEY,
  IMAGE_MODEL_FALLBACKS,
  MAX_IMAGE_INPUTS,
  MAX_IMAGE_INPUT_BYTES,
  SUPPORTED_IMAGE_INPUT_MIME,
} from '../config/veegpt-image.config'

export interface GeneratedImage {
  /** Raw image bytes (to be uploaded to object storage by the caller). */
  buffer: Buffer
  mimeType: string
  /** Any text the model returned alongside the image (usually empty). */
  text?: string
}

export class ImageGenerationError extends Error {
  constructor(
    message: string,
    readonly category:
      | 'no_image'
      | 'refused'
      | 'invalid_input'
      | 'provider'
      | 'not_configured' = 'provider'
  ) {
    super(message)
    this.name = 'ImageGenerationError'
  }
}

/**
 * Resolve the API key: prefer the user's own Google AI Studio key (the SAME key
 * their text model uses, from AI Configuration); fall back to the server env
 * key. Throws a clear not_configured error when neither is present.
 */
function resolveApiKey(apiKey?: string): string {
  const key = apiKey || GEMINI_IMAGE_API_KEY
  if (!key) {
    throw new ImageGenerationError(
      'Image generation is not configured. Add your Google AI Studio key in Settings → AI Configuration.',
      'not_configured'
    )
  }
  return key
}

/** Error messages that mean "this model id isn't available on this key" → retry another id. */
function isModelUnavailable(msg: string): boolean {
  return /not found|not available|no longer available|unsupported|invalid.*model|does not exist|404/i.test(
    msg
  )
}

/** Fetch an input/reference image URL and return sanitised inline data. */
async function fetchInlineImage(
  url: string,
  signal?: AbortSignal
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    let mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_IMAGE_INPUT_BYTES) return null
    // Infer from extension if the server didn't send a usable content-type.
    if (!SUPPORTED_IMAGE_INPUT_MIME.has(mime)) {
      if (/\.png(\?|$)/i.test(url)) mime = 'image/png'
      else if (/\.(jpe?g)(\?|$)/i.test(url)) mime = 'image/jpeg'
      else if (/\.webp(\?|$)/i.test(url)) mime = 'image/webp'
      else if (/\.gif(\?|$)/i.test(url)) mime = 'image/gif'
      else mime = 'image/png'
    }
    return { mimeType: mime, data: buf.toString('base64') }
  } catch {
    return null
  }
}

function extractImage(response: any): GeneratedImage | null {
  const parts = response?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return null
  let text = ''
  for (const p of parts) {
    const inline = p?.inlineData || p?.inline_data
    if (inline?.data) {
      return {
        buffer: Buffer.from(inline.data, 'base64'),
        mimeType: inline.mimeType || inline.mime_type || 'image/png',
        text: text || undefined,
      }
    }
    if (typeof p?.text === 'string') text += p.text
  }
  return null
}

/** Pre-resolved inline image bytes (already loaded from storage / decoded). */
export interface InlineImageInput {
  mimeType: string
  /** base64-encoded image bytes. */
  data: string
}

export interface GenerateImageParams {
  /** Fully-constructed image instruction (built by the planner, not raw user text). */
  prompt: string
  /**
   * Pre-resolved input images (bytes already loaded, e.g. from object storage by
   * key). PREFERRED over imageUrls for reliability — no HTTP fetch, no dependency
   * on URL reachability or signed-URL expiry. Used for multi-turn editing.
   */
  imageInputs?: InlineImageInput[]
  /** Input image URLs — used when only a URL is available (e.g. a fresh upload). */
  imageUrls?: string[]
  /** Concrete Gemini image model id (from selectImageModel). */
  model: string
  /** The user's own Google AI Studio key (from AI Configuration), if set. */
  apiKey?: string
  /**
   * Desired output aspect ratio as a "W:H" string (e.g. "16:9"). Passed to the
   * model as a STRUCTURED generationConfig.imageConfig.aspectRatio — the only
   * thing Nano Banana honours; a textual hint in the prompt is ignored and the
   * model defaults to 1:1. Unsupported ratios are normalized to the nearest
   * supported one.
   */
  aspectRatio?: string
  signal?: AbortSignal
}

/**
 * Aspect ratios Gemini's native image models accept. Anything else (e.g. the
 * "1.91:1" wide preset) is mapped to the closest supported ratio so the request
 * never fails and still comes out non-square.
 */
const SUPPORTED_ASPECT_RATIOS = new Set([
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
])

function normalizeAspectRatio(ratio?: string): string | undefined {
  if (!ratio) return undefined
  const r = ratio.trim()
  if (SUPPORTED_ASPECT_RATIOS.has(r)) return r
  // Map common unsupported ratios (and anything odd) to the nearest supported
  // one by numeric value so the output is still correctly non-square.
  const m = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(r)
  if (!m) return undefined
  const target = Number(m[1]) / Number(m[2])
  if (!Number.isFinite(target) || target <= 0) return undefined
  let best = '1:1'
  let bestDelta = Infinity
  for (const cand of SUPPORTED_ASPECT_RATIOS) {
    const [cw, ch] = cand.split(':').map(Number)
    const delta = Math.abs(cw / ch - target)
    if (delta < bestDelta) {
      bestDelta = delta
      best = cand
    }
  }
  return best
}

/** Base REST endpoint for the Gemini generative-language API. */
const GENAI_REST_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * The single provider call: Gemini's native image `generateContent` over REST.
 * REST (not the SDK) is used deliberately so we can set
 * `generationConfig.imageConfig.aspectRatio` — the only thing the model honours
 * for non-square output. Returns the parsed JSON, whose shape matches what
 * {@link extractImage} expects.
 */
async function generateContentREST(opts: {
  model: string
  parts: any[]
  apiKey: string
  aspectRatio?: string
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<any> {
  // Ask explicitly for image output and set the structured aspect ratio.
  const generationConfig: Record<string, unknown> = { responseModalities: ['IMAGE'] }
  if (opts.aspectRatio) {
    generationConfig.imageConfig = { aspectRatio: opts.aspectRatio }
  }
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: opts.parts }],
    generationConfig,
  }

  // Own timeout so a truly hung provider can never stall the chat stream, but
  // generous enough for slow valid work — editing with input images and premium
  // "thinking" / high-resolution models can legitimately take several minutes.
  // Also honor the caller's abort signal.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 300000)
  const onAbort = () => controller.abort()
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort()
    else opts.signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    const res = await fetch(
      `${GENAI_REST_BASE}/${encodeURIComponent(opts.model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': opts.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    )
    const json: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = String(json?.error?.message || `HTTP ${res.status}`)
      const err: any = new Error(msg)
      err.status = res.status
      throw err
    }
    return json
  } finally {
    clearTimeout(timer)
    if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
  }
}

/**
 * Generate or edit an image with Gemini's native image capability.
 *
 * - No imageUrls → text-to-image generation.
 * - With imageUrls → editing / reference-guided generation (the actual image
 *   bytes are sent to the model, never just a text description of them).
 */
export async function generateOrEditImage(
  params: GenerateImageParams
): Promise<GeneratedImage> {
  const apiKey = resolveApiKey(params.apiKey)
  const aspectRatio = normalizeAspectRatio(params.aspectRatio)
  const parts: any[] = [{ text: params.prompt }]

  // Count how many input images were REQUESTED (bytes + urls), and how many were
  // actually attached to the request, so we can fail clearly if editing input
  // was expected but nothing could be loaded.
  const inputs = (params.imageInputs || []).slice(0, MAX_IMAGE_INPUTS)
  let requestedInputs = 0
  let attachedInputs = 0

  // 1) Pre-resolved bytes (preferred — no network, always current).
  for (const inline of inputs) {
    requestedInputs++
    if (inline?.data && SUPPORTED_IMAGE_INPUT_MIME.has(inline.mimeType)) {
      parts.push({ inlineData: { mimeType: inline.mimeType, data: inline.data } })
      attachedInputs++
    }
  }

  // 2) URL-based inputs (fresh uploads / references without a storage key).
  const urls = (params.imageUrls || []).slice(0, Math.max(0, MAX_IMAGE_INPUTS - inputs.length))
  for (const url of urls) {
    requestedInputs++
    const inline = await fetchInlineImage(url, params.signal)
    if (inline) {
      parts.push({ inlineData: { mimeType: inline.mimeType, data: inline.data } })
      attachedInputs++
    }
  }

  // If input images were expected but NONE could be loaded, fail clearly rather
  // than silently generating something unrelated.
  if (requestedInputs > 0 && attachedInputs === 0) {
    throw new ImageGenerationError(
      'The image to edit could not be read. Please re-upload it and try again.',
      'invalid_input'
    )
  }

  // Try the requested model first, then known-good fallbacks — Google 404s some
  // pinned image ids on newer keys, so a single hardcoded id is fragile.
  const candidates = [params.model, ...IMAGE_MODEL_FALLBACKS].filter(
    (m, i, a) => m && a.indexOf(m) === i
  )
  let lastErr: any = null
  for (const modelId of candidates) {
    let response: any
    try {
      response = await generateContentREST({
        model: modelId,
        parts,
        apiKey,
        aspectRatio,
        signal: params.signal,
        timeoutMs: 300000,
      })
    } catch (err: any) {
      const msg = String(err?.message || err || '')
      console.error(
        `[gemini-image] provider call failed for model="${modelId}": ${msg}`
      )
      if (/safety|blocked|policy/i.test(msg)) {
        throw new ImageGenerationError(
          'That request was blocked by the image safety filter. Try rephrasing it.',
          'refused'
        )
      }
      // Model id not available on this key → try the next candidate.
      if (isModelUnavailable(msg)) {
        lastErr = err
        continue
      }
      throw new ImageGenerationError(msg || 'The image provider failed.', 'provider')
    }

    // The model can refuse by returning only text (no image part).
    const promptFeedback = response?.promptFeedback || response?.prompt_feedback
    if (promptFeedback?.blockReason) {
      throw new ImageGenerationError(
        'That request was blocked by the image safety filter. Try rephrasing it.',
        'refused'
      )
    }

    const image = extractImage(response)
    if (image) return image
    // No image part on a successful call → try the next candidate model.
    lastErr = new ImageGenerationError(
      'The model did not return an image this time. Please try again.',
      'no_image'
    )
  }

  // Every candidate failed. Surface the most useful error.
  if (lastErr instanceof ImageGenerationError) throw lastErr
  const msg = String(lastErr?.message || '')
  console.error(`[gemini-image] all image models failed. lastError="${msg}"`)
  throw new ImageGenerationError(
    'The image model is unavailable on this account right now. Please try again shortly.',
    'provider'
  )
}

/** Whether the image capability is configured (used to gate the tools). */
export function isImageCapabilityConfigured(): boolean {
  return !!GEMINI_IMAGE_API_KEY
}
