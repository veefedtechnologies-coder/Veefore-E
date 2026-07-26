/**
 * Unit tests for the composite score framework (Phase 2).
 * Weights are caller-supplied (not defined in docs); these tests validate the
 * normalization and weighted-aggregation mechanics only.
 */

import { describe, it, expect } from 'vitest'
import { clamp, computeCompositeScore, normalizeToScore } from '../composite'

describe('clamp', () => {
  it('bounds values to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})

describe('normalizeToScore', () => {
  it('maps a value linearly to 0–100', () => {
    expect(normalizeToScore(50, 0, 100)).toBe(50)
    expect(normalizeToScore(0, 0, 100)).toBe(0)
    expect(normalizeToScore(100, 0, 100)).toBe(100)
  })

  it('clamps out-of-range values', () => {
    expect(normalizeToScore(150, 0, 100)).toBe(100)
    expect(normalizeToScore(-10, 0, 100)).toBe(0)
  })

  it('inverts when lower is better', () => {
    expect(normalizeToScore(0, 0, 100, false)).toBe(100)
    expect(normalizeToScore(100, 0, 100, false)).toBe(0)
  })

  it('returns null for an empty range', () => {
    expect(normalizeToScore(5, 10, 10)).toBeNull()
  })
})

describe('computeCompositeScore', () => {
  it('computes a weighted average normalized by weight sum', () => {
    const score = computeCompositeScore([
      { key: 'a', score: 80, weight: 2 },
      { key: 'b', score: 50, weight: 1 },
    ])
    // (80*2 + 50*1) / 3 = 70
    expect(score).toBe(70)
  })

  it('ignores invalid components', () => {
    const score = computeCompositeScore([
      { key: 'a', score: 80, weight: 1 },
      { key: 'b', score: 200, weight: 1 }, // out of 0–100 range
    ])
    expect(score).toBe(80)
  })

  it('returns null below the minimum component threshold', () => {
    const score = computeCompositeScore(
      [{ key: 'a', score: 80, weight: 1 }],
      { minComponents: 2 }
    )
    expect(score).toBeNull()
  })

  it('returns null when total weight is not positive', () => {
    const score = computeCompositeScore([{ key: 'a', score: 80, weight: 0 }])
    expect(score).toBeNull()
  })
})
