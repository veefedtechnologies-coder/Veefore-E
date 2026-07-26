/**
 * SubscriptionUsagePanel — displays quota usage progress bars for the
 * authenticated user's subscription.
 *
 * All data is fetched via useSubscription() from the server — nothing is
 * hardcoded.  A limit value of -1 means "unlimited" and renders as a plain
 * text label instead of a progress bar.
 */

import * as React from 'react';
import useSubscription from '@/hooks/useSubscription';
import { isNearQuota } from '@/hooks/useSubscription';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLimit(value: number | undefined): string {
  if (value === undefined || value === null) return '—';
  if (value === -1) return 'Unlimited';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function usagePercent(used: number, limit: number): number {
  if (limit === -1 || limit === 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

/** Returns the Tailwind colour class for the progress indicator based on pct. */
function severityClass(pct: number): string {
  if (pct >= 100) return 'bg-red-500';
  if (pct >= 90) return 'bg-orange-500';
  if (pct >= 80) return 'bg-yellow-400';
  return 'bg-green-500';
}

// ---------------------------------------------------------------------------
// QuotaBar
// ---------------------------------------------------------------------------

interface QuotaBarProps {
  label: string;
  used: number;
  limit: number;
}

function QuotaBar({ label, used, limit }: QuotaBarProps) {
  const unlimited = limit === -1;
  const pct = usagePercent(used, limit);
  const near = isNearQuota(used, limit);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground flex items-center gap-1.5">
          {label}
          {near && !unlimited && (
            <Badge
              className="h-4 px-1.5 text-[10px] bg-yellow-100 text-yellow-800 border-yellow-300"
              variant="outline"
            >
              Near limit
            </Badge>
          )}
        </span>
        <span className="text-muted-foreground tabular-nums text-xs">
          {unlimited ? (
            <span className="text-green-600 font-medium">Unlimited</span>
          ) : (
            <>
              {used.toLocaleString()} / {formatLimit(limit)}
              <span className="ml-1 text-muted-foreground">({pct}%)</span>
            </>
          )}
        </span>
      </div>

      {!unlimited && (
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn('h-full rounded-full transition-all', severityClass(pct))}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}: ${pct}%`}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubscriptionUsagePanel
// ---------------------------------------------------------------------------

export function SubscriptionUsagePanel() {
  const {
    plan,
    status,
    limits,
    usage,
    aiCredits,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    isLoading,
    error,
  } = useSubscription();

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4 p-4" aria-busy="true">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="space-y-1 animate-pulse">
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-2 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Unable to load subscription data. Please try again later.
      </div>
    );
  }

  // ── No data ────────────────────────────────────────────────────────────────
  if (!limits || !usage) {
    return null;
  }

  // ── Formatted access-end date ──────────────────────────────────────────────
  const accessEndsFormatted = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div className="space-y-4">
      {/* payment_failed banner */}
      {status === 'payment_failed' && (
        <div
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          <strong className="font-semibold">Payment failed.</strong> Please update
          your payment method to restore full access. Your account may be
          restricted until this is resolved.
        </div>
      )}

      {/* cancelAtPeriodEnd notice */}
      {cancelAtPeriodEnd && accessEndsFormatted && (
        <div
          className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
          role="alert"
        >
          <strong className="font-semibold">Subscription cancelled.</strong> You
          have access until{' '}
          <span className="font-medium">{accessEndsFormatted}</span>. After that
          your account will revert to the free plan.
        </div>
      )}

      {/* Plan label */}
      {plan && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Current plan:</span>
          <Badge variant="secondary" className="capitalize">
            {plan}
          </Badge>
          {status && status !== 'active' && (
            <Badge
              variant="outline"
              className={cn(
                'capitalize',
                status === 'payment_failed' && 'border-red-400 text-red-600',
                status === 'cancelled' && 'border-muted text-muted-foreground',
              )}
            >
              {status.replace('_', ' ')}
            </Badge>
          )}
        </div>
      )}

      {/* Quota bars */}
      <div className="space-y-4">
        {/* AI Credits — cycle spend comes from the canonical usage counter.
            The total available pool includes the remaining monthly allocation
            plus any unspent purchased credits. */}
        {aiCredits && (
          <QuotaBar
            label={`AI Credits (${aiCredits.remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })} left)`}
            used={Math.max(0, aiCredits.usedThisCycle)}
            limit={aiCredits.monthly === -1 ? -1 : aiCredits.usedThisCycle + aiCredits.remaining}
          />
        )}

        {/* Workspaces */}
        <QuotaBar
          label="Workspaces"
          used={usage.workspacesUsed}
          limit={limits.maxWorkspaces}
        />

        {/* Profiles */}
        <QuotaBar
          label="Social Profiles"
          used={usage.profilesUsed}
          limit={limits.maxProfiles}
        />

        {/* Scheduled Posts */}
        <QuotaBar
          label="Scheduled Posts (this cycle)"
          used={usage.scheduledPostsThisCycle}
          limit={limits.scheduledPostsPerMonth}
        />

        {/* Keyword Conversations */}
        <QuotaBar
          label="Keyword Conversations (this cycle)"
          used={usage.keywordConversationsThisCycle}
          limit={limits.keywordTriggerConversationsPerMonth}
        />

        {/* AI Conversations */}
        <QuotaBar
          label="AI Conversations (this cycle)"
          used={usage.aiConversationsThisCycle}
          limit={limits.aiConversationsPerMonth}
        />
      </div>
    </div>
  );
}

export default SubscriptionUsagePanel;
