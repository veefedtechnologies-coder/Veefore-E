/**
 * Unit tests for the pure widget display utilities (Phase 5).
 */

import { describe, it, expect } from 'vitest'
import { heatmapIntensity, progressFraction } from '../utils'

describe('progressFraction', () => {
  it('returns the clamped fraction of current/goal', () => {
    expect(progressFraction(50, 100)).toBe(0.5)
    expect(progressFraction(150, 100)).toBe(1)
    expect(progressFraction(-10, 100)).toBe(0)
  })

  it('returns 0 for a non-positive or invalid goal', () => {
    expect(progressFraction(10, 0)).toBe(0)
    expect(progressFraction(10, -5)).toBe(0)
    expect(progressFraction(Number.NaN, 100)).toBe(0)
  })
})

describe('heatmapIntensity', () => {
  it('scales value relative to max, clamped to [0,1]', () => {
    expect(heatmapIntensity(5, 10)).toBe(0.5)
    expect(heatmapIntensity(20, 10)).toBe(1)
    expect(heatmapIntensity(0, 10)).toBe(0)
  })

  it('returns 0 when max is non-positive or invalid', () => {
    expect(heatmapIntensity(5, 0)).toBe(0)
    expect(heatmapIntensity(5, Number.NaN)).toBe(0)
  })
})
