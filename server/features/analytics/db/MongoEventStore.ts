/**
 * Veefore Analytics — MongoEventStore (Phase 10).
 *
 * MongoDB implementation of the pipeline {@link EventStore} port. De-duplication
 * is enforced both by a pre-check and by the unique `dedupeKey` index + upsert,
 * so concurrent ingestion is race-safe (07-data-event-architecture.md Ch 10).
 */

import type { AnalyticsEvent } from '../events/types'
import type { EventStore } from '../pipeline'
import { AnalyticsEventModel } from './models/AnalyticsEventModel'

export class MongoEventStore implements EventStore {
  async exists(dedupeKey: string): Promise<boolean> {
    const found = await AnalyticsEventModel.exists({ dedupeKey })
    return !!found
  }

  async save(event: AnalyticsEvent, dedupeKey: string): Promise<void> {
    // Idempotent insert: only writes on first occurrence of the dedupe key.
    await AnalyticsEventModel.updateOne(
      { dedupeKey },
      {
        $setOnInsert: {
          ...event,
          eventTimestamp: new Date(event.eventTimestamp),
          dedupeKey,
        },
      },
      { upsert: true }
    )
  }
}

export const mongoEventStore = new MongoEventStore()
