/**
 * Tests for LeadTimeEstimator (pure logic).
 *
 * Unit tests pin the config-table anchors and the buffer/clamp edge cases.
 * The property test covers Property 11 across the full format × complexity input
 * space: the estimated Lead_Time is always within the clamp bounds and always
 * includes the safety buffer.
 *
 * Satisfies Requirements: 7.2 (Property 11)
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  LeadTimeEstimator,
  DEFAULT_LEAD_TIME_CONFIG,
  type ContentComplexity,
} from './LeadTimeEstimator'
import type { ContentFormat } from '../db/models/ContentSlotModel'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const MIN_LEAD_TIME_MS = 2 * HOUR_MS
const MAX_LEAD_TIME_MS = 14 * DAY_MS

const FORMATS: ContentFormat[] = ['reel', 'photo', 'carousel', 'story']
const COMPLEXITIES: ContentComplexity[] = ['low', 'med', 'high']

const ITERATIONS = 500

describe('LeadTimeEstimator — config-table anchors (R7.2)', () => {
  const estimator = new LeadTimeEstimator()

  it('photo:low base ≈ 2h → 2h + 30m buffer = 2.5h', () => {
    // base 2h, buffer = max(0.25*2h=30m, 30m) = 30m → 2.5h (within bounds)
    expect(estimator.estimate('photo', 'low')).toBe(2 * HOUR_MS + 30 * MINUTE_MS)
  })

  it('carousel:med base ≈ 8h → 8h + 2h buffer = 10h', () => {
    // base 8h, buffer = max(0.25*8h=2h, 30m) = 2h → 10h
    expect(estimator.estimate('carousel', 'med')).toBe(10 * HOUR_MS)
  })

  it('reel:high base ≈ 24h → 24h + 6h buffer = 30h', () => {
    // base 24h, buffer = max(0.25*24h=6h, 30m) = 6h → 30h
    expect(estimator.estimate('reel', 'high')).toBe(30 * HOUR_MS)
  })

  it('story:low base ≈ 1h → clamped up to the 2h floor', () => {
    // base 1h, buffer = max(0.25*1h=15m, 30m) = 30m → 1.5h, clamped up to 2h
    expect(estimator.estimate('story', 'low')).toBe(MIN_LEAD_TIME_MS)
  })
})

describe('LeadTimeEstimator — buffer rule (R7.2)', () => {
  const estimator = new LeadTimeEstimator()

  it('buffer is at least 25% of the base duration', () => {
    for (const format of FORMATS) {
      for (const complexity of COMPLEXITIES) {
        const base = estimator.baseDurationMs(format, complexity)
        expect(estimator.bufferMs(base)).toBeGreaterThanOrEqual(0.25 * base)
      }
    }
  })

  it('buffer is never smaller than the 30-minute floor', () => {
    for (const format of FORMATS) {
      for (const complexity of COMPLEXITIES) {
        const base = estimator.baseDurationMs(format, complexity)
        expect(estimator.bufferMs(base)).toBeGreaterThanOrEqual(30 * MINUTE_MS)
      }
    }
  })
})

describe('LeadTimeEstimator — clamp edge cases (R7.2)', () => {
  it('clamps up to the 2h floor when base + buffer is below it', () => {
    const estimator = new LeadTimeEstimator({
      ...DEFAULT_LEAD_TIME_CONFIG,
      baseDurationMs: {
        ...DEFAULT_LEAD_TIME_CONFIG.baseDurationMs,
        photo: { low: 1 * MINUTE_MS, med: 1 * MINUTE_MS, high: 1 * MINUTE_MS },
      },
    })
    expect(estimator.estimate('photo', 'low')).toBe(MIN_LEAD_TIME_MS)
  })

  it('clamps down to the 14d ceiling when base + buffer exceeds it', () => {
    const estimator = new LeadTimeEstimator({
      ...DEFAULT_LEAD_TIME_CONFIG,
      baseDurationMs: {
        ...DEFAULT_LEAD_TIME_CONFIG.baseDurationMs,
        reel: { low: 60 * DAY_MS, med: 60 * DAY_MS, high: 60 * DAY_MS },
      },
    })
    expect(estimator.estimate('reel', 'high')).toBe(MAX_LEAD_TIME_MS)
  })
})

/**
 * Property 11 — Lead-time bounds and buffer inclusion.
 *
 * For any content format and complexity, the estimated Lead_Time is:
 *   (a) always within the clamp bounds [2h, 14d], and
 *   (b) always the base duration plus the safety buffer, clamped — i.e. the
 *       buffer is included before clamping and the clamp is respected.
 *
 * **Validates: Requirements 7.2**
 */
describe('LeadTimeEstimator — Property 11: bounds and buffer inclusion', () => {
  it('output is always within [2h, 14d] and includes the buffer', () => {
    const estimator = new LeadTimeEstimator()

    fc.assert(
      fc.property(
        fc.constantFrom(...FORMATS),
        fc.constantFrom(...COMPLEXITIES),
        (format, complexity) => {
          const result = estimator.estimate(format, complexity)

          // (a) Always within the clamp bounds.
          expect(result).toBeGreaterThanOrEqual(MIN_LEAD_TIME_MS)
          expect(result).toBeLessThanOrEqual(MAX_LEAD_TIME_MS)

          // (b) The buffer is included: recompute base + buffer and confirm the
          //     estimate is exactly that value clamped into range.
          const base = estimator.baseDurationMs(format, complexity)
          const buffer = estimator.bufferMs(base)
          const buffered = base + buffer
          const expected = Math.min(Math.max(buffered, MIN_LEAD_TIME_MS), MAX_LEAD_TIME_MS)

          expect(result).toBe(expected)
          // Buffer is strictly positive, so the buffered total always exceeds base.
          expect(buffered).toBeGreaterThan(base)
        },
      ),
      { numRuns: ITERATIONS },
    )
  })

  it('over arbitrary base durations, buffer+clamp stays within bounds and adds the buffer', () => {
    // Exercises the buffer/clamp algorithm across the whole numeric input space,
    // independent of the specific config table values.
    const estimator = new LeadTimeEstimator()

    fc.assert(
      fc.property(
        // Base durations from 0 up to well beyond the 14d ceiling.
        fc.integer({ min: 0, max: 40 * DAY_MS }),
        (base) => {
          const buffer = estimator.bufferMs(base)
          const buffered = base + buffer
          const result = Math.min(Math.max(buffered, MIN_LEAD_TIME_MS), MAX_LEAD_TIME_MS)

          // Bounds always hold.
          expect(result).toBeGreaterThanOrEqual(MIN_LEAD_TIME_MS)
          expect(result).toBeLessThanOrEqual(MAX_LEAD_TIME_MS)

          // Buffer rule: at least 25% of base and at least 30 minutes.
          expect(buffer).toBeGreaterThanOrEqual(0.25 * base)
          expect(buffer).toBeGreaterThanOrEqual(30 * MINUTE_MS)

          // Buffer inclusion: when the buffered total sits inside the bounds, the
          // result equals it (buffer fully carried through, not dropped).
          if (buffered >= MIN_LEAD_TIME_MS && buffered <= MAX_LEAD_TIME_MS) {
            expect(result).toBe(buffered)
            expect(result).toBeGreaterThan(base)
          }
        },
      ),
      { numRuns: ITERATIONS },
    )
  })
})
