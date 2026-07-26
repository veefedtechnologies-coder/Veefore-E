/**
 * Veefore Analytics — Event Normalization (Phase 7).
 *
 * Turns loose {@link AnalyticsEventInput} into a complete {@link AnalyticsEvent}
 * envelope with defaults filled (id, timestamp, status, version)
 * (07-data-event-architecture.md Ch 2 Normalization Layer). Also computes a
 * stable de-duplication key so re-syncs/backfills don't double-count (Ch 10).
 */

import { randomUUID } from 'crypto'

import type { AnalyticsEvent, AnalyticsEventInput } from './types'

/** Default event schema version when the input omits one. */
export const DEFAULT_EVENT_VERSION = 1

/**
 * Complete an event envelope, filling defaults. Timestamps are stored in UTC ISO
 * (07-data-event-architecture.md Ch 12). Does not validate — call
 * `validateEvent` after normalizing.
 */
export function normalizeEvent<P>(input: AnalyticsEventInput<P>): AnalyticsEvent<P> {
  const eventTimestamp = input.eventTimestamp
    ? new Date(input.eventTimestamp).toISOString()
    : new Date().toISOString()

  return {
    eventId: input.eventId ?? randomUUID(),
    eventName: input.eventName,
    eventVersion: input.eventVersion ?? DEFAULT_EVENT_VERSION,
    eventTimestamp,
    workspaceId: input.workspaceId,
    organizationId: input.organizationId,
    userId: input.userId,
    platform: input.platform,
    accountId: input.accountId,
    source: input.source,
    status: input.status ?? 'success',
    traceId: input.traceId,
    dataQuality: input.dataQuality,
    payload: input.payload,
    metadata: input.metadata,
  }
}

/**
 * A deterministic de-duplication key. Prefers an explicit
 * `metadata.dedupeKey`; otherwise derives one from the identifying fields so two
 * identical re-synced events collapse to one (07-data-event-architecture.md Ch 10).
 */
export function computeDedupeKey(event: AnalyticsEvent): string {
  const explicit = event.metadata?.dedupeKey
  if (typeof explicit === 'string' && explicit.length > 0) return explicit
  return [event.eventName, event.workspaceId, event.accountId ?? '', event.eventTimestamp].join('|')
}
