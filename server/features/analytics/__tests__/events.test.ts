/**
 * Unit tests for event normalization, naming, and validation (Phase 7).
 */

import { describe, it, expect } from 'vitest'
import {
  ANALYTICS_EVENT_NAMES,
  computeDedupeKey,
  isKnownEventName,
  isValidEventNameFormat,
  normalizeEvent,
  validateEvent,
} from '../events'
import type { AnalyticsEventInput } from '../events'

const baseInput: AnalyticsEventInput<Record<string, number>> = {
  eventName: ANALYTICS_EVENT_NAMES.INSTAGRAM_FOLLOWERS_UPDATED,
  workspaceId: 'ws_1',
  source: 'connector:instagram',
  accountId: 'acc_1',
  platform: 'instagram',
  payload: { followers_total: 1000 },
}

describe('event names', () => {
  it('validates the domain.action.object format', () => {
    expect(isValidEventNameFormat('instagram.followers.updated')).toBe(true)
    expect(isValidEventNameFormat('bad name')).toBe(false)
    expect(isValidEventNameFormat('too.few')).toBe(false)
    expect(isValidEventNameFormat('Instagram.Followers.Updated')).toBe(false)
  })

  it('recognizes catalog names', () => {
    expect(isKnownEventName(ANALYTICS_EVENT_NAMES.SYNC_STARTED)).toBe(true)
    expect(isKnownEventName('made.up.name')).toBe(false)
  })
})

describe('normalizeEvent', () => {
  it('fills defaults (id, timestamp, status, version)', () => {
    const e = normalizeEvent(baseInput)
    expect(e.eventId).toBeTruthy()
    expect(e.status).toBe('success')
    expect(e.eventVersion).toBe(1)
    expect(() => new Date(e.eventTimestamp).toISOString()).not.toThrow()
  })

  it('preserves an explicit timestamp as UTC ISO', () => {
    const e = normalizeEvent({ ...baseInput, eventTimestamp: '2026-01-15T10:30:00Z' })
    expect(e.eventTimestamp).toBe('2026-01-15T10:30:00.000Z')
  })

  it('computes a stable dedupe key and honors an explicit one', () => {
    const e1 = normalizeEvent({ ...baseInput, eventTimestamp: '2026-01-15T10:00:00Z' })
    const e2 = normalizeEvent({ ...baseInput, eventTimestamp: '2026-01-15T10:00:00Z' })
    expect(computeDedupeKey(e1)).toBe(computeDedupeKey(e2))

    const explicit = normalizeEvent({ ...baseInput, metadata: { dedupeKey: 'fixed-key' } })
    expect(computeDedupeKey(explicit)).toBe('fixed-key')
  })
})

describe('validateEvent', () => {
  it('accepts a well-formed event', () => {
    expect(validateEvent(normalizeEvent(baseInput)).valid).toBe(true)
  })

  it('rejects a bad name, missing workspace, and future timestamp', () => {
    const bad = normalizeEvent({ ...baseInput, eventName: 'nope' })
    expect(validateEvent(bad).valid).toBe(false)

    const noWs = { ...normalizeEvent(baseInput), workspaceId: '' }
    expect(validateEvent(noWs).valid).toBe(false)

    const future = { ...normalizeEvent(baseInput), eventTimestamp: new Date(Date.now() + 3600_000).toISOString() }
    expect(validateEvent(future).valid).toBe(false)
  })

  it('enforces ownership when a guard is supplied', () => {
    const e = normalizeEvent(baseInput)
    const result = validateEvent(e, { assertOwnership: () => false })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/workspace/i)
  })

  it('can require a known catalog name', () => {
    const e = normalizeEvent({ ...baseInput, eventName: 'custom.thing.happened' })
    expect(validateEvent(e).valid).toBe(true) // format ok
    expect(validateEvent(e, { requireKnownName: true }).valid).toBe(false)
  })
})
