/**
 * CreditsPage — full AI-credit history and balance overview.
 *
 * Shows the user's live balance snapshot (available / monthly allowance /
 * purchased / used this cycle / next reset) alongside a paginated, filterable
 * ledger of every credit-affecting event: deductions, refunds, finalization
 * adjustments, skipped charges, and failures.
 *
 * Data sources:
 *   - GET /api/v2/subscription/credits/history  (balance + totals + ledger)
 *   - useSubscription() for the same live balance (kept in sync app-wide)
 */

import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import useSubscription from '@/hooks/useSubscription'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Coins,
  TrendingDown,
  RotateCcw,
  Sparkles,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Wallet,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types (mirror the /credits/history response)
// ---------------------------------------------------------------------------

type CreditKind = 'deduction' | 'refund' | 'adjustment' | 'skipped' | 'failed'

interface CreditTransaction {
  id: string
  feature: string
  kind: CreditKind
  status: string
  credits: number
  providerCostInr: number
  workspaceId: string | null
  automatic: boolean
  refundReason: string | null
  reservedCredits: number | null
  refundedPortion: number | null
  adjustmentCredits: number | null
  overageCredits: number | null
  createdAt: string
  updatedAt: string
}

interface CreditHistoryResponse {
  balance: {
    remaining: number
    monthly: number
    purchased: number
    rolloverCredits: number
    usedThisCycle: number
    nextResetAt: string | null
    lastResetAt: string | null
  }
  totals: {
    lifetimeSpent: number
    lifetimeRefunded: number
    transactionCount: number
  }
  items: CreditTransaction[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}

// ---------------------------------------------------------------------------
// Static maps
// ---------------------------------------------------------------------------

const FEATURE_LABELS: Record<string, string> = {
  captionGeneration: 'Caption Generation',
  hashtagGeneration: 'Hashtag Generation',
  performanceBanner: 'Performance Banner',
  aiRewrite: 'AI Rewrite',
  imageGeneration: 'Image Generation',
  aiGrowthRecommendation: 'Growth Recommendation',
  aiContentPlan: 'Content Plan',
  aiAnalyticsInsight: 'Analytics Insight',
  aiBusinessInsight: 'Business Insight',
  automationDm: 'Automation DM',
  automationComment: 'Automation Comment',
  videoScript: 'Video Script',
}

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'deduction', label: 'Deductions' },
  { key: 'refund', label: 'Refunds' },
  { key: 'adjustment', label: 'Adjustments' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'failed', label: 'Failed' },
]

const KIND_META: Record<CreditKind, { label: string; badge: string; sign: '-' | '+' | ''; amount: string }> = {
  deduction: { label: 'Deducted', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', sign: '-', amount: 'text-red-600 dark:text-red-400' },
  refund: { label: 'Refunded', badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', sign: '+', amount: 'text-green-600 dark:text-green-400' },
  adjustment: { label: 'Adjustment', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', sign: '', amount: 'text-amber-600 dark:text-amber-400' },
  skipped: { label: 'Skipped', badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', sign: '', amount: 'text-gray-500 dark:text-gray-400' },
  failed: { label: 'Failed', badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', sign: '', amount: 'text-gray-500 dark:text-gray-400' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (n: number | undefined | null) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)

const featureLabel = (feature: string) =>
  FEATURE_LABELS[feature] ?? feature.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

const formatDate = (iso: string) => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Summary stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  accent: string
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', accent)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CreditsPage() {
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const limit = 20

  const { aiCredits } = useSubscription()

  const { data, isLoading, isFetching, error, refetch } = useQuery<CreditHistoryResponse, Error>({
    queryKey: ['/api/v2/subscription/credits/history', filter, page],
    queryFn: () =>
      apiRequest(
        `/api/v2/subscription/credits/history?page=${page}&limit=${limit}` +
          (filter !== 'all' ? `&type=${filter}` : '')
      ),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })

  // Prefer the freshest balance: the app-wide subscription hook (live-synced),
  // falling back to the history endpoint's snapshot.
  const balance = data?.balance
  const remaining = aiCredits?.remaining ?? balance?.remaining
  const monthly = aiCredits?.monthly ?? balance?.monthly
  const purchased = aiCredits?.purchased ?? balance?.purchased
  const usedThisCycle = aiCredits?.usedThisCycle ?? balance?.usedThisCycle
  const nextResetAt = aiCredits?.nextResetAt ?? balance?.nextResetAt ?? null

  const totals = data?.totals
  const items = data?.items ?? []
  const pagination = data?.pagination

  const changeFilter = (key: string) => {
    setFilter(key)
    setPage(1)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Heading */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Credits</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Track every credit deducted, refunded, and available on your account.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {isLoading && !data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard
              icon={Wallet}
              label="Available"
              value={fmt(remaining)}
              sub={monthly != null ? `of ${fmt(monthly)} monthly` : undefined}
              accent="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
            />
            <StatCard
              icon={TrendingDown}
              label="Used this cycle"
              value={fmt(usedThisCycle)}
              sub={nextResetAt ? `Resets ${formatDate(nextResetAt)}` : undefined}
              accent="bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
            />
            <StatCard
              icon={Sparkles}
              label="Purchased"
              value={fmt(purchased)}
              sub="Add-on credits (carry over)"
              accent="bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400"
            />
            <StatCard
              icon={RotateCcw}
              label="Refunded (lifetime)"
              value={fmt(totals?.lifetimeRefunded ?? 0)}
              sub={`${fmt(totals?.lifetimeSpent ?? 0)} spent lifetime`}
              accent="bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400"
            />
          </>
        )}
      </div>

      {/* Next reset banner */}
      {nextResetAt && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-900/10 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
          <CalendarClock className="h-4 w-4 flex-shrink-0" />
          <span>
            Your monthly allowance of <strong>{fmt(monthly)}</strong> credits resets on{' '}
            <strong>{formatDate(nextResetAt)}</strong>.
          </span>
        </div>
      )}

      {/* How reservations work */}
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
        <Coins className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>
          Some AI features reserve their maximum cost before generating, then refund the unused
          portion once the real usage is measured — so a charge may briefly show higher and then
          settle to its final amount. The <strong>Credits</strong> column always reflects the final,
          net amount.
        </span>
      </div>

      {/* Ledger */}
      <Card className="overflow-hidden">
        {/* Filter tabs */}
        <div className="flex flex-wrap items-center gap-1 border-b border-gray-100 dark:border-gray-800 p-3">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => changeFilter(f.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                filter === f.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Table */}
        {error ? (
          <div className="p-10 text-center text-sm text-red-600 dark:text-red-400">
            Couldn’t load credit history. {error.message}
          </div>
        ) : isLoading && !data ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
            <Coins className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No credit activity yet</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Credit deductions and refunds will appear here as you use AI features.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="hidden md:table-cell">Details</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((tx) => {
                const meta = KIND_META[tx.kind]
                return (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {featureLabel(tx.feature)}
                      </div>
                      {tx.automatic && (
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">Automatic</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn('border-transparent', meta.badge)}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className={cn('text-right font-semibold tabular-nums', meta.amount)}>
                      {tx.kind === 'skipped' || tx.kind === 'failed'
                        ? '—'
                        : `${meta.sign}${fmt(tx.credits)}`}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-gray-500 dark:text-gray-400">
                      {tx.kind === 'refund' && tx.refundReason ? (
                        `Reason: ${tx.refundReason}`
                      ) : tx.refundedPortion && tx.reservedCredits ? (
                        <span>
                          Reserved {fmt(tx.reservedCredits)},{' '}
                          <span className="text-green-600 dark:text-green-400">
                            refunded {fmt(tx.refundedPortion)}
                          </span>
                        </span>
                      ) : tx.overageCredits ? (
                        `Overage: +${fmt(tx.overageCredits)}`
                      ) : tx.status === 'pending' ? (
                        'Reserved — settling…'
                      ) : (
                        ''
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(tx.createdAt)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        {pagination && pagination.total > 0 && (
          <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} transactions
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!pagination.hasMore || isFetching}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
