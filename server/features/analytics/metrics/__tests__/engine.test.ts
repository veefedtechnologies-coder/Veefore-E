/**
 * Unit tests for the Metric Engine and registry (Phase 2).
 * Validates provenance (data-quality, lineage), null-safety, raw/calculated
 * resolution, composite handling, and registry integrity.
 */

import { describe, it, expect } from 'vitest'
import { MetricEngine, rateValue } from '../engine'
import { METRIC_IDS } from '../metric-ids'
import {
  ALL_METRICS,
  METRIC_DEFINITIONS,
  getMetricById,
  getMetricByKey,
} from '../registry'
import type { MetricBenchmark } from '../types'

const engine = new MetricEngine()

describe('registry integrity', () => {
  it('every definition key matches its record key', () => {
    for (const [key, def] of Object.entries(METRIC_DEFINITIONS)) {
      expect(def.key).toBe(key)
    }
  })

  it('metric IDs are unique', () => {
    const ids = ALL_METRICS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('lineage dependencies reference known metric keys', () => {
    for (const def of ALL_METRICS) {
      for (const dep of def.dependencies ?? []) {
        expect(getMetricByKey(dep), `missing dependency ${dep} for ${def.key}`).toBeDefined()
      }
    }
  })

  it('lookups by key and id agree', () => {
    expect(getMetricById(METRIC_IDS.FOLLOWERS)).toBe(getMetricByKey('followers_total'))
  })
})

describe('raw metric resolution', () => {
  it('returns the verified raw value', () => {
    const v = engine.computeMetric('followers_total', { current: { followers_total: 1000 } })
    expect(v.value).toBe(1000)
    expect(v.dataQuality).toBe('verified')
    expect(v.metricId).toBe(METRIC_IDS.FOLLOWERS)
  })

  it('returns null when the raw input is missing', () => {
    const v = engine.computeMetric('followers_total', { current: {} })
    expect(v.value).toBeNull()
  })
})

describe('calculated metric resolution', () => {
  it('computes follower growth from current and previous', () => {
    const v = engine.computeMetric('follower_growth', {
      current: { followers_total: 1200 },
      previous: { followers_total: 1000 },
    })
    expect(v.value).toBe(200)
    expect(v.dataQuality).toBe('calculated')
    expect(v.lineage).toContain('followers_total')
  })

  it('computes net followers from the period delta when new/lost are unavailable', () => {
    const v = engine.computeMetric('net_followers', {
      current: { followers_total: 1200 },
      previous: { followers_total: 1000 },
    })
    expect(v.value).toBe(200)
  })

  it('prefers explicit new/lost for net followers when present', () => {
    const v = engine.computeMetric('net_followers', {
      current: { followers_total: 1200, new_followers: 250, lost_followers: 50 },
      previous: { followers_total: 1000 },
    })
    expect(v.value).toBe(200)
  })

  it('computes follower growth rate from new/lost against start-of-period base (no previous window)', () => {
    // new 5, lost 2 → net +3; current 455 → start base = 452; 3/452 ≈ 0.66%
    const v = engine.computeMetric('follower_growth_rate', {
      current: { followers_total: 455, new_followers: 5, lost_followers: 2 },
    })
    expect(v.value).not.toBeNull()
    expect(v.value).toBeCloseTo(0.66, 1)
  })

  it('computes audience churn from lost against start-of-period base (no previous window)', () => {
    // lost 2, net +3, current 455 → base 452; churn 2/452 ≈ 0.44%
    const v = engine.computeMetric('audience_churn', {
      current: { followers_total: 455, new_followers: 5, lost_followers: 2 },
    })
    expect(v.value).not.toBeNull()
    expect(v.value).toBeCloseTo(0.44, 1)
  })

  it('computes engagement rate by reach from interaction inputs', () => {
    const v = engine.computeMetric('engagement_rate_by_reach', {
      current: { likes: 30, comments: 10, shares: 5, saves: 5, reach_total: 1000 },
    })
    // (30+10+5+5)/1000*100 = 5
    expect(v.value).toBe(5)
  })

  it('returns null when a required input is missing', () => {
    const v = engine.computeMetric('reach_efficiency', { current: { reach_total: 2000 } })
    expect(v.value).toBeNull()
  })

  it('computes velocity using the window duration', () => {
    const v = engine.computeMetric('reach_velocity', {
      current: { reach_total: 4800 },
      windowHours: 24,
    })
    expect(v.value).toBe(200)
  })

  it('publishing success rate uses published + failed as the base', () => {
    const v = engine.computeMetric('publishing_success_rate', {
      current: { published_posts: 9, failed_posts: 1 },
    })
    expect(v.value).toBe(90)
  })
})

describe('computeAll', () => {
  it('includes raw inputs and derivable calculated metrics', () => {
    const all = engine.computeAll({
      current: { likes: 30, comments: 10, shares: 5, saves: 5, reach_total: 1000, followers_total: 2000 },
    })
    expect(all.followers_total.value).toBe(2000)
    expect(all.total_engagements.value).toBe(50)
    expect(all.engagement_rate_by_reach.value).toBe(5)
    // Not derivable without previous followers → null, not fabricated.
    expect(all.follower_growth.value).toBeNull()
  })
})

describe('composite handling', () => {
  it('does not auto-compute composites via computeMetric', () => {
    const v = engine.computeMetric('virality_score', { current: {} })
    expect(v.value).toBeNull()
    expect(v.unit).toBe('score')
  })

  it('computes a composite from explicit weighted components', () => {
    const v = engine.computeComposite('virality_score', [
      { key: 'share_rate', score: 80, weight: 1 },
      { key: 'save_rate', score: 60, weight: 1 },
    ])
    expect(v.value).toBe(70)
    expect(v.lineage).toEqual(['share_rate', 'save_rate'])
  })

  it('throws for a non-composite key', () => {
    expect(() => engine.computeComposite('followers_total', [])).toThrow()
  })
})

describe('unknown metrics', () => {
  it('throws on an unknown metric key', () => {
    expect(() => engine.computeMetric('does_not_exist', { current: {} })).toThrow()
  })
})

describe('rateValue', () => {
  it('returns undefined without a benchmark', () => {
    expect(rateValue(5)).toBeUndefined()
  })

  it('matches the correct band', () => {
    const benchmark: MetricBenchmark = {
      excellent: { min: 8, max: 100 },
      good: { min: 4, max: 7.99 },
      poor: { min: 0, max: 3.99 },
    }
    expect(rateValue(9, benchmark)).toBe('excellent')
    expect(rateValue(5, benchmark)).toBe('good')
    expect(rateValue(1, benchmark)).toBe('poor')
  })
})
