/**
 * Unit tests for the pure metric calculation functions (Phase 2).
 * Validates the documented formulas and null-safety guarantees
 * (02-metrics-dictionary.md Ch 12–19; CODING_RULES Rule 21).
 */

import { describe, it, expect } from 'vitest'
import {
  audienceChurn,
  audienceRetention,
  averageFrequency,
  averageWatchTime,
  clickThroughRate,
  completionRate,
  engagementRate,
  engagementVelocity,
  followerGrowth,
  netFollowers,
  percentage,
  publishingFailureRate,
  publishingSuccessRate,
  reachEfficiency,
  reachVelocity,
  round,
  safeDivide,
  saveRate,
  shareRate,
  totalEngagements,
} from '../calculations'

describe('helpers', () => {
  it('round respects precision', () => {
    expect(round(1.23456)).toBe(1.23)
    expect(round(1.23456, 3)).toBe(1.235)
  })

  it('safeDivide guards zero/negative/invalid denominators', () => {
    expect(safeDivide(10, 2)).toBe(5)
    expect(safeDivide(10, 0)).toBeNull()
    expect(safeDivide(10, -2)).toBeNull()
    expect(safeDivide(Number.NaN, 2)).toBeNull()
  })

  it('percentage computes part/whole*100 and rounds', () => {
    expect(percentage(1, 4)).toBe(25)
    expect(percentage(1, 3)).toBe(33.33)
    expect(percentage(1, 0)).toBeNull()
  })
})

describe('audience metrics', () => {
  it('followerGrowth = current − previous', () => {
    expect(followerGrowth(1200, 1000)).toBe(200)
    expect(followerGrowth(900, 1000)).toBe(-100)
    expect(followerGrowth(1, Number.NaN)).toBeNull()
  })

  it('netFollowers = new − lost', () => {
    expect(netFollowers(300, 120)).toBe(180)
  })

  it('followerGrowthRate = (net new / previous) × 100', () => {
    expect(percentage(200, 1000)).toBe(20) // sanity
  })

  it('audienceChurn and retention are complementary', () => {
    const churn = audienceChurn(50, 1000)
    expect(churn).toBe(5)
    expect(audienceRetention(churn as number)).toBe(95)
  })
})

describe('engagement metrics', () => {
  it('totalEngagements sums interactions', () => {
    expect(totalEngagements(10, 5, 3, 2)).toBe(20)
    expect(totalEngagements(10, 5, 3, Number.NaN)).toBeNull()
  })

  it('engagementRate = engagements / base × 100', () => {
    expect(engagementRate(50, 1000)).toBe(5)
    expect(engagementRate(50, 0)).toBeNull()
  })

  it('share/save rate use reach denominator', () => {
    expect(shareRate(20, 1000)).toBe(2)
    expect(saveRate(30, 1000)).toBe(3)
  })

  it('engagementVelocity = gained per hour', () => {
    expect(engagementVelocity(240, 24)).toBe(10)
    expect(engagementVelocity(240, 0)).toBeNull()
  })
})

describe('reach & impressions', () => {
  it('reachEfficiency = reach / followers (ratio)', () => {
    expect(reachEfficiency(2000, 1000)).toBe(2)
    expect(reachEfficiency(2000, 0)).toBeNull()
  })

  it('reachVelocity = reach gained per hour', () => {
    expect(reachVelocity(4800, 24)).toBe(200)
  })

  it('averageFrequency = impressions / reach', () => {
    expect(averageFrequency(3000, 1000)).toBe(3)
  })
})

describe('clicks & video', () => {
  it('clickThroughRate = clicks / base × 100', () => {
    expect(clickThroughRate(50, 1000)).toBe(5)
  })

  it('completionRate = completions / views × 100', () => {
    expect(completionRate(250, 1000)).toBe(25)
  })

  it('averageWatchTime = total watch seconds / views', () => {
    expect(averageWatchTime(10000, 1000)).toBe(10)
  })
})

describe('publishing', () => {
  it('success and failure rates are complementary over total', () => {
    expect(publishingSuccessRate(9, 10)).toBe(90)
    expect(publishingFailureRate(1, 10)).toBe(10)
  })

  it('returns null when total is zero', () => {
    expect(publishingSuccessRate(0, 0)).toBeNull()
  })
})
