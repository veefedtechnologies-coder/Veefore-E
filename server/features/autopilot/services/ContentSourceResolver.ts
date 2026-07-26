/**
 * Auto Pilot — ContentSourceResolver (PLAN-stage helper).
 *
 * For each planned Content_Slot the PLAN stage must decide where that slot's
 * media comes from. The resolver returns one of three Content_Source kinds
 * (design "ContentSourceResolver + LeadTimeEstimator"):
 *
 *   • `pool`         — reuse an existing, available Media_Pool item (its id is
 *                      returned so the slot can be assigned directly).
 *   • `user-brief`   — request user-created media via a just-in-time
 *                      Content_Brief (R7.1: a slot needs user media that is not
 *                      in the pool).
 *   • `ai-generated` — produce the media with AI (the fallback/backup source).
 *
 * The decision follows the Mission's `contentSourcePreference` (R6.2 — the pool
 * is the primary source, so the user is never forced to upload before a Mission
 * can start; AI generation is the backup):
 *
 *   • `user-first` → pool → user-brief → ai-generated
 *   • `ai-first`   → ai-generated → pool → user-brief
 *
 * The resolver walks the preference order and returns the first source that is
 * *available*:
 *   - `pool` is available only when the workspace pool holds an available item
 *     whose media type fits the slot's format (a reel needs video, a photo needs
 *     an image, a carousel needs images, a story accepts either).
 *   - `user-brief` is always available (we can always ask the user).
 *   - `ai-generated` is available when AI can produce the slot's format; this is
 *     configurable/injectable so the fallback branches remain testable.
 *
 * Pool availability is read through the injected `MediaPoolService` (defaulting
 * to the shared singleton), so the resolution rules are unit-testable without a
 * live database. Callers that already hold the available pool can pass it in to
 * avoid a redundant read.
 *
 * Satisfies Requirements: 6.2, 7.1
 */

import type { ContentSourcePreference } from '../db/models/AutoPilotMissionModel'
import type { ContentFormat } from '../db/models/ContentSlotModel'
import type { IMediaPoolItem, MediaType } from '../db/models'
import { MediaPoolService, mediaPoolService } from './MediaPoolService'

/**
 * The resolved source for a Content_Slot. Mirrors the design's `ContentSource`
 * union; `pool` carries the id of the reusable item that satisfied the slot.
 */
export type ContentSource =
  | { kind: 'pool'; mediaPoolItemId: string }
  | { kind: 'user-brief' }
  | { kind: 'ai-generated' }

/** The `contentSourcePreference`-ordered list of source kinds to try (R6.2). */
export const PREFERENCE_ORDER: Record<
  ContentSourcePreference,
  readonly ContentSource['kind'][]
> = {
  // Pool is the primary source; user-brief requests user media; AI is backup.
  'user-first': ['pool', 'user-brief', 'ai-generated'],
  // AI is preferred; fall back to reusing the pool, then to a user brief.
  'ai-first': ['ai-generated', 'pool', 'user-brief'],
}

/**
 * The pool media types that can satisfy each slot format. A reel needs video, a
 * photo/carousel needs images, and a story accepts either. Kept as data so the
 * matching rule is explicit rather than embedded in branching logic.
 */
export const ACCEPTED_MEDIA_TYPES_BY_FORMAT: Record<ContentFormat, readonly MediaType[]> = {
  reel: ['video'],
  photo: ['image'],
  carousel: ['image'],
  story: ['image', 'video'],
}

/** The Mission fields the resolver reads. */
export interface ResolverMissionInput {
  workspaceId: unknown
  contentSourcePreference: ContentSourcePreference
}

/** The Content_Slot fields the resolver reads. */
export interface ResolverSlotInput {
  format: ContentFormat
}

/** A pool item as seen by the resolver (subset of `IMediaPoolItem`). */
export type ResolverPoolItem = Pick<IMediaPoolItem, 'mediaType'> & {
  _id?: unknown
  available?: boolean
}

/**
 * Predicate deciding whether AI can produce media for a given slot format. The
 * default assumes AI can always produce every format (AI is the guaranteed
 * backup); injecting a stricter predicate exercises the fallback branches.
 */
export type CanGenerateAi = (format: ContentFormat) => boolean

const defaultCanGenerateAi: CanGenerateAi = () => true

export interface ContentSourceResolverOptions {
  mediaPoolService?: MediaPoolService
  canGenerateAi?: CanGenerateAi
}

/**
 * Resolves each Content_Slot's source kind per the Mission's
 * `contentSourcePreference`, checking pool availability via `MediaPoolService`.
 */
export class ContentSourceResolver {
  private readonly mediaPoolService: MediaPoolService
  private readonly canGenerateAi: CanGenerateAi

  constructor(options: ContentSourceResolverOptions = {}) {
    this.mediaPoolService = options.mediaPoolService ?? mediaPoolService
    this.canGenerateAi = options.canGenerateAi ?? defaultCanGenerateAi
  }

  /**
   * Resolve the Content_Source for a slot.
   *
   * Walks the preference order for the Mission's `contentSourcePreference` and
   * returns the first available source. When `pool` is omitted the available
   * pool is read from `MediaPoolService.listAvailable(workspaceId)`.
   *
   * `user-brief` is always available, so it is the guaranteed terminal source
   * for `user-first`; `ai-generated` is the guaranteed terminal source for
   * `ai-first` whenever AI can produce the format — so the resolver always
   * returns a usable source and never forces an upfront upload (R6.2).
   */
  async resolve(
    mission: ResolverMissionInput,
    slot: ResolverSlotInput,
    pool?: ResolverPoolItem[],
  ): Promise<ContentSource> {
    const available = pool ?? (await this.mediaPoolService.listAvailable(mission.workspaceId))
    const order = PREFERENCE_ORDER[mission.contentSourcePreference] ?? PREFERENCE_ORDER['user-first']

    for (const kind of order) {
      const source = this.trySource(kind, slot, available)
      if (source) return source
    }

    // Defensive terminal fallback: a brief can always be requested (R7.1).
    return { kind: 'user-brief' }
  }

  /**
   * Attempt to satisfy a slot from a single source kind. Returns the resolved
   * `ContentSource` when the kind is available, otherwise `null` so the caller
   * moves on to the next preference.
   */
  private trySource(
    kind: ContentSource['kind'],
    slot: ResolverSlotInput,
    pool: ResolverPoolItem[],
  ): ContentSource | null {
    switch (kind) {
      case 'pool': {
        const item = this.findMatchingPoolItem(slot.format, pool)
        return item ? { kind: 'pool', mediaPoolItemId: String(item._id) } : null
      }
      case 'user-brief':
        // R7.1: a Content_Brief can always be requested for user-created media.
        return { kind: 'user-brief' }
      case 'ai-generated':
        return this.canGenerateAi(slot.format) ? { kind: 'ai-generated' } : null
      default:
        return null
    }
  }

  /**
   * Find the first available pool item whose media type fits the slot format,
   * or `null` when the pool holds no usable item for that format.
   */
  private findMatchingPoolItem(
    format: ContentFormat,
    pool: ResolverPoolItem[],
  ): ResolverPoolItem | null {
    const acceptable = ACCEPTED_MEDIA_TYPES_BY_FORMAT[format] ?? []
    return (
      pool.find(
        (item) =>
          item.available !== false &&
          item._id != null &&
          acceptable.includes(item.mediaType),
      ) ?? null
    )
  }
}

/** Shared default instance using the shared MediaPoolService singleton. */
export const contentSourceResolver = new ContentSourceResolver()
