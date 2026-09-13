/**
 * Unit tests for computeCadenceModel — the recommendation must genuinely vary
 * with the account numbers, the gap, and the deadline (not snap to 5/7).
 */

import { describe, it, expect } from 'vitest'
import {
  computeCadenceModel,
  type SetupValues,
  type AccountContext,
} from './missionSetupInterpreter'

function values(overrides: Partial<SetupValues> = {}): SetupValues {
  return { goalMetric: 'followers', targetValue: 1000, ...overrides }
}

const weeksFromNow = (n: number) =>
  new Date(Date.now() + n * 7 * 24 * 60 * 60 * 1000).toISOString()

describe('computeCadenceModel', () => {
  it('recommends a light cadence when the account is already near the goal', () => {
    const account: AccountContext = { followers: 950, avgReach: 400 }
    const m = computeCadenceModel(values({ targetValue: 1000, targetDate: weeksFromNow(12) }), account)
    // Tiny gap (50 over 12 weeks) → low required rate → minimum cadence.
    expect(m.requiredGain).toBe(50)
    expect(m.recommendedPerWeek).toBe(2)
    expect(m.feasibility).toBe('comfortable')
  })

  it('scales up cadence for the same gap under a tighter deadline', () => {
    // High reach so neither case saturates the [2,14] ceiling.
    const account: AccountContext = { followers: 1000, avgReach: 1000 }
    const near = computeCadenceModel(values({ targetValue: 3000, targetDate: weeksFromNow(20) }), account)
    const tight = computeCadenceModel(values({ targetValue: 3000, targetDate: weeksFromNow(6) }), account)
    // Same gap, tighter deadline → higher recommended cadence.
    expect(tight.recommendedPerWeek).toBeGreaterThan(near.recommendedPerWeek)
    expect(near.recommendedPerWeek).toBeLessThan(14)
  })

  it('varies with the account reach (more reach per post → fewer posts needed)', () => {
    const lowReach = computeCadenceModel(
      values({ targetValue: 5000, targetDate: weeksFromNow(10) }),
      { followers: 1000, avgReach: 100 },
    )
    const highReach = computeCadenceModel(
      values({ targetValue: 5000, targetDate: weeksFromNow(10) }),
      { followers: 1000, avgReach: 5000 },
    )
    expect(highReach.recommendedPerWeek).toBeLessThan(lowReach.recommendedPerWeek)
  })

  it('flags an unrealistic goal (tiny account, huge target, short deadline)', () => {
    const account: AccountContext = { followers: 3, avgReach: 19 }
    const m = computeCadenceModel(values({ targetValue: 10_000, targetDate: weeksFromNow(12) }), account)
    expect(m.feasibility).toBe('unrealistic')
    expect(m.recommendedPerWeek).toBeLessThanOrEqual(14)
    expect(m.recommendedPerWeek).toBeGreaterThanOrEqual(2)
  })

  it('stays within the sane cadence band [2,14]', () => {
    const account: AccountContext = { followers: 10, avgReach: 5 }
    const m = computeCadenceModel(values({ targetValue: 1_000_000, targetDate: weeksFromNow(2) }), account)
    expect(m.recommendedPerWeek).toBeGreaterThanOrEqual(2)
    expect(m.recommendedPerWeek).toBeLessThanOrEqual(14)
  })
})
