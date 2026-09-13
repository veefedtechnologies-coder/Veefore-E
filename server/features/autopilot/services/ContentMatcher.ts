/**
 * Auto Pilot — ContentMatcher.
 *
 * Makes "Let AI arrange" mean something. Instead of assigning a slot the FIRST
 * format-matching pool item (arbitrary upload order), the matcher picks the
 * available item whose cached vision description best matches the slot's theme,
 * so a "sunset beach" theme gets the beach photo and a "gym" theme gets the gym
 * clip — deterministically and without a network call.
 *
 * Scoring is a simple, explainable token-overlap between the slot theme (+ the
 * mission niche) and the candidate's `visionAnalysis.description` (stopword-
 * filtered Jaccard-style overlap). Ties break by oldest `createdAt` for stable
 * ordering. When NO candidate has a description (vision unavailable), it falls
 * back to the first eligible item — exactly the old behaviour, so there is no
 * regression (R5.2). Items already claimed this tick are excluded so two slots
 * never grab the same media (R5.3).
 *
 * Pure + synchronous → fully unit-testable with plain objects.
 *
 * Satisfies Requirements: 5.1, 5.2, 5.3
 */

import type { ContentFormat } from '../db/models/ContentSlotModel'
import type { IMediaPoolItem, MediaType } from '../db/models'
import { cachedDescription } from './VisionGroundingService'

/** Pool media types that satisfy each slot format (mirrors ContentSourceResolver). */
export const ACCEPTED_MEDIA_TYPES_BY_FORMAT: Record<ContentFormat, readonly MediaType[]> = {
  reel: ['video'],
  photo: ['image'],
  carousel: ['image'],
  story: ['image', 'video'],
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'your', 'my',
  'toward', 'towards', 'its', 'their', 'into', 'from', 'by', 'at', 'is', 'are', 'this',
  'that', 'it', 'as', 'be', 'was', 'were', 'we', 'you', 'i', 'our', 'us', 'they',
])

/** Tokenize into meaningful lower-case words (length > 2, not a stopword). */
function tokenize(text: string): Set<string> {
  const out = new Set<string>()
  for (const w of String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)) {
    if (w.length > 2 && !STOPWORDS.has(w)) out.add(w)
  }
  return out
}

/** Overlap score in [0,1]: shared tokens / theme tokens (recall-weighted). */
export function scoreMatch(theme: string, description: string): number {
  const themeTokens = tokenize(theme)
  if (themeTokens.size === 0) return 0
  const descTokens = tokenize(description)
  if (descTokens.size === 0) return 0
  let shared = 0
  for (const t of themeTokens) if (descTokens.has(t)) shared++
  return shared / themeTokens.size
}

/** The pool-item shape the matcher reads. */
export interface MatchablePoolItem {
  _id?: unknown
  mediaType?: MediaType
  available?: boolean
  mediaUrl?: string
  visionAnalysis?: Record<string, unknown>
  createdAt?: Date | string | number
}

export interface PickForSlotOptions {
  /** Mission niche, added to the theme text for scoring context. */
  niche?: string
  /** Ids already claimed this tick — excluded so no double-assignment (R5.3). */
  claimedIds?: Set<string>
}

/** Coerce a createdAt-ish value to epoch ms (missing → +∞ so it sorts last). */
function createdAtMs(item: MatchablePoolItem): number {
  const c = item.createdAt
  if (c == null) return Number.POSITIVE_INFINITY
  const t = c instanceof Date ? c.getTime() : new Date(c).getTime()
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
}

/**
 * Pick the best available pool item for a slot's theme + format.
 *
 * Returns the highest-scoring eligible item by theme↔description overlap; when
 * no eligible item has a description, returns the oldest eligible item (the old
 * first-match behaviour). Returns `null` when nothing eligible remains.
 */
export function pickForSlot<T extends MatchablePoolItem>(
  theme: string,
  format: ContentFormat,
  pool: readonly T[],
  options: PickForSlotOptions = {},
): T | null {
  const accepted = ACCEPTED_MEDIA_TYPES_BY_FORMAT[format] ?? (['image', 'video'] as const)
  const claimed = options.claimedIds
  const themeText = `${theme ?? ''} ${options.niche ?? ''}`

  const eligible = pool.filter(
    (item) =>
      item.available !== false &&
      item._id != null &&
      !!item.mediaUrl &&
      item.mediaType != null &&
      accepted.includes(item.mediaType) &&
      !(claimed?.has(String(item._id)) ?? false),
  )
  if (eligible.length === 0) return null

  let best: T | null = null
  let bestScore = -1
  let bestCreated = Number.POSITIVE_INFINITY

  for (const item of eligible) {
    const desc = cachedDescription(item)
    const score = desc ? scoreMatch(themeText, desc) : 0
    const created = createdAtMs(item)
    // Prefer higher score; break ties by oldest createdAt (stable, deterministic).
    if (score > bestScore || (score === bestScore && created < bestCreated)) {
      best = item
      bestScore = score
      bestCreated = created
    }
  }

  return best
}
