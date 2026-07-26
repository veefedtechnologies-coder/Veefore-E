/**
 * Veefore Analytics — Ingestion & Aggregation Pipeline (Phase 7).
 *
 * Orchestrates the documented data flow (07-data-event-architecture.md Ch 1):
 *
 *   raw input → normalize → validate → de-duplicate → persist (event store)
 *             → aggregate into rollups → persist (rollup store)
 *
 * Pure orchestration over injected ports; safe to unit-test with in-memory
 * fakes. No platform APIs are called here (connectors live upstream, Rule 10).
 */

import {
  computeDedupeKey,
  normalizeEvent,
  validateEvent,
  type ValidateEventOptions,
} from '../events'
import type { AnalyticsEvent, AnalyticsEventInput } from '../events/types'
import { rollupEvents, type MetricEvent, type MetricRollup, type RollupGranularity } from '../aggregation'
import { noopLogger, type EventStore, type PipelineLogger, type RollupStore } from './ports'

/** Outcome of ingesting a batch of events. */
export interface IngestResult {
  /** Events that passed validation and were newly persisted. */
  accepted: AnalyticsEvent[]
  /** Rejected inputs with their validation errors. */
  rejected: { input: AnalyticsEventInput; errors: string[] }[]
  /** Count of events skipped because they were duplicates. */
  duplicates: number
}

export interface AnalyticsPipelineDeps {
  eventStore?: EventStore
  rollupStore?: RollupStore
  logger?: PipelineLogger
  validation?: ValidateEventOptions
}

/** Granularities produced for each ingested batch by default. */
export const DEFAULT_ROLLUP_GRANULARITIES: RollupGranularity[] = [
  'hourly',
  'daily',
  'monthly',
  'lifetime',
]

/**
 * The analytics ingestion + aggregation pipeline. Construct with the ports you
 * have; omitted ports make the corresponding step a no-op (useful in tests and
 * before Phase 10 wiring).
 */
export class AnalyticsPipeline {
  private readonly eventStore?: EventStore
  private readonly rollupStore?: RollupStore
  private readonly logger: PipelineLogger
  private readonly validation: ValidateEventOptions

  constructor(deps: AnalyticsPipelineDeps = {}) {
    this.eventStore = deps.eventStore
    this.rollupStore = deps.rollupStore
    this.logger = deps.logger ?? noopLogger
    this.validation = deps.validation ?? {}
  }

  /**
   * Normalize, validate, de-duplicate, and persist a batch of event inputs.
   * Invalid events are rejected (and logged) and never propagate downstream
   * (Ch 10). Returns the accepted events for optional aggregation.
   */
  async ingest(inputs: AnalyticsEventInput[]): Promise<IngestResult> {
    const accepted: AnalyticsEvent[] = []
    const rejected: IngestResult['rejected'] = []
    let duplicates = 0

    for (const input of inputs) {
      const event = normalizeEvent(input)
      const { valid, errors } = validateEvent(event, this.validation)

      if (!valid) {
        rejected.push({ input, errors })
        this.logger.warn('analytics.pipeline: event rejected', {
          eventName: input.eventName,
          workspaceId: input.workspaceId,
          errors,
        })
        continue
      }

      const dedupeKey = computeDedupeKey(event)
      if (this.eventStore) {
        if (await this.eventStore.exists(dedupeKey)) {
          duplicates += 1
          continue
        }
        await this.eventStore.save(event, dedupeKey)
      }

      accepted.push(event)
    }

    return { accepted, rejected, duplicates }
  }

  /**
   * Aggregate events into rollups at the given granularities and persist them
   * (when a rollup store is configured). Returns the computed rollups.
   */
  async aggregate(
    events: MetricEvent[],
    granularities: RollupGranularity[] = DEFAULT_ROLLUP_GRANULARITIES
  ): Promise<MetricRollup[]> {
    const all: MetricRollup[] = []
    for (const granularity of granularities) {
      const rollups = rollupEvents(events, granularity)
      for (const rollup of rollups) {
        if (this.rollupStore) {
          try {
            await this.rollupStore.upsert(rollup)
          } catch (err) {
            this.logger.error('analytics.pipeline: rollup upsert failed', {
              granularity,
              workspaceId: rollup.workspaceId,
              error: (err as Error)?.message,
            })
            throw err
          }
        }
        all.push(rollup)
      }
    }
    return all
  }

  /**
   * Convenience: ingest a batch and immediately aggregate the accepted events.
   */
  async ingestAndAggregate(
    inputs: AnalyticsEventInput<Record<string, number>>[],
    granularities: RollupGranularity[] = DEFAULT_ROLLUP_GRANULARITIES
  ): Promise<{ ingest: IngestResult; rollups: MetricRollup[] }> {
    const ingest = await this.ingest(inputs)
    const rollups = await this.aggregate(ingest.accepted as MetricEvent[], granularities)
    return { ingest, rollups }
  }
}
