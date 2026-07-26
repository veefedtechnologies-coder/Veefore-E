/**
 * Veefore Analytics — Event Types (Phase 7: Data & Event Architecture).
 *
 * The normalized analytics event envelope and related types
 * (07-data-event-architecture.md Ch 2–5). Every measurable thing becomes an
 * event with a common envelope so the pipeline, validation, and aggregation are
 * uniform. Backend-only (CODING_RULES Rule 9).
 */

import type { DataQuality, Platform } from '../metrics'

/** Processing status of an event (07-data-event-architecture.md Ch 4). */
export type EventStatus = 'pending' | 'success' | 'failed'

/**
 * The common event envelope every analytics event carries
 * (07-data-event-architecture.md Ch 4). The `payload` holds event-specific
 * fields; `metadata` holds non-metric context (e.g. sync ids).
 */
export interface AnalyticsEvent<P = Record<string, unknown>> {
  /** Unique event id (idempotency + auditing). */
  eventId: string
  /** `domain.action.object` name (see event-names.ts). */
  eventName: string
  /** Schema version of this event's payload. */
  eventVersion: number
  /** Event time in ISO-8601 UTC (07-data-event-architecture.md Ch 12). */
  eventTimestamp: string
  /** Owning workspace (multi-tenant isolation, Ch 5 & Ch 15). */
  workspaceId: string
  /** Owning organization, when applicable. */
  organizationId?: string
  /** Acting user, when applicable. */
  userId?: string
  /** Source platform, when the event relates to one. */
  platform?: Platform
  /** Connected account id, when the event relates to one. */
  accountId?: string
  /** Where the event originated (e.g. 'connector:instagram', 'webhook', 'job'). */
  source: string
  /** Processing status. */
  status: EventStatus
  /** Correlation id for tracing across the pipeline. */
  traceId?: string
  /** Data-quality label for values carried by this event. */
  dataQuality?: DataQuality
  /** Event-specific fields. */
  payload: P
  /** Non-metric context. */
  metadata?: Record<string, unknown>
}

/**
 * Input accepted by the pipeline before an envelope is fully built. The
 * normalizer completes required fields (eventId, timestamp, status defaults).
 */
export interface AnalyticsEventInput<P = Record<string, unknown>>
  extends Partial<Pick<AnalyticsEvent<P>, 'eventId' | 'eventTimestamp' | 'status' | 'traceId' | 'dataQuality' | 'metadata' | 'eventVersion'>> {
  eventName: string
  workspaceId: string
  organizationId?: string
  userId?: string
  platform?: Platform
  accountId?: string
  source: string
  payload: P
}

/** Result of validating an event. */
export interface EventValidationResult {
  valid: boolean
  /** Human-readable reasons the event was rejected (empty when valid). */
  errors: string[]
}
