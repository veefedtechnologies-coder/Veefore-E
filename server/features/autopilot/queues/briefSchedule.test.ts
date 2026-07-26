/**
 * Tests for the Content-Brief scheduling math (pure logic).
 *
 * Unit tests pin the send-delay clamp and the default 50/25/10 % reminder fire
 * times. The property test covers Property 12 across arbitrary send/publish
 * windows and fraction sets: reminders are bounded (≤3) and each fires at the
 * instant the remaining Lead_Time equals its fraction of the total Lead_Time.
 *
 * Satisfies Requirements: 7.3, 7.4, 7.5 (Property 12)
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  computeReminderSchedule,
  computeSendDelayMs,
  DEFAULT_REMINDER_FRACTIONS,
  MAX_REMINDERS,
} from './briefSchedule'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const ITERATIONS = 500

describe('computeSendDelayMs (R7.3)', () => {
  it('delays the send until publishTime − leadTime', () => {
    const now = 1_000_000
    const sendAt = now + 3 * HOUR_MS
    expect(computeSendDelayMs(sendAt, now)).toBe(3 * HOUR_MS)
  })

  it('clamps a past send time to fire immediately', () => {
    const now = 1_000_000
    expect(computeSendDelayMs(now - 5 * HOUR_MS, now)).toBe(0)
  })
})

describe('computeReminderSchedule — default 50/25/10 % (R7.5)', () => {
  it('fires the three reminders at the correct remaining-lead fractions', () => {
    const now = 0
    const sendAtMs = 0
    const leadMs = 10 * HOUR_MS
    const publishAtMs = sendAtMs + leadMs

    const reminders = computeReminderSchedule({ sendAtMs, publishAtMs, now })

    expect(reminders).toHaveLength(3)
    // 50 % remaining → publish − 0.5·L, 25 % → publish − 0.25·L, 10 % → publish − 0.1·L
    expect(reminders[0]).toMatchObject({ index: 1, fraction: 0.5, fireAtMs: publishAtMs - 0.5 * leadMs })
    expect(reminders[1]).toMatchObject({ index: 2, fraction: 0.25, fireAtMs: publishAtMs - 0.25 * leadMs })
    expect(reminders[2]).toMatchObject({ index: 3, fraction: 0.1, fireAtMs: publishAtMs - 0.1 * leadMs })
    // Delays measured from now.
    expect(reminders.map((r) => r.delayMs)).toEqual([5 * HOUR_MS, 7.5 * HOUR_MS, 9 * HOUR_MS])
  })

  it('returns no reminders when the lead time is non-positive', () => {
    expect(computeReminderSchedule({ sendAtMs: 100, publishAtMs: 100, now: 0 })).toEqual([])
    expect(computeReminderSchedule({ sendAtMs: 200, publishAtMs: 100, now: 0 })).toEqual([])
  })

  it('clamps a past reminder fire time to zero delay', () => {
    const leadMs = 10 * HOUR_MS
    const sendAtMs = 0
    const publishAtMs = leadMs
    // "now" is already past the 50 % point (fires at 5h) but before publish.
    const reminders = computeReminderSchedule({ sendAtMs, publishAtMs, now: 6 * HOUR_MS })
    expect(reminders[0].delayMs).toBe(0) // 50 % reminder already due
    expect(reminders[1].delayMs).toBe(1.5 * HOUR_MS) // 25 % reminder at 7.5h
  })

  it('never schedules more than MAX_REMINDERS even when given extra fractions', () => {
    const reminders = computeReminderSchedule({
      sendAtMs: 0,
      publishAtMs: 10 * HOUR_MS,
      now: 0,
      fractions: [0.9, 0.75, 0.5, 0.25, 0.1, 0.05],
    })
    expect(reminders.length).toBeLessThanOrEqual(MAX_REMINDERS)
    expect(reminders).toHaveLength(3)
  })

  it('ignores out-of-range fractions (≤0 or ≥1)', () => {
    const reminders = computeReminderSchedule({
      sendAtMs: 0,
      publishAtMs: 10 * HOUR_MS,
      now: 0,
      fractions: [0, 1, 1.5, -0.2, 0.4],
    })
    expect(reminders).toHaveLength(1)
    expect(reminders[0].fraction).toBe(0.4)
  })
})

/**
 * Property 12 — Bounded, correctly-timed reminders.
 *
 * For any send/publish window and any set of fractions, the schedule:
 *   (a) contains at most 3 reminders (R7.5), and
 *   (b) fires each reminder exactly when the remaining Lead_Time equals its
 *       fraction of the total Lead_Time, strictly between send and publish, in
 *       ascending fire-time order, with non-negative delays.
 *
 * **Validates: Requirements 7.5**
 */
describe('computeReminderSchedule — Property 12: bounded reminders', () => {
  it('is bounded to ≤3 and fires at the correct remaining-lead fractions', () => {
    fc.assert(
      fc.property(
        // A sane scheduling window: send in [0, 30d], lead in (0, 30d], now anywhere near it.
        fc.integer({ min: 0, max: 30 * DAY_MS }),
        fc.integer({ min: 1, max: 30 * DAY_MS }),
        fc.integer({ min: -10 * DAY_MS, max: 40 * DAY_MS }),
        // Arbitrary candidate fractions, including out-of-range noise.
        fc.array(fc.double({ min: -0.5, max: 1.5, noNaN: true }), { minLength: 0, maxLength: 8 }),
        (sendAtMs, leadMs, now, rawFractions) => {
          const publishAtMs = sendAtMs + leadMs
          const reminders = computeReminderSchedule({
            sendAtMs,
            publishAtMs,
            now,
            fractions: rawFractions.length ? rawFractions : undefined,
          })

          // (a) Bounded — never more than 3 reminders (R7.5).
          expect(reminders.length).toBeLessThanOrEqual(MAX_REMINDERS)

          let previousFire = -Infinity
          for (const reminder of reminders) {
            // Fraction is a valid remaining-lead fraction.
            expect(reminder.fraction).toBeGreaterThan(0)
            expect(reminder.fraction).toBeLessThan(1)

            // (b) Fires exactly when remaining Lead_Time == fraction · L.
            const remainingAtFire = publishAtMs - reminder.fireAtMs
            expect(remainingAtFire).toBeCloseTo(reminder.fraction * leadMs, 6)

            // Strictly inside the (send, publish) window.
            expect(reminder.fireAtMs).toBeGreaterThan(sendAtMs)
            expect(reminder.fireAtMs).toBeLessThan(publishAtMs)

            // Ascending fire order (largest fraction fires earliest).
            expect(reminder.fireAtMs).toBeGreaterThan(previousFire)
            previousFire = reminder.fireAtMs

            // Delay never negative.
            expect(reminder.delayMs).toBeGreaterThanOrEqual(0)
          }
        },
      ),
      { numRuns: ITERATIONS },
    )
  })

  it('default fractions always yield exactly 3 ascending reminders for any positive lead', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 * DAY_MS }),
        fc.integer({ min: 1, max: 30 * DAY_MS }),
        (sendAtMs, leadMs) => {
          const reminders = computeReminderSchedule({
            sendAtMs,
            publishAtMs: sendAtMs + leadMs,
            now: sendAtMs,
          })
          expect(reminders).toHaveLength(DEFAULT_REMINDER_FRACTIONS.length)
          expect(reminders.map((r) => r.fraction)).toEqual([...DEFAULT_REMINDER_FRACTIONS])
        },
      ),
      { numRuns: ITERATIONS },
    )
  })
})
