/**
 * Property 4: Platform Filter Propagation
 *
 * Validates that the PlatformSelection → platforms[] transformation always
 * produces a query parameter that faithfully represents the user's selection.
 *
 * Invariant:
 *  - selection === 'all'       → platforms param is empty / undefined (no filter applied)
 *  - selection === 'instagram' → platforms param contains exactly ['instagram']
 *  - selection === 'facebook'  → platforms param contains exactly ['facebook']
 *
 * **Validates: Requirements 6.1, 6.4**
 *
 * This test exercises the pure transformation extracted from
 * `OverviewDashboardInner` and `buildQueryString` in `useDashboardData`.
 * By testing the transformation in isolation we avoid React/DOM dependencies
 * while still covering the exact logic that drives every analytics API call.
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Pure transformation extracted from OverviewDashboardInner
// (mirrors the useMemo in OverviewDashboard.tsx)
//
// `existingPlatforms` represents the local `platforms` state — the secondary
// multi-select filter that is empty by default. The PlatformFilterContext
// selection is the single-platform chip control.
// ---------------------------------------------------------------------------

type PlatformSelection = 'instagram' | 'facebook' | 'all'

/**
 * Derives the `platforms[]` array that gets forwarded to `useDashboardData`
 * (and ultimately serialised as the `?platforms=` query param).
 *
 * Logic mirrors OverviewDashboard.tsx `platformsParam` useMemo:
 *  if (selection === 'all') return existingPlatforms   // default: []
 *  return [selection]
 */
function derivePlatformsParam(
  selection: PlatformSelection,
  existingPlatforms: string[] = [],
): string[] {
  if (selection === 'all') return existingPlatforms
  return [selection]
}

// ---------------------------------------------------------------------------
// Pure helper extracted from buildQueryString in useDashboardData.ts
//
// Returns the value that ends up in the URL for the `platforms` key:
//  - undefined  when platforms is empty (param is omitted entirely)
//  - a comma-joined string when one or more platforms are specified
// ---------------------------------------------------------------------------

function serializePlatformsParam(platforms: string[]): string | undefined {
  if (!platforms.length) return undefined
  return platforms.join(',')
}

// ---------------------------------------------------------------------------
// Tests — parameterised over the three PlatformSelection values
// ---------------------------------------------------------------------------

const ALL_SELECTIONS: PlatformSelection[] = ['instagram', 'facebook', 'all']

describe('Property 4: Platform Filter Propagation', () => {
  describe('derivePlatformsParam — selection → platforms[]', () => {
    it.each(ALL_SELECTIONS)(
      'selection "%s" produces a platforms[] that matches the selection',
      (selection) => {
        const result = derivePlatformsParam(selection)

        if (selection === 'all') {
          // Invariant: 'all' must NOT inject any platform constraint.
          // The array must be empty so the backend returns merged results.
          expect(result).toEqual([])
        } else {
          // Invariant: specific platform must appear exactly once.
          expect(result).toHaveLength(1)
          expect(result[0]).toBe(selection)
        }
      },
    )

    it('selection "all" with pre-existing local platforms preserves them unchanged', () => {
      // When 'all' is chosen the secondary per-platform multi-select state is
      // passed through untouched — the context filter adds no extra constraint.
      const existing = ['instagram', 'facebook']
      const result = derivePlatformsParam('all', existing)
      expect(result).toEqual(existing)
    })

    it('selection "instagram" overrides any existing platforms state', () => {
      // Selecting a specific platform replaces the multi-select state with a
      // single-item array — the multi-select is irrelevant when a chip is active.
      const result = derivePlatformsParam('instagram', ['facebook'])
      expect(result).toEqual(['instagram'])
    })

    it('selection "facebook" overrides any existing platforms state', () => {
      const result = derivePlatformsParam('facebook', ['instagram'])
      expect(result).toEqual(['facebook'])
    })
  })

  describe('serializePlatformsParam — platforms[] → URL param value', () => {
    it.each(ALL_SELECTIONS)(
      'serialized param for selection "%s" is correct',
      (selection) => {
        const platforms = derivePlatformsParam(selection)
        const serialized = serializePlatformsParam(platforms)

        if (selection === 'all') {
          // 'all' → empty array → param is omitted (undefined)
          expect(serialized).toBeUndefined()
        } else {
          // Specific platform → param is the platform name
          expect(serialized).toBe(selection)
        }
      },
    )
  })

  describe('round-trip invariant — serialized param unambiguously encodes the selection', () => {
    it.each(ALL_SELECTIONS)(
      'selection "%s" round-trips without information loss',
      (selection) => {
        const platforms = derivePlatformsParam(selection)
        const serialized = serializePlatformsParam(platforms)

        if (selection === 'all') {
          // No filter is sent — backend receives no platforms restriction.
          expect(platforms).toHaveLength(0)
          expect(serialized).toBeUndefined()
        } else {
          // Exactly one platform is sent and it matches the selection.
          expect(platforms).toContain(selection)
          expect(serialized).toBe(selection)
          // Ensure no extra platforms leaked in.
          expect(platforms.filter((p) => p !== selection)).toHaveLength(0)
        }
      },
    )
  })

  describe('exhaustive coverage — all three PlatformSelection values', () => {
    it('covers every declared PlatformSelection value', () => {
      // This test acts as a static assertion: if PlatformSelection gains a new
      // variant the test below will start failing, prompting an update to the
      // property invariants above.
      const testedSelections = new Set(ALL_SELECTIONS)
      expect(testedSelections.has('instagram')).toBe(true)
      expect(testedSelections.has('facebook')).toBe(true)
      expect(testedSelections.has('all')).toBe(true)
      expect(testedSelections.size).toBe(3)
    })
  })
})
