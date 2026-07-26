/**
 * Veefore Analytics — Event Validation (Phase 7).
 *
 * Validates events before they enter the metric engine
 * (07-data-event-architecture.md Ch 10): schema, timestamps, account ownership,
 * and well-formed payloads. Invalid data must never propagate into analytics.
 */

import { isKnownEventName, isValidEventNameFormat } from './event-names'
import type { AnalyticsEvent, EventValidationResult } from './types'

export interface ValidateEventOptions {
  /** Require the event name to be in the catalog (not just well-formed). */
  requireKnownName?: boolean
  /**
   * Ownership guard: returns true when the event's account belongs to its
   * workspace. Enforced on the backend, never only in the UI (Ch 15).
   */
  assertOwnership?: (event: AnalyticsEvent) => boolean
  /** Max clock skew (ms) allowed for future-dated events. Default 5 min. */
  maxFutureSkewMs?: number
}

const DEFAULT_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000

/**
 * Validate a normalized event. Returns all failures (not just the first) so
 * callers can log a complete reason (Ch 10 "Log validation failures").
 */
export function validateEvent(
  event: AnalyticsEvent,
  options: ValidateEventOptions = {}
): EventValidationResult {
  const { requireKnownName = false, assertOwnership, maxFutureSkewMs = DEFAULT_MAX_FUTURE_SKEW_MS } = options
  const errors: string[] = []

  // Name.
  if (!event.eventName || !isValidEventNameFormat(event.eventName)) {
    errors.push(`Invalid event name format: "${event.eventName}" (expected domain.action.object)`)
  } else if (requireKnownName && !isKnownEventName(event.eventName)) {
    errors.push(`Unknown event name: "${event.eventName}"`)
  }

  // Identity / tenancy.
  if (!event.workspaceId) errors.push('Missing workspaceId')
  if (!event.eventId) errors.push('Missing eventId')
  if (!event.source) errors.push('Missing source')

  // Timestamp.
  const ts = Date.parse(event.eventTimestamp)
  if (Number.isNaN(ts)) {
    errors.push(`Invalid eventTimestamp: "${event.eventTimestamp}"`)
  } else if (ts > Date.now() + maxFutureSkewMs) {
    errors.push('eventTimestamp is too far in the future')
  }

  // Payload.
  if (event.payload === null || typeof event.payload !== 'object') {
    errors.push('Payload must be an object')
  }

  // Ownership.
  if (assertOwnership && !assertOwnership(event)) {
    errors.push('Account does not belong to the workspace')
  }

  return { valid: errors.length === 0, errors }
}
