/**
 * Veefore Analytics — Events module public API (Phase 7).
 *
 * Normalized analytics events: envelope types, name catalog, normalization, and
 * validation (07-data-event-architecture.md Ch 2–5, 10).
 */

export type {
  AnalyticsEvent,
  AnalyticsEventInput,
  EventStatus,
  EventValidationResult,
} from './types'

export {
  ANALYTICS_EVENT_NAMES,
  EVENT_NAME_PATTERN,
  type AnalyticsEventName,
  isValidEventNameFormat,
  isKnownEventName,
  eventDomain,
} from './event-names'

export { normalizeEvent, computeDedupeKey, DEFAULT_EVENT_VERSION } from './normalize'
export { validateEvent, type ValidateEventOptions } from './validate'
