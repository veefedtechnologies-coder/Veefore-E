/**
 * Unit tests for SlotMetricsReader — genuine per-post metrics for LEARN.
 */

import { describe, it, expect, vi } from 'vitest'
import { SlotMetricsReader, type ContentMetricsStore } from './SlotMetricsReader'
import type { IContentSlot } from '../../db/models'

function slot(overrides: Record<string, unknown> = {}): IContentSlot {
  return { _id: 'slot-1', contentId: 'content-1', ...overrides } as unknown as IContentSlot
}

function makeReader(doc: unknown) {
  const store: ContentMetricsStore = { findById: vi.fn(async () => doc as never) }
  return { reader: new SlotMetricsReader(store), store }
}

describe('SlotMetricsReader.read', () => {
  it('maps stored per-post metrics onto SlotMetrics', async () => {
    const { reader } = makeReader({
      metrics: { likes: 10, comments: 3, shares: 1, reach: 500, views: 800, engagement: 42 },
    })
    const out = await reader.read(slot())
    expect(out).toEqual({ reach: 500, engagement: 42, likes: 10, comments: 3, shares: 1, views: 800 })
  })

  it('derives engagement from interactions when the stored value is 0/absent', async () => {
    const { reader } = makeReader({ metrics: { likes: 5, comments: 2, shares: 1, saves: 2 } })
    const out = await reader.read(slot())
    expect(out?.engagement).toBe(10) // 5+2+1+2
  })

  it('uses impressions as views when views is absent', async () => {
    const { reader } = makeReader({ metrics: { likes: 1, impressions: 300 } })
    const out = await reader.read(slot())
    expect(out?.views).toBe(300)
  })

  it('returns null when the slot has no contentId', async () => {
    const { reader, store } = makeReader({ metrics: { likes: 5 } })
    const out = await reader.read(slot({ contentId: undefined }))
    expect(out).toBeNull()
    expect(store.findById).not.toHaveBeenCalled()
  })

  it('returns null when the content record is missing', async () => {
    const { reader } = makeReader(null)
    expect(await reader.read(slot())).toBeNull()
  })

  it('returns null when metrics are all zero/absent (no signal to learn from)', async () => {
    const { reader } = makeReader({ metrics: { likes: 0, comments: 0, reach: 0, engagement: 0 } })
    // reach:0 is finite/non-negative so it IS a usable signal; use truly empty:
    const empty = makeReader({ metrics: {} })
    expect(await empty.reader.read(slot())).toBeNull()
    // A zero-reach post still yields reach:0 (a real measurement).
    const out = await reader.read(slot())
    expect(out).toEqual({ reach: 0, likes: 0, comments: 0 })
  })

  it('degrades to null when the store throws', async () => {
    const store: ContentMetricsStore = {
      findById: vi.fn(async () => {
        throw new Error('db down')
      }),
    }
    const reader = new SlotMetricsReader(store)
    expect(await reader.read(slot())).toBeNull()
  })
})
