/**
 * Unit tests for the AI Intelligence Engine (Phase 11): deterministic
 * forecasting, signal detection, confidence, root cause, recommendations, and
 * the executive summary.
 */

import { describe, it, expect } from 'vitest'
import { deriveConfidence } from '../confidence'
import { linearRegression } from '../stats'
import { forecastSeries } from '../forecast'
import { detectAnomalies, detectTrend } from '../signals'
import { analyzeRootCause } from '../root-cause'
import { buildRecommendations } from '../recommendations'
import { buildExecutiveSummary } from '../executive-summary'
import { AIIntelligenceEngine } from '../engine'

describe('linearRegression', () => {
  it('fits a perfect line with rSquared 1', () => {
    const r = linearRegression([0, 2, 4, 6, 8])
    expect(r.slope).toBeCloseTo(2)
    expect(r.intercept).toBeCloseTo(0)
    expect(r.rSquared).toBeCloseTo(1)
  })
})

describe('deriveConfidence', () => {
  it('rewards more data + good fit + verified provenance', () => {
    expect(deriveConfidence({ points: 40, rSquared: 0.95, dataQuality: 'verified' })).toBe('very_high')
    expect(deriveConfidence({ points: 3, rSquared: 0.1, dataQuality: 'predicted' })).toBe('low')
  })
})

describe('forecastSeries', () => {
  it('projects a clear upward trend forward', () => {
    const f = forecastSeries('followers_total', [100, 110, 120, 130, 140], { horizon: 3, dataQuality: 'verified' })
    expect(f.predictions).toHaveLength(3)
    // next values continue ~+10 per step
    expect(f.predictions[0].value).toBeGreaterThan(140)
    expect(f.predictions[2].value).toBeGreaterThan(f.predictions[0].value)
    expect(f.method).toBe('linear_regression')
    expect(f.assumptions.length).toBeGreaterThan(0)
  })

  it('clamps non-negative and degrades to low confidence with little data', () => {
    const f = forecastSeries('reach_total', [5], { horizon: 2 })
    expect(f.confidence).toBe('low')
    expect(f.predictions.every((p) => p.value >= 0)).toBe(true)
  })
})

describe('detectTrend / detectAnomalies', () => {
  it('detects a rising trend and its percent change', () => {
    const t = detectTrend('followers_total', [100, 120, 150], 'verified')
    expect(t.direction).toBe('rising')
    expect(t.changePercent).toBe(50)
  })

  it('flags a spike as an anomaly', () => {
    const anomalies = detectAnomalies('likes', [10, 10, 10, 10, 10, 10, 10, 10, 10, 50])
    expect(anomalies.length).toBeGreaterThan(0)
    expect(anomalies[anomalies.length - 1].value).toBe(50)
  })

  it('returns no anomalies for a flat series', () => {
    expect(detectAnomalies('likes', [10, 10, 10, 10])).toHaveLength(0)
  })
})

describe('analyzeRootCause', () => {
  it('ranks same-direction factors and includes a causation caveat', () => {
    const rc = analyzeRootCause(
      { metricKey: 'reach_total', changePercent: -20 },
      [
        { metricKey: 'published_posts', changePercent: -30 },
        { metricKey: 'impressions_total', changePercent: 15 }, // opposite direction → excluded
      ]
    )
    expect(rc.direction).toBe('falling')
    expect(rc.factors).toHaveLength(1)
    expect(rc.factors[0].metricKey).toBe('published_posts')
    expect(rc.caveat).toMatch(/causation/i)
  })
})

describe('buildRecommendations', () => {
  it('recommends action for a confident unfavourable trend', () => {
    const recs = buildRecommendations([
      { metricKey: 'audience_churn', direction: 'rising', slope: 1, changePercent: 25, confidence: 'high' },
    ])
    // churn rising is unfavourable (higherIsBetter=false) → "address" style
    expect(recs).toHaveLength(1)
    expect(recs[0].supportingMetricKeys).toEqual(['audience_churn'])
  })

  it('skips low-confidence and flat trends', () => {
    const recs = buildRecommendations([
      { metricKey: 'likes', direction: 'flat', slope: 0, changePercent: 0, confidence: 'high' },
      { metricKey: 'reach_total', direction: 'rising', slope: 1, changePercent: 5, confidence: 'low' },
    ])
    expect(recs).toHaveLength(0)
  })
})

describe('buildExecutiveSummary', () => {
  it('summarizes the biggest win and concern', () => {
    const summary = buildExecutiveSummary([
      { metricKey: 'followers_total', direction: 'rising', slope: 1, changePercent: 12, confidence: 'high' },
      { metricKey: 'audience_churn', direction: 'rising', slope: 1, changePercent: 20, confidence: 'medium' },
    ])
    expect(summary.text).toMatch(/Followers/)
    expect(summary.supportingMetricKeys).toContain('followers_total')
    expect(summary.supportingMetricKeys).toContain('audience_churn')
  })

  it('handles no usable trends', () => {
    const summary = buildExecutiveSummary([])
    expect(summary.confidence).toBe('low')
    expect(summary.text).toMatch(/not enough data/i)
  })
})

describe('AIIntelligenceEngine.analyze', () => {
  it('produces trends, forecasts, recommendations, and a summary', () => {
    const engine = new AIIntelligenceEngine()
    const result = engine.analyze({
      series: {
        followers_total: [100, 110, 120, 130, 140, 150],
        audience_churn: [2, 3, 4, 5, 6, 7],
      },
      dataQuality: 'verified',
      forecastHorizon: 3,
    })
    expect(result.trends).toHaveLength(2)
    expect(result.forecasts).toHaveLength(2)
    expect(result.executiveSummary.text.length).toBeGreaterThan(0)
    expect(result.recommendations.length).toBeGreaterThan(0)
  })
})
