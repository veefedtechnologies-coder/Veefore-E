/**
 * Unit tests for date-range resolution (Phase 9). Pure query-param construction.
 */

import { describe, it, expect } from 'vitest'
import { resolveDateRange } from '../dateRanges'

const NOW = new Date('2026-01-31T12:00:00.000Z')

describe('resolveDateRange', () => {
  it('resolves a rolling preset with an equal-length comparison window', () => {
    const r = resolveDateRange('last_30d', NOW)
    expect(r.to).toBe('2026-01-31T12:00:00.000Z')
    expect(r.from).toBe('2026-01-01T12:00:00.000Z')
    expect(r.compareTo).toBe(r.from)
    expect(r.compareFrom).toBe('2025-12-02T12:00:00.000Z')
  })

  it('resolves "today" from start-of-day UTC', () => {
    const r = resolveDateRange('today', NOW)
    expect(r.from).toBe('2026-01-31T00:00:00.000Z')
    expect(r.to).toBe('2026-01-31T12:00:00.000Z')
    expect(r.compareFrom).toBe('2026-01-30T00:00:00.000Z')
    expect(r.compareTo).toBe('2026-01-31T00:00:00.000Z')
  })

  it('resolves "yesterday" to the full prior day', () => {
    const r = resolveDateRange('yesterday', NOW)
    expect(r.from).toBe('2026-01-30T00:00:00.000Z')
    expect(r.to).toBe('2026-01-31T00:00:00.000Z')
  })

  it('returns an empty range for custom (picker pending)', () => {
    expect(resolveDateRange('custom', NOW)).toEqual({})
  })

  it('resolves a custom window with a preceding comparison window', () => {
    const r = resolveDateRange('custom', NOW, { from: '2024-06-01', to: '2026-07-02' })
    expect(r.from).toBe('2024-06-01T00:00:00.000Z')
    expect(r.to).toBe('2026-07-02T23:59:59.999Z')
    // Spans > 365 days are supported (calendar picker can select ~2 years).
    const spanDays = (new Date(r.to!).getTime() - new Date(r.from!).getTime()) / 86_400_000
    expect(spanDays).toBeGreaterThan(365)
    expect(r.compareTo).toBe(r.from)
  })

  it('omits the comparison window when mode is "none"', () => {
    const r = resolveDateRange('last_30d', NOW, undefined, { mode: 'none' })
    expect(r.from).toBeDefined()
    expect(r.compareFrom).toBeUndefined()
    expect(r.compareTo).toBeUndefined()
  })

  it('uses the supplied window for a custom comparison', () => {
    const r = resolveDateRange('last_30d', NOW, undefined, {
      mode: 'custom',
      custom: { from: '2025-05-02', to: '2025-05-31' },
    })
    expect(r.compareFrom).toBe('2025-05-02T00:00:00.000Z')
    expect(r.compareTo).toBe('2025-05-31T23:59:59.999Z')
  })

  it('resolves "month to date" from the first of the month', () => {
    const r = resolveDateRange('month_to_date', NOW, undefined, { mode: 'none' })
    expect(r.from).toBe('2026-01-01T00:00:00.000Z')
    expect(r.to).toBe('2026-01-31T12:00:00.000Z')
  })

  it('resolves "last month" to the full previous calendar month', () => {
    const r = resolveDateRange('last_month', NOW, undefined, { mode: 'none' })
    expect(r.from).toBe('2025-12-01T00:00:00.000Z')
    expect(r.to).toBe('2025-12-31T23:59:59.999Z')
  })

  it('resolves "year to date" from Jan 1', () => {
    const r = resolveDateRange('year_to_date', NOW, undefined, { mode: 'none' })
    expect(r.from).toBe('2026-01-01T00:00:00.000Z')
  })
})
