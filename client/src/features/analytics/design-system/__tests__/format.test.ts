/**
 * Unit tests for the Analytics Design System formatting utilities (Phase 3).
 * These are pure functions (no DOM) validating display formatting only.
 */

import { describe, it, expect } from 'vitest'
import {
  compactNumber,
  formatCount,
  formatDelta,
  formatDuration,
  formatMetricValue,
  formatPercentChange,
  trendFromChange,
} from '../format'

const MINUS = '\u2212' // the typographic minus sign used by delta formatters

describe('compactNumber / formatCount', () => {
  it('compacts large numbers', () => {
    expect(compactNumber(1250)).toBe('1.3K')
    expect(compactNumber(2_400_000)).toBe('2.4M')
  })

  it('groups small counts and compacts large ones', () => {
    expect(formatCount(1250)).toBe('1,250')
    expect(formatCount(25_800)).toBe('25.8K')
  })
})

describe('formatDuration', () => {
  it('formats seconds/minutes/hours', () => {
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(80)).toBe('1m 20s')
    expect(formatDuration(3661)).toBe('1h 1m')
  })
})

describe('formatMetricValue by unit', () => {
  it('count', () => expect(formatMetricValue(1250, 'count')).toBe('1,250'))
  it('percent', () => expect(formatMetricValue(4.7, 'percent')).toBe('4.7%'))
  it('ratio', () => expect(formatMetricValue(2, 'ratio')).toBe('2x'))
  it('currency', () => expect(formatMetricValue(1200, 'currency')).toBe('$1,200'))
  it('seconds', () => expect(formatMetricValue(80, 'seconds')).toBe('1m 20s'))
  it('per_hour', () => expect(formatMetricValue(200, 'per_hour')).toBe('200/hr'))
  it('score', () => expect(formatMetricValue(183, 'score')).toBe('183'))

  it('returns placeholder for null/invalid', () => {
    expect(formatMetricValue(null, 'count')).toBe('—')
    expect(formatMetricValue(undefined, 'percent')).toBe('—')
    expect(formatMetricValue(Number.NaN, 'count')).toBe('—')
  })
})

describe('deltas & percentages', () => {
  it('formatDelta adds a sign', () => {
    expect(formatDelta(200, 'count')).toBe('+200')
    expect(formatDelta(-50, 'count')).toBe(`${MINUS}50`)
    expect(formatDelta(null)).toBe('—')
  })

  it('formatPercentChange adds a sign', () => {
    expect(formatPercentChange(12.5)).toBe('+12.5%')
    expect(formatPercentChange(-0.3)).toBe(`${MINUS}0.3%`)
    expect(formatPercentChange(null)).toBe('—')
  })
})

describe('trendFromChange', () => {
  it('derives direction from sign', () => {
    expect(trendFromChange(5)).toBe('up')
    expect(trendFromChange(-5)).toBe('down')
    expect(trendFromChange(0)).toBe('flat')
    expect(trendFromChange(null)).toBe('flat')
  })
})
