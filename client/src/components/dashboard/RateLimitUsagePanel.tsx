/**
 * RateLimitUsagePanel — Displays BOTH Meta rate-limit systems side by side.
 *
 * Meta runs two separate rate-limit systems simultaneously; every API call is
 * checked against both, and whichever ceiling is hit first throttles you:
 *
 *  1. App-Level (X-App-Usage)        → 200 × app users per HOUR
 *  2. Account-Level / BUC            → 4,800 × daily impressions per 24 HOURS
 *
 * This panel shows both so you can see which limit is closest to its ceiling.
 *
 * Requirements: 8.x (transparent usage UX)
 */

import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { Card, CardContent } from '@/components/ui/card'
import { Activity, Server, User } from 'lucide-react'

type Tier = 'NORMAL' | 'CAUTION' | 'RESTRICTED' | 'CRITICAL'

interface AppLevelUsage {
  callCountPct: number
  totalCputimePct: number
  totalTimePct: number
  effectivePct: number
  tier: Tier
  lastUpdatedAt: number | null
  resetWindow: string
  budgetFormula: string
}

interface AccountUsage {
  id: string
  username: string
  instagramAccountId: string
  callCountPct: number
  totalCputimePct: number
  totalTimePct: number
  effectivePct: number
  tier: Tier
  isStale: boolean
}

interface RateLimitUsageResponse {
  success: boolean
  appLevel: AppLevelUsage
  accountLevel: {
    resetWindow: string
    budgetFormula: string
    accounts: AccountUsage[]
  }
}

// Tier → color mapping (plain, calm colors)
const tierColor: Record<Tier, string> = {
  NORMAL: 'bg-emerald-500',
  CAUTION: 'bg-amber-500',
  RESTRICTED: 'bg-orange-500',
  CRITICAL: 'bg-rose-500',
}

const tierLabel: Record<Tier, string> = {
  NORMAL: 'Healthy',
  CAUTION: 'Slowing down',
  RESTRICTED: 'Limited',
  CRITICAL: 'Paused',
}

function UsageBar({ pct, tier }: { pct: number; tier: Tier }) {
  const width = Math.min(100, Math.max(2, pct))
  return (
    <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${tierColor[tier]}`}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

export function RateLimitUsagePanel() {
  const workspaceData = useCurrentWorkspace()
  const currentWorkspace = workspaceData?.currentWorkspace

  const { data, isLoading } = useQuery<RateLimitUsageResponse>({
    queryKey: ['/api/instagram/rate-limit-usage', currentWorkspace?.id],
    queryFn: async () => {
      return await apiRequest(
        `/api/instagram/rate-limit-usage?workspaceId=${currentWorkspace?.id}`
      )
    },
    enabled: !!currentWorkspace?.id,
    refetchInterval: 60 * 1000, // refresh once a minute
    staleTime: 30 * 1000,
  })

  if (isLoading || !data?.success) {
    return null
  }

  const { appLevel, accountLevel } = data

  return (
    <Card className="bg-white dark:bg-gray-800 shadow-sm border border-gray-200/50 dark:border-gray-700/50">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            API Usage
          </h3>
        </div>

        {/* App-Level usage — the 200×users/hour limit (usually the tighter one) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                App-wide hourly limit
              </span>
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {appLevel.effectivePct}%
            </span>
          </div>
          <UsageBar pct={appLevel.effectivePct} tier={appLevel.tier} />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Shared across everyone using the app · resets hourly · {tierLabel[appLevel.tier]}
          </p>
        </div>

        {/* Account-Level (BUC) usage — the 4800×impressions/24h limit, per account */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Per-account daily limit
            </span>
          </div>

          {accountLevel.accounts.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No connected accounts yet.
            </p>
          )}

          {accountLevel.accounts.map((acc) => (
            <div key={acc.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  @{acc.username}
                </span>
                <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                  {acc.effectivePct}%
                </span>
              </div>
              <UsageBar pct={acc.effectivePct} tier={acc.tier} />
            </div>
          ))}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Each account's own budget · resets over 24 hours
          </p>
        </div>

        {/* Plain-language explainer */}
        <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 pt-3">
          Your data refresh is governed by whichever limit is closer to full. The
          app-wide hourly limit is usually the tighter one until more accounts connect.
        </p>
      </CardContent>
    </Card>
  )
}

export default RateLimitUsagePanel
