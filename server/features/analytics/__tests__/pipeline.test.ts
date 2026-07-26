/**
 * Unit tests for the ingestion + aggregation pipeline (Phase 7), using in-memory
 * fakes for the storage ports.
 */

import { describe, it, expect } from 'vitest'
import {
  AnalyticsPipeline,
  type EventStore,
  type RollupStore,
} from '../pipeline'
import type { AnalyticsEvent } from '../events'
import type { MetricRollup } from '../aggregation'
import { ANALYTICS_EVENT_NAMES } from '../events'
import type { AnalyticsEventInput } from '../events'

class FakeEventStore implements EventStore {
  keys = new Set<string>()
  saved: AnalyticsEvent[] = []
  async exists(dedupeKey: string) {
    return this.keys.has(dedupeKey)
  }
  async save(event: AnalyticsEvent, dedupeKey: string) {
    this.keys.add(dedupeKey)
    this.saved.push(event)
  }
}

class FakeRollupStore implements RollupStore {
  rollups: MetricRollup[] = []
  async upsert(rollup: MetricRollup) {
    this.rollups.push(rollup)
  }
}

function input(overrides: Partial<AnalyticsEventInput<Record<string, number>>> = {}): AnalyticsEventInput<Record<string, number>> {
  return {
    eventName: ANALYTICS_EVENT_NAMES.INSTAGRAM_MEDIA_SYNCED,
    workspaceId: 'ws_1',
    accountId: 'acc_1',
    platform: 'instagram',
    source: 'connector:instagram',
    eventTimestamp: '2026-01-15T08:00:00Z',
    payload: { likes: 10 },
    ...overrides,
  }
}

describe('AnalyticsPipeline.ingest', () => {
  it('accepts valid events and rejects invalid ones', async () => {
    const store = new FakeEventStore()
    const pipeline = new AnalyticsPipeline({ eventStore: store })

    const result = await pipeline.ingest([
      input(),
      input({ eventName: 'not valid' }), // rejected
    ])

    expect(result.accepted).toHaveLength(1)
    expect(result.rejected).toHaveLength(1)
    expect(store.saved).toHaveLength(1)
  })

  it('de-duplicates by dedupe key', async () => {
    const store = new FakeEventStore()
    const pipeline = new AnalyticsPipeline({ eventStore: store })

    const dupInput = input({ metadata: { dedupeKey: 'same' } })
    const result = await pipeline.ingest([dupInput, dupInput])

    expect(result.accepted).toHaveLength(1)
    expect(result.duplicates).toBe(1)
  })
})

describe('AnalyticsPipeline.ingestAndAggregate', () => {
  it('persists rollups for accepted events', async () => {
    const eventStore = new FakeEventStore()
    const rollupStore = new FakeRollupStore()
    const pipeline = new AnalyticsPipeline({ eventStore, rollupStore })

    const { ingest, rollups } = await pipeline.ingestAndAggregate(
      [
        input({ eventTimestamp: '2026-01-15T08:00:00Z', payload: { followers_total: 1000, likes: 10 } }),
        input({ eventTimestamp: '2026-01-15T20:00:00Z', payload: { followers_total: 1100, likes: 5 }, metadata: { dedupeKey: 'k2' } }),
      ],
      ['daily']
    )

    expect(ingest.accepted).toHaveLength(2)
    expect(rollups).toHaveLength(1)
    expect(rollups[0].metrics.likes).toBe(15) // sum
    expect(rollups[0].metrics.followers_total).toBe(1100) // latest
    expect(rollupStore.rollups).toHaveLength(1)
  })
})
