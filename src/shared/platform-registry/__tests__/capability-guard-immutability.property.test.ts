/**
 * Property 1: CapabilityGuard Immutability
 *
 * For any platform + any attempt to mutate the registry after initialization,
 * `getMetricSupport()` returns the original declared value unchanged.
 *
 * Invariant: `mutate(registry); result = getMetricSupport(p, k)` must equal
 * the pre-mutation value for all `p`, `k`.
 *
 * Validates: Requirements 1.7
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { PLATFORM_REGISTRY, CapabilityGuard } from '../index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect all metric keys that are explicitly declared in the registry for
 * both instagram and facebook so we can generate arbitrary (platform, key)
 * pairs with known pre-mutation values.
 */
function collectDeclaredMetricKeys(): string[] {
  const keys = new Set<string>()
  for (const platformData of Object.values(PLATFORM_REGISTRY)) {
    for (const key of Object.keys(platformData.analytics.metrics)) {
      keys.add(key)
    }
  }
  return Array.from(keys)
}

const declaredKeys = collectDeclaredMetricKeys()

// ---------------------------------------------------------------------------
// Property 1: Registry immutability — getMetricSupport returns original value
// after any mutation attempt
// ---------------------------------------------------------------------------

describe('Property 1 — CapabilityGuard Immutability (Requirement 1.7)', () => {
  it('getMetricSupport returns the original value after direct mutation attempt on metrics object', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('instagram', 'facebook'),
        fc.oneof(
          fc.constantFrom(...declaredKeys),    // known metric keys
          fc.string({ minLength: 1, maxLength: 30 }), // arbitrary unknown keys
        ),
        (platform, metricKey) => {
          // Step 1: capture the original declared value BEFORE any mutation attempt
          const originalValue = CapabilityGuard.getMetricSupport(
            platform as 'instagram' | 'facebook',
            metricKey,
          )

          // Step 2: attempt to mutate the metrics map for the specific platform
          // The registry is deeply frozen, so this is silently rejected in
          // non-strict mode and throws a TypeError in strict mode — but in
          // either case the original value must be preserved.
          try {
            ;(PLATFORM_REGISTRY as any)[platform].analytics.metrics[metricKey] = 'NONE'
          } catch {
            // TypeError thrown in strict mode — mutation was correctly blocked
          }

          // Step 3: attempt to mutate the analytics object itself
          try {
            ;(PLATFORM_REGISTRY as any)[platform].analytics = { metrics: {} }
          } catch {
            // mutation blocked — expected
          }

          // Step 4: attempt to replace the platform entry entirely
          try {
            ;(PLATFORM_REGISTRY as any)[platform] = undefined
          } catch {
            // mutation blocked — expected
          }

          // Step 5: query again — must still return the pre-mutation value
          const postMutationValue = CapabilityGuard.getMetricSupport(
            platform as 'instagram' | 'facebook',
            metricKey,
          )

          return postMutationValue === originalValue
        },
      ),
      { numRuns: 200 },
    )
  })

  it('getMetricSupport returns the original value after a bulk wipe attempt on the metrics object', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('instagram', 'facebook'),
        fc.constantFrom(...declaredKeys),
        (platform, metricKey) => {
          const originalValue = CapabilityGuard.getMetricSupport(
            platform as 'instagram' | 'facebook',
            metricKey,
          )

          // Attempt to delete every key in the metrics map via Object.keys
          try {
            const metricsRef = (PLATFORM_REGISTRY as any)[platform].analytics.metrics
            for (const k of Object.keys(metricsRef)) {
              delete metricsRef[k]
            }
          } catch {
            // Frozen — expected
          }

          const postMutationValue = CapabilityGuard.getMetricSupport(
            platform as 'instagram' | 'facebook',
            metricKey,
          )

          return postMutationValue === originalValue
        },
      ),
      { numRuns: 100 },
    )
  })

  it('PLATFORM_REGISTRY top-level is frozen', () => {
    expect(Object.isFrozen(PLATFORM_REGISTRY)).toBe(true)
  })

  it('PLATFORM_REGISTRY platform entries are frozen', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('instagram', 'facebook'),
        (platform) => Object.isFrozen(PLATFORM_REGISTRY[platform as 'instagram' | 'facebook']),
      ),
    )
  })

  it('PLATFORM_REGISTRY analytics.metrics objects are frozen', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('instagram', 'facebook'),
        (platform) =>
          Object.isFrozen(
            PLATFORM_REGISTRY[platform as 'instagram' | 'facebook'].analytics.metrics,
          ),
      ),
    )
  })
})
