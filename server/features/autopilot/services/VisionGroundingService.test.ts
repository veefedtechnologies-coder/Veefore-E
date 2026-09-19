/**
 * Unit tests for VisionGroundingService — analyze-once + cache + degrade.
 */

import { describe, it, expect, vi } from 'vitest'
import { VisionGroundingService, cachedDescription } from './VisionGroundingService'

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'item-1',
    mediaUrl: 'https://cdn/img.png',
    mediaType: 'image' as const,
    ...overrides,
  }
}

describe('cachedDescription', () => {
  it('returns a present description', () => {
    expect(cachedDescription({ visionAnalysis: { description: '  a cat  ' } })).toBe('a cat')
  })
  it('returns undefined when missing/empty', () => {
    expect(cachedDescription({ visionAnalysis: {} })).toBeUndefined()
    expect(cachedDescription({})).toBeUndefined()
    expect(cachedDescription(undefined)).toBeUndefined()
  })
})

describe('VisionGroundingService.ensureDescription', () => {
  it('reuses a cached description and never analyzes (R1.2)', async () => {
    const analyze = vi.fn(async () => 'should not be called')
    const setVisionAnalysis = vi.fn(async () => null)
    const svc = new VisionGroundingService({ analyzer: { analyze }, store: { setVisionAnalysis } })

    const out = await svc.ensureDescription(makeItem({ visionAnalysis: { description: 'a red car' } }))

    expect(out).toBe('a beach at sunset')
    expect(analyze).not.toHaveBeenCalled()
    expect(setVisionAnalysis).not.toHaveBeenCalled()
  })

  it('analyzes + caches on a miss (R1.1)', async () => {
    const analyze = vi.fn(async () => 'a beach at sunset')
    const setVisionAnalysis = vi.fn(async () => null)
    const svc = new VisionGroundingService({
      analyzer: { analyze },
      store: { setVisionAnalysis },
      now: () => 0,
    })
    const item = makeItem()

    const out = await svc.ensureDescription(item, 'ws-1')

    expect(out).toBe('a beach at sunset')
    expect(analyze).toHaveBeenCalledWith('https://cdn/img.png', 'image', undefined)
    expect(setVisionAnalysis).toHaveBeenCalledWith('item-1', {
      description: 'a beach at sunset',
      analyzedAt: new Date(0).toISOString(),
    })
    // In-memory item is updated so the same tick reuses it.
    expect((item.visionAnalysis as { description?: string }).description).toBe('a beach at sunset')
  })

  it('degrades to undefined when analysis throws (R1.3)', async () => {
    const analyze = vi.fn(async () => {
      throw new Error('vision down')
    })
    const setVisionAnalysis = vi.fn(async () => null)
    const svc = new VisionGroundingService({ analyzer: { analyze }, store: { setVisionAnalysis } })

    const out = await svc.ensureDescription(makeItem())

    expect(out).toBeUndefined()
    expect(setVisionAnalysis).not.toHaveBeenCalled()
  })

  it('degrades to undefined on timeout (R1.4)', async () => {
    const analyze = vi.fn(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('too late'), 50)),
    )
    const svc = new VisionGroundingService({
      analyzer: { analyze },
      store: { setVisionAnalysis: vi.fn(async () => null) },
      timeoutMs: 5,
    })

    const out = await svc.ensureDescription(makeItem())
    expect(out).toBeUndefined()
  })

  it('returns undefined for a missing item or missing url', async () => {
    const svc = new VisionGroundingService({
      analyzer: { analyze: vi.fn() },
      store: { setVisionAnalysis: vi.fn() },
    })
    expect(await svc.ensureDescription(undefined)).toBeUndefined()
    expect(await svc.ensureDescription(makeItem({ mediaUrl: '' }))).toBeUndefined()
  })
})

describe('VisionGroundingService.buildGrounding', () => {
  it('folds vision description with user intent + keyword', async () => {
    const svc = new VisionGroundingService({
      analyzer: { analyze: vi.fn(async () => 'a gym workout') },
      store: { setVisionAnalysis: vi.fn(async () => null) },
    })
    const item = makeItem({ userIntent: 'promote the plan', userKeyword: 'PLAN' })

    const g = await svc.buildGrounding(item, 'ws-1')

    expect(g).toEqual({ description: 'a gym workout', userIntent: 'promote the plan', userKeyword: 'PLAN' })
  })

  it('omits absent fields', async () => {
    const svc = new VisionGroundingService({
      analyzer: { analyze: vi.fn(async () => undefined) },
      store: { setVisionAnalysis: vi.fn(async () => null) },
    })
    const g = await svc.buildGrounding(makeItem())
    expect(g).toEqual({})
  })
})

// ─── toFetchableMediaUrl (relative-path → fetchable) ────────────────────────

import * as fs from 'fs'
import * as path from 'path'
import { toFetchableMediaUrl } from './VisionGroundingService'

describe('toFetchableMediaUrl', () => {
  it('passes through absolute http/https/data URLs unchanged', () => {
    expect(toFetchableMediaUrl('https://cdn/x.png')).toBe('https://cdn/x.png')
    expect(toFetchableMediaUrl('http://cdn/x.png')).toBe('http://cdn/x.png')
    expect(toFetchableMediaUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA')
  })

  it('reads a local /uploads file into a data URL', () => {
    // Create a real file under cwd so the resolver can read it.
    const rel = `/uploads/__vision_test__/pic.png`
    const abs = path.join(process.cwd(), rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, Buffer.from([1, 2, 3, 4]))
    try {
      const out = toFetchableMediaUrl(rel)
      expect(out.startsWith('data:image/png;base64,')).toBe(true)
      expect(out).toContain(Buffer.from([1, 2, 3, 4]).toString('base64'))
    } finally {
      fs.rmSync(path.dirname(abs), { recursive: true, force: true })
    }
  })

  it('falls back to an absolute base URL when the local file is missing', () => {
    const prev = process.env.BASE_URL
    process.env.BASE_URL = 'https://app.example.com'
    try {
      expect(toFetchableMediaUrl('/uploads/missing/none.png')).toBe(
        'https://app.example.com/uploads/missing/none.png',
      )
    } finally {
      if (prev === undefined) delete process.env.BASE_URL
      else process.env.BASE_URL = prev
    }
  })
})
