/**
 * @vitest-environment happy-dom
 */

/**
 * Unit tests for useGovernedQuery pure helper functions.
 *
 * Tests formatRelativeTime() and formatRefreshEstimate() without React rendering context.
 * These helpers power the "last updated" timestamp and refresh estimate UX.
 *
 * Requirements: 8.1, 8.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatRelativeTime, formatRefreshEstimate } from '../useGovernedQuery'

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null when timestamp is null', () => {
    expect(formatRelativeTime(null)).toBeNull()
  })

  it('returns "Updated just now" for timestamps less than 30 seconds ago', () => {
    const now = Date.now()
    expect(formatRelativeTime(now)).toBe('Updated just now')
    expect(formatRelativeTime(now - 10_000)).toBe('Updated just now')
    expect(formatRelativeTime(now - 29_000)).toBe('Updated just now')
  })

  it('returns "Updated just now" for future timestamps', () => {
    const future = Date.now() + 5000
    expect(formatRelativeTime(future)).toBe('Updated just now')
  })

  it('returns "Updated less than a minute ago" for 30-59 seconds', () => {
    const now = Date.now()
    expect(formatRelativeTime(now - 30_000)).toBe('Updated less than a minute ago')
    expect(formatRelativeTime(now - 45_000)).toBe('Updated less than a minute ago')
    expect(formatRelativeTime(now - 59_000)).toBe('Updated less than a minute ago')
  })

  it('returns "Updated 1 minute ago" for exactly 1 minute', () => {
    const now = Date.now()
    expect(formatRelativeTime(now - 60_000)).toBe('Updated 1 minute ago')
    expect(formatRelativeTime(now - 90_000)).toBe('Updated 1 minute ago')
  })

  it('returns "Updated N minutes ago" for 2-59 minutes', () => {
    const now = Date.now()
    expect(formatRelativeTime(now - 2 * 60_000)).toBe('Updated 2 minutes ago')
    expect(formatRelativeTime(now - 12 * 60_000)).toBe('Updated 12 minutes ago')
    expect(formatRelativeTime(now - 59 * 60_000)).toBe('Updated 59 minutes ago')
  })

  it('returns "Updated 1 hour ago" for exactly 1 hour', () => {
    const now = Date.now()
    expect(formatRelativeTime(now - 60 * 60_000)).toBe('Updated 1 hour ago')
    expect(formatRelativeTime(now - 90 * 60_000)).toBe('Updated 1 hour ago')
  })

  it('returns "Updated N hours ago" for 2-23 hours', () => {
    const now = Date.now()
    expect(formatRelativeTime(now - 2 * 60 * 60_000)).toBe('Updated 2 hours ago')
    expect(formatRelativeTime(now - 5 * 60 * 60_000)).toBe('Updated 5 hours ago')
    expect(formatRelativeTime(now - 23 * 60 * 60_000)).toBe('Updated 23 hours ago')
  })

  it('returns "Updated 1 day ago" for exactly 1 day', () => {
    const now = Date.now()
    expect(formatRelativeTime(now - 24 * 60 * 60_000)).toBe('Updated 1 day ago')
  })

  it('returns "Updated N days ago" for multiple days', () => {
    const now = Date.now()
    expect(formatRelativeTime(now - 3 * 24 * 60 * 60_000)).toBe('Updated 3 days ago')
  })

  it('never contains raw timestamps or technical jargon', () => {
    const now = Date.now()
    const timestamps = [
      now - 5_000,
      now - 45_000,
      now - 120_000,
      now - 3600_000,
      now - 86400_000,
    ]

    for (const ts of timestamps) {
      const result = formatRelativeTime(ts)!
      expect(result).toMatch(/^Updated /)
      expect(result).not.toMatch(/\d{10,}/) // No raw timestamps
      expect(result).not.toMatch(/ms|millisecond/) // No technical units
    }
  })
})

describe('formatRefreshEstimate', () => {
  it('returns null for null input', () => {
    expect(formatRefreshEstimate(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(formatRefreshEstimate(undefined)).toBeNull()
  })

  it('returns null for zero or negative minutes', () => {
    expect(formatRefreshEstimate(0)).toBeNull()
    expect(formatRefreshEstimate(-5)).toBeNull()
  })

  it('returns "~N minutes" for values under 60', () => {
    expect(formatRefreshEstimate(5)).toBe('~5 minutes')
    expect(formatRefreshEstimate(20)).toBe('~20 minutes')
    expect(formatRefreshEstimate(59)).toBe('~59 minutes')
  })

  it('returns "~1 hour" for approximately 60 minutes', () => {
    expect(formatRefreshEstimate(60)).toBe('~1 hour')
  })

  it('returns "~N hours" for larger values', () => {
    expect(formatRefreshEstimate(120)).toBe('~2 hours')
    expect(formatRefreshEstimate(180)).toBe('~3 hours')
  })

  it('rounds properly for non-round minute values', () => {
    expect(formatRefreshEstimate(4.7)).toBe('~5 minutes')
    expect(formatRefreshEstimate(89)).toBe('~1 hour') // rounds to 1 hour
    expect(formatRefreshEstimate(150)).toBe('~3 hours') // rounds to 3 hours (150/60 = 2.5 → rounds to 3)
  })

  it('uses human-readable format without technical jargon', () => {
    const values = [1, 5, 15, 30, 60, 90, 120, 240]
    for (const val of values) {
      const result = formatRefreshEstimate(val)!
      expect(result).toMatch(/^~\d+ (minutes?|hours?)$/)
    }
  })
})
