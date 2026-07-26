/**
 * Unit tests for the analytics history cache window/day math (pure helpers).
 * These decide when a fetched window is safe to store forever vs. must be
 * refreshed, and build the Redis/BullMQ keys — the correctness core of the
 * read-through cache.
 */

import { describe, it, expect } from 'vitest'
import {
  backfillJobId,
  clampToNow,
  enumerateDays,
  followsRedisKey,
  isFresh,
  isImmutableWindow,
  missingDays,
  toUtcYmd,
  todayUtcYmd,
} from '../windowKeys'

const NOW = new Date('2026-01-31T12:00:00.000Z')

describe('windowKeys', () => {
  it('formats UTC calendar days', () => {
    expect(toUtcYmd(new Date('2026-01-31T23:59:59.999Z'))).toBe('2026-01-31')
    expect(todayUtcYmd(NOW)).toBe('2026-01-31')
  })

  it('treats a window ending before today as immutable', () => {
    expect(isImmutableWindow('2026-01-30', NOW)).toBe(true)
    // A window ending today is still accumulating → mutable.
    expect(isImmutableWindow('2026-01-31', NOW)).toBe(false)
    expect(isImmutableWindow('2026-02-05', NOW)).toBe(false)
  })

  it('checks freshness against a TTL', () => {
    const tenMinAgo = new Date(NOW.getTime() - 10 * 60_000)
    expect(isFresh(tenMinAgo, 30 * 60_000, NOW)).toBe(true)
    expect(isFresh(tenMinAgo, 5 * 60_000, NOW)).toBe(false)
  })

  it('clamps a future end date to now', () => {
    const future = new Date('2026-06-01T00:00:00.000Z')
    expect(clampToNow(future, NOW)).toEqual(NOW)
    const past = new Date('2026-01-01T00:00:00.000Z')
    expect(clampToNow(past, NOW)).toEqual(past)
  })

  it('builds a stable Redis key independent of account order', () => {
    const a = followsRedisKey('ws1', ['b', 'a'], '2026-01-01', '2026-01-31')
    const b = followsRedisKey('ws1', ['a', 'b'], '2026-01-01', '2026-01-31')
    expect(a).toBe(b)
    expect(a).toBe('analytics:foll:ws1:a,b:2026-01-01:2026-01-31')
  })

  it('builds a deterministic backfill job id per window', () => {
    expect(backfillJobId('follows', 'acc1', '2026-01-01', '2026-01-31')).toBe(
      'follows-backfill_acc1_2026-01-01_2026-01-31'
    )
    // Different groups (follows vs insights) never collide on the same window.
    expect(backfillJobId('insights', 'acc1', '2026-01-01', '2026-01-31')).not.toBe(
      backfillJobId('follows', 'acc1', '2026-01-01', '2026-01-31')
    )
  })

  it('backfill job id contains no ":" (BullMQ forbids it in custom ids)', () => {
    expect(backfillJobId('follows', '17841406961110225', '2024-07-02', '2026-07-02')).not.toContain(':')
  })

  it('enumerates inclusive UTC days', () => {
    expect(enumerateDays('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ])
    expect(enumerateDays('2026-02-02', '2026-02-01')).toEqual([])
  })

  it('finds the days missing from what is present', () => {
    const required = ['2026-01-01', '2026-01-02', '2026-01-03']
    const present = new Set(['2026-01-02'])
    expect(missingDays(required, present)).toEqual(['2026-01-01', '2026-01-03'])
  })

  it('isolates the Redis key per workspace (no cross-workspace cache hit)', () => {
    // Same account, two different workspaces → two DIFFERENT keys, so one
    // workspace can never read another's cached follows totals.
    const w1 = followsRedisKey('ws1', ['acctX'], '2026-01-01', '2026-01-31')
    const w2 = followsRedisKey('ws2', ['acctX'], '2026-01-01', '2026-01-31')
    expect(w1).not.toBe(w2)
    expect(w1.startsWith('analytics:foll:ws1:')).toBe(true)
    expect(w2.startsWith('analytics:foll:ws2:')).toBe(true)
  })

  it('sees a sub-range as fully present once its days are stored (DB-served)', () => {
    // Simulate: a full year was fetched → all its days stored.
    const year = enumerateDays('2025-04-01', '2026-03-31')
    const stored = new Set(year)
    // A sub-range within it needs zero additional fetches.
    const sub = enumerateDays('2026-01-01', '2026-03-03')
    expect(missingDays(sub, stored)).toEqual([])
  })
})
