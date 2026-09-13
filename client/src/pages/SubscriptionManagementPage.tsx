import React, { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Instagram,
  Loader2,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import useSubscription from '@/hooks/useSubscription';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';

const PLAN_PRICING: Record<string, { monthly: number; yearly: number }> = {
  creator: { monthly: 799, yearly: 7999 },
  pro: { monthly: 1999, yearly: 19999 },
  business: { monthly: 4999, yearly: 49999 },
};

const CANCELLATION_REASONS = [
  { value: 'too_expensive', label: 'The plan is too expensive' },
  { value: 'not_using_enough', label: 'I am not using Veefore enough' },
  { value: 'missing_features', label: 'I need features that are not available' },
  { value: 'switching_service', label: 'I am moving to another service' },
  { value: 'temporary', label: 'This is a temporary decision' },
  { value: 'other', label: 'Another reason' },
];
const formatDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(
        new Date(value)
      )
    : 'Not available';

const formatCurrency = (value: number) => new Intl.NumberFormat('en-IN').format(value);
const titleCase = (value?: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Free';

function VisualPanel() {
  return (
    <aside className="relative hidden h-screen min-w-0 flex-col overflow-hidden bg-slate-950 text-white lg:flex">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 20% 15%, rgba(59,130,246,.28), transparent 30%), radial-gradient(circle at 85% 70%, rgba(124,58,237,.25), transparent 35%)',
        }}
      />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div className="absolute -left-32 bottom-10 h-72 w-72 rounded-full border border-blue-400/20" />
      <div className="absolute -left-20 bottom-24 h-48 w-48 rounded-full border border-violet-400/20" />

      <div className="relative z-10 flex items-center gap-3 px-10 pt-9 xl:px-14">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 font-black shadow-lg shadow-blue-500/25">
          V
        </div>
        <div>
          <p className="font-bold tracking-tight">Veefore</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Social intelligence
          </p>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-center px-10 py-8 xl:px-14">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
            <Sparkles className="h-3.5 w-3.5" />
            Your growth, visualized
          </span>
          <h2 className="mt-5 text-4xl font-bold leading-[1.08] tracking-[-0.04em] xl:text-5xl">
            One subscription.
            <br />
            <span className="bg-gradient-to-r from-blue-300 to-violet-300 bg-clip-text text-transparent">
              Every growth signal.
            </span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
            Keep a clear view of the value your plan powers—from publishing and AI to audience
            growth and automation.
          </p>
        </div>

        <div className="relative mt-9 h-[330px] max-w-[570px]">
          <div className="absolute left-0 top-10 w-[88%] overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.075] p-5 shadow-2xl shadow-black/40 backdrop-blur-xl xl:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Growth overview
                </p>
                <p className="mt-1 text-lg font-bold">Audience momentum</p>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
                <TrendingUp className="h-3.5 w-3.5" />
                24.8%
              </div>
            </div>
            <div className="mt-6 grid grid-cols-[1fr_108px] gap-5">
              <div className="relative h-36 overflow-hidden rounded-2xl bg-white/[0.035]">
                <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-white/10" />
                <div className="absolute inset-x-0 top-2/3 border-t border-dashed border-white/10" />
                <svg
                  viewBox="0 0 300 125"
                  className="absolute inset-0 h-full w-full"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity=".34" />
                      <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 106 C35 101 47 86 73 91 C100 97 111 62 143 70 C174 78 185 35 218 45 C248 53 267 18 300 21 L300 125 L0 125 Z"
                    fill="url(#growthFill)"
                  />
                  <path
                    d="M0 106 C35 101 47 86 73 91 C100 97 111 62 143 70 C174 78 185 35 218 45 C248 53 267 18 300 21"
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="space-y-2.5">
                <div className="rounded-2xl bg-white/[0.05] p-3">
                  <Users className="h-4 w-4 text-blue-300" />
                  <p className="mt-2 text-lg font-bold">18.4K</p>
                  <p className="text-[10px] text-slate-500">Audience</p>
                </div>
                <div className="rounded-2xl bg-white/[0.05] p-3">
                  <Activity className="h-4 w-4 text-violet-300" />
                  <p className="mt-2 text-lg font-bold">8.7%</p>
                  <p className="text-[10px] text-slate-500">Engagement</p>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute right-0 top-0 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-pink-500 to-orange-400 shadow-xl shadow-pink-500/20">
            <Instagram className="h-6 w-6" />
          </div>
          <div
            className="absolute bottom-7 right-2 w-44 rounded-2xl border border-white/10 p-4 shadow-2xl backdrop-blur-xl"
            style={{ backgroundColor: 'rgba(16,22,42,0.95)' }}
          >
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/15 text-violet-300">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold">Automation active</p>
                <p className="mt-0.5 text-[10px] text-slate-500">12 flows running</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-violet-500 to-blue-400" />
            </div>
          </div>
          <div
            className="absolute bottom-1 left-6 flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-[11px] text-slate-300 shadow-xl"
            style={{ backgroundColor: 'rgba(16,22,42,0.9)' }}
          >
            <MessageCircle className="h-3.5 w-3.5 text-blue-300" />
            AI conversations <strong className="text-white">+1,284</strong>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between border-t border-white/10 px-10 py-5 text-[11px] text-slate-500 xl:px-14">
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          Secure subscription controls
        </span>
        <span>veefore.com</span>
      </div>
    </aside>
  );
}
function ManagementSkeleton() {
  return (
    <div className="grid h-screen w-full grid-cols-1 overflow-hidden bg-slate-50 lg:grid-cols-2">
      {/* skeleton-guard-allow: decorative full-bleed visual panel, mirrors the
          dark graphics column of the loaded layout — it holds no content
          structure, so it is a solid block rather than a Skeleton. */}
      <div className="hidden bg-slate-950 lg:block" />
      <div className="min-w-0 overflow-hidden bg-white p-8 lg:p-14">
        <div className="mx-auto max-w-2xl space-y-6">
          <Skeleton variant="text" className="h-6 w-28" />
          <Skeleton variant="rectangle" className="h-12 w-80 rounded-xl" />
          <Skeleton variant="card" className="h-44 rounded-3xl" />
          <Skeleton variant="card" className="h-72 rounded-3xl" />
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionManagementPage() {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const openCancelDialog = () => {
    setClosing(false);
    setShowCancelDialog(true);
  };

  // Play the slide-out animation, then unmount once it fully finishes. The
  // timeout matches the 300ms exit duration so we never unmount mid-animation
  // (which would flash the panel back to its resting position).
  const closeCancelDialog = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setShowCancelDialog(false);
      setClosing(false);
    }, 300);
  };
  const {
    plan,
    status,
    billingCycle,
    currentPeriodStart,
    currentPeriodEnd,
    renewsAt,
    accessEndsAt,
    autoRenew,
    cancelAtPeriodEnd,
    isLoading,
    error,
  } = useSubscription();

  const cancellationMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/v2/subscription/cancel', {
        method: 'POST',
        body: JSON.stringify({ reason, feedback: feedback.trim() || undefined }),
      }),
    onSuccess: async (response: any) => {
      await queryClient.invalidateQueries({ queryKey: ['subscription', 'me'] });
      closeCancelDialog();
      setSuccessMessage(
        `Automatic renewal is off. Your ${titleCase(plan)} access continues through ${formatDate(response?.accessEndsAt ?? currentPeriodEnd)}.`
      );
    },
  });

  if (isLoading) return <ManagementSkeleton />;

  const isPaid = Boolean(plan && plan !== 'free');
  const pricing = PLAN_PRICING[plan ?? ''];
  const recurringPrice = pricing
    ? billingCycle === 'yearly'
      ? pricing.yearly
      : pricing.monthly
    : null;
  const periodEnd = accessEndsAt ?? currentPeriodEnd;
  const canCancel = isPaid && !cancelAtPeriodEnd && autoRenew !== false;
  const cancellationError = cancellationMutation.error as Error | null;

  return (
    <main className="grid h-screen w-full grid-cols-1 overflow-hidden bg-white text-slate-950 lg:grid-cols-2 dark:bg-slate-950 dark:text-white">
      <VisualPanel />

      <section className="h-screen min-w-0 overflow-y-auto bg-white dark:bg-slate-950">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col px-5 py-6 sm:px-9 lg:px-10 lg:py-9 xl:px-14">
          <div className="flex items-center justify-between">
            <Link
              href="/settings/billing"
              className="group flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 transition group-hover:border-slate-300 group-hover:bg-slate-50 dark:border-slate-800 dark:group-hover:bg-slate-900">
                <ArrowLeft className="h-4 w-4" />
              </span>
              Back to plans
            </Link>
            <span className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <LockKeyhole className="h-3.5 w-3.5" />
              Secure portal
            </span>
          </div>

          <div className="mt-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
              Subscription management
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
              Your plan, clearly managed.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Review your plan, billing period, and automatic renewal. Your paid access remains
              protected through the end of the period.
            </p>
          </div>

          {successMessage && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Cancellation scheduled</p>
                <p className="mt-1 text-sm leading-6">{successMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="rounded-lg p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {error && (
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <AlertCircle className="h-5 w-5 shrink-0" />
              We could not load your subscription details. Refresh and try again.
            </div>
          )}
          <div className="relative mt-6 overflow-hidden rounded-3xl bg-slate-950 p-5 text-white lg:hidden">
            <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-blue-500/25 blur-3xl" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Growth overview
                </p>
                <p className="mt-1 text-lg font-bold">Your plan at work</p>
              </div>
              <BarChart3 className="h-5 w-5 text-blue-300" />
            </div>
            <svg
              viewBox="0 0 320 70"
              className="relative mt-4 h-16 w-full"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M0 58 C38 55 53 39 82 45 C114 52 125 23 158 31 C194 40 211 10 245 20 C274 29 290 6 320 8"
                fill="none"
                stroke="#60a5fa"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,.06)] dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col justify-between gap-5 border-b border-slate-200 p-5 dark:border-slate-800 sm:flex-row sm:items-start sm:p-6">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl font-bold">{titleCase(plan)} plan</h2>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider',
                      cancelAtPeriodEnd
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                        : isPaid
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    )}
                  >
                    {cancelAtPeriodEnd
                      ? 'Ends at period close'
                      : isPaid
                        ? (status ?? 'Active')
                        : 'Free'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {cancelAtPeriodEnd
                    ? `Paid features stay active through ${formatDate(periodEnd)}.`
                    : isPaid
                      ? 'Active subscription with automatic renewal.'
                      : 'No paid subscription is active.'}
                </p>
              </div>
              {recurringPrice != null && (
                <div className="sm:text-right">
                  <p className="text-3xl font-bold tracking-tight">
                    ₹{formatCurrency(recurringPrice)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">billed {billingCycle}</p>
                </div>
              )}
            </div>

            {isPaid ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                <div className="grid gap-4 p-5 sm:grid-cols-[42px_1fr_auto] sm:items-center sm:p-6">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                    <CalendarDays className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Current billing period</p>
                    <p className="mt-1 text-sm font-bold">
                      {formatDate(currentPeriodStart)} — {formatDate(currentPeriodEnd)}
                    </p>
                  </div>
                  <span className="hidden text-[11px] font-medium text-slate-400 sm:block">
                    Paid access
                  </span>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-[42px_1fr_auto] sm:items-center sm:p-6">
                  <div
                    className={cn(
                      'grid h-10 w-10 place-items-center rounded-xl',
                      cancelAtPeriodEnd
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                        : 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300'
                    )}
                  >
                    <RefreshCw className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Automatic renewal</p>
                    <p
                      className={cn(
                        'mt-1 text-sm font-bold',
                        cancelAtPeriodEnd && 'text-amber-700 dark:text-amber-300'
                      )}
                    >
                      {cancelAtPeriodEnd
                        ? 'Off — no more automatic charges'
                        : `On — renews ${formatDate(renewsAt)}`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'hidden rounded-full px-2.5 py-1 text-[10px] font-bold sm:block',
                      cancelAtPeriodEnd
                        ? 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                    )}
                  >
                    {cancelAtPeriodEnd ? 'DISABLED' : 'ENABLED'}
                  </span>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-[42px_1fr_auto] sm:items-center sm:p-6">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <CreditCard className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Payment authorization</p>
                    <p className="mt-1 text-sm font-bold">Razorpay AutoPay</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {cancelAtPeriodEnd
                        ? 'Scheduled to stop at period end'
                        : 'Authorized for recurring payments'}
                    </p>
                  </div>
                  <ShieldCheck className="hidden h-5 w-5 text-emerald-500 sm:block" />
                </div>
              </div>
            ) : (
              <div className="p-7 text-center">
                <Sparkles className="mx-auto h-7 w-7 text-blue-600" />
                <h3 className="mt-3 font-bold">Ready for more capacity?</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Choose a plan to unlock more AI, automation, and analytics.
                </p>
                <Link
                  href="/settings/billing"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
                >
                  View plans <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </section>

          {isPaid && (
            <section
              className={cn(
                'mt-5 rounded-3xl border p-5 sm:p-6',
                cancelAtPeriodEnd
                  ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20'
                  : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60'
              )}
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-lg">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Subscription renewal
                  </p>
                  <h2 className="mt-2 text-base font-bold">
                    {cancelAtPeriodEnd
                      ? 'Your cancellation is scheduled'
                      : 'Need to end your subscription?'}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {cancelAtPeriodEnd
                      ? `You retain every ${titleCase(plan)} feature until ${formatDate(periodEnd)}. Your account then moves to Free immediately with no grace period.`
                      : `Cancellation turns off Razorpay AutoPay. You keep complete ${titleCase(plan)} access through ${formatDate(currentPeriodEnd)}.`}
                  </p>
                </div>
                {canCancel && (
                  <button
                    type="button"
                    onClick={openCancelDialog}
                    className="shrink-0 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 transition hover:border-red-300 hover:bg-red-50 dark:border-red-900 dark:bg-slate-950 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    Cancel subscription
                  </button>
                )}
              </div>
            </section>
          )}

          <div className="mt-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pb-2 pt-8 text-[10px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <LockKeyhole className="h-3 w-3" />
              Authenticated
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3" />
              Provider confirmed
            </span>
            <span className="flex items-center gap-1.5">
              <Clock3 className="h-3 w-3" />
              Paid-through access
            </span>
          </div>
        </div>
      </section>
      {showCancelDialog && (
        <div
          className={cn(
            'fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm duration-300',
            closing ? 'fill-mode-forwards animate-out fade-out' : 'animate-in fade-in'
          )}
          role="presentation"
          onClick={() => !cancellationMutation.isPending && closeCancelDialog()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            onClick={event => event.stopPropagation()}
            className={cn(
              'flex h-full w-full max-w-lg flex-col bg-white shadow-2xl duration-300 ease-out dark:bg-slate-900',
              closing
                ? 'fill-mode-forwards animate-out slide-out-to-right'
                : 'animate-in slide-in-from-right'
            )}
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-800 sm:px-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-300">
                  Confirm cancellation
                </p>
                <h2 id="cancel-title" className="mt-2 text-xl font-bold">
                  Turn off automatic renewal?
                </h2>
              </div>
              <button
                type="button"
                onClick={closeCancelDialog}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close cancellation dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
              <div className="relative overflow-hidden rounded-2xl bg-slate-950 p-5 text-white">
                <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-blue-500/25 blur-2xl" />
                <div className="relative flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/10 text-amber-300">
                    <Clock3 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">You will not lose access today</p>
                    <p className="mt-1.5 text-sm leading-6 text-slate-300">
                      Your {titleCase(plan)} plan remains active through{' '}
                      <strong className="text-white">{formatDate(currentPeriodEnd)}</strong>.
                      AutoPay will be disabled and no next subscription charge will occur.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="cancellation-reason" className="text-sm font-bold">
                  What is the main reason?
                </label>
                <select
                  id="cancellation-reason"
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">Select a reason</option>
                  {CANCELLATION_REASONS.map(item => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="cancellation-feedback" className="text-sm font-bold">
                  Anything else we should know?{' '}
                  <span className="font-normal text-slate-500">Optional</span>
                </label>
                <textarea
                  id="cancellation-feedback"
                  value={feedback}
                  onChange={event => setFeedback(event.target.value.slice(0, 500))}
                  rows={4}
                  placeholder="Your feedback helps us improve."
                  className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950"
                />
                <p className="mt-1 text-right text-[11px] text-slate-400">{feedback.length}/500</p>
              </div>

              <label
                htmlFor="cancellation-acknowledge"
                className={cn(
                  'flex w-full cursor-pointer items-start gap-3 rounded-2xl border-2 border-solid p-4 text-left transition',
                  acknowledged
                    ? 'border-red-500 bg-red-50 dark:border-red-500 dark:bg-red-950/30'
                    : 'border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800/60 dark:hover:bg-slate-800'
                )}
              >
                <input
                  id="cancellation-acknowledge"
                  type="checkbox"
                  checked={acknowledged}
                  onChange={event => setAcknowledged(event.target.checked)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 border-solid text-white shadow-sm ring-1 ring-inset transition',
                    acknowledged
                      ? 'border-red-600 bg-red-600 ring-red-600'
                      : 'border-slate-500 bg-slate-200 ring-slate-300 dark:border-slate-400 dark:bg-slate-700 dark:ring-slate-600'
                  )}
                >
                  <Check
                    className={cn(
                      'h-4 w-4 stroke-[3] transition',
                      acknowledged ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </span>
                <span className="text-sm font-medium leading-6 text-slate-700 dark:text-slate-200">
                  I understand that my account moves to Free immediately after{' '}
                  {formatDate(currentPeriodEnd)}, without a grace period.
                </span>
              </label>

              {cancellationError && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  We couldn’t complete your cancellation right now and your subscription was not
                  changed. Please try again in a few minutes.
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900 sm:px-8">
              <button
                type="button"
                onClick={() => cancellationMutation.mutate()}
                disabled={!reason || !acknowledged || cancellationMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {cancellationMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {cancellationMutation.isPending ? 'Disabling AutoPay…' : 'Confirm cancellation'}
              </button>
              <button
                type="button"
                onClick={closeCancelDialog}
                disabled={cancellationMutation.isPending}
                className="mt-2 w-full rounded-xl px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Keep my subscription
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
