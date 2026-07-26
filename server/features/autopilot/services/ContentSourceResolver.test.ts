/**
 * Tests for ContentSourceResolver (PLAN-stage helper).
 *
 * Unit tests cover every `contentSourcePreference` and every pool-availability
 * branch:
 *   • user-first with a matching pool item → `pool`
 *   • user-first with an empty/unmatched pool → `user-brief` (R7.1)
 *   • ai-first with AI producible → `ai-generated`
 *   • ai-first with AI unavailable, pool matching → `pool`
 *   • ai-first with AI unavailable and empty pool → `user-brief`
 * plus format→media-type matching, availability filtering, and the pass-in vs
 * MediaPoolService-read paths. A property test asserts the resolver always
 * returns a usable source and honours the preference ordering, so R6.2 (never
 * force an upfront upload) holds across random pools.
 *
 * The MediaPoolService is stubbed so resolution is verified without a database.
 *
 * Satisfies Requirements: 6.2, 7.1
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  ContentSourceResolver,
  PREFERENCE_ORDER,
  ACCEPTED_MEDIA_TYPES_BY_FORMAT,
  type ResolverPoolItem,
  type ResolverMissionInput,
} from './ContentSourceResolver'
import type { ContentFormat } from '../db/models/ContentSlotModel'
import type { ContentSourcePreference } from '../db/models/AutoPilotMissionModel'
import type { MediaType } from '../db/models'

const FORMATS: ContentFormat[] = ['reel', 'photo', 'carousel', 'story']
const PREFERENCES: ContentSourcePreference[] = ['user-first', 'ai-first']

/** A minimal pool item for the resolver's reads. */
function poolItem(overrides: Partial<ResolverPoolItem> = {}): ResolverPoolItem {
  return { _id: 'item-1', mediaType: 'image', available: true, ...overrides }
}

/** A resolver whose pool read returns `pool`; records the workspace queried. */
function makeResolver(
  pool: ResolverPoolItem[],
  opts: { canGenerateAi?: (f: ContentFormat) => boolean } = {},
) {
  const listAvailable = vi.fn(async (_workspaceId: unknown) => pool)
  const resolver = new ContentSourceResolver({
    mediaPoolService: { listAvailable } as never,
    canGenerateAi: opts.canGenerateAi,
  })
  return { resolver, listAvailable }
}

function mission(
  contentSourcePreference: ContentSourcePreference,
  workspaceId: unknown = 'ws-1',
): ResolverMissionInput {
  return { workspaceId, contentSourcePreference }
}

describe('ContentSourceResolver — user-first preference', () => {
  it('resolves to pool when a matching item is available', async () => {
    const { resolver } = makeResolver([poolItem({ _id: 'img-1', mediaType: 'image' })])
    const source = await resolver.resolve(mission('user-first'), { format: 'photo' })
    expect(source).toEqual({ kind: 'pool', mediaPoolItemId: 'img-1' })
  })

  it('resolves to user-brief when the pool is empty (R7.1)', async () => {
    const { resolver } = makeResolver([])
    const source = await resolver.resolve(mission('user-first'), { format: 'photo' })
    expect(source).toEqual({ kind: 'user-brief' })
  })

  it('resolves to user-brief when no pool item fits the slot format', async () => {
    // A reel needs video, but the pool only holds an image.
    const { resolver } = makeResolver([poolItem({ mediaType: 'image' })])
    const source = await resolver.resolve(mission('user-first'), { format: 'reel' })
    expect(source).toEqual({ kind: 'user-brief' })
  })
})

describe('ContentSourceResolver — ai-first preference', () => {
  it('resolves to ai-generated when AI can produce the format', async () => {
    const { resolver } = makeResolver([poolItem({ _id: 'img-1' })])
    const source = await resolver.resolve(mission('ai-first'), { format: 'photo' })
    // AI is preferred even though a pool item exists.
    expect(source).toEqual({ kind: 'ai-generated' })
  })

  it('falls back to pool when AI cannot produce the format', async () => {
    const { resolver } = makeResolver([poolItem({ _id: 'vid-1', mediaType: 'video' })], {
      canGenerateAi: () => false,
    })
    const source = await resolver.resolve(mission('ai-first'), { format: 'reel' })
    expect(source).toEqual({ kind: 'pool', mediaPoolItemId: 'vid-1' })
  })

  it('falls back to user-brief when AI is unavailable and the pool is empty', async () => {
    const { resolver } = makeResolver([], { canGenerateAi: () => false })
    const source = await resolver.resolve(mission('ai-first'), { format: 'reel' })
    expect(source).toEqual({ kind: 'user-brief' })
  })
})

describe('ContentSourceResolver — pool matching by format', () => {
  it('matches a reel to a video item', async () => {
    const { resolver } = makeResolver([
      poolItem({ _id: 'img', mediaType: 'image' }),
      poolItem({ _id: 'vid', mediaType: 'video' }),
    ])
    const source = await resolver.resolve(mission('user-first'), { format: 'reel' })
    expect(source).toEqual({ kind: 'pool', mediaPoolItemId: 'vid' })
  })

  it('matches a photo/carousel to an image item', async () => {
    const { resolver } = makeResolver([poolItem({ _id: 'img', mediaType: 'image' })])
    expect(await resolver.resolve(mission('user-first'), { format: 'carousel' })).toEqual({
      kind: 'pool',
      mediaPoolItemId: 'img',
    })
  })

  it('accepts either media type for a story', async () => {
    const { resolver } = makeResolver([poolItem({ _id: 'vid', mediaType: 'video' })])
    expect(await resolver.resolve(mission('user-first'), { format: 'story' })).toEqual({
      kind: 'pool',
      mediaPoolItemId: 'vid',
    })
  })

  it('ignores items explicitly marked unavailable', async () => {
    const { resolver } = makeResolver([poolItem({ _id: 'gone', available: false })])
    const source = await resolver.resolve(mission('user-first'), { format: 'photo' })
    expect(source).toEqual({ kind: 'user-brief' })
  })
})

describe('ContentSourceResolver — pool read behaviour', () => {
  it('reads available pool from MediaPoolService scoped to the workspace', async () => {
    const { resolver, listAvailable } = makeResolver([poolItem({ _id: 'img-1' })])
    await resolver.resolve(mission('user-first', 'ws-42'), { format: 'photo' })
    expect(listAvailable).toHaveBeenCalledTimes(1)
    expect(listAvailable).toHaveBeenCalledWith('ws-42')
  })

  it('uses a passed-in pool without querying MediaPoolService', async () => {
    const { resolver, listAvailable } = makeResolver([])
    const source = await resolver.resolve(mission('user-first'), { format: 'photo' }, [
      poolItem({ _id: 'passed', mediaType: 'image' }),
    ])
    expect(source).toEqual({ kind: 'pool', mediaPoolItemId: 'passed' })
    expect(listAvailable).not.toHaveBeenCalled()
  })
})

// ─── Property: preference order honoured + always a usable source ────────────
// For any preference, format, and random pool, the resolver returns one of the
// three kinds, honours the preference ordering (the first available source in
// order wins), and never yields nothing — so a Mission can always proceed
// without an upfront upload (R6.2 / R7.1).
// **Validates: Requirements 6.2, 7.1**
describe('Property — R6.2/R7.1 preference ordering and total resolution', () => {
  const mediaTypeArb: fc.Arbitrary<MediaType> = fc.constantFrom<MediaType>('image', 'video')

  it('returns the first available source in preference order for any pool', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PREFERENCES),
        fc.constantFrom(...FORMATS),
        fc.boolean(), // whether AI can produce the format
        fc.array(
          fc.record({
            _id: fc.string({ minLength: 1, maxLength: 6 }),
            mediaType: mediaTypeArb,
            available: fc.boolean(),
          }),
          { maxLength: 8 },
        ),
        async (preference, format, canGenerate, rawPool) => {
          const pool: ResolverPoolItem[] = rawPool
          const resolver = new ContentSourceResolver({
            mediaPoolService: { listAvailable: async () => pool } as never,
            canGenerateAi: () => canGenerate,
          })

          const source = await resolver.resolve(
            { workspaceId: 'ws', contentSourcePreference: preference },
            { format },
            pool,
          )

          // Availability of each candidate source, computed independently.
          const acceptable = ACCEPTED_MEDIA_TYPES_BY_FORMAT[format]
          const poolAvailable = pool.some(
            (i) => i.available !== false && i._id != null && acceptable.includes(i.mediaType),
          )
          const availability: Record<string, boolean> = {
            pool: poolAvailable,
            'user-brief': true,
            'ai-generated': canGenerate,
          }

          // The resolver must return the FIRST available kind in order.
          const expectedKind = PREFERENCE_ORDER[preference].find((k) => availability[k])
          expect(source.kind).toBe(expectedKind)

          // Always a usable source (user-brief is always available).
          expect(['pool', 'user-brief', 'ai-generated']).toContain(source.kind)
          if (source.kind === 'pool') {
            expect(typeof source.mediaPoolItemId).toBe('string')
            expect(source.mediaPoolItemId.length).toBeGreaterThan(0)
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})
