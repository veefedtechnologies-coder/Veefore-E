import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import {
  Activity,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  CreditCard,
  Download,
  FileText,
  Info,
  Landmark,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TimeSeriesChart } from '@/features/analytics/design-system';
import useSubscription from '@/hooks/useSubscription';
import { queryClient } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import {
  type BillingActivity,
  type BillingActivityType,
  type BillingModelUsage,
  type BillingRange,
  useBillingHistory,
} from '@/features/billing/useBillingHistory';

const RANGE_OPTIONS: Array<{ value: BillingRange; label: string }> = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '12 months' },
];

const ACTIVITY_FILTERS: Array<{ value: BillingActivityType; label: string }> = [
  { value: 'all', label: 'All activity' },
  { value: 'payments', label: 'Payments' },
  { value: 'refunds', label: 'Refunds' },
  { value: 'credits', label: 'AI credits' },
  { value: 'ai_usage', label: 'Model usage' },
];

const number = (value: number, digits = 0) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(value || 0);

const money = (value: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(
    value || 0
  );

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value || 0);

const dateTime = (value: string) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );

const shortDate = (value: string) =>
  new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(
    new Date(`${value}T00:00:00Z`)
  );

const titleCase = (value: string | null | undefined) =>
  value ? value.replace(/[._-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : '—';

const paymentSourceLabel = (source: string) => {
  if (source === 'subscription_renewal') return 'Subscription renewal';
  if (source === 'subscription_auth') return 'Subscription activation';
  if (source === 'credits') return 'AI credit purchase';
  if (source === 'addon') return 'Add-on purchase';
  return 'Subscription billing';
};

function statusClasses(status: string) {
  if (['captured', 'success', 'settled', 'reported', 'refunded'].includes(status))
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (['pending', 'initiated', 'authorized', 'adjusting', 'estimated'].includes(status))
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
  if (['failed', 'skipped'].includes(status))
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300';
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

function activityAccent(type: BillingActivity['type']) {
  if (type === 'payment') return 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300';
  if (type === 'refund')
    return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300';
  if (type === 'credit')
    return 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300';
  return 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-300';
}

function activityIcon(type: BillingActivity['type']) {
  if (type === 'payment') return <CreditCard className="h-4 w-4" />;
  if (type === 'refund') return <RotateCcw className="h-4 w-4" />;
  if (type === 'credit') return <Coins className="h-4 w-4" />;
  return <Bot className="h-4 w-4" />;
}

function activityTitle(item: BillingActivity) {
  if (item.type === 'payment') return paymentSourceLabel(item.source);
  if (item.type === 'refund') return 'Subscription refund';
  return item.title;
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
  accent,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: React.ReactNode;
  accent: string;
  loading?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className={cn('absolute inset-x-0 top-0 h-0.5', accent)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-28" />
          ) : (
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {value}
            </p>
          )}
          <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {icon}
        </div>
      </div>
    </Card>
  );
}

function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div>
          <h2 className="font-semibold text-slate-950 dark:text-white">{title}</h2>
          {description && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function ModelUsageOverview({
  models,
  loading,
}: {
  models: BillingModelUsage[];
  loading: boolean;
}) {
  if (loading)
    return (
      <div className="space-y-4 p-5">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  if (!models.length)
    return (
      <div className="flex h-[285px] items-center justify-center text-sm text-slate-400">
        No model usage recorded in this period
      </div>
    );

  const maxTokens = Math.max(...models.map(model => model.totalTokens), 1);
  const totalTokens = models.reduce((sum, model) => sum + model.totalTokens, 0);
  return (
    <div className="max-h-[360px] space-y-4 overflow-y-auto p-5">
      {models.map((model, index) => {
        const share = totalTokens ? (model.totalTokens / totalTokens) * 100 : 0;
        const width = Math.max(2, (model.totalTokens / maxTokens) * 100);
        return (
          <div
            key={`${model.provider}-${model.model}`}
            className="rounded-xl border border-slate-100 p-3.5 dark:border-slate-800"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-50 text-[10px] font-bold text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                    {index + 1}
                  </span>
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {model.model || 'Unknown model'}
                  </p>
                  {model.estimatedCalls > 0 && (
                    <Badge
                      variant="outline"
                      className="h-5 border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    >
                      {model.estimatedCalls} estimated
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {titleCase(model.provider)} · {number(model.calls)} calls · {share.toFixed(1)}% of
                  tokens
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                  {number(model.totalTokens)} tokens
                </p>
                <p className="text-[11px] text-slate-500">{usd(model.estimatedCostUsd)} est.</p>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400"
                style={{ width: `${width}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
              <span>Input {number(model.promptTokens)}</span>
              <span>Output {number(model.completionTokens)}</span>
              <span className="text-blue-600 dark:text-blue-400">
                Cached {number(model.cachedTokens)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityDetails({ item }: { item: BillingActivity }) {
  if (item.type === 'payment')
    return (
      <>
        {paymentSourceLabel(item.source)}
        {item.method ? ` · ${titleCase(item.method)}` : ''}
        {item.planId ? ` · ${titleCase(item.planId)}` : ''}
      </>
    );
  if (item.type === 'refund')
    return (
      <>Subscription refund · {item.method ? titleCase(item.method) : 'Original payment method'}</>
    );
  if (item.type === 'credit') {
    if (item.refundReason) return <>Reason: {item.refundReason}</>;
    if (item.refundedPortion)
      return (
        <>
          Reserved {number(item.reservedCredits ?? 0, 2)} · returned{' '}
          {number(item.refundedPortion, 2)}
        </>
      );
    return (
      <>
        {item.automatic ? 'Automatic settlement' : 'Account adjustment'} · provider cost{' '}
        {money(item.providerCostInr)}
      </>
    );
  }
  return (
    <>
      {titleCase(item.provider)} · {item.model} · in {number(item.promptTokens)} / out{' '}
      {number(item.completionTokens)}
    </>
  );
}

function ActivityAmount({ item }: { item: BillingActivity }) {
  if (item.type === 'payment')
    return <span className="font-semibold">{money(item.amount, item.currency)}</span>;
  if (item.type === 'refund')
    return (
      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
        +{money(item.amount, item.currency)}
      </span>
    );
  if (item.type === 'credit') {
    const returned = ['refunded', 'refunding', 'refund_pending'].includes(item.status);
    return (
      <span
        className={cn(
          'font-semibold',
          returned
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-violet-600 dark:text-violet-400'
        )}
      >
        {returned ? '+' : '−'}
        {number(item.credits, 2)} cr
      </span>
    );
  }
  return (
    <span className="font-semibold text-cyan-700 dark:text-cyan-300">
      {number(item.totalTokens)} tok
    </span>
  );
}

export default function BillingHistoryPage() {
  const [, setLocation] = useLocation();
  const [range, setRange] = useState<BillingRange>(30);
  const [type, setType] = useState<BillingActivityType>('all');
  const [page, setPage] = useState(1);
  const [requestVersion, setRequestVersion] = useState(0);
  const { plan, status, billingCycle, currentPeriodEnd, aiCredits } = useSubscription();
  const {
    data: responseData,
    isLoading: queryLoading,
    isFetching,
    error,
  } = useBillingHistory({ range, type, page, limit: 20, requestVersion });
  const responseMatchesSelection =
    responseData?.filters?.type === type &&
    responseData.range.days === range &&
    responseData.filters.page === page;
  const data = responseMatchesSelection ? responseData : undefined;
  const isLoading = queryLoading || (!!responseData && !responseMatchesSelection);

  const primary =
    data?.summary.money.find(entry => entry.currency === 'INR') ?? data?.summary.money[0];
  const credits = data?.summary.credits;
  const ai = data?.summary.ai;
  const creditPercent = credits?.monthly
    ? Math.min(100, Math.round((credits.usedThisCycle / credits.monthly) * 100))
    : 0;
  const cacheRate = ai?.promptTokens ? Math.round((ai.cachedTokens / ai.promptTokens) * 100) : 0;

  // ── Plan vs add-on credit split ──────────────────────────────────────────
  // Credits are consumed monthly-allocation first, then permanent add-on
  // (purchased) credits once the monthly allowance is exhausted. We derive the
  // split from the live balance (monthly allocation, remaining purchased, and
  // this cycle's usage) so users can see exactly which bucket is being spent.
  const planMonthly = aiCredits?.monthly ?? credits?.monthly ?? 0;
  const addonRemaining = aiCredits?.purchased ?? credits?.purchased ?? 0;
  const usedThisCycle = aiCredits?.usedThisCycle ?? credits?.usedThisCycle ?? 0;
  const planUsed = Math.min(usedThisCycle, planMonthly);
  const planRemaining = Math.max(0, planMonthly - usedThisCycle);
  const addonUsedThisCycle = Math.max(0, usedThisCycle - planMonthly);
  const addonTotal = addonRemaining + addonUsedThisCycle;
  const planUsedPct = planMonthly ? Math.min(100, Math.round((planUsed / planMonthly) * 100)) : 0;
  const addonUsedPct = addonTotal
    ? Math.min(100, Math.round((addonUsedThisCycle / addonTotal) * 100))
    : 0;
  const creditNextReset = aiCredits?.nextResetAt ?? credits?.nextResetAt ?? null;

  const trendData = useMemo(
    () =>
      (data?.series ?? []).map(point => ({
        label: shortDate(point.date),
        credits: point.credits,
        creditRefunds: point.creditRefunds,
        aiCalls: point.aiCalls,
      })),
    [data?.series]
  );

  const visibleActivities = useMemo(() => {
    const allItems = data?.activities ?? [];
    const paymentByReference = new Map(
      allItems
        .filter(
          (item): item is Extract<BillingActivity, { type: 'payment' }> => item.type === 'payment'
        )
        .map(item => [item.reference, item])
    );
    const normalized = allItems.map((item): BillingActivity => {
      if (item.type !== 'refund' || item.amount > 0) return item;
      const original = paymentByReference.get(item.reference);
      if (!original) return item;
      return {
        ...item,
        amount: original.amount,
        status: item.status || (original.status === 'refunded' ? 'success' : 'initiated'),
      };
    });
    const expectedType: Partial<Record<BillingActivityType, BillingActivity['type']>> = {
      payments: 'payment',
      refunds: 'refund',
      credits: 'credit',
      ai_usage: 'ai_usage',
    };
    const expected = expectedType[type];
    return normalized.filter(item => !expected || item.type === expected);
  }, [data?.activities, type]);

  const rangeLabel = data?.range
    ? `${new Date(data.range.since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: range === 365 ? 'numeric' : undefined })} – ${new Date(data.range.until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${range} days`;

  const beginFreshRequest = () => {
    void queryClient.cancelQueries({ queryKey: ['billing-history'] });
    queryClient.removeQueries({ queryKey: ['billing-history'], type: 'inactive' });
    setRequestVersion(current => current + 1);
  };
  const changeRange = (next: BillingRange) => {
    if (next === range) return;
    beginFreshRequest();
    setRange(next);
    setPage(1);
  };
  const changeType = (next: BillingActivityType) => {
    if (next === type) return;
    beginFreshRequest();
    setType(next);
    setPage(1);
  };
  const changePage = (next: number) => {
    beginFreshRequest();
    setPage(next);
  };
  const refreshFresh = () => beginFreshRequest();

  return (
    <div className="min-h-full bg-slate-50/70 dark:bg-slate-950">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <section
          className="relative mb-6 overflow-hidden rounded-3xl border border-slate-800 px-6 py-6 text-white shadow-xl shadow-slate-900/15 sm:px-8"
          style={{ backgroundColor: '#0b1736', color: '#ffffff', borderColor: '#1e3a8a' }}
        >
          <div className="pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-violet-400/15 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                  Secure billing center
                </Badge>
                <Badge className="border-emerald-300/25 bg-emerald-300/10 text-emerald-200 hover:bg-emerald-300/10">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  Account-only records
                </Badge>
              </div>
              <h1
                className="text-2xl font-bold tracking-tight sm:text-3xl"
                style={{ color: '#ffffff' }}
              >
                Billing, credits & AI usage
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: '#cbd5e1' }}>
                A complete, auditable view of payments, refunds, invoices, AI credits, and model
                consumption.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-[220px] rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-3 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  Current subscription
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-semibold text-white">{titleCase(plan ?? 'free')}</span>
                  <span className="text-xs text-slate-300">
                    {titleCase(billingCycle)} · {titleCase(status)}
                  </span>
                </div>
                {currentPeriodEnd && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Current period ends {new Date(currentPeriodEnd).toLocaleDateString('en-IN')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLocation('/settings/billing')}
                className="inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-semibold shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
              >
                <WalletCards className="mr-2 h-4 w-4" />
                Manage plan
              </button>
            </div>
          </div>
        </section>

        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              {RANGE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => changeRange(option.value)}
                  disabled={isFetching}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-wait',
                    range === option.value
                      ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Viewing {rangeLabel}
              {isFetching ? ' · Updating…' : ''}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refreshFresh} disabled={isFetching}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
            Refresh data
          </Button>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            Unable to load billing records. {error.message}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            loading={isLoading}
            icon={<Landmark className="h-5 w-5" />}
            label={`Net paid · ${primary?.currency ?? 'INR'}`}
            value={money(primary?.net ?? 0, primary?.currency ?? 'INR')}
            detail={`${number(primary?.purchases ?? 0)} add-on or credit purchases`}
            accent="bg-blue-500"
          />
          <SummaryCard
            loading={isLoading}
            icon={<Coins className="h-5 w-5" />}
            label="Available AI credits"
            value={number(aiCredits?.remaining ?? credits?.remaining ?? 0, 2)}
            detail={
              <div>
                <div className="mb-1 flex justify-between">
                  <span>
                    {number(aiCredits?.usedThisCycle ?? credits?.usedThisCycle ?? 0, 2)} used
                  </span>
                  <span>{creditPercent}% of allowance</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-violet-500"
                    style={{ width: `${creditPercent}%` }}
                  />
                </div>
              </div>
            }
            accent="bg-violet-500"
          />
          <SummaryCard
            loading={isLoading}
            icon={<Bot className="h-5 w-5" />}
            label="AI model usage"
            value={`${number(ai?.totalTokens ?? 0)} tokens`}
            detail={`${number(ai?.calls ?? 0)} calls · ${cacheRate}% input cached · ${usd(ai?.estimatedCostUsd ?? 0)} est.`}
            accent="bg-cyan-500"
          />
          <SummaryCard
            loading={isLoading}
            icon={<RotateCcw className="h-5 w-5" />}
            label="Refunds & invoices"
            value={money(primary?.refunded ?? 0, primary?.currency ?? 'INR')}
            detail={`${number(data?.summary.invoiceCount ?? 0)} invoices in this period`}
            accent="bg-emerald-500"
          />
        </div>

        <div className="mt-6">
          <Panel
            title="AI credit breakdown"
            description="How your monthly plan credits and one-time add-on credits are being used"
            action={
              <Badge variant="outline" className="font-normal">
                <Coins className="mr-1 h-3.5 w-3.5" />
                {number((planRemaining + addonRemaining) as number, 2)} available
              </Badge>
            }
          >
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {/* Plan (subscription) credits — refresh every billing cycle */}
              <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300">
                      <Sparkles className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Plan credits
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {titleCase(plan ?? 'free')} · resets each cycle
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Monthly
                  </span>
                </div>

                {isLoading ? (
                  <Skeleton className="mt-4 h-8 w-32" />
                ) : (
                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
                        {number(planRemaining, 2)}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        remaining of {number(planMonthly)}
                      </p>
                    </div>
                    <p className="text-right text-xs font-medium text-slate-600 dark:text-slate-300">
                      {number(planUsed, 2)} used
                      <span className="block text-[11px] text-slate-400">
                        {planUsedPct}% of allowance
                      </span>
                    </p>
                  </div>
                )}

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all"
                    style={{ width: `${planUsedPct}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {creditNextReset
                    ? `Refreshes on ${new Date(creditNextReset).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : 'Refreshes at the start of each billing cycle'}
                </p>
              </div>

              {/* Add-on (purchased) credits — permanent, never expire */}
              <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <Coins className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Add-on credits
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        One-time packs · used after plan credits
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                    Never expires
                  </span>
                </div>

                {isLoading ? (
                  <Skeleton className="mt-4 h-8 w-32" />
                ) : (
                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
                        {number(addonRemaining, 2)}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {addonTotal > 0
                          ? `remaining of ${number(addonTotal, 2)}`
                          : 'no add-on packs yet'}
                      </p>
                    </div>
                    <p className="text-right text-xs font-medium text-slate-600 dark:text-slate-300">
                      {number(addonUsedThisCycle, 2)} used
                      <span className="block text-[11px] text-slate-400">this cycle</span>
                    </p>
                  </div>
                )}

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${addonUsedPct}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Add-on credits are permanent and are only spent once your monthly plan credits run
                  out.
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Panel
            title="Credits & AI activity"
            description="Daily metered consumption, returned credits, and provider calls"
            action={
              <Badge variant="outline" className="font-normal">
                <Activity className="mr-1 h-3.5 w-3.5" />
                Live ledger
              </Badge>
            }
          >
            <div className="p-5">
              {isLoading ? (
                <Skeleton className="h-[285px] w-full rounded-xl" />
              ) : trendData.length ? (
                <TimeSeriesChart
                  key={`billing-trend-${range}`}
                  data={trendData}
                  series={[
                    { key: 'credits', name: 'Credits used', color: '#8b5cf6', unit: 'count' },
                    {
                      key: 'creditRefunds',
                      name: 'Credits returned',
                      color: '#10b981',
                      unit: 'count',
                    },
                    { key: 'aiCalls', name: 'AI calls', color: '#06b6d4', unit: 'count' },
                  ]}
                  variant="area"
                  height={285}
                />
              ) : (
                <div className="flex h-[285px] items-center justify-center text-sm text-slate-400">
                  No usage recorded in this period
                </div>
              )}
            </div>
          </Panel>
          <Panel
            title="AI usage by model"
            description="Named models with calls, token share, cache usage, and estimated provider cost"
            action={
              <Badge variant="outline" className="font-normal">
                {number(data?.models.length ?? 0)} models
              </Badge>
            }
          >
            <ModelUsageOverview models={data?.models ?? []} loading={isLoading} />
          </Panel>
        </div>

        <div className="mt-6">
          <Panel
            title="Model consumption"
            description="Input, output, cached tokens, call volume, and estimated provider cost"
            action={
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Info className="h-3.5 w-3.5" />
                Estimates are not customer charges
              </div>
            }
          >
            {isLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : data?.models.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider / model</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Input</TableHead>
                      <TableHead className="text-right">Output</TableHead>
                      <TableHead className="text-right">Cached</TableHead>
                      <TableHead className="min-w-[180px]">Token share</TableHead>
                      <TableHead className="text-right">Est. cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.models.map(model => {
                      const maxTokens = data.models[0]?.totalTokens || 1;
                      return (
                        <TableRow key={`${model.provider}-${model.model}`}>
                          <TableCell>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {model.model}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                              <span>{titleCase(model.provider)}</span>
                              {model.estimatedCalls > 0 && (
                                <Badge
                                  variant="outline"
                                  className="h-5 border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                >
                                  {model.estimatedCalls} estimated
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {number(model.calls)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {number(model.promptTokens)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {number(model.completionTokens)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-blue-600 dark:text-blue-400">
                            {number(model.cachedTokens)}
                          </TableCell>
                          <TableCell>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                                style={{
                                  width: `${Math.max(2, (model.totalTokens / maxTokens) * 100)}%`,
                                }}
                              />
                            </div>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {number(model.totalTokens)} total
                            </p>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {usd(model.estimatedCostUsd)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="p-12 text-center text-sm text-slate-500">
                No AI model activity for this period.
              </div>
            )}
          </Panel>
        </div>

        <div className="mt-6">
          <Panel
            title="Unified activity ledger"
            description="Auditable detail for money, credits, refunds, invoices, and each AI call"
            action={<ReceiptText className="h-5 w-5 text-blue-500" />}
          >
            <div className="flex max-w-full gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900">
              {ACTIVITY_FILTERS.map(filter => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => changeType(filter.value)}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                    type === filter.value
                      ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-white dark:ring-slate-600'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            {isLoading && !data ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 7 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : visibleActivities.length ? (
              <div className={cn('overflow-x-auto transition-opacity', isFetching && 'opacity-60')}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[165px]">Date</TableHead>
                      <TableHead className="min-w-[210px]">Activity</TableHead>
                      <TableHead className="min-w-[250px]">Details</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount / usage</TableHead>
                      <TableHead className="min-w-[145px] text-right">Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleActivities.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                            {dateTime(item.occurredAt)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                                activityAccent(item.type)
                              )}
                            >
                              {activityIcon(item.type)}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 dark:text-white">
                                {activityTitle(item)}
                              </p>
                              <p className="text-[10px] uppercase tracking-wider text-slate-400">
                                {item.type.replace('_', ' ')}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 dark:text-slate-400">
                          <ActivityDetails item={item} />
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn('font-medium', statusClasses(item.status))}
                          >
                            {titleCase(item.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <ActivityAmount item={item} />
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-right text-xs text-slate-500 dark:text-slate-400">
                          {item.type === 'payment' && item.invoice?.pdfUrl ? (
                            <a
                              href={item.invoice.pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                              <Download className="h-3.5 w-3.5" />
                              {item.invoice.number}
                            </a>
                          ) : item.type === 'payment' ? (
                            (item.invoice?.number ?? item.reference)
                          ) : item.type === 'refund' ? (
                            item.reference
                          ) : item.type === 'ai_usage' ? (
                            `${usd(item.estimatedCostUsd)} est.`
                          ) : item.automatic ? (
                            'Metered'
                          ) : (
                            'Manual'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-3 rounded-2xl bg-slate-100 p-3 text-slate-400 dark:bg-slate-800">
                  <FileText className="h-6 w-6" />
                </div>
                <p className="font-medium text-slate-700 dark:text-slate-200">
                  No matching billing activity
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Try another activity type or date range.
                </p>
              </div>
            )}
            {data?.pagination && data.pagination.total > 0 && (
              <div className="flex flex-col justify-between gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center">
                <p className="text-xs text-slate-500">
                  Page {data.pagination.page} of {data.pagination.totalPages} ·{' '}
                  {number(data.pagination.total)} records
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || isFetching}
                    onClick={() => changePage(Math.max(1, page - 1))}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.pagination.hasMore || isFetching}
                    onClick={() => changePage(page + 1)}
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Panel>
        </div>

        <div className="mt-6 flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 sm:flex-row sm:items-center">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Records are restricted to your authenticated account.
          </span>
          <span className="inline-flex items-center gap-2">
            <Info className="h-4 w-4 text-amber-500" />
            {data?.disclosure ??
              'Verified charges and estimated provider costs are shown separately.'}
          </span>
        </div>
      </div>
    </div>
  );
}
