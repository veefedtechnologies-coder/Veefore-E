/**
 * Tests for MediaGenerationAdapter (Task 11.1).
 *
 * Unit tests pin the format routing (R8.3: `reel` → the AI video service, every
 * other format → the AI image service) and the add-to-pool behaviour (R6.3: a
 * produced item is added to the Media_Pool marked `available` via
 * `addGeneratedMedia`). A property test asserts the routing invariant holds for
 * every format across random prompts. Additional tests cover the
 * BackupMediaGenerator role (Task 10.3): `generate` produces media WITHOUT adding
 * to the pool (so the brief flow never double-adds) and returns `null` on
 * provider failure so the caller reschedules (R7.7).
 *
 * Every provider + the Media_Pool service is stubbed, so routing/add-to-pool is
 * verified without a network, a provider token, or a database.
 *
 * Satisfies Requirements: 6.3, 8.3
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  MediaGenerationAdapter,
  MEDIA_TYPE_BY_FORMAT,
  type GenerateMediaInput,
} from './MediaGenerationAdapter'
import type { ContentFormat, IMediaPoolItem, MediaType } from '../db/models'
import type { GeneratedMediaInput } from './MediaPoolService'

const ALL_FORMATS: ContentFormat[] = ['reel', 'photo', 'carousel', 'story']

/** A fake Media_Pool that records `addGeneratedMedia` calls and echoes an item. */
function fakePool() {
  const calls: GeneratedMediaInput[] = []
  const service = {
    calls,
    addGeneratedMedia: vi.fn(async (input: GeneratedMediaInput): Promise<IMediaPoolItem> => {
      calls.push(input)
      return {
        _id: `item-${calls.length}`,
        workspaceId: input.workspaceId,
        origin: input.origin ?? 'ai-generated',
        mediaUrl: input.mediaUrl,
        mediaType: input.mediaType,
        format: input.format,
        sizeBytes: input.sizeBytes,
        available: true,
        usedInSlots: [],
      } as unknown as IMediaPoolItem
    }),
  }
  return service
}

/** Spy image + video generators returning distinguishable URLs. */
function fakeGenerators() {
  const image = { generateImage: vi.fn(async () => 'https://cdn/image.png') }
  const video = { generateVideo: vi.fn(async () => 'https://cdn/video.mp4') }
  return { image, video }
}

function makeAdapter() {
  const pool = fakePool()
  const { image, video } = fakeGenerators()
  const adapter = new MediaGenerationAdapter({
    imageGenerator: image,
    videoGenerator: video,
    mediaPoolService: pool as never,
  })
  return { adapter, pool, image, video }
}

function input(overrides: Partial<GenerateMediaInput> = {}): GenerateMediaInput {
  return {
    workspaceId: 'ws-1',
    missionId: 'm-1',
    userId: 'u-1',
    format: 'photo',
    prompt: 'a cozy coffee shop',
    ...overrides,
  }
}

describe('MediaGenerationAdapter.generateMedia — R8.3 routing', () => {
  it('routes a reel to the AI video service (not the image service)', async () => {
    const { adapter, image, video } = makeAdapter()
    const res = await adapter.generateMedia(input({ format: 'reel' }))

    expect(res.status).toBe('generated')
    expect(video.generateVideo).toHaveBeenCalledTimes(1)
    expect(video.generateVideo).toHaveBeenCalledWith('a cozy coffee shop')
    expect(image.generateImage).not.toHaveBeenCalled()
    if (res.status === 'generated') {
      expect(res.media.mediaType).toBe('video')
      expect(res.media.mediaUrl).toBe('https://cdn/video.mp4')
    }
  })

  it.each(['photo', 'carousel', 'story'] as ContentFormat[])(
    'routes a %s to the AI image service (not the video service)',
    async (format) => {
      const { adapter, image, video } = makeAdapter()
      const res = await adapter.generateMedia(input({ format }))

      expect(res.status).toBe('generated')
      expect(image.generateImage).toHaveBeenCalledTimes(1)
      expect(video.generateVideo).not.toHaveBeenCalled()
      if (res.status === 'generated') {
        expect(res.media.mediaType).toBe('image')
        expect(res.media.mediaUrl).toBe('https://cdn/image.png')
      }
    },
  )
})

describe('MediaGenerationAdapter.generateMedia — R6.3 add-to-pool', () => {
  it('adds the generated item to the pool marked available (ai-generated)', async () => {
    const { adapter, pool } = makeAdapter()
    const res = await adapter.generateMedia(input({ format: 'photo' }))

    expect(pool.addGeneratedMedia).toHaveBeenCalledTimes(1)
    const call = pool.calls[0]
    expect(call).toMatchObject({
      workspaceId: 'ws-1',
      missionId: 'm-1',
      mediaUrl: 'https://cdn/image.png',
      mediaType: 'image',
      origin: 'ai-generated',
    })
    expect(res.status).toBe('generated')
    if (res.status === 'generated') {
      expect(res.item.available).toBe(true)
      expect(res.item.origin).toBe('ai-generated')
    }
  })

  it('does not add anything to the pool when generation fails', async () => {
    const pool = fakePool()
    const image = { generateImage: vi.fn(async () => { throw new Error('provider down') }) }
    const video = { generateVideo: vi.fn(async () => 'https://cdn/video.mp4') }
    const adapter = new MediaGenerationAdapter({
      imageGenerator: image,
      videoGenerator: video,
      mediaPoolService: pool as never,
    })

    const res = await adapter.generateMedia(input({ format: 'photo' }))

    expect(res.status).toBe('failed')
    if (res.status === 'failed') expect(res.error).toContain('provider down')
    expect(pool.addGeneratedMedia).not.toHaveBeenCalled()
  })
})

describe('MediaGenerationAdapter as BackupMediaGenerator — Task 10.3', () => {
  it('canGenerate is true for every known format', () => {
    const { adapter } = makeAdapter()
    for (const format of ALL_FORMATS) {
      expect(adapter.canGenerate(format)).toBe(true)
    }
  })

  it('generate produces media WITHOUT adding to the pool (no double-add)', async () => {
    const { adapter, pool, image } = makeAdapter()
    const media = await adapter.generate({
      missionId: 'm-1',
      workspaceId: 'ws-1',
      slotId: 'slot-1',
      format: 'photo',
    })

    expect(media).not.toBeNull()
    expect(media?.mediaType).toBe('image')
    expect(image.generateImage).toHaveBeenCalledTimes(1)
    // The resolution flow adds to the pool itself — the port must not.
    expect(pool.addGeneratedMedia).not.toHaveBeenCalled()
  })

  it('generate produces a video-type backup for a reel', async () => {
    const { adapter, video } = makeAdapter()
    const media = await adapter.generate({
      missionId: 'm-1',
      workspaceId: 'ws-1',
      slotId: 'slot-1',
      format: 'reel',
    })
    expect(media?.mediaType).toBe('video')
    expect(video.generateVideo).toHaveBeenCalledTimes(1)
  })

  it('generate returns null on provider failure so the caller reschedules (R7.7)', async () => {
    const pool = fakePool()
    const image = { generateImage: vi.fn(async () => { throw new Error('boom') }) }
    const video = { generateVideo: vi.fn(async () => 'https://cdn/video.mp4') }
    const adapter = new MediaGenerationAdapter({
      imageGenerator: image,
      videoGenerator: video,
      mediaPoolService: pool as never,
    })

    const media = await adapter.generate({
      missionId: 'm-1',
      workspaceId: 'ws-1',
      slotId: 'slot-1',
      format: 'photo',
    })
    expect(media).toBeNull()
  })
})

// ─── Property: format routing invariant ──────────────────────────────────────
// For every format and any prompt, generateMedia produces the media type
// dictated by MEDIA_TYPE_BY_FORMAT (reel→video, else→image), invokes exactly the
// matching provider, and adds an available ai-generated item of that type.
// **Validates: Requirements 8.3, 6.3**
describe('Property — R8.3 routing / R6.3 add-to-pool invariant', () => {
  it('produces the format-dictated media type via the matching provider for every format', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_FORMATS),
        fc.string({ minLength: 1, maxLength: 200 }),
        async (format, prompt) => {
          const { adapter, pool, image, video } = makeAdapter()
          const res = await adapter.generateMedia(input({ format, prompt }))

          const expected: MediaType = MEDIA_TYPE_BY_FORMAT[format]
          expect(res.status).toBe('generated')
          if (res.status === 'generated') {
            expect(res.media.mediaType).toBe(expected)
            expect(res.item.available).toBe(true)
            expect(res.item.origin).toBe('ai-generated')
          }

          // Exactly the matching provider ran.
          if (expected === 'video') {
            expect(video.generateVideo).toHaveBeenCalledTimes(1)
            expect(image.generateImage).not.toHaveBeenCalled()
          } else {
            expect(image.generateImage).toHaveBeenCalledTimes(1)
            expect(video.generateVideo).not.toHaveBeenCalled()
          }

          // Always added to the pool once, with the routed media type.
          expect(pool.addGeneratedMedia).toHaveBeenCalledTimes(1)
          expect(pool.calls[0].mediaType).toBe(expected)
        },
      ),
      { numRuns: 100 },
    )
  })
})
