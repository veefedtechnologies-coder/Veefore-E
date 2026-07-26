import { describe, it, expect } from 'vitest'
import { computeBestTime } from '../server/services/bestTimeEngine'

describe('bestTimeEngine.computeBestTime', () => {
  it('returns learning/empty state with no data', () => {
    const r = computeBestTime({})
    expect(r.bestSlot).toBeNull()
    expect(r.bestDay).toBeNull()
    expect(r.summary).toBe('Not enough data yet')
    expect(r.confidenceLevel).toBe('Learning')
    expect(r.dailyBest).toHaveLength(7)
  })

  it('uses audience-only signal when no posts exist', () => {
    // Monday (dow=1) at 18:00 has the most followers online
    const weeklyActive: Record<string, number> = {
      '1_18': 1000, '1_19': 500, '2_9': 200, '3_12': 100,
    }
    const r = computeBestTime({ weeklyActive })
    expect(r.signals.audience).toBe(true)
    expect(r.signals.engagement).toBe(false)
    expect(r.bestSlot?.dow).toBe(1)
    expect(r.bestSlot?.hour).toBe(18)
    expect(r.bestDay?.dow).toBe(1)
    // Combined grid top slot should be 100
    expect(r.combinedGrid['1_18']).toBe(100)
  })

  it('fuses audience + engagement + reach and picks the strongest blended slot', () => {
    const weeklyActive: Record<string, number> = { '3_19': 1000, '5_10': 800 }
    // Two posts: Wednesday 19h very strong engagement, Friday 10h weaker
    const posts = [
      { publishedAt: makeDate(3, 19), reach: 1000, likes: 200, comments: 50, saves: 40, shares: 10, views: 5000 },
      { publishedAt: makeDate(3, 19), reach: 1000, likes: 180, comments: 45, saves: 35, shares: 8, views: 4800 },
      { publishedAt: makeDate(5, 10), reach: 1000, likes: 20, comments: 2, saves: 1, shares: 0, views: 1200 },
    ]
    const r = computeBestTime({ weeklyActive, posts })
    expect(r.signals.audience).toBe(true)
    expect(r.signals.engagement).toBe(true)
    expect(r.signals.reach).toBe(true)
    // Wednesday 19h wins on all three signals
    expect(r.bestSlot?.dow).toBe(3)
    expect(r.bestSlot?.hour).toBe(19)
    expect(r.bestDay?.dow).toBe(3)
    expect(r.meta.postsAnalyzed).toBe(3)
  })

  it('dampens slots backed by only one post via the support factor', () => {
    // Same per-post performance; slot B has far more posts, so support lifts it above
    // slot A which is backed by a single post.
    const posts = [
      // Slot A: Monday 8h — one post
      { publishedAt: makeDate(1, 8), reach: 1000, likes: 60, comments: 15, saves: 8, shares: 3 },
      // Slot B: Tuesday 20h — six posts of identical strength
      ...Array.from({ length: 6 }, () => ({ publishedAt: makeDate(2, 20), reach: 1000, likes: 60, comments: 15, saves: 8, shares: 3 })),
    ]
    const r = computeBestTime({ posts })
    // Slot B should win because its evidence is far stronger (support factor)
    expect(r.bestSlot?.dow).toBe(2)
    expect(r.bestSlot?.hour).toBe(20)
  })

  it('applies V4.6 weighting — saves and comments count more than likes', () => {
    // Two slots, same reach & same total interaction count, but slot A is save-heavy.
    const posts = [
      // Slot A: Monday 8h — 20 saves (high intent)
      { publishedAt: makeDate(1, 8), reach: 1000, likes: 10, comments: 0, saves: 20, shares: 0 },
      // Slot B: Tuesday 20h — 20 likes (low intent), same total count
      { publishedAt: makeDate(2, 20), reach: 1000, likes: 30, comments: 0, saves: 0, shares: 0 },
    ]
    const r = computeBestTime({ posts })
    // Slot A: (10 + 20×2) = 50 weighted; Slot B: 30 weighted → A wins
    expect(r.bestSlot?.dow).toBe(1)
    expect(r.bestSlot?.hour).toBe(8)
  })

  it('produces a best hour for every day that has signal', () => {
    const weeklyActive: Record<string, number> = {
      '0_10': 300, '1_18': 1000, '2_9': 500, '6_21': 700,
    }
    const r = computeBestTime({ weeklyActive })
    const mon = r.dailyBest.find((d) => d.dow === 1)!
    expect(mon.hour).toBe(18)
    expect(mon.dayScore).toBe(100) // Monday is the strongest day
    const sun = r.dailyBest.find((d) => d.dow === 0)!
    expect(sun.hour).toBe(10)
    expect(sun.dayScore).toBeGreaterThan(0)
    expect(sun.dayScore).toBeLessThan(100)
  })

  it('filters out noise posts scoring below 10% of the average (V4.6 rule)', () => {
    // Nine strong posts on Monday 8h, one near-zero-engagement dud on Tuesday 20h.
    // The dud's score is far below 10% of the average, so it should be excluded
    // entirely rather than dragging down Tuesday's (already tiny) average.
    const posts = [
      ...Array.from({ length: 9 }, () => ({ publishedAt: makeDate(1, 8), reach: 1000, likes: 200, comments: 50, saves: 40, shares: 10 })),
      { publishedAt: makeDate(2, 20), reach: 10, likes: 1, comments: 0, saves: 0, shares: 0 }, // near-zero — should be filtered
    ]
    const r = computeBestTime({ posts })
    expect(r.meta.postsAnalyzed).toBe(10)
    expect(r.meta.usablePosts).toBe(9) // the dud got filtered out
    expect(r.bestSlot?.dow).toBe(1)
    expect(r.bestSlot?.hour).toBe(8)
    // Tuesday 20h should have NO signal at all since its only post was filtered
    expect(r.combinedGrid['2_20']).toBeUndefined()
  })

  it('finds the next upcoming occurrence of a qualifying slot within 7 days', () => {
    const weeklyActive: Record<string, number> = { '3_19': 1000 } // Wednesday 7pm is the only slot
    // Fix "now" to a known Monday 10am so the scan is deterministic.
    const now = fixedMonday10am()
    const r = computeBestTime({ weeklyActive, now })
    expect(r.nextOccurrence).not.toBeNull()
    expect(r.nextOccurrence?.dow).toBe(3)
    expect(r.nextOccurrence?.hour).toBe(19)
    // Should land 2 days later than "now" (Monday → Wednesday)
    const diffDays = Math.round((r.nextOccurrence!.date.getTime() - now.getTime()) / 86_400_000)
    expect(diffDays).toBe(2)
  })

  it('falls back to next calendar occurrence of bestSlot when nothing else qualifies within a week', () => {
    // Only one slot has any signal at all, so the forward scan will find it as
    // the very next occurrence (it's both the qualifying slot and the fallback).
    const weeklyActive: Record<string, number> = { '5_9': 500 }
    const now = fixedMonday10am()
    const r = computeBestTime({ weeklyActive, now })
    expect(r.nextOccurrence).not.toBeNull()
    expect(r.nextOccurrence?.dow).toBe(5)
    expect(r.nextOccurrence?.hour).toBe(9)
    expect(r.nextOccurrence!.date.getTime()).toBeGreaterThan(now.getTime())
  })

  it('returns nextOccurrence null when there is no data at all', () => {
    const r = computeBestTime({})
    expect(r.nextOccurrence).toBeNull()
  })
})

/** Build a Date on a given local day-of-week (0=Sun) and hour in the current week. */
function makeDate(dow: number, hour: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay() + dow)
  d.setHours(hour, 0, 0, 0)
  return d
}

/** A fixed Monday 10:00 AM reference time, for deterministic forward-scan tests. */
function fixedMonday10am(): Date {
  const d = new Date()
  const diff = (1 - d.getDay() + 7) % 7
  d.setDate(d.getDate() + diff)
  d.setHours(10, 0, 0, 0)
  return d
}
