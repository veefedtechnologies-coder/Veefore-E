/**
 * Tests for the `autopilot-automation` queue helpers (Task 15.1).
 *
 * Covers the pure {@link computeDeactivationDelayMs} scheduling arithmetic that
 * anchors the 90-day stand-down job (R11.3), and the null-safe posture of the
 * queue when Redis is absent (graceful degradation — the queue is `null` and the
 * manager's enqueues no-op to `false`).
 *
 * Satisfies Requirements: 11.2, 11.3
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  computeDeactivationDelayMs,
  ACTIVE_WINDOW_MS,
  ACTIVATION_WINDOW_MS,
  autopilotAutomationQueue,
  isAutopilotAutomationQueueAvailable,
  AutopilotAutomationQueueManager,
} from './autopilotAutomationQueue'

describe('autopilot-automation queue — window constants (R11.2, R11.3)', () => {
  it('active engagement window is 90 days', () => {
    expect(ACTIVE_WINDOW_MS).toBe(90 * 24 * 60 * 60 * 1000)
  })

  it('activation window is 60 seconds', () => {
    expect(ACTIVATION_WINDOW_MS).toBe(60_000)
  })
})

describe('computeDeactivationDelayMs (R11.3)', () => {
  it('returns the time from now until publish + 90 days', () => {
    const publishedAt = Date.parse('2025-01-01T00:00:00Z')
    const now = publishedAt + 24 * 60 * 60 * 1000 // 1 day after publish
    const delay = computeDeactivationDelayMs(publishedAt, now)
    expect(delay).toBe(ACTIVE_WINDOW_MS - 24 * 60 * 60 * 1000)
  })

  it('clamps an elapsed window to an immediate (0) deactivation', () => {
    const publishedAt = Date.parse('2025-01-01T00:00:00Z')
    const now = publishedAt + ACTIVE_WINDOW_MS + 5_000 // window already closed
    expect(computeDeactivationDelayMs(publishedAt, now)).toBe(0)
  })

  it('honours a custom active-window length', () => {
    const publishedAt = 1_000_000
    const now = publishedAt
    expect(computeDeactivationDelayMs(publishedAt, now, 10_000)).toBe(10_000)
  })

  it('is never negative and equals max(0, publish + window − now) (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 ** 12 }),
        fc.integer({ min: 0, max: 10 ** 12 }),
        fc.integer({ min: 1, max: ACTIVE_WINDOW_MS }),
        (publishedAt, now, windowMs) => {
          const delay = computeDeactivationDelayMs(publishedAt, now, windowMs)
          expect(delay).toBeGreaterThanOrEqual(0)
          expect(delay).toBe(Math.max(0, publishedAt + windowMs - now))
          // Once the window is entered (now ≥ publishedAt), the delay never
          // exceeds the window length.
          if (now >= publishedAt) {
            expect(delay).toBeLessThanOrEqual(windowMs)
          }
        },
      ),
    )
  })
})

describe('autopilot-automation queue — null-safe without Redis', () => {
  // These tests run in the default (no REDIS_URL) environment, so the queue is
  // null and every enqueue degrades to an inline no-op returning false.
  const noRedis = !process.env.REDIS_URL

  it.runIf(noRedis)('exposes a null queue and reports unavailable', () => {
    expect(autopilotAutomationQueue).toBeNull()
    expect(isAutopilotAutomationQueueAvailable()).toBe(false)
  })

  it.runIf(noRedis)('scheduleActivation no-ops to false', async () => {
    const ok = await AutopilotAutomationQueueManager.scheduleActivation({
      ruleId: 'r1',
      missionId: 'm1',
      workspaceId: 'w1',
      slotId: 's1',
      publishedAt: new Date(),
    })
    expect(ok).toBe(false)
  })

  it.runIf(noRedis)('scheduleDeactivation no-ops to false', async () => {
    const ok = await AutopilotAutomationQueueManager.scheduleDeactivation({
      ruleId: 'r1',
      missionId: 'm1',
      workspaceId: 'w1',
      slotId: 's1',
      publishedAt: new Date(),
    })
    expect(ok).toBe(false)
  })
})
