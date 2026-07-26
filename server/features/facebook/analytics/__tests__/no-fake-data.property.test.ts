/**
 * Property-Based Test: No-Fake-Data Invariant (Property 5)
 *
 * For any metric key where `CapabilityGuard.getMetricSupport(platform, key) === 'NONE'`,
 * the normalized metric result object never contains that key — not even as `0` or `null`.
 *
 * Invariant: `supportLevel === 'NONE'` implies `!(key in normalizedResult.metrics)`
 *
 * Scenarios covered:
 *   1. `saves` on Facebook — declared NONE in the registry
 *   2. `facebook_reactions` on Instagram — declared NONE in the registry
 *   3. `facebook_page_views` on Instagram — declared NONE in the registry
 *   4. Every NONE metric key from both platforms, via fast-check generators
 *
 * **Validates: Requirements 5.6, 6.5, 12.6**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { CapabilityGuard, PLATFORM_REGISTRY } from '../../../../../src/shared/platform-registry/index'
import type { PlatformId } from '../../../../../src/shared/platform-registry/types'

// ---------------------------------------------------------------------------
// Helpers — pure normalization functions extracted from providers
//
// Rather than invoking the real providers (which require live HTTP + GovernedHttpClient),
// we replicate the exact normalization mapping used by FacebookProvider.getAnalytics()
// and InstagramProvider.getAnalytics(). These functions are pure transformations of
// raw-API-shaped objects and carry zero side effects.
// ---------------------------------------------------------------------------

/**
 * Mirrors the normalization logic inside `FacebookProvider.getAnalytics()`.
 * Given a raw record (any subset of Facebook API fields), returns the
 * NormalizedMetricResult metrics map, omitting null/undefined values.
 */
function normalizeFacebookRaw(raw: Record<string, number | null | undefined>): Record<string, number> {
  const metrics: Record<string, number> = {}

  // Mirrors mapFacebookRawMetrics (post 2024-03-14 deprecation): page_impressions*
  // / page_fans* were removed by Meta and are replaced by the valid names below.
  if (raw.page_fan_count != null) metrics.followers_total = raw.page_fan_count
  if (raw.page_follows != null) metrics.followers_total = raw.page_follows
  if (raw.page_posts_impressions_organic != null) {
    metrics.impressions_total = raw.page_posts_impressions_organic
  }
  if (raw.page_post_engagements != null) metrics.total_engagements = raw.page_post_engagements
  if (raw.page_actions_post_reactions_like_total != null) metrics.likes = raw.page_actions_post_reactions_like_total
  if (raw.page_video_views != null) {
    metrics.video_views = raw.page_video_views
  }
  if (raw.page_views_total != null) {
    // page_views_total maps to reach_total (unique page visitors as reach proxy),
    // profile_visits, and facebook_page_views
    metrics.reach_total = raw.page_views_total
    metrics.profile_visits = raw.page_views_total
    metrics.facebook_page_views = raw.page_views_total
  }
  // Historical reach: if page_impressions_unique exists (pre-deprecation data), prefer it
  if (raw.page_impressions_unique != null) {
    metrics.reach_total = raw.page_impressions_unique
  }
  if (raw.page_daily_follows != null) metrics.new_followers = raw.page_daily_follows
  if (raw.page_daily_unfollows_unique != null) metrics.lost_followers = raw.page_daily_unfollows_unique
  if (raw.published_posts != null) metrics.published_posts = raw.published_posts
  if (raw.page_actions_post_reactions_total != null) metrics.facebook_reactions = raw.page_actions_post_reactions_total
  if (raw.post_clicks_total != null) metrics.facebook_post_clicks = raw.post_clicks_total

  // NOTE: `saves` has no raw Facebook API field — so it can never end up in
  // this result under normal operation. We test that an adversarial raw input
  // that sneaks in a `saves` key is never forwarded to the output.
  // The real provider does not map any raw field → `saves`, so this invariant
  // holds structurally.  The test below adds a `saves` key directly to the
  // raw object to confirm the normalization function ignores it.

  return metrics
}

/**
 * Mirrors the normalization logic inside `InstagramProvider.getAnalytics()`.
 * Given a raw insights object, returns the normalized metrics map.
 * Facebook-specific keys (`facebook_reactions`, `facebook_page_views`) must
 * never appear in the result, because the Instagram normalization path has
 * no mapping for them.
 */
function normalizeInstagramRaw(raw: {
  follower_count?: number | null
  reach_days_28?: number | null
  reach?: number | null
  impressions?: number | null
  profile_views?: number | null
  website_clicks?: number | null
  // Adversarial fields — should be silently dropped
  facebook_reactions?: number | null
  facebook_page_views?: number | null
  saves?: number | null
}): Record<string, number> {
  const metrics: Record<string, number> = {}

  if (raw.follower_count != null) metrics.followers_total = raw.follower_count
  const reach = raw.reach_days_28 ?? raw.reach
  if (reach != null) metrics.reach_total = reach
  if (raw.impressions != null) metrics.impressions_total = raw.impressions
  if (raw.profile_views != null) metrics.profile_visits = raw.profile_views
  if (raw.website_clicks != null) metrics.website_clicks = raw.website_clicks

  // The Instagram normalization path MUST NOT forward facebook_reactions,
  // facebook_page_views, or any key declared NONE for instagram.

  return metrics
}

// ---------------------------------------------------------------------------
// Collect NONE metric keys per platform from the live registry
// ---------------------------------------------------------------------------

function getNoneMetricKeys(platform: PlatformId): string[] {
  return Object.entries(PLATFORM_REGISTRY[platform].analytics.metrics)
    .filter(([, level]) => level === 'NONE')
    .map(([key]) => key)
}

const facebookNoneKeys = getNoneMetricKeys('facebook')   // ['saves']
const instagramNoneKeys = getNoneMetricKeys('instagram') // ['facebook_reactions', 'facebook_page_views']

// ---------------------------------------------------------------------------
// Arbitrary generators
// ---------------------------------------------------------------------------

/**
 * Generates a raw Facebook API insights record that includes ALL possible
 * output metric keys (normal and adversarial), with arbitrary numeric values
 * or null, across any permutation of present/absent fields.
 *
 * This represents the worst-case adversarial input: even if a raw key for a
 * NONE metric somehow appeared in the raw response, the normalization function
 * must not forward it.
 */
const arbitraryFacebookRaw = fc.record(
  {
    // Normal fields that have valid (post-2024) Facebook API mappings
    page_fan_count:                          fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    page_follows:                            fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    page_posts_impressions_organic:          fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    // Historical reach (pre-2024 deprecation) — may exist in stored rollups
    page_impressions_unique:                 fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    page_post_engagements:                   fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    page_actions_post_reactions_like_total:  fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    page_video_views:                        fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    page_views_total:                        fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    page_daily_follows:                      fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    page_daily_unfollows_unique:             fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    published_posts:                         fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: null }),
    page_actions_post_reactions_total:       fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    // post_clicks_total: sum of per-post post_clicks (confirmed valid API metric)
    post_clicks_total:                       fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    // Adversarial: `saves` is a NONE metric for Facebook; if it sneaks into the
    // raw record (e.g., due to a future API change), normalization must discard it.
    saves:                                   fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
  },
  { requiredKeys: [] }
)

/**
 * Generates a raw Instagram insights object that includes both normal fields
 * and adversarial Facebook-specific keys that must never appear in the output.
 */
const arbitraryInstagramRaw = fc.record(
  {
    // Normal Instagram insight fields
    follower_count:        fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    reach_days_28:         fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    reach:                 fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    impressions:           fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    profile_views:         fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    website_clicks:        fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    // Adversarial: Facebook-specific keys declared NONE for Instagram
    facebook_reactions:    fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    facebook_page_views:   fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    // `saves` is FULL on Instagram — it should pass through if the raw field
    // for it existed, but the current Instagram normalization path does not map
    // any raw field → saves (the test confirms saves stays absent)
  },
  { requiredKeys: [] }
)

const ITERATIONS = 500

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: facebook-page-integration, Property 5: No-Fake-Data Invariant', () => {

  // -------------------------------------------------------------------------
  // 5a. Registry sanity: confirm expected NONE declarations
  // -------------------------------------------------------------------------

  describe('5a. Registry declares expected NONE metric keys', () => {
    it('facebook registry declares `saves` as NONE', () => {
      expect(CapabilityGuard.getMetricSupport('facebook', 'saves')).toBe('NONE')
    })

    it('instagram registry declares `facebook_reactions` as NONE', () => {
      expect(CapabilityGuard.getMetricSupport('instagram', 'facebook_reactions')).toBe('NONE')
    })

    it('instagram registry declares `facebook_page_views` as NONE', () => {
      expect(CapabilityGuard.getMetricSupport('instagram', 'facebook_page_views')).toBe('NONE')
    })

    it('facebook has at least one NONE metric key', () => {
      expect(facebookNoneKeys.length).toBeGreaterThanOrEqual(1)
      expect(facebookNoneKeys).toContain('saves')
    })

    it('instagram has at least two NONE metric keys', () => {
      expect(instagramNoneKeys.length).toBeGreaterThanOrEqual(2)
      expect(instagramNoneKeys).toContain('facebook_reactions')
      expect(instagramNoneKeys).toContain('facebook_page_views')
    })
  })

  // -------------------------------------------------------------------------
  // 5b. Facebook normalization — `saves` is never present in output
  // -------------------------------------------------------------------------

  describe('5b. Facebook normalization: NONE metric keys absent from result', () => {
    it('property: for any raw Facebook response, `saves` is never in normalized metrics', () => {
      fc.assert(
        fc.property(arbitraryFacebookRaw, (raw) => {
          const metrics = normalizeFacebookRaw(raw as Record<string, number | null>)

          // Core invariant: `saves` (NONE for facebook) must be absent
          expect('saves' in metrics).toBe(false)

          // Confirm CapabilityGuard agrees with the registry declaration
          expect(CapabilityGuard.getMetricSupport('facebook', 'saves')).toBe('NONE')
        }),
        { numRuns: ITERATIONS }
      )
    })

    it('property: for any raw Facebook response, all NONE-declared keys are absent from normalized metrics', () => {
      fc.assert(
        fc.property(arbitraryFacebookRaw, (raw) => {
          const metrics = normalizeFacebookRaw(raw as Record<string, number | null>)

          for (const noneKey of facebookNoneKeys) {
            expect(noneKey in metrics).toBe(false)
          }
        }),
        { numRuns: ITERATIONS }
      )
    })

    it('adversarial: even when raw input contains a `saves` key with value 0, output excludes it', () => {
      const raw = { page_fan_count: 1000, saves: 0 }
      const metrics = normalizeFacebookRaw(raw)
      expect('saves' in metrics).toBe(false)
    })

    it('adversarial: even when raw input contains a `saves` key with a large positive value, output excludes it', () => {
      const raw = { page_fan_count: 5000, page_posts_impressions_organic: 20000, saves: 999 }
      const metrics = normalizeFacebookRaw(raw)
      expect('saves' in metrics).toBe(false)
      // Other metrics are still present
      expect(metrics.followers_total).toBe(5000)
      expect(metrics.impressions_total).toBe(20000)
    })

    it('adversarial: raw input with only a `saves` field produces an empty metrics object', () => {
      const raw = { saves: 42 }
      const metrics = normalizeFacebookRaw(raw)
      expect(Object.keys(metrics)).toHaveLength(0)
    })

    it('supported Facebook metrics are still present when raw data has valid values', () => {
      // facebook_reactions IS supported (FULL) on Facebook — confirm it appears
      const raw = {
        page_fan_count: 3000,
        page_actions_post_reactions_total: 150,
        saves: 10, // NONE — must be dropped
      }
      const metrics = normalizeFacebookRaw(raw)
      expect(metrics.followers_total).toBe(3000)
      expect(metrics.facebook_reactions).toBe(150)
      expect('saves' in metrics).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // 5c. Instagram normalization — facebook_reactions and facebook_page_views
  //     are never present in output
  // -------------------------------------------------------------------------

  describe('5c. Instagram normalization: NONE metric keys absent from result', () => {
    it('property: for any raw Instagram response, `facebook_reactions` is never in normalized metrics', () => {
      fc.assert(
        fc.property(arbitraryInstagramRaw, (raw) => {
          const metrics = normalizeInstagramRaw(raw)

          expect('facebook_reactions' in metrics).toBe(false)
          expect(CapabilityGuard.getMetricSupport('instagram', 'facebook_reactions')).toBe('NONE')
        }),
        { numRuns: ITERATIONS }
      )
    })

    it('property: for any raw Instagram response, `facebook_page_views` is never in normalized metrics', () => {
      fc.assert(
        fc.property(arbitraryInstagramRaw, (raw) => {
          const metrics = normalizeInstagramRaw(raw)

          expect('facebook_page_views' in metrics).toBe(false)
          expect(CapabilityGuard.getMetricSupport('instagram', 'facebook_page_views')).toBe('NONE')
        }),
        { numRuns: ITERATIONS }
      )
    })

    it('property: for any raw Instagram response, all NONE-declared keys are absent from normalized metrics', () => {
      fc.assert(
        fc.property(arbitraryInstagramRaw, (raw) => {
          const metrics = normalizeInstagramRaw(raw)

          for (const noneKey of instagramNoneKeys) {
            expect(noneKey in metrics).toBe(false)
          }
        }),
        { numRuns: ITERATIONS }
      )
    })

    it('adversarial: even when raw input contains `facebook_reactions` with value 0, output excludes it', () => {
      const raw = { follower_count: 2000, facebook_reactions: 0 }
      const metrics = normalizeInstagramRaw(raw)
      expect('facebook_reactions' in metrics).toBe(false)
      expect(metrics.followers_total).toBe(2000)
    })

    it('adversarial: even when raw input contains `facebook_page_views` with a positive value, output excludes it', () => {
      const raw = { follower_count: 1500, impressions: 8000, facebook_page_views: 400 }
      const metrics = normalizeInstagramRaw(raw)
      expect('facebook_page_views' in metrics).toBe(false)
      expect(metrics.followers_total).toBe(1500)
      expect(metrics.impressions_total).toBe(8000)
    })

    it('adversarial: raw input with only facebook_reactions and facebook_page_views produces empty metrics', () => {
      const raw = { facebook_reactions: 100, facebook_page_views: 200 }
      const metrics = normalizeInstagramRaw(raw)
      expect(Object.keys(metrics)).toHaveLength(0)
    })

    it('supported Instagram metrics are still present when raw data is valid', () => {
      // `saves` is FULL on Instagram — current normalization does not have a raw→saves
      // mapping, but `follower_count`, `reach`, etc. should pass through normally
      const raw = {
        follower_count: 5000,
        reach_days_28: 12000,
        impressions: 30000,
        facebook_reactions: 99,    // NONE — must be dropped
        facebook_page_views: 500,  // NONE — must be dropped
      }
      const metrics = normalizeInstagramRaw(raw)
      expect(metrics.followers_total).toBe(5000)
      expect(metrics.reach_total).toBe(12000)
      expect(metrics.impressions_total).toBe(30000)
      expect('facebook_reactions' in metrics).toBe(false)
      expect('facebook_page_views' in metrics).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // 5d. Cross-platform: CapabilityGuard × normalization are consistent
  //     For any platform and any metric key declared NONE, the metric is
  //     absent from the result of that platform's normalization function.
  // -------------------------------------------------------------------------

  describe('5d. Cross-platform consistency: CapabilityGuard and normalization agree', () => {
    it('property: for any NONE key on Facebook, normalizeFacebookRaw never produces it', () => {
      const noneKeyArb = fc.constantFrom(...facebookNoneKeys)

      fc.assert(
        fc.property(noneKeyArb, arbitraryFacebookRaw, (noneKey, raw) => {
          // Confirm the registry still says NONE (guard against registry mutation)
          expect(CapabilityGuard.getMetricSupport('facebook', noneKey)).toBe('NONE')

          const metrics = normalizeFacebookRaw(raw as Record<string, number | null>)

          // The normalization result must not contain the NONE key
          expect(noneKey in metrics).toBe(false)
        }),
        { numRuns: ITERATIONS }
      )
    })

    it('property: for any NONE key on Instagram, normalizeInstagramRaw never produces it', () => {
      const noneKeyArb = fc.constantFrom(...instagramNoneKeys)

      fc.assert(
        fc.property(noneKeyArb, arbitraryInstagramRaw, (noneKey, raw) => {
          // Confirm the registry still says NONE
          expect(CapabilityGuard.getMetricSupport('instagram', noneKey)).toBe('NONE')

          const metrics = normalizeInstagramRaw(raw)

          // The normalization result must not contain the NONE key
          expect(noneKey in metrics).toBe(false)
        }),
        { numRuns: ITERATIONS }
      )
    })

    it('property: any key in normalized Facebook result has support !== NONE for Facebook', () => {
      fc.assert(
        fc.property(arbitraryFacebookRaw, (raw) => {
          const metrics = normalizeFacebookRaw(raw as Record<string, number | null>)

          for (const key of Object.keys(metrics)) {
            const support = CapabilityGuard.getMetricSupport('facebook', key)
            expect(support).not.toBe('NONE')
          }
        }),
        { numRuns: ITERATIONS }
      )
    })

    it('property: any key in normalized Instagram result has support !== NONE for Instagram', () => {
      fc.assert(
        fc.property(arbitraryInstagramRaw, (raw) => {
          const metrics = normalizeInstagramRaw(raw)

          for (const key of Object.keys(metrics)) {
            const support = CapabilityGuard.getMetricSupport('instagram', key)
            expect(support).not.toBe('NONE')
          }
        }),
        { numRuns: ITERATIONS }
      )
    })
  })
})
