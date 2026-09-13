/**
 * Auto Pilot — VisionGroundingService.
 *
 * Turns a Media_Pool item into a factual, cached description of what it actually
 * shows, so downstream stages (caption drafting, engagement-automation
 * decisions, content matching) reason over the REAL media instead of just the
 * slot's theme text. This is the foundation of the "intelligence" overhaul: the
 * existing `AIServiceManager.analyzeMedia` (Gemini/OpenAI vision) is finally
 * wired into the Operating Loop, and its output is cached on the pool item so a
 * given item is analyzed at most once.
 *
 * ── Behaviour ────────────────────────────────────────────────────────────────
 *   • Cache hit  — an item whose `visionAnalysis.description` is already present
 *     is returned as-is; no vision call, no spend (R1.2).
 *   • Cache miss — the media is analyzed under `withAIFeature('autopilot.vision')`
 *     (credit attribution · R1.4), the description is persisted via
 *     `setVisionAnalysis({ description, analyzedAt })`, and returned (R1.1).
 *   • Degrade    — a throw, timeout, or empty result resolves to `undefined` so
 *     callers fall back to the text-only path and the loop never breaks (R1.3).
 *
 * Every dependency (the vision transport, the persistence store, the clock, the
 * timeout) is injected with the real singletons as defaults, so the cache /
 * persist / degrade logic is fully unit-testable without a network or database.
 *
 * Satisfies Requirements: 1.1, 1.2, 1.3, 1.4
 */

import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../../../config/logger'
import { aiServiceManager, type UserAIPreferences } from '../../../services/AIServiceManager'
import { withAIFeature } from '../../../services/aiUsageTracker'
import { mediaPoolRepository } from '../db/repositories/MediaPoolRepository'
import type { IMediaPoolItem, MediaType } from '../db/models'

/** MIME type by file extension, for building data URLs from local uploads. */
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  '3gp': 'video/3gpp',
}

/**
 * Make a media URL fetchable by the vision model. Auto Pilot stores uploads as
 * server-relative paths (e.g. `/uploads/autopilot/media/…`), which `fetch()`
 * cannot parse ("Failed to parse URL"). Those files live on local disk under the
 * process cwd (served at `/uploads`), so we read them and return a `data:` URL
 * the vision fetch can consume. Absolute (http/https/data) URLs pass through; a
 * relative path whose file can't be read falls back to an absolute URL built
 * from the configured base so vision can still try over HTTP.
 */
export function toFetchableMediaUrl(mediaUrl: string): string {
  if (/^(https?:|data:)/i.test(mediaUrl)) return mediaUrl
  if (mediaUrl.startsWith('/')) {
    try {
      const abs = path.join(process.cwd(), mediaUrl.split('?')[0])
      if (fs.existsSync(abs)) {
        const ext = (abs.split('.').pop() || '').toLowerCase()
        const mime = MIME_BY_EXT[ext] || 'application/octet-stream'
        const b64 = fs.readFileSync(abs).toString('base64')
        return `data:${mime};base64,${b64}`
      }
    } catch {
      /* fall through to the HTTP base-URL form */
    }
    const base =
      process.env.INTERNAL_BASE_URL ||
      process.env.BASE_URL ||
      process.env.APP_URL ||
      `http://127.0.0.1:${process.env.PORT || 5000}`
    return `${base.replace(/\/$/, '')}${mediaUrl}`
  }
  return mediaUrl
}

/**
 * Process-level in-memory cache for vision descriptions, keyed by media pool
 * item ID. This is a secondary guard COMPLEMENTARY to the DB-persisted
 * `visionAnalysis` field. It prevents redundant re-analysis when:
 *   1. Multiple stages in the same tick both call ensureDescription for the
 *      same pool item (THINK builds inventory → GATE processes assigned slot).
 *   2. The DB write of `setVisionAnalysis` succeeds but the fresh DB fetch on
 *      the next tick returns the document before the write has propagated
 *      (eventual consistency / driver caching edge cases).
 * The cache is never invalidated: a vision description for a given pool item
 * is stable (the underlying media doesn't change), so holding it for the
 * lifetime of the server process is safe and desirable.
 */
const VISION_PROCESS_CACHE = new Map<string, string>()

const COMPONENT = 'autopilot.VisionGroundingService'

/** The AI-feature label used to attribute vision-analysis spend (R1.4). */
export const VISION_AI_FEATURE = 'autopilot.vision'

/** Default per-item vision deadline (ms) so a slow/large media never hangs a tick. */
export const VISION_TIMEOUT_MS = 20_000

/** The grounding signal passed to caption / automation stages. */
export interface MediaGrounding {
  /** Factual description of what the media shows (vision), when available. */
  description?: string
  /** Free-text purpose the user attached to the item. */
  userIntent?: string
  /** Explicit automation trigger keyword the user set for the item. */
  userKeyword?: string
}

/** The minimal pool-item shape the service reads. */
export interface GroundablePoolItem {
  _id?: unknown
  mediaUrl?: string
  mediaType?: MediaType
  visionAnalysis?: Record<string, unknown>
  userIntent?: string
  userKeyword?: string
}

/** Vision transport port. Defaults to `aiServiceManager.analyzeMedia`. */
export interface VisionAnalyzer {
  analyze(
    mediaUrl: string,
    mediaType: 'image' | 'video',
    preferences?: UserAIPreferences,
  ): Promise<string | undefined>
}

/** Persistence port for caching the description on the pool item. */
export interface VisionStore {
  setVisionAnalysis(
    itemId: string,
    visionAnalysis: Record<string, unknown>,
  ): Promise<IMediaPoolItem | null>
}

/** Tunable dependencies for the vision-grounding step. */
export interface VisionGroundingServiceOptions {
  analyzer?: VisionAnalyzer
  store?: VisionStore
  timeoutMs?: number
  now?: () => number
}

const defaultAnalyzer: VisionAnalyzer = {
  analyze: (mediaUrl, mediaType, preferences) =>
    aiServiceManager.analyzeMedia(mediaUrl, mediaType, preferences),
}

/** A non-empty trimmed string. */
function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Read a cached vision description off an item's `visionAnalysis`, if present.
 * Also checks the process-level in-memory cache (populated after first analysis)
 * so items that were analyzed this server session never re-analyze even if the
 * DB fetch returns a stale document that doesn't yet carry `visionAnalysis`.
 */
export function cachedDescription(item: GroundablePoolItem | null | undefined): string | undefined {
  if (!item) return undefined
  // Check the process-level cache first (fastest, no DB round-trip).
  const itemId = item._id != null ? String(item._id) : ''
  if (itemId && VISION_PROCESS_CACHE.has(itemId)) {
    return VISION_PROCESS_CACHE.get(itemId)
  }
  // Fall back to the DB-persisted field.
  const d = (item?.visionAnalysis as { description?: unknown } | undefined)?.description
  const desc = nonEmpty(d) ? d.trim() : undefined
  // Warm the process cache so future same-tick calls skip the DB check.
  if (desc && itemId) VISION_PROCESS_CACHE.set(itemId, desc)
  return desc
}

/**
 * Analyzes media once and caches the description, exposing a `MediaGrounding`
 * that folds together the vision description and the user's per-item intent.
 */
export class VisionGroundingService {
  private readonly analyzer: VisionAnalyzer
  private readonly store: VisionStore
  private readonly timeoutMs: number
  private readonly now: () => number

  constructor(options: VisionGroundingServiceOptions = {}) {
    this.analyzer = options.analyzer ?? defaultAnalyzer
    this.store = options.store ?? (mediaPoolRepository as unknown as VisionStore)
    this.timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? VISION_TIMEOUT_MS))
    this.now = options.now ?? Date.now
  }

  /**
   * Ensure a factual description for the item, analyzing + caching on a miss.
   * Returns `undefined` (never throws) when vision is unavailable so callers
   * degrade to text-only (R1.3).
   *
   * Vision is Gemini-primary in this app (video is Gemini-only; images also
   * fall back to OpenAI). When the workspace's configured AI provider/model
   * (`preferences`) is not vision-capable or its call fails, this retries ONCE
   * with no preferences — `AIServiceManager`'s own default vision chain
   * (Gemini flash models → OpenAI vision for images) — so a workspace configured
   * for a non-vision or misbehaving provider still gets a real description
   * instead of silently degrading to text-only.
   *
   * @param workspaceId  used only for AI-usage attribution (R1.4).
   * @param preferences  the workspace's configured AI settings (model, BYO keys).
   */
  async ensureDescription(
    item: GroundablePoolItem | null | undefined,
    workspaceId?: unknown,
    preferences?: UserAIPreferences,
  ): Promise<string | undefined> {
    if (!item) return undefined

    const cached = cachedDescription(item)
    if (cached) {
      // Log at trace-level so the user can see the cache is working (not re-analyzing).
      logger.debug('VISION: cache hit — skipping re-analysis', {
        component: COMPONENT,
        itemId: item._id != null ? String(item._id) : '?',
        source: VISION_PROCESS_CACHE.has(item._id != null ? String(item._id) : '') ? 'process-cache' : 'db-field',
      })
      return cached
    }

    if (!nonEmpty(item.mediaUrl)) return undefined
    const mediaType: 'image' | 'video' = item.mediaType === 'video' ? 'video' : 'image'
    const itemId = item._id != null ? String(item._id) : ''

    // Auto Pilot uploads are stored as server-relative paths; resolve to a
    // fetchable form (local file → data URL, else absolute URL) so the vision
    // model can actually read the bytes.
    const fetchableUrl = toFetchableMediaUrl(item.mediaUrl)
    const attributionCtx = { workspaceId: workspaceId != null ? String(workspaceId) : undefined }

    const runAnalyze = (prefs?: UserAIPreferences) =>
      withAIFeature(VISION_AI_FEATURE, attributionCtx, () =>
        this.withTimeout(() => this.analyzer.analyze(fetchableUrl, mediaType, prefs)),
      )

    let description: string | undefined
    try {
      description = await runAnalyze(preferences)
    } catch (error) {
      logger.warn('VISION: analysis failed with configured provider — falling back to default vision chain', {
        component: COMPONENT,
        itemId,
        error: error instanceof Error ? error.message : String(error),
      })
      description = undefined
    }

    // Fall back to the built-in Gemini/OpenAI vision chain (no preferences)
    // when the configured provider produced nothing and we haven't already
    // tried the default chain (i.e. non-empty preferences were supplied).
    if (!nonEmpty(description) && preferences && Object.keys(preferences).length > 0) {
      try {
        description = await runAnalyze(undefined)
      } catch (error) {
        logger.warn('VISION: fallback vision chain also failed — degrading to text-only', {
          component: COMPONENT,
          itemId,
          error: error instanceof Error ? error.message : String(error),
        })
        return undefined
      }
    }

    if (!nonEmpty(description)) {
      logger.warn('VISION: analyzer returned no description — degrading to text-only', {
        component: COMPONENT,
        itemId,
        mediaUrl: item.mediaUrl,
        mediaType,
      })
      return undefined
    }
    const trimmed = description.trim()
    logger.info('VISION: analyzed media', {
      component: COMPONENT,
      itemId,
      mediaType,
      descriptionPreview: trimmed.slice(0, 120),
    })

    // Cache best-effort so a description is computed at most once (R1.1).
    if (itemId) {
      // Warm the process-level cache immediately so subsequent calls in the
      // same tick (THINK → GATE) get a cache hit without another DB round-trip.
      VISION_PROCESS_CACHE.set(itemId, trimmed)
      try {
        await this.store.setVisionAnalysis(itemId, {
          description: trimmed,
          analyzedAt: new Date(this.now()).toISOString(),
        })
        // Reflect the cache on the in-memory item so this tick reuses it.
        item.visionAnalysis = { ...(item.visionAnalysis ?? {}), description: trimmed }
      } catch (error) {
        logger.warn('VISION: failed to cache description to DB — description is in process-cache for this session', {
          component: COMPONENT,
          itemId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return trimmed
  }

  /**
   * Build the full {@link MediaGrounding} for an item: the (ensured) vision
   * description plus the user's per-item intent + keyword. Returns an empty
   * object when the item is missing.
   */
  async buildGrounding(
    item: GroundablePoolItem | null | undefined,
    workspaceId?: unknown,
    preferences?: UserAIPreferences,
  ): Promise<MediaGrounding> {
    if (!item) return {}
    const description = await this.ensureDescription(item, workspaceId, preferences)
    const grounding: MediaGrounding = {}
    if (nonEmpty(description)) grounding.description = description
    if (nonEmpty(item.userIntent)) grounding.userIntent = item.userIntent.trim()
    if (nonEmpty(item.userKeyword)) grounding.userKeyword = item.userKeyword.trim()
    return grounding
  }

  /** Race the vision call against a deadline; resolve `undefined` on timeout. */
  private async withTimeout(op: () => Promise<string | undefined>): Promise<string | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), this.timeoutMs)
    })
    try {
      return await Promise.race([op(), timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

/** Shared default instance wired to the real vision transport + repository. */
export const visionGroundingService = new VisionGroundingService()
