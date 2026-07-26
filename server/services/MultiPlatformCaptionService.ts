/**
 * MultiPlatformCaptionService
 *
 * Server-side caption generation service that enforces platform-specific
 * constraints BEFORE calling AIServiceManager, generates shared creative
 * briefs for "Both" platform requests, and returns a structured
 * MultiPlatformCaptionResult with partial-success semantics.
 *
 * Platform constraints enforced here (server-side, not in the AI prompt alone):
 *  - Facebook / Both (Facebook slot): max 500 characters, max 3 hashtags,
 *    conversational tone directive
 *  - Instagram:                        max 2200 characters,
 *    hashtag-discovery tone directive
 *
 * Requirements: 11.2, 11.3, 11.4
 */

import type { UserAIPreferences } from './AIServiceManager'
import { AIServiceManager } from './AIServiceManager'
import type { PlatformId } from '../../src/shared/platform-registry/types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single platform's caption generation result. */
export interface PlatformCaptionResult {
  /** The platform this result is for. */
  platform: PlatformId
  /**
   * The generated caption text.
   * Present when generation succeeded; absent when `error` is set.
   */
  caption?: string
  /** Character count of the generated caption (0 when absent). */
  characterCount: number
  /** Number of hashtags detected in the generated caption (0 when absent). */
  hashtagCount: number
  /**
   * Error message when AI generation failed for this platform.
   * The other platform's result is still returned (partial-success).
   */
  error?: string
}

/**
 * Returned by `MultiPlatformCaptionService.generateCaptions()`.
 *
 * When `targetPlatforms` includes both Instagram and Facebook, `sharedBrief`
 * is populated with the creative brief generated before the caption variants.
 */
export interface MultiPlatformCaptionResult {
  /**
   * Shared creative brief (topic, angle, CTA) produced before generating
   * individual caption variants.  Present only when `Both` was requested.
   */
  sharedBrief?: string
  /** One entry per requested platform.  Always contains at least one entry. */
  captions: PlatformCaptionResult[]
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const FACEBOOK_MAX_CHARS = 500
const FACEBOOK_MAX_HASHTAGS = 3
const INSTAGRAM_MAX_CHARS = 2200

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Counts the number of hashtags in a string. */
function countHashtags(text: string): number {
  const matches = text.match(/#[\w\u00C0-\u017F]+/gu)
  return matches ? matches.length : 0
}

/** Returns the number of Unicode characters (grapheme-aware via spread). */
function charCount(text: string): number {
  // Spread handles surrogate pairs correctly for most emoji
  return [...text].length
}

/**
 * Truncates a caption to `maxChars` characters.
 * Cuts at the last word boundary before the limit to avoid mid-word cuts.
 * The ellipsis character counts toward the limit.
 */
function truncateToChars(text: string, maxChars: number): string {
  const chars = [...text]
  if (chars.length <= maxChars) return text
  // Reserve one position for the ellipsis (…)
  const targetLen = maxChars - 1
  let cutAt = targetLen
  while (cutAt > 0 && chars[cutAt] !== ' ' && chars[cutAt] !== '\n') {
    cutAt--
  }
  if (cutAt === 0) cutAt = targetLen // no word boundary found — hard cut
  const truncated = chars.slice(0, cutAt).join('').trimEnd() + '…'
  // Verify the result length is within maxChars (should always be true, but be safe)
  return [...truncated].length <= maxChars ? truncated : chars.slice(0, maxChars - 1).join('') + '…'
}

/**
 * Trims excess hashtags from a caption so that at most `maxHashtags` remain.
 * Extra hashtags are removed from the end of the text (most captions place
 * hashtags at the end).
 */
function enforceMaxHashtags(text: string, maxHashtags: number): string {
  const hashtagPattern = /#[\w\u00C0-\u017F]+/gu
  const found: Array<{ tag: string; index: number }> = []
  let match: RegExpExecArray | null
  while ((match = hashtagPattern.exec(text)) !== null) {
    found.push({ tag: match[0], index: match.index })
  }

  if (found.length <= maxHashtags) return text

  // Remove hashtags beyond the limit (from last to first to preserve indices)
  const toRemove = found.slice(maxHashtags)
  let result = text
  for (let i = toRemove.length - 1; i >= 0; i--) {
    const { tag, index } = toRemove[i]
    result = result.slice(0, index) + result.slice(index + tag.length)
  }
  // Clean up any double-spaces left by removals
  return result.replace(/ {2,}/g, ' ').trimEnd()
}

// ---------------------------------------------------------------------------
// Platform constraint enforcement
// ---------------------------------------------------------------------------

/**
 * Applies Facebook caption constraints:
 * - Enforces max 3 hashtags (strips excess from the end)
 * - Enforces max 500 characters (truncates at word boundary)
 */
function applyFacebookConstraints(caption: string): string {
  let result = enforceMaxHashtags(caption, FACEBOOK_MAX_HASHTAGS)
  result = truncateToChars(result, FACEBOOK_MAX_CHARS)
  return result
}

/**
 * Applies Instagram caption constraints:
 * - Enforces max 2200 characters (truncates at word boundary)
 * No hashtag limit is applied for Instagram (discovery tone is the goal).
 */
function applyInstagramConstraints(caption: string): string {
  return truncateToChars(caption, INSTAGRAM_MAX_CHARS)
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSharedBriefPrompt(topic: string, preferences: UserAIPreferences): string {
  const niche = preferences.contentNiche ?? 'general'
  const persona = preferences.aiPersona ?? 'Professional & Authoritative'
  return `You are a creative strategist. Your task is to write a SHORT shared creative brief for a social media post.

Topic: "${topic}"
Content niche: ${niche}
Brand voice: ${persona}

Write a concise creative brief (3 sentences max) covering:
1. Topic angle: The specific angle or hook to use
2. Core message: The central idea or value proposition
3. CTA: A clear call-to-action that works across platforms

Return ONLY the creative brief text — no headings, labels, or metadata.`
}

function buildFacebookCaptionPrompt(
  topic: string,
  sharedBrief: string | undefined,
  preferences: UserAIPreferences,
): string {
  const briefSection = sharedBrief
    ? `\nCreative Brief:\n${sharedBrief}\n`
    : ''

  const niche = preferences.contentNiche ?? 'general'
  const persona = preferences.aiPersona ?? 'Professional & Authoritative'

  return `You are a social media copywriter specialising in Facebook Page content.

Topic: "${topic}"${briefSection}
Content niche: ${niche}
Brand voice: ${persona}

Write a Facebook Page caption with these STRICT requirements:
- Conversational, friendly tone (avoid Instagram-style excessive hashtags)
- Maximum ${FACEBOOK_MAX_CHARS} characters total
- No more than ${FACEBOOK_MAX_HASHTAGS} hashtags
- Link-post friendly — optimised for Facebook's algorithm
- Natural language that encourages comments and shares
- Avoid generic hashtag dumps; only include hashtags that genuinely add value

Return ONLY the caption text. No labels, explanations, or metadata.`
}

function buildInstagramCaptionPrompt(
  topic: string,
  sharedBrief: string | undefined,
  preferences: UserAIPreferences,
): string {
  const briefSection = sharedBrief
    ? `\nCreative Brief:\n${sharedBrief}\n`
    : ''

  const niche = preferences.contentNiche ?? 'general'
  const persona = preferences.aiPersona ?? 'Professional & Authoritative'

  return `You are a social media copywriter specialising in Instagram content.

Topic: "${topic}"${briefSection}
Content niche: ${niche}
Brand voice: ${persona}

Write an Instagram caption with these STRICT requirements:
- Hashtag-discovery optimised: include 10–20 relevant, strategic hashtags
- Maximum ${INSTAGRAM_MAX_CHARS} characters total (including hashtags)
- Engaging hook in the first line to stop the scroll
- Conversational but aspirational tone
- Mix of broad reach hashtags and niche community hashtags
- Include relevant emojis to boost engagement

Return ONLY the caption text. No labels, explanations, or metadata.`
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

/**
 * Generates platform-aware captions by enforcing constraints server-side
 * and calling AIServiceManager with targeted prompts.
 *
 * Usage:
 * ```ts
 * const svc = new MultiPlatformCaptionService()
 * const result = await svc.generateCaptions({
 *   targetPlatforms: ['instagram', 'facebook'],
 *   topic: 'Morning coffee tips',
 *   userId: 'user123',
 *   workspaceId: 'ws456',
 *   preferences: { contentNiche: 'lifestyle' },
 * })
 * ```
 */
export class MultiPlatformCaptionService {
  private readonly ai: AIServiceManager

  constructor() {
    this.ai = AIServiceManager.getInstance()
  }

  /**
   * Generate captions for one or more platforms with constraint enforcement.
   *
   * - Single platform: returns one `PlatformCaptionResult` entry, no `sharedBrief`.
   * - Both platforms: generates a shared brief first (visible to the user), then
   *   two parallel AI calls (one per platform).  If one platform fails the other's
   *   result is still returned with `error` set on the failed entry.
   *
   * Requirements: 11.2, 11.3, 11.4, 11.5
   */
  async generateCaptions(params: {
    targetPlatforms: PlatformId[]
    topic: string
    userId: string
    workspaceId: string
    preferences?: UserAIPreferences
  }): Promise<MultiPlatformCaptionResult> {
    const { targetPlatforms, topic, userId, workspaceId, preferences = {} } = params

    const wantsFacebook = targetPlatforms.includes('facebook')
    const wantsInstagram = targetPlatforms.includes('instagram')
    const wantsBoth = wantsFacebook && wantsInstagram

    // ------------------------------------------------------------------
    // Step 1: Generate shared creative brief (only for "Both" flow)
    // ------------------------------------------------------------------
    let sharedBrief: string | undefined
    if (wantsBoth) {
      try {
        const briefPrompt = buildSharedBriefPrompt(topic, preferences)
        sharedBrief = await this.ai.generateText(briefPrompt, {
          ...preferences,
          platformContext: 'all',
        })
        console.log('[MultiPlatformCaptionService] Shared brief generated', {
          length: sharedBrief.length,
          topic,
        })
      } catch (err) {
        // Brief generation failure is non-fatal — captions can still be
        // generated without it; the brief will simply be absent.
        console.warn(
          '[MultiPlatformCaptionService] Shared brief generation failed — continuing without it:',
          err instanceof Error ? err.message : err,
        )
        sharedBrief = undefined
      }
    }

    // ------------------------------------------------------------------
    // Step 2: Build per-platform generation tasks
    // ------------------------------------------------------------------
    const tasks: Array<{
      platform: PlatformId
      generate: () => Promise<string>
      applyConstraints: (caption: string) => string
    }> = []

    if (wantsInstagram) {
      tasks.push({
        platform: 'instagram',
        generate: () =>
          this.ai.generateText(
            buildInstagramCaptionPrompt(topic, sharedBrief, preferences),
            {
              ...preferences,
              platformContext: 'instagram',
            },
          ),
        applyConstraints: applyInstagramConstraints,
      })
    }

    if (wantsFacebook) {
      tasks.push({
        platform: 'facebook',
        generate: () =>
          this.ai.generateText(
            buildFacebookCaptionPrompt(topic, sharedBrief, preferences),
            {
              ...preferences,
              platformContext: 'facebook',
            },
          ),
        applyConstraints: applyFacebookConstraints,
      })
    }

    // Handle unsupported / unrecognised platforms gracefully
    for (const p of targetPlatforms) {
      if (p !== 'instagram' && p !== 'facebook') {
        tasks.push({
          platform: p,
          generate: async () => {
            throw new Error(`Platform "${p}" is not supported for caption generation.`)
          },
          applyConstraints: (c) => c,
        })
      }
    }

    // ------------------------------------------------------------------
    // Step 3: Execute all platform generations in parallel
    //         (partial-success: one failure must not block the other)
    // ------------------------------------------------------------------
    console.log('[MultiPlatformCaptionService] Starting caption generation', {
      platforms: tasks.map((t) => t.platform),
      topic,
      userId,
      workspaceId,
      hasBrief: !!sharedBrief,
    })

    const settled = await Promise.allSettled(
      tasks.map(async (task) => {
        const raw = await task.generate()
        const constrained = task.applyConstraints(raw.trim())
        return { platform: task.platform, caption: constrained }
      }),
    )

    // ------------------------------------------------------------------
    // Step 4: Assemble results
    // ------------------------------------------------------------------
    const captions: PlatformCaptionResult[] = settled.map((result, idx) => {
      const platform = tasks[idx].platform
      if (result.status === 'fulfilled') {
        const { caption } = result.value
        const chars = charCount(caption)
        const hashtags = countHashtags(caption)
        console.log('[MultiPlatformCaptionService] Caption generated', {
          platform,
          characterCount: chars,
          hashtagCount: hashtags,
        })
        return { platform, caption, characterCount: chars, hashtagCount: hashtags }
      } else {
        const reason =
          result.reason instanceof Error ? result.reason.message : String(result.reason)
        console.error(
          `[MultiPlatformCaptionService] Caption generation failed for platform "${platform}":`,
          reason,
        )
        return { platform, characterCount: 0, hashtagCount: 0, error: reason }
      }
    })

    return { sharedBrief, captions }
  }
}

/** Singleton instance for use by route handlers. */
let _instance: MultiPlatformCaptionService | undefined

export function getMultiPlatformCaptionService(): MultiPlatformCaptionService {
  if (!_instance) _instance = new MultiPlatformCaptionService()
  return _instance
}

// Backward-compatible default export for route handlers that import directly
export const multiPlatformCaptionService = {
  generateCaptions: (...args: Parameters<MultiPlatformCaptionService['generateCaptions']>) =>
    getMultiPlatformCaptionService().generateCaptions(...args),
}
