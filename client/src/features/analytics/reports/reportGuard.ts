/**
 * reportGuard.ts
 *
 * Registry-gated section inclusion utility for the report engine.
 *
 * Instead of ever writing `if (platform === 'facebook')` guards inside the
 * export functions, every metric section builder calls
 * `shouldIncludeMetricSection(metricKey, activePlatforms)`.  The function
 * returns `true` only when at least one of the active platforms declares a
 * MetricSupportLevel that is not 'NONE', ensuring no empty rows, zero
 * values, or placeholder text are emitted for entirely-unsupported metrics.
 *
 * Requirements: 9.1, 9.6
 */

import { CapabilityGuard } from '@platform-registry/index'
import type { PlatformId, MetricSupportLevel } from '@platform-registry/types'

// ---------------------------------------------------------------------------
// Re-export PlatformId for convenience so report code imports from one place
// ---------------------------------------------------------------------------
export type { PlatformId, MetricSupportLevel }

/**
 * Returns `true` when at least one platform in `platforms` has a
 * `MetricSupportLevel` other than `'NONE'` for the given `metricKey`.
 *
 * When the `platforms` array is empty (single-platform legacy path) the
 * function returns `true` so existing behaviour is preserved.
 *
 * @example
 * // 'saves' is NONE on Facebook → omit if Facebook-only report
 * shouldIncludeMetricSection('saves', ['facebook'])   // false
 * shouldIncludeMetricSection('saves', ['instagram'])  // true
 * shouldIncludeMetricSection('saves', ['instagram', 'facebook']) // true (Instagram has it)
 * shouldIncludeMetricSection('facebook_reactions', ['instagram']) // false
 * shouldIncludeMetricSection('facebook_reactions', ['facebook'])  // true
 */
export function shouldIncludeMetricSection(
  metricKey: string,
  platforms: PlatformId[],
): boolean {
  // Legacy / single-platform callers that pass an empty array: always include
  if (platforms.length === 0) return true

  return platforms.some(
    (p) => CapabilityGuard.getMetricSupport(p, metricKey) !== 'NONE',
  )
}

/**
 * Returns the set of platforms that have at least PARTIAL support for the
 * given metric key.  Used to decide which platform-branded columns or rows
 * to include in comparison charts and multi-platform tables.
 *
 * @example
 * getSupportingPlatforms('saves', ['instagram', 'facebook'])
 * // ['instagram']  — Facebook returns NONE for 'saves'
 */
export function getSupportingPlatforms(
  metricKey: string,
  platforms: PlatformId[],
): PlatformId[] {
  return platforms.filter(
    (p) => CapabilityGuard.getMetricSupport(p, metricKey) !== 'NONE',
  )
}

/**
 * Returns true when BOTH platforms declare `FULL` or `PARTIAL` support for
 * the metric — the condition for including a side-by-side comparison column
 * in multi-platform exports (Requirement 9.3).
 */
export function isComparisonMetric(
  metricKey: string,
  platforms: PlatformId[],
): boolean {
  if (platforms.length < 2) return false
  const comparisonLevels: MetricSupportLevel[] = ['FULL', 'PARTIAL']
  return platforms.every((p) =>
    comparisonLevels.includes(CapabilityGuard.getMetricSupport(p, metricKey)),
  )
}

/**
 * Human-readable display name for a platform, used in column headers and
 * section labels so report code never hard-codes platform names.
 */
export function platformDisplayName(platform: PlatformId): string {
  const names: Record<PlatformId, string> = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    youtube: 'YouTube',
    tiktok: 'TikTok',
    pinterest: 'Pinterest',
    x: 'X (Twitter)',
    threads: 'Threads',
  }
  return names[platform] ?? platform
}
