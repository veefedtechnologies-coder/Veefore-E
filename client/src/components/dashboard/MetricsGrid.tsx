import { Users, Eye, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface GrowthData {
  value: string
  isPositive: boolean
}

interface MetricsGridProps {
  periodData: {
    followerTotal: number
    followerGains: number
    followerGained?: number
    followerLost?: number
    /** Previous period gross gained — for "vs previous" badge */
    followerPrevGained?: number
    /** Previous period gross lost — for "vs previous" badge */
    followerPrevLost?: number
    likes: number
    reach: number
    views: number
  }
  growthPercentages: {
    followers: GrowthData
    likes: GrowthData
    reach: GrowthData
    views: GrowthData
  }
  selectedPeriod: 'day' | 'week' | 'month'
  formatNumber: (num: number) => string
  isLoading?: boolean
}

function SkeletonMetricGridCard() {
  return (
    <div className="bg-white dark:bg-slate-900/50 rounded-xl p-6 border border-gray-100 dark:border-gray-800/60 relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div>
            <Skeleton className="h-3 w-24 mb-3 rounded" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
          <Skeleton className="w-10 h-10 rounded-lg" />
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800/50 flex justify-between">
          <Skeleton className="h-3 w-28 rounded" />
          <Skeleton className="h-3 w-12 rounded" />
        </div>
      </div>
    </div>
  )
}

export function MetricsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <SkeletonMetricGridCard />
      <SkeletonMetricGridCard />
    </div>
  )
}

// Compute % change badge. Returns null when comparison isn't meaningful.
function pctBadge(cur: number, prev: number): { value: string; isPositive: boolean; higherIsBetter: boolean } | null {
  if (cur === 0 && prev === 0) return null;
  if (prev === 0) return null; // no baseline — caller shows absolute instead
  const raw = Math.max(-999, Math.min(999, ((cur - prev) / Math.abs(prev)) * 100));
  return {
    value: `${raw >= 0 ? '+' : ''}${raw.toFixed(1)}%`,
    isPositive: raw >= 0,
    higherIsBetter: true,
  };
}

// For lost followers, lower is better — invert the colour logic.
function lostBadge(cur: number, prev: number): { value: string; isPositive: boolean } | null {
  if (cur === 0 && prev === 0) return null;
  if (prev === 0) return null;
  const raw = Math.max(-999, Math.min(999, ((cur - prev) / Math.abs(prev)) * 100));
  return {
    value: `${raw >= 0 ? '+' : ''}${raw.toFixed(1)}%`,
    // More lost = bad (red), fewer lost = good (green) — reversed from normal
    isPositive: raw <= 0,
  };
}

export function MetricsGrid({ periodData, growthPercentages, selectedPeriod, formatNumber, isLoading }: MetricsGridProps) {
  if (isLoading) {
    return <MetricsGridSkeleton />
  }

  const periodLabel = selectedPeriod === 'day' ? "Today's" :
                      selectedPeriod === 'week' ? 'Weekly' : 'Monthly'

  const hasGainedLostData = (periodData.followerGained ?? 0) > 0 || (periodData.followerLost ?? 0) > 0
  const net = periodData.followerGains

  const gained    = periodData.followerGained    ?? 0
  const lost      = periodData.followerLost      ?? 0
  const prevGained = periodData.followerPrevGained ?? 0
  const prevLost   = periodData.followerPrevLost   ?? 0

  const gainedBadge = hasGainedLostData ? pctBadge(gained, prevGained) : null
  const lostChangeBadge = hasGainedLostData ? lostBadge(lost, prevLost) : null

  // Fallback single badge when no granular data
  const simpleBadge = growthPercentages.followers

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {/* ── Followers Card ─────────────────────────────────────────────── */}
      <div className="group relative bg-blue-50 dark:bg-gray-800 rounded-xl p-6 transition-all duration-300 hover:shadow-md border border-blue-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col h-full justify-between">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-2">
                {periodLabel} New Followers
              </div>

              {hasGainedLostData ? (
                <div className="space-y-1">
                  <div className={`text-3xl font-extrabold tracking-tight ${
                    net >= 0 ? 'text-blue-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {net >= 0 ? '+' : ''}{formatNumber(net)}
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 ml-1 align-middle">net</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <TrendingUp className="w-3 h-3" />
                      +{formatNumber(gained)} gained
                    </span>
                    <span className="text-gray-300 dark:text-gray-600 text-xs">·</span>
                    <span className="flex items-center gap-1 text-xs font-semibold text-rose-500 dark:text-rose-400">
                      <TrendingDown className="w-3 h-3" />
                      -{formatNumber(lost)} lost
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-4xl font-extrabold text-blue-900 dark:text-white tracking-tight">
                  {net > 0 ? '+' : ''}{formatNumber(net)}
                </div>
              )}
            </div>
            <div className="p-3 bg-blue-200/50 dark:bg-blue-500/20 rounded-xl text-blue-700 dark:text-blue-400 shadow-sm border border-blue-300/50 dark:border-blue-400/30 ml-3 flex-shrink-0">
              <Users className="w-6 h-6" />
            </div>
          </div>

          {/* ── vs previous period ────────────────────────────────────── */}
          <div className="mt-3 pt-3 border-t border-blue-200/50 dark:border-blue-500/20">
            {hasGainedLostData ? (
              /* Two clear badges: gained change + lost change */
              <div className="space-y-1">
                <span className="text-blue-800/70 dark:text-gray-400 font-medium text-xs">vs previous period</span>
                <div className="flex items-center gap-2">
                  {/* Gained badge — more gained = green, fewer = red */}
                  {gainedBadge ? (
                    <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      gainedBadge.isPositive
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                    }`}>
                      <TrendingUp className="w-3 h-3" />
                      {gainedBadge.value}
                    </span>
                  ) : gained > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <TrendingUp className="w-3 h-3" />
                      +{formatNumber(gained)} new
                    </span>
                  ) : null}

                  {/* Lost badge — fewer lost = green (good), more lost = red (bad) */}
                  {lostChangeBadge ? (
                    <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      lostChangeBadge.isPositive
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                    }`}>
                      <TrendingDown className="w-3 h-3" />
                      {/* Show the absolute % — if lost went up it's bad, already reflected in colour */}
                      {Math.abs(parseFloat(lostChangeBadge.value)).toFixed(1)}% lost
                    </span>
                  ) : lost > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                      <TrendingDown className="w-3 h-3" />
                      {formatNumber(lost)} lost
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              /* Simple single badge fallback */
              <div className="flex items-center justify-between text-sm">
                <span className="text-blue-800/70 dark:text-gray-400 font-medium">vs previous period</span>
                {simpleBadge.value === '—' ? (
                  <span className="text-gray-400 dark:text-gray-500 font-medium">—</span>
                ) : (
                  <div className={`flex items-center font-bold ${
                    simpleBadge.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {simpleBadge.isPositive
                      ? <ArrowUpRight className="w-4 h-4 mr-1" />
                      : <ArrowDownRight className="w-4 h-4 mr-1" />}
                    <span>{simpleBadge.value}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Reach Card ─────────────────────────────────────────────────── */}
      <div className="group relative bg-purple-50 dark:bg-gray-800 rounded-xl p-6 transition-all duration-300 hover:shadow-md border border-purple-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-400/20 dark:bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col h-full justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider mb-2">
                {selectedPeriod === 'day' ? "Today's Reach" :
                 selectedPeriod === 'week' ? 'Weekly Reach' :
                 'Monthly Reach'}
              </div>
              <div className="text-4xl font-extrabold text-purple-900 dark:text-white tracking-tight">
                {formatNumber(periodData.reach)}
              </div>
            </div>
            <div className="p-3 bg-purple-200/50 dark:bg-purple-500/20 rounded-xl text-purple-700 dark:text-purple-400 shadow-sm border border-purple-300/50 dark:border-purple-400/30">
              <Eye className="w-6 h-6" />
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-purple-200/50 dark:border-purple-500/20">
            <div className="flex items-center justify-between text-sm">
              <span className="text-purple-800/70 dark:text-gray-400 font-medium">vs previous period</span>
              <div className={`flex items-center font-bold ${
                growthPercentages.reach.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {growthPercentages.reach.isPositive
                  ? <ArrowUpRight className="w-4 h-4 mr-1" />
                  : <ArrowDownRight className="w-4 h-4 mr-1" />}
                <span>{growthPercentages.reach.value}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
