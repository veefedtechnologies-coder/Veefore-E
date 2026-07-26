/**
 * bestTimeEngine — Unified "Best Time to Post" algorithm.
 *
 * Fuses three independent signals into one 7×24 (day-of-week × hour) score grid:
 *   1. Audience online   — how many followers are online per slot (Meta online_followers, 30-day avg)
 *   2. Performance       — our proven V4.6 model: weighted engagement (saves×2, comments/shares×1.5,
 *                          likes×1) amplified by log-reach, averaged per slot (from Content metrics)
 *   3. Reach / views     — how many impressions your posts earned per slot (from Content metrics)
 *
 * The performance signal carries forward the original V4.6 "AI Post Performance Model"
 * scoring — but drops its hard-coded IST timezone assumption and blends it with live
 * audience-online telemetry, making it timezone-correct and forward-looking.
 *
 * All inputs come from the database (SocialAccount.audienceActiveTimeWeekly and the
 * Content collection). This module is PURE — no DB or network calls — so it is fully
 * testable and deterministic. The route layer gathers the raw data and calls compute().
 *
 * Output includes the single best slot, the best DAY of the week, the best hour for
 * every day, the top slots, a normalized heatmap, and a confidence score.
 *
 * DOW convention: 0 = Sunday … 6 = Saturday. Hour: 0–23 (local server time of stored data).
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface BestTimePostInput {
  /** ISO date/string the post went live */
  publishedAt: string | Date
  reach?: number
  impressions?: number
  views?: number
  likes?: number
  comments?: number
  saves?: number
  shares?: number
}

export interface BestTimeEngineInput {
  /** "DOW_HOUR" → avg followers online (SocialAccount.audienceActiveTimeWeekly) */
  weeklyActive?: Record<string, number>
  /** "hour" → avg followers online (SocialAccount.audienceActiveTime) — fallback when weekly is empty */
  hourlyActive?: Record<string, number>
  /** Published posts with metrics from the Content collection */
  posts?: BestTimePostInput[]
  /** Reference "now" for the next-occurrence forward scan. Defaults to new Date(). Exposed for tests. */
  now?: Date
}

export interface RankedSlot {
  dow: number
  dayName: string
  hour: number
  hourLabel: string
  score: number // 0–100
}

export interface DailyBest {
  dow: number
  dayName: string
  hour: number
  hourLabel: string
  score: number // 0–100, best hour of this day relative to global max
  dayScore: number // 0–100, this day's total strength relative to best day
}

export interface BestTimeResult {
  /** "DOW_HOUR" → 0–100 combined score, for the heatmap */
  combinedGrid: Record<string, number>
  /** The single best day+hour to post */
  bestSlot: RankedSlot | null
  /** The best DAY of the week (aggregated across all hours) */
  bestDay: { dow: number; dayName: string; score: number; bestHour: number; hourLabel: string } | null
  /** Best hour for each of the 7 days, ordered Sun→Sat */
  dailyBest: DailyBest[]
  /** Top 5 day+hour slots overall */
  topSlots: RankedSlot[]
  /** 0–100 confidence in the recommendation */
  confidence: number
  confidenceLevel: 'High' | 'Medium' | 'Low' | 'Learning'
  /** Which signals contributed to the score */
  signals: { audience: boolean; engagement: boolean; reach: boolean }
  /** How much data backed the analysis */
  meta: { postsAnalyzed: number; usablePosts: number; audienceSlots: number; zScore: number }
  /** Human-readable one-liner, e.g. "Wednesday at 7 PM" */
  summary: string
  /**
   * The next upcoming calendar date/time (from `now`) that hits a qualifying slot
   * (score ≥ 5% of the grid max — same sensitivity threshold as the V4.6 engine),
   * scanning forward up to 7 days. Falls back to the next occurrence of bestSlot
   * if nothing clears the threshold within a week. Null if there's no signal at all.
   */
  nextOccurrence: { date: Date; dow: number; dayName: string; hour: number; hourLabel: string; score: number } | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function hourLabel(h: number): string {
  const hh = h % 12 || 12
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${hh} ${ap}`
}

function key(dow: number, hour: number): string {
  return `${dow}_${hour}`
}

/** Normalize a value map so the largest becomes 1.0; empty/zero-max maps return {}. */
function normalizeMap(m: Record<string, number>): Record<string, number> {
  const max = Math.max(0, ...Object.values(m))
  if (max <= 0) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(m)) {
    if (v > 0) out[k] = v / max
  }
  return out
}

/**
 * Support/shrinkage factor for post-derived signals. A slot backed by only one
 * post shouldn't beat a slot backed by ten. count/(count+K) grows toward 1 as
 * evidence accumulates (K=2 → 1 post≈0.33, 3≈0.60, 8≈0.80).
 */
function support(count: number): number {
  return count / (count + 2)
}

// ── Main computation ─────────────────────────────────────────────────────────

export function computeBestTime(input: BestTimeEngineInput): BestTimeResult {
  const weeklyActive = input.weeklyActive ?? {}
  const hourlyActive = input.hourlyActive ?? {}
  const posts = input.posts ?? []

  // ── 1. Build raw per-slot signal grids ──────────────────────────────────
  // Audience: prefer the weekly (DOW×hour) grid; if only hourly exists, broadcast
  // each hour value across all 7 days so the audience signal still contributes.
  const audienceRaw: Record<string, number> = {}
  if (Object.keys(weeklyActive).length > 0) {
    for (const [k, v] of Object.entries(weeklyActive)) {
      if (typeof v === 'number' && v > 0) audienceRaw[k] = v
    }
  } else if (Object.keys(hourlyActive).length > 0) {
    for (const [h, v] of Object.entries(hourlyActive)) {
      if (typeof v === 'number' && v > 0) {
        const hour = parseInt(h, 10)
        if (Number.isFinite(hour)) {
          for (let dow = 0; dow < 7; dow++) audienceRaw[key(dow, hour)] = v
        }
      }
    }
  }

  // ── 1b. Score every post, then apply the V4.6 noise filter ──────────────
  // Performance score — carried over from our proven V4.6 engine. Weighted
  // engagement (saves and comments signal stronger intent than likes) amplified
  // by log-reach so a genuinely viral slot ranks higher, but one mega-post can't
  // completely drown out consistently good slots (log dampens the tail):
  //   perf = (likes + comments×1.5 + saves×2 + shares×1.5) × (1 + log10(reach))
  const scoredPosts = posts
    .map((post) => {
      const when = post.publishedAt ? new Date(post.publishedAt) : null
      if (!when || isNaN(when.getTime())) return null
      const reach = post.reach ?? 0
      const weightedEng =
        (post.likes ?? 0) +
        (post.comments ?? 0) * 1.5 +
        (post.saves ?? 0) * 2 +
        (post.shares ?? 0) * 1.5
      const perf = weightedEng * (reach > 0 ? 1 + Math.log10(reach) : 1)
      const imp = (post.views ?? 0) > 0 ? (post.views as number)
        : (post.impressions ?? 0) > 0 ? (post.impressions as number)
        : reach
      return { dow: when.getDay(), hour: when.getHours(), perf, imp }
    })
    .filter((p): p is { dow: number; hour: number; perf: number; imp: number } => p !== null)

  // V4.6 noise filter: discard posts scoring below 10% of the average performance
  // score before they influence any slot average. A couple of flukes (very low
  // engagement outliers) shouldn't drag down an otherwise strong time slot.
  const avgPerf = scoredPosts.length
    ? scoredPosts.reduce((a, p) => a + p.perf, 0) / scoredPosts.length
    : 0
  const usablePosts = avgPerf > 0
    ? scoredPosts.filter((p) => p.perf >= avgPerf * 0.1)
    : scoredPosts

  // Post-derived signals: accumulate per-slot impressions and engagement-rate.
  const reachSums: Record<string, number> = {}
  const reachCounts: Record<string, number> = {}
  const engSums: Record<string, number> = {}
  const engCounts: Record<string, number> = {}

  for (const post of usablePosts) {
    const k = key(post.dow, post.hour)
    if (post.imp > 0) {
      reachSums[k] = (reachSums[k] ?? 0) + post.imp
      reachCounts[k] = (reachCounts[k] ?? 0) + 1
    }
    if (post.perf > 0) {
      engSums[k] = (engSums[k] ?? 0) + post.perf
      engCounts[k] = (engCounts[k] ?? 0) + 1
    }
  }

  const reachAvg: Record<string, number> = {}
  for (const [k, sum] of Object.entries(reachSums)) reachAvg[k] = sum / (reachCounts[k] || 1)
  const engAvg: Record<string, number> = {}
  for (const [k, sum] of Object.entries(engSums)) engAvg[k] = sum / (engCounts[k] || 1)

  // ── 2. Normalize each signal to 0–1 ─────────────────────────────────────
  const audienceNorm = normalizeMap(audienceRaw)
  const reachNorm = normalizeMap(reachAvg)
  const engNorm = normalizeMap(engAvg)

  const hasAudience = Object.keys(audienceNorm).length > 0
  const hasReach = Object.keys(reachNorm).length > 0
  const hasEng = Object.keys(engNorm).length > 0

  // ── 3. Adaptive weights based on which signals are available ─────────────
  // Audience-online is the strongest FORWARD-looking signal (it predicts who will
  // see the post now), so it gets the most weight when present. The performance
  // score (our V4.6 weighted-engagement × log-reach model) is the best QUALITY
  // signal from history. Reach is a secondary raw-volume signal.
  let wAud = 0, wEng = 0, wReach = 0
  if (hasAudience && (hasEng || hasReach)) {
    wAud = 0.45; wEng = hasEng ? 0.35 : 0; wReach = hasReach ? 0.20 : 0
  } else if (hasAudience) {
    wAud = 1
  } else if (hasEng || hasReach) {
    wEng = hasEng ? 0.6 : 0; wReach = hasReach ? 0.4 : 0
  }
  // Renormalize weights so they always sum to 1 over the available signals.
  const wSum = wAud + wEng + wReach || 1
  wAud /= wSum; wEng /= wSum; wReach /= wSum

  // ── 4. Fuse into a combined 7×24 grid ────────────────────────────────────
  const rawCombined: Record<string, number> = {}
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const k = key(dow, hour)
      const aud = audienceNorm[k] ?? 0
      const eng = (engNorm[k] ?? 0) * support(engCounts[k] ?? 0)
      const reach = (reachNorm[k] ?? 0) * support(reachCounts[k] ?? 0)
      const score = wAud * aud + wEng * eng + wReach * reach
      if (score > 0) rawCombined[k] = score
    }
  }

  // Scale combined grid to 0–100.
  const combinedMax = Math.max(0, ...Object.values(rawCombined))
  const combinedGrid: Record<string, number> = {}
  if (combinedMax > 0) {
    for (const [k, v] of Object.entries(rawCombined)) {
      combinedGrid[k] = Math.round((v / combinedMax) * 1000) / 10 // 1dp, 0–100
    }
  }

  // ── 5. Rank slots, days, and per-day best hours ──────────────────────────
  const rankedSlots: RankedSlot[] = Object.entries(combinedGrid)
    .map(([k, score]) => {
      const [dow, hour] = k.split('_').map(Number)
      return { dow, dayName: DAY_NAMES[dow], hour, hourLabel: hourLabel(hour), score }
    })
    .sort((a, b) => b.score - a.score)

  const bestSlot = rankedSlots[0] ?? null
  const topSlots = rankedSlots.slice(0, 5)

  // Best hour per day + per-day aggregate strength.
  const dayTotals: number[] = Array(7).fill(0)
  const dayBestHour: Array<{ hour: number; score: number }> = Array.from({ length: 7 }, () => ({ hour: 0, score: 0 }))
  for (const [k, score] of Object.entries(combinedGrid)) {
    const [dow, hour] = k.split('_').map(Number)
    dayTotals[dow] += score
    if (score > dayBestHour[dow].score) dayBestHour[dow] = { hour, score }
  }

  const maxDayTotal = Math.max(0, ...dayTotals)
  const dailyBest: DailyBest[] = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    dayName: DAY_NAMES[dow],
    hour: dayBestHour[dow].hour,
    hourLabel: hourLabel(dayBestHour[dow].hour),
    score: dayBestHour[dow].score,
    dayScore: maxDayTotal > 0 ? Math.round((dayTotals[dow] / maxDayTotal) * 1000) / 10 : 0,
  }))

  // Best DAY = day with the highest total strength across all its hours.
  let bestDay: BestTimeResult['bestDay'] = null
  if (maxDayTotal > 0) {
    let bestDow = 0
    for (let d = 1; d < 7; d++) if (dayTotals[d] > dayTotals[bestDow]) bestDow = d
    bestDay = {
      dow: bestDow,
      dayName: DAY_NAMES[bestDow],
      score: Math.round((dayTotals[bestDow] / maxDayTotal) * 1000) / 10,
      bestHour: dayBestHour[bestDow].hour,
      hourLabel: hourLabel(dayBestHour[bestDow].hour),
    }
  }

  // ── 6. Confidence ────────────────────────────────────────────────────────
  // Blend two factors:
  //   • Data volume — more posts + more audience coverage ⇒ more trustworthy.
  //   • Separation  — how sharply the best slot stands out above the average
  //     (z-score of the top slot vs the grid mean). A clear peak is more reliable
  //     than a flat grid where every slot looks the same.
  const postsAnalyzed = posts.length
  const usablePostCount = usablePosts.length
  const audienceSlots = Object.keys(audienceNorm).length

  const values = Object.values(combinedGrid)
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const variance = values.length ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length : 0
  const std = Math.sqrt(variance)
  const topVal = bestSlot?.score ?? 0
  const zScore = std > 0 ? (topVal - mean) / std : 0

  const volumeScore = Math.min(1, (Math.min(postsAnalyzed, 20) / 20) * 0.5 + (Math.min(audienceSlots, 48) / 48) * 0.5)
  const separationScore = Math.min(1, zScore / 3)
  const confidence = Math.round((volumeScore * 0.6 + separationScore * 0.4) * 100)

  const confidenceLevel: BestTimeResult['confidenceLevel'] =
    confidence >= 75 ? 'High' : confidence >= 50 ? 'Medium' : confidence >= 25 ? 'Low' : 'Learning'

  // ── 7. Next-occurrence forward scan ──────────────────────────────────────
  // Carried over from the V4.6 engine's "billboard" logic: instead of just
  // reporting the all-time best slot, scan forward hour-by-hour (up to 7 days)
  // for the next slot that clears a 5% sensitivity threshold of the grid's max
  // score. This surfaces genuinely upcoming opportunities (e.g. "your next
  // high-yield window is tomorrow at 7 PM") rather than only historical bests.
  // Falls back to the next calendar occurrence of bestSlot if nothing qualifies.
  let nextOccurrence: BestTimeResult['nextOccurrence'] = null
  if (bestSlot && combinedMax > 0) {
    const now = input.now ?? new Date()
    const pulseThreshold = (bestSlot.score) * 0.05 // 5% of the top score, matching V4.6
    let found: { date: Date; dow: number; hour: number; score: number } | null = null

    for (let i = 1; i <= 168; i++) {
      const checkTime = new Date(now.getTime() + i * 3600_000)
      const dow = checkTime.getDay()
      const hour = checkTime.getHours()
      const score = combinedGrid[key(dow, hour)] ?? 0
      if (score >= pulseThreshold && score > 0) {
        found = { date: checkTime, dow, hour, score }
        break
      }
    }

    if (!found) {
      // Fall back to the next calendar occurrence of the all-time best slot.
      const result = new Date(now)
      result.setMinutes(0, 0, 0)
      result.setHours(bestSlot.hour)
      const diff = (bestSlot.dow - result.getDay() + 7) % 7
      result.setDate(result.getDate() + diff)
      if (result <= now) result.setDate(result.getDate() + 7)
      found = { date: result, dow: bestSlot.dow, hour: bestSlot.hour, score: bestSlot.score }
    }

    nextOccurrence = {
      date: found.date,
      dow: found.dow,
      dayName: DAY_NAMES[found.dow],
      hour: found.hour,
      hourLabel: hourLabel(found.hour),
      score: found.score,
    }
  }

  // ── 8. Human summary ──────────────────────────────────────────────────────
  const summary = bestSlot
    ? `${bestSlot.dayName} at ${bestSlot.hourLabel}`
    : 'Not enough data yet'

  return {
    combinedGrid,
    bestSlot,
    bestDay,
    dailyBest,
    topSlots,
    confidence,
    confidenceLevel,
    signals: { audience: hasAudience, engagement: hasEng, reach: hasReach },
    meta: {
      postsAnalyzed,
      usablePosts: usablePostCount,
      audienceSlots,
      zScore: Math.round(zScore * 100) / 100,
    },
    summary,
    nextOccurrence,
  }
}
