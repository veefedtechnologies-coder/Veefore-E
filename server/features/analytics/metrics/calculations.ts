/**
 * Veefore Analytics — Metric Calculations (Phase 2).
 *
 * Pure, deterministic functions implementing the calculated-metric formulas
 * defined in the Metrics Dictionary (02-metrics-dictionary.md, Ch 12–19). These
 * are the single source of truth for derived metrics so every dashboard, report,
 * and AI explanation computes identically (Ch 4 consistency; CODING_RULES Rule 9
 * — analytics logic lives on the backend).
 *
 * Conventions:
 *  • Every function returns `number | null`. `null` means "not computable"
 *    (missing/invalid inputs, or division by zero) — never a fabricated value.
 *  • Percentage results are rounded to {@link DEFAULT_PRECISION} decimals for
 *    stable, comparable output. Raw ratios keep the same precision.
 *  • Only formulas explicitly documented (or standard, unambiguous deterministic
 *    derivations of a documented metric) are implemented here.
 */

/** Default decimal precision for rate/ratio outputs. */
export const DEFAULT_PRECISION = 2

/** True only for finite, real numbers. */
function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/** Round to `precision` decimals, guarding against float noise. */
export function round(value: number, precision: number = DEFAULT_PRECISION): number {
  const factor = 10 ** precision
  return Math.round((value + Number.EPSILON) * factor) / factor
}

/**
 * Divide `numerator / denominator`, returning `null` when the denominator is
 * zero/negative or either input is invalid. The shared guard behind every rate.
 */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator)) return null
  if (denominator <= 0) return null
  return numerator / denominator
}

/**
 * Percentage of `part` relative to `whole`: `part / whole * 100`.
 * Returns `null` when not computable.
 */
export function percentage(part: number, whole: number): number | null {
  const ratio = safeDivide(part, whole)
  return ratio === null ? null : round(ratio * 100)
}

// ── Audience / Followers ─────────────────────────────────────────────────────

/** Follower Growth = Current Followers − Previous Followers (Ch 12). */
export function followerGrowth(current: number, previous: number): number | null {
  if (!isFiniteNumber(current) || !isFiniteNumber(previous)) return null
  return current - previous
}

/** Net Followers = New Followers − Lost Followers (Ch 12). */
export function netFollowers(newFollowers: number, lostFollowers: number): number | null {
  if (!isFiniteNumber(newFollowers) || !isFiniteNumber(lostFollowers)) return null
  return newFollowers - lostFollowers
}

/** Follower Growth Rate = (Net New Followers / Previous Followers) × 100 (Ch 12). */
export function followerGrowthRate(netNewFollowers: number, previousFollowers: number): number | null {
  return percentage(netNewFollowers, previousFollowers)
}

/** Audience Churn = (Lost Followers / Previous Followers) × 100 (Ch 12). */
export function audienceChurn(lostFollowers: number, previousFollowers: number): number | null {
  return percentage(lostFollowers, previousFollowers)
}

/** Audience Retention = 100 − Churn% (Ch 12). */
export function audienceRetention(churnPercent: number): number | null {
  if (!isFiniteNumber(churnPercent)) return null
  return round(100 - churnPercent)
}

// ── Engagement ───────────────────────────────────────────────────────────────

/** Sum of interaction counts: likes + comments + shares + saves. */
export function totalEngagements(
  likes: number,
  comments: number,
  shares: number,
  saves: number
): number | null {
  const parts = [likes, comments, shares, saves]
  if (!parts.every(isFiniteNumber)) return null
  return parts.reduce((sum, n) => sum + n, 0)
}

/**
 * Engagement Rate = Engagements / Base × 100, where Base is Followers, Reach, or
 * Impressions depending on the chosen formula (Ch 15). Use the specific wrappers
 * below to make the denominator explicit at call sites.
 */
export function engagementRate(engagements: number, base: number): number | null {
  return percentage(engagements, base)
}

export const engagementRateByFollowers = engagementRate
export const engagementRateByReach = engagementRate
export const engagementRateByImpressions = engagementRate

/**
 * Share Rate = Shares / Reach × 100. The dictionary names "Share Rate" (Ch 15)
 * but does not fix its denominator; we mirror the documented engagement-rate-by-
 * reach convention (Ch 15). Denominator is explicit here for auditability.
 */
export function shareRate(shares: number, reach: number): number | null {
  return percentage(shares, reach)
}

/** Save Rate = Saves / Reach × 100 (denominator per the Share Rate note above). */
export function saveRate(saves: number, reach: number): number | null {
  return percentage(saves, reach)
}

/** Engagement Velocity = Engagements gained per hour (Ch 15 "Engagement Velocity"). */
export function engagementVelocity(engagementsGained: number, hours: number): number | null {
  const perHour = safeDivide(engagementsGained, hours)
  return perHour === null ? null : round(perHour)
}

// ── Reach & Impressions ──────────────────────────────────────────────────────

/** Reach Efficiency = Reach / Followers (Ch 13). Returns a ratio, not a percent. */
export function reachEfficiency(reach: number, followers: number): number | null {
  const ratio = safeDivide(reach, followers)
  return ratio === null ? null : round(ratio)
}

/** Reach Velocity = Reach gained per hour (Ch 13). */
export function reachVelocity(reachGained: number, hours: number): number | null {
  const perHour = safeDivide(reachGained, hours)
  return perHour === null ? null : round(perHour)
}

/**
 * Average Frequency = Impressions / Reach (Ch 14). Standard, deterministic
 * derivation of the documented "Average Frequency" metric. Returns a ratio.
 */
export function averageFrequency(impressions: number, reach: number): number | null {
  const ratio = safeDivide(impressions, reach)
  return ratio === null ? null : round(ratio)
}

// ── Clicks ───────────────────────────────────────────────────────────────────

/**
 * Click-Through Rate = Clicks / Base × 100, where Base is Impressions or Reach.
 * Denominator is explicit at the call site.
 */
export function clickThroughRate(clicks: number, base: number): number | null {
  return percentage(clicks, base)
}

// ── Video ────────────────────────────────────────────────────────────────────

/**
 * Completion Rate = Completed Views / Views × 100 (Ch 16). Standard deterministic
 * derivation of the documented "Completion Rate" metric.
 */
export function completionRate(completions: number, views: number): number | null {
  return percentage(completions, views)
}

/**
 * Average Watch Time = Total Watch Time (seconds) / Views (Ch 16). Standard
 * deterministic derivation. Returns seconds.
 */
export function averageWatchTime(totalWatchSeconds: number, views: number): number | null {
  const avg = safeDivide(totalWatchSeconds, views)
  return avg === null ? null : round(avg)
}

// ── Publishing ─────────────────────────────────────────────────────────────

/** Publishing Success Rate = Published / Total × 100 (Ch 18). */
export function publishingSuccessRate(published: number, total: number): number | null {
  return percentage(published, total)
}

/** Publishing Failure Rate = Failed / Total × 100 (Ch 18). */
export function publishingFailureRate(failed: number, total: number): number | null {
  return percentage(failed, total)
}
