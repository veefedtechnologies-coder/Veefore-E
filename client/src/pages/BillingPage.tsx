import React, { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Crown,
  Headphones,
  Infinity as InfinityIcon,
  Loader2,
  LockKeyhole,
  Rocket,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { VeeGPTUsagePanel } from '@/components/subscription/VeeGPTUsagePanel';
import useSubscription from '@/hooks/useSubscription';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';
import { openRazorpayCheckout, openRazorpayOrderCheckout } from '@/lib/razorpayCheckout';
import { nudgePremiumModalPoll } from '@/components/subscription/PremiumSubscriptionModalHost';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * One-time prepaid AI credit packs. Prices here are DISPLAY-ONLY — the server
 * derives the charged amount from ADDON_CONFIG. Keep in sync with
 * server/config/plan-config.ts. These are one-time top-ups, NOT recurring
 * add-ons (extra workspaces/seats/etc. are intentionally not sold here).
 */
const CREDIT_PACKS: ReadonlyArray<{
  addonType: string;
  credits: number;
  priceInr: number;
  popular?: boolean;
}> = [
  { addonType: 'ai_credits_500', credits: 500, priceInr: 299 },
  { addonType: 'ai_credits_2000', credits: 2000, priceInr: 899, popular: true },
  { addonType: 'ai_credits_5000', credits: 5000, priceInr: 1999 },
];

type BillingCycle = 'monthly' | 'yearly';
type PaidPlanId = 'creator' | 'pro' | 'business';

type PlanDefinition = {
  id: PaidPlanId;
  name: string;
  eyebrow: string;
  description: string;
  monthly: number;
  yearly: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  iconStyle: string;
  popular?: boolean;
  highlights: string[];
};
const PLAN_ORDER = ['free', 'creator', 'pro', 'business', 'enterprise'] as const;

const PLANS: PlanDefinition[] = [
  {
    id: 'creator',
    name: 'Creator',
    eyebrow: 'For creators & freelancers',
    description:
      'Publish consistently, understand your audience, and automate everyday engagement.',
    monthly: 799,
    yearly: 7999,
    icon: Rocket,
    accent: 'from-sky-500 to-blue-600',
    iconStyle: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
    highlights: [
      '2 workspaces and 15 social profiles',
      '80 scheduled posts every month',
      '500 AI credits with Full VeeGPT',
      '5 workflows and 5 AI workflows',
      '1 year of cross-platform analytics',
      'Basic social listening and exports',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    eyebrow: 'For growing businesses',
    description:
      'Turn data into growth with advanced AI, deeper analytics, and automation at scale.',
    monthly: 1999,
    yearly: 19999,
    icon: Sparkles,
    accent: 'from-violet-500 to-indigo-600',
    iconStyle: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
    popular: true,
    highlights: [
      '5 workspaces and 75 social profiles',
      '5 team members and 2,000 AI credits',
      'Advanced VeeGPT and AI insights',
      'Unlimited workflows and triggers',
      'Custom dashboards and advanced reports',
      'Advanced listening and smart journeys',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    eyebrow: 'For agencies & larger teams',
    description:
      'Operate multiple brands with client-ready reporting, governance, and generous limits.',
    monthly: 4999,
    yearly: 49999,
    icon: Building2,
    accent: 'from-amber-500 to-orange-600',
    iconStyle: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    highlights: [
      '20 workspaces and 300 social profiles',
      '20 team members and unlimited posts',
      '5,000 AI credits every month',
      'White-label and client reporting',
      'Approval workflows and advanced roles',
      'Priority chat support',
    ],
  },
];

type ComparisonRow = {
  label: string;
  creator: string;
  pro: string;
  business: string;
  enterprise: string;
  featured?: boolean;
};

const COMPARISON_GROUPS: Array<{
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: ComparisonRow[];
}> = [
  {
    title: 'Workspace & publishing',
    icon: Users,
    rows: [
      {
        label: 'Workspaces',
        creator: '2',
        pro: '5',
        business: '20',
        enterprise: 'Unlimited',
        featured: true,
      },
      {
        label: 'Social profiles',
        creator: '15',
        pro: '75',
        business: '300',
        enterprise: 'Unlimited',
      },
      { label: 'Team members', creator: '1', pro: '5', business: '20', enterprise: 'Unlimited' },
      {
        label: 'Scheduled posts / month',
        creator: '80',
        pro: '80',
        business: 'Unlimited',
        enterprise: 'Unlimited',
      },
      {
        label: 'Bulk scheduling & drafts',
        creator: 'Included',
        pro: 'Included',
        business: 'Included',
        enterprise: 'Included',
      },
    ],
  },
  {
    title: 'AI & intelligence',
    icon: Bot,
    rows: [
      {
        label: 'AI credits / month',
        creator: '500',
        pro: '2,000',
        business: '5,000',
        enterprise: 'Custom',
        featured: true,
      },
      {
        label: 'VeeGPT',
        creator: 'Full',
        pro: 'Advanced',
        business: 'Advanced',
        enterprise: 'Advanced',
      },
      {
        label: 'AI recommendations',
        creator: 'Standard',
        pro: 'Advanced',
        business: 'Advanced',
        enterprise: 'Advanced',
      },
      {
        label: 'AI analytics insights',
        creator: '—',
        pro: 'Included',
        business: 'Included',
        enterprise: 'Included',
      },
    ],
  },
  {
    title: 'Automation & engagement',
    icon: Workflow,
    rows: [
      {
        label: 'Workflows / AI workflows',
        creator: '5 / 5',
        pro: 'Unlimited',
        business: 'Unlimited',
        enterprise: 'Unlimited',
        featured: true,
      },
      {
        label: 'Keyword triggers',
        creator: '20',
        pro: 'Unlimited',
        business: 'Unlimited',
        enterprise: 'Unlimited',
      },
      {
        label: 'Keyword conversations / month',
        creator: '500',
        pro: '5,000',
        business: '50,000',
        enterprise: 'Unlimited',
      },
      {
        label: 'AI conversations / month',
        creator: '300',
        pro: '3,000',
        business: '30,000',
        enterprise: 'Unlimited',
      },
      {
        label: 'Follow campaign conversations',
        creator: '100',
        pro: '1,000',
        business: '10,000',
        enterprise: 'Unlimited',
      },
      {
        label: 'Multi-step journeys & smart logic',
        creator: '—',
        pro: 'Included',
        business: 'Included',
        enterprise: 'Included',
      },
    ],
  },
  {
    title: 'Analytics, listening & control',
    icon: BarChart3,
    rows: [
      {
        label: 'Analytics history',
        creator: '1 year',
        pro: '2 years',
        business: '2 years',
        enterprise: 'Unlimited',
        featured: true,
      },
      {
        label: 'Custom dashboards & reports',
        creator: '—',
        pro: 'Included',
        business: 'Included',
        enterprise: 'Included',
      },
      {
        label: 'Social listening',
        creator: 'Basic',
        pro: 'Advanced',
        business: 'Advanced',
        enterprise: 'Advanced',
      },
      {
        label: 'White-label & client reports',
        creator: '—',
        pro: '—',
        business: 'Included',
        enterprise: 'Included',
      },
      {
        label: 'Approval workflow',
        creator: '—',
        pro: '—',
        business: 'Included',
        enterprise: 'Included',
      },
      { label: 'API access & SSO', creator: '—', pro: '—', business: '—', enterprise: 'Included' },
      {
        label: 'Support',
        creator: 'Email',
        pro: 'Priority email',
        business: 'Priority chat',
        enterprise: 'Dedicated + SLA',
      },
    ],
  },
];

const formatInr = (value: number) => new Intl.NumberFormat('en-IN').format(value);
const titleCase = (value?: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Free';

export function BillingPage() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('yearly');
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [buyingCredits, setBuyingCredits] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pendingDowngrade, setPendingDowngrade] = useState<PaidPlanId | 'free' | null>(null);
  const confirmPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { user } = useFirebaseAuth();
  const {
    plan: currentPlan,
    status,
    limits,
    usage,
    aiCredits,
    cancelAtPeriodEnd,
    isLoading: subscriptionLoading,
  } = useSubscription();
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutResult = params.get('checkout');
    if (!checkoutResult) return;

    if (checkoutResult === 'success') {
      setConfirming(true);
      queryClient.invalidateQueries({ queryKey: ['subscription', 'me'] });
      // An upgrade raises the workspace limit — refresh the workspace lists so
      // previously-locked workspaces unlock in the switcher immediately instead
      // of after the 5-min stale window.
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces-v2'] });
      // The confirming webhook (subscription.activated) also arms the premium
      // welcome modal; poll for it so it appears once fulfilment lands.
      nudgePremiumModalPoll();
      const startedAt = Date.now();
      confirmPollRef.current = setInterval(() => {
        if (Date.now() - startedAt > 40_000) {
          if (confirmPollRef.current) clearInterval(confirmPollRef.current);
          confirmPollRef.current = null;
          setConfirming(false);
          return;
        }
        queryClient.invalidateQueries({ queryKey: ['subscription', 'me'] });
      }, 2000);
    } else if (checkoutResult === 'failed') {
      setError('Your payment could not be completed. No plan changes were made—please try again.');
    } else if (checkoutResult === 'cancelled') {
      setError('Checkout was closed before payment was completed.');
    }

    params.delete('checkout');
    const nextSearch = params.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`
    );

    return () => {
      if (confirmPollRef.current) clearInterval(confirmPollRef.current);
      confirmPollRef.current = null;
    };
  }, [queryClient]);

  useEffect(() => {
    if (confirming && status === 'active' && currentPlan && currentPlan !== 'free') {
      setConfirming(false);
      if (confirmPollRef.current) clearInterval(confirmPollRef.current);
      confirmPollRef.current = null;
      // The plan is now applied (webhook processed) — refresh the workspace
      // lists once more so any workspace locked under the previous plan unlocks
      // now that the higher limit is in effect.
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces-v2'] });
    }
  }, [confirming, currentPlan, status, queryClient]);

  const { data: userDataRaw } = useQuery({
    queryKey: ['/api/user'],
    queryFn: () => apiRequest('/api/user'),
    enabled: Boolean(user),
  });
  const userData =
    (userDataRaw as any)?.data?.user ??
    (userDataRaw as any)?.data ??
    (userDataRaw as any)?.user ??
    userDataRaw;

  const launchCheckout = async (data: any) => {
    if (data?.subscriptionId) {
      try {
        await openRazorpayCheckout({
          subscriptionId: data.subscriptionId,
          email: userData?.email ?? user?.email ?? undefined,
          phone: userData?.preferences?.phone ?? user?.phoneNumber ?? undefined,
          onDismiss: () => setPurchasing(null),
        });
      } catch (checkoutError: any) {
        setPurchasing(null);
        setError(checkoutError?.message ?? 'We could not open secure checkout. Please try again.');
      }
      return;
    }

    if (data?.checkoutUrl) {
      setPurchasing(null);
      window.location.href = data.checkoutUrl;
      return;
    }

    setPurchasing(null);
    queryClient.invalidateQueries({ queryKey: ['subscription', 'me'] });
  };

  const subscribeMutation = useMutation({
    mutationFn: ({ planId, cycle }: { planId: PaidPlanId; cycle: BillingCycle }) =>
      apiRequest('/api/v2/subscription/create', {
        method: 'POST',
        body: JSON.stringify({
          planId,
          billingCycle: cycle,
          workspaceId: userData?.currentWorkspaceId ?? '',
          email: userData?.email ?? user?.email ?? '',
          phone: userData?.preferences?.phone ?? user?.phoneNumber ?? '9999999999',
        }),
      }),
    onSuccess: launchCheckout,
    onError: (mutationError: any) => {
      setPurchasing(null);
      setError(mutationError?.message ?? 'We could not start your subscription. Please try again.');
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: (newPlanId: PaidPlanId) =>
      apiRequest('/api/v2/subscription/upgrade', {
        method: 'POST',
        body: JSON.stringify({ newPlanId }),
      }),
    onSuccess: launchCheckout,
    onError: (mutationError: any) => {
      setPurchasing(null);
      setError(mutationError?.message ?? 'We could not start your upgrade. Please try again.');
    },
  });

  // Downgrade to a LOWER paid tier. Unlike upgrade/subscribe there is no
  // checkout — the change is SCHEDULED for the end of the current paid period
  // (the backend records a `subscription.downgrade_scheduled` event and flags
  // cancelAtPeriodEnd). The user keeps their current plan until then, so we just
  // refetch and show a confirmation note rather than opening Razorpay.
  const downgradeMutation = useMutation({
    // TEST: `immediate` applies the downgrade right now instead of at period end.
    mutationFn: (newPlanId: PaidPlanId | 'free') =>
      apiRequest('/api/v2/subscription/downgrade', {
        method: 'POST',
        body: JSON.stringify({ newPlanId, immediate: true }),
      }),
    onSuccess: (_data, newPlanId) => {
      setPurchasing(null);
      setPendingDowngrade(null);
      setNotice(`Downgraded to ${titleCase(newPlanId)}. Applied immediately.`);
      queryClient.invalidateQueries({ queryKey: ['subscription', 'me'] });
      // A downgrade can reduce the workspace limit. Refresh the workspace lists
      // so the mandatory workspace-selection modal (driven by
      // `requiresWorkspaceSelection`) appears right away and the switcher shows
      // the new locked flags — instead of only after the 5-min stale window.
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces-v2'] });
      // Immediate downgrades write a completed subscription.downgraded event
      // that arms the plan-change success modal; poll for it now.
      nudgePremiumModalPoll();
    },
    onError: (mutationError: any) => {
      setPurchasing(null);
      setPendingDowngrade(null);
      setError(mutationError?.message ?? 'We could not schedule your downgrade. Please try again.');
    },
  });

  // ── One-time AI credit pack top-ups ──────────────────────────────────────
  // Prices are display-only; the server re-derives the real amount from
  // ADDON_CONFIG when it creates the Razorpay order, and the payment.captured
  // webhook re-checks it again before granting. Credits are granted by the
  // webhook, never here — see CreditsPage for the same flow.
  const creditOrderMutation = useMutation({
    mutationFn: (addonType: string) =>
      apiRequest('/api/v2/subscription/credits/create-order', {
        method: 'POST',
        body: JSON.stringify({ addonType, quantity: 1 }),
      }),
    onSuccess: async (order: any) => {
      try {
        await openRazorpayOrderCheckout({
          orderId: order.orderId,
          amountPaise: order.amountPaise,
          currency: order.currency,
          description: `${Number(order.credits).toLocaleString('en-IN')} AI credits`,
          email: userData?.email ?? user?.email ?? undefined,
          phone: userData?.preferences?.phone ?? user?.phoneNumber ?? undefined,
          onSuccess: () => {
            setBuyingCredits(null);
            setNotice(
              'Payment received. Your credits are being added and will appear in a few seconds.'
            );
            // Credits are granted by the payment.captured webhook, which also
            // arms the success modal. Poll for webhook-confirmed fulfilment
            // rather than treating this client callback as final.
            nudgePremiumModalPoll();
            setTimeout(
              () => queryClient.invalidateQueries({ queryKey: ['subscription', 'me'] }),
              2500
            );
          },
          onDismiss: () => setBuyingCredits(null),
        });
      } catch (checkoutError: any) {
        setBuyingCredits(null);
        setError(checkoutError?.message ?? 'We could not open secure checkout. Please try again.');
      }
    },
    onError: (mutationError: any) => {
      setBuyingCredits(null);
      setError(mutationError?.message ?? 'We could not start your purchase. Please try again.');
    },
  });

  const buyCredits = (addonType: string) => {
    if (buyingCredits || purchasing || confirming) return;
    setError(null);
    setNotice(null);
    setBuyingCredits(addonType);
    creditOrderMutation.mutate(addonType);
  };

  const currentOrder = PLAN_ORDER.indexOf((currentPlan ?? 'free') as (typeof PLAN_ORDER)[number]);

  const onPaidPlan = status === 'active' && Boolean(currentPlan) && currentPlan !== 'free';

  const selectPlan = (planId: PaidPlanId) => {
    if (purchasing || confirming) return;
    const targetOrder = PLAN_ORDER.indexOf(planId);
    if (targetOrder === currentOrder) return; // current plan — nothing to do

    setError(null);
    setNotice(null);
    setPurchasing(planId);

    if (targetOrder < currentOrder) {
      // Lower tier while on a paid plan → confirm first, then downgrade.
      if (onPaidPlan) {
        setPurchasing(null);
        setPendingDowngrade(planId);
      } else {
        setPurchasing(null);
      }
      return;
    }

    // Higher tier → upgrade (paid, active) or fresh subscribe.
    if (onPaidPlan) {
      upgradeMutation.mutate(planId);
    } else {
      subscribeMutation.mutate({ planId, cycle: billingCycle });
    }
  };

  const getCta = (plan: PlanDefinition) => {
    const planOrder = PLAN_ORDER.indexOf(plan.id);
    if (!confirming && currentPlan === plan.id) return { label: 'Current plan', disabled: true };
    // Lower tier: allow a scheduled downgrade when on a paid plan; otherwise
    // it's simply included in the higher plan the user already has.
    if (planOrder < currentOrder) {
      if (onPaidPlan) return { label: `Downgrade to ${plan.name}`, disabled: false };
      return { label: `Included with ${titleCase(currentPlan)}`, disabled: true };
    }
    if (onPaidPlan) return { label: `Upgrade to ${plan.name}`, disabled: false };
    return { label: `Choose ${plan.name}`, disabled: false };
  };

  const workspaceLimit =
    limits?.maxWorkspaces === -1 ? 'Unlimited' : (limits?.maxWorkspaces ?? '—');
  const profileLimit = limits?.maxProfiles === -1 ? 'Unlimited' : (limits?.maxProfiles ?? '—');
  return (
    <main className="min-h-screen bg-[#f6f7fb] pb-20 text-slate-950 dark:bg-slate-950 dark:text-white">
      <section className="relative isolate overflow-hidden border-b border-white/10 bg-slate-950 px-4 pb-24 pt-8 text-white sm:px-6 lg:px-8">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.24),transparent_32%),radial-gradient(circle_at_85%_35%,rgba(139,92,246,0.18),transparent_30%)]" />
        <div className="absolute inset-0 -z-10 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />

        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
                Settings / Subscription
              </p>
              <h1 className="mt-2 text-lg font-semibold text-white">Plans & billing</h1>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-slate-300 sm:flex">
              <LockKeyhole className="h-3.5 w-3.5 text-emerald-300" />
              Secure checkout
            </div>
          </div>

          <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(330px,.65fr)]">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-medium text-blue-200">
                <Sparkles className="h-3.5 w-3.5" />
                Simple plans. Serious growth.
              </div>
              <h2 className="max-w-3xl text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
                Everything you need to turn social into a growth engine.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Choose the capacity your team needs today. Upgrade as you grow and unlock deeper AI,
                automation, analytics, and collaboration.
              </p>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-300">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Instant activation after payment
                </span>
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Secure Razorpay checkout
                </span>
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-300" />
                  Upgrade without losing your work
                </span>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                    Your current plan
                  </p>
                  {subscriptionLoading ? (
                    <Skeleton variant="rectangle" className="mt-3 h-8 w-28 rounded-lg" />
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-2xl font-bold">{titleCase(currentPlan)}</p>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                          status === 'active' || currentPlan === 'free'
                            ? 'bg-emerald-400/15 text-emerald-300'
                            : 'bg-amber-400/15 text-amber-200'
                        )}
                      >
                        {currentPlan === 'free' ? 'Available' : (status ?? 'Inactive')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
                  <Crown className="h-5 w-5 text-white" />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-5">
                <div>
                  <p className="text-[11px] text-slate-400">Workspaces</p>
                  <p className="mt-1 text-sm font-semibold">
                    {usage?.workspacesUsed ?? 0} / {workspaceLimit}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400">Profiles</p>
                  <p className="mt-1 text-sm font-semibold">
                    {usage?.profilesUsed ?? 0} / {profileLimit}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400">AI credits</p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatInr(aiCredits?.remaining ?? 0)} left
                  </p>
                </div>
              </div>
              <p className="mt-5 rounded-xl bg-white/[0.05] px-3 py-2.5 text-xs leading-5 text-slate-400">
                {cancelAtPeriodEnd
                  ? 'Automatic renewal is off. Open the management portal to review your access end date.'
                  : 'Select any higher plan below to add more capacity and capabilities to your account.'}
              </p>
              {currentPlan && currentPlan !== 'free' && (
                <a
                  href="/subscription/manage"
                  className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-3 text-sm font-semibold text-white transition hover:border-blue-400/40 hover:bg-blue-400/10"
                >
                  <span>{cancelAtPeriodEnd ? 'View subscription details' : 'Manage plan'}</span>
                  <ArrowRight className="h-4 w-4 text-blue-300" />
                </a>
              )}
              {onPaidPlan && !cancelAtPeriodEnd && (
                <button
                  type="button"
                  onClick={() => {
                    if (purchasing || confirming) return;
                    setError(null);
                    setNotice(null);
                    setPendingDowngrade('free');
                  }}
                  disabled={Boolean(purchasing) || confirming}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3.5 py-2.5 text-xs font-semibold text-slate-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {purchasing === 'free' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Downgrade to Free
                </button>
              )}
              {/* §44: detailed VeeGPT usage in plain language (no provider pricing). */}
              <VeeGPTUsagePanel />
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-12 max-w-7xl px-4 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-white p-4 shadow-lg shadow-red-950/5 dark:border-red-900/60 dark:bg-slate-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                Checkout needs your attention
              </p>
              <p className="mt-0.5 text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded-lg p-1 text-red-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
              aria-label="Dismiss message"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {notice && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-lg shadow-emerald-950/5 dark:border-emerald-900/60 dark:bg-slate-900">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                Change scheduled
              </p>
              <p className="mt-0.5 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="rounded-lg p-1 text-emerald-400 transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950"
              aria-label="Dismiss message"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {confirming && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-lg shadow-blue-950/5 dark:border-blue-900/60 dark:bg-slate-900">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Confirming your payment
              </p>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                Your plan will update automatically as soon as payment is verified.
              </p>
            </div>
          </div>
        )}

        <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-xl shadow-slate-900/[0.05] dark:border-slate-800 dark:bg-slate-900 sm:p-6 lg:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                Choose your plan
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                Built for every stage of growth
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                All prices are in INR. Pick annual billing to get approximately two months included.
              </p>
            </div>

            <div
              className="flex w-fit items-center rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800"
              aria-label="Billing frequency"
            >
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={cn(
                  'rounded-xl px-4 py-2 text-sm font-semibold transition',
                  billingCycle === 'monthly'
                    ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400'
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('yearly')}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
                  billingCycle === 'yearly'
                    ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400'
                )}
              >
                Yearly
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  SAVE 17%
                </span>
              </button>
            </div>
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {PLANS.map(plan => {
              const Icon = plan.icon;
              const price = billingCycle === 'yearly' ? Math.round(plan.yearly / 12) : plan.monthly;
              const yearlySaving = plan.monthly * 12 - plan.yearly;
              const isPurchasing = purchasing === plan.id;
              const cta = getCta(plan);
              const isCurrent = !confirming && currentPlan === plan.id;
              const isDowngrade = PLAN_ORDER.indexOf(plan.id) < currentOrder && onPaidPlan;

              return (
                <article
                  key={plan.id}
                  className={cn(
                    'relative flex min-h-full flex-col overflow-hidden rounded-[1.6rem] border bg-white p-6 transition duration-300 dark:bg-slate-950/60',
                    plan.popular
                      ? 'border-violet-300 shadow-xl shadow-violet-600/10 ring-1 ring-violet-200 dark:border-violet-500/50 dark:ring-violet-500/20'
                      : 'border-slate-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/[0.06] dark:border-slate-800 dark:hover:border-slate-700',
                    isCurrent &&
                      'border-emerald-400 ring-1 ring-emerald-300 dark:border-emerald-500/60 dark:ring-emerald-500/20'
                  )}
                >
                  <div
                    className={cn(
                      'absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-90',
                      plan.accent
                    )}
                  />
                  {plan.popular && !isCurrent && (
                    <span className="absolute right-5 top-5 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                      Most popular
                    </span>
                  )}
                  {isCurrent && (
                    <span className="absolute right-5 top-5 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      Current
                    </span>
                  )}

                  <div
                    className={cn('grid h-11 w-11 place-items-center rounded-2xl', plan.iconStyle)}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
                    {plan.eyebrow}
                  </p>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                    {plan.name}
                  </h3>
                  <p className="mt-2 min-h-[72px] text-sm leading-6 text-slate-600 dark:text-slate-400">
                    {plan.description}
                  </p>

                  <div className="mt-6 border-y border-slate-100 py-5 dark:border-slate-800">
                    <div className="flex items-end gap-1">
                      <span className="pb-1 text-sm font-semibold text-slate-500">₹</span>
                      <span className="text-4xl font-bold tracking-[-0.04em] text-slate-950 dark:text-white">
                        {formatInr(price)}
                      </span>
                      <span className="pb-1 text-sm text-slate-500">/ month</span>
                    </div>
                    <div className="mt-2 min-h-5 text-xs text-slate-500 dark:text-slate-400">
                      {billingCycle === 'yearly' ? (
                        <span>
                          ₹{formatInr(plan.yearly)} billed yearly · save ₹{formatInr(yearlySaving)}
                        </span>
                      ) : (
                        <span>₹{formatInr(plan.monthly)} billed monthly</span>
                      )}
                    </div>
                  </div>

                  <p className="mt-5 text-sm font-semibold text-slate-900 dark:text-white">
                    Everything you need:
                  </p>
                  <ul className="mt-4 flex-1 space-y-3">
                    {plan.highlights.map(feature => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm leading-5 text-slate-600 dark:text-slate-300"
                      >
                        <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                          <Check className="h-2.5 w-2.5 stroke-[3] text-emerald-700 dark:text-emerald-300" />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => selectPlan(plan.id)}
                    disabled={cta.disabled || Boolean(purchasing) || confirming}
                    className={cn(
                      'mt-7 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:ring-offset-slate-950',
                      cta.disabled
                        ? 'cursor-default bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        : plan.popular
                          ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/20 hover:from-violet-700 hover:to-indigo-700'
                          : 'bg-slate-950 text-white hover:bg-blue-600 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-500 dark:hover:text-white',
                      purchasing && !isPurchasing && 'cursor-not-allowed opacity-45'
                    )}
                  >
                    {isPurchasing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      !cta.disabled && <ArrowRight className="h-4 w-4" />
                    )}
                    {isPurchasing
                      ? isDowngrade
                        ? 'Applying…'
                        : 'Opening secure checkout…'
                      : cta.label}
                  </button>
                </article>
              );
            })}
          </div>

          {/* One-time AI credit top-ups (prepaid packs, not recurring add-ons) */}
          <div className="mt-5 rounded-[1.6rem] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/60 sm:p-8">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-600 dark:text-blue-300">
                  Need more AI credits?
                </p>
                <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-950 dark:text-white">
                  Top up with a one-time credit pack
                </h3>
                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                  Purchased credits never expire and carry over between billing cycles. One-time
                  payment — no change to your plan.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {CREDIT_PACKS.map(pack => {
                const isBuying = buyingCredits === pack.addonType;
                return (
                  <div
                    key={pack.addonType}
                    className={cn(
                      'relative rounded-2xl border p-5',
                      pack.popular
                        ? 'border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10'
                        : 'border-slate-200 dark:border-slate-800'
                    )}
                  >
                    {pack.popular && (
                      <span className="absolute -top-2 right-4 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                        Best value
                      </span>
                    )}
                    <p className="text-2xl font-bold text-slate-950 dark:text-white">
                      {pack.credits.toLocaleString('en-IN')}
                    </p>
                    <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">AI credits</p>
                    <p className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
                      ₹{formatInr(pack.priceInr)}
                    </p>
                    <button
                      type="button"
                      onClick={() => buyCredits(pack.addonType)}
                      disabled={Boolean(buyingCredits) || Boolean(purchasing) || confirming}
                      className={cn(
                        'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50',
                        pack.popular
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-slate-950 text-white hover:bg-blue-600 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-500 dark:hover:text-white'
                      )}
                    >
                      {isBuying ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Opening secure checkout…
                        </>
                      ) : (
                        'Buy credits'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[1.6rem] bg-slate-950 text-white dark:border dark:border-slate-800">
            <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
                  <Crown className="h-5 w-5 text-amber-300" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-xl font-bold">Enterprise</h3>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                      Custom plan
                    </span>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                    Unlimited scale with custom AI credits, API access, SSO, dedicated
                    infrastructure, tailored onboarding, and an SLA backed by dedicated support.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <InfinityIcon className="h-3.5 w-3.5 text-blue-300" />
                      Unlimited capacity
                    </span>
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-blue-300" />
                      Enterprise security
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Headphones className="h-3.5 w-3.5 text-blue-300" />
                      Dedicated support
                    </span>
                  </div>
                </div>
              </div>
              {currentPlan === 'enterprise' ? (
                <div className="relative rounded-xl bg-emerald-400/10 px-5 py-3 text-center text-sm font-bold text-emerald-300 ring-1 ring-emerald-400/20">
                  Current plan
                </div>
              ) : (
                <a
                  href="mailto:sales@veefore.com?subject=Veefore%20Enterprise%20Plan%20Inquiry"
                  className="relative inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-blue-50"
                >
                  Contact sales <ArrowRight className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </section>
        <section className="py-16">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
              Included from Creator
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
              A complete operating system for social growth
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              Every paid plan starts with the essentials, then adds capacity and advanced controls
              as your operation grows.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Bot,
                title: 'AI creation',
                copy: 'VeeGPT, content generation, recommendations, and monthly AI credits.',
              },
              {
                icon: Workflow,
                title: 'Automation',
                copy: 'Always-on workflows for comments, DMs, triggers, and campaigns.',
              },
              {
                icon: BarChart3,
                title: 'Actionable analytics',
                copy: 'Cross-platform performance, audience intelligence, and exports.',
              },
              {
                icon: ShieldCheck,
                title: 'Reliable operations',
                copy: 'Secure checkout, protected access, and support for your plan.',
              },
            ].map(({ icon: Icon, title, copy }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <h3 className="mt-4 text-sm font-bold text-slate-950 dark:text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/[0.04] dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-6 dark:border-slate-800 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
              Full comparison
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              See exactly what each plan includes
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Limits reset monthly unless noted otherwise. Unlimited means no plan-level cap.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead className="sticky top-0 z-[1] bg-slate-50/95 backdrop-blur dark:bg-slate-950/95">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="w-[28%] px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Capability
                  </th>
                  {['Creator', 'Pro', 'Business', 'Enterprise'].map(name => (
                    <th
                      key={name}
                      className={cn(
                        'px-4 py-4 text-sm font-bold text-slate-900 dark:text-white',
                        name === 'Pro' && 'bg-violet-50/70 dark:bg-violet-500/[0.06]'
                      )}
                    >
                      {name}
                      {name === 'Pro' && (
                        <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[9px] uppercase tracking-wider text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                          Popular
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_GROUPS.map(group => {
                  const GroupIcon = group.icon;
                  return (
                    <React.Fragment key={group.title}>
                      <tr className="border-b border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/60">
                        <td colSpan={5} className="px-6 py-3">
                          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300">
                            <GroupIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />
                            {group.title}
                          </span>
                        </td>
                      </tr>
                      {group.rows.map(row => (
                        <tr
                          key={`${group.title}-${row.label}`}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-slate-800/70 dark:hover:bg-slate-800/30"
                        >
                          <td className="px-6 py-3.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                            {row.label}
                          </td>
                          {[row.creator, row.pro, row.business, row.enterprise].map(
                            (value, index) => (
                              <td
                                key={index}
                                className={cn(
                                  'px-4 py-3.5 text-sm text-slate-600 dark:text-slate-400',
                                  index === 1 && 'bg-violet-50/40 dark:bg-violet-500/[0.035]',
                                  row.featured && 'font-semibold text-slate-900 dark:text-white'
                                )}
                              >
                                {value === 'Included' ? (
                                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Included
                                  </span>
                                ) : (
                                  value
                                )}
                              </td>
                            )
                          )}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="py-16">
          <div className="grid gap-8 lg:grid-cols-[.65fr_1.35fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                Before you choose
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                Clear answers, confident purchase
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
                Your workspace data and existing content stay in place when you upgrade.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  icon: Clock3,
                  question: 'When does my plan activate?',
                  answer:
                    'Your plan activates automatically after Razorpay confirms the payment, usually within a few seconds.',
                },
                {
                  icon: Zap,
                  question: 'What happens when I upgrade?',
                  answer:
                    'The higher plan is applied after payment confirmation, unlocking its limits and features for your account.',
                },
                {
                  icon: ShieldCheck,
                  question: 'Is checkout secure?',
                  answer:
                    'Payment is completed in Razorpay’s secure checkout. Veefore uses the verified payment event before granting access.',
                },
                {
                  icon: CheckCircle2,
                  question: 'Is yearly billing better value?',
                  answer:
                    'Yearly plans save about 17% compared with paying monthly for twelve months.',
                },
              ].map(({ icon: Icon, question, answer }) => (
                <div
                  key={question}
                  className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <Icon className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                  <h3 className="mt-4 text-sm font-bold text-slate-950 dark:text-white">
                    {question}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                    {answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {process.env.NODE_ENV === 'development' && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <strong>Test mode:</strong> Razorpay test checkout is enabled in this environment.
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(pendingDowngrade)}
        onOpenChange={open => {
          if (!open && !downgradeMutation.isPending) setPendingDowngrade(null);
        }}
      >
        <DialogContent className="overflow-hidden gap-0 border-0 p-0 sm:max-w-md sm:rounded-2xl">
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-8 pb-9 pt-11 text-center text-white">
            <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" />
            <div className="relative">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                <AlertCircle className="h-8 w-8 text-amber-300" />
              </div>
              <DialogTitle className="mt-5 text-2xl font-extrabold tracking-tight">
                {pendingDowngrade === 'free'
                  ? 'Downgrade to Free?'
                  : `Switch to ${titleCase(pendingDowngrade ?? '')}?`}
              </DialogTitle>
              <DialogDescription className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-300">
                {pendingDowngrade === 'free'
                  ? 'You’ll move to the Free plan and lose access to your paid limits, workflows, and AI capacity.'
                  : `You’ll move from ${titleCase(currentPlan)} down to ${titleCase(pendingDowngrade ?? '')}. Some limits and features will be reduced to match the lower plan.`}
              </DialogDescription>
            </div>
          </div>

          <div className="space-y-4 px-8 py-6">
            <div className="flex items-center justify-center gap-3 rounded-2xl bg-slate-50 py-4 text-sm font-semibold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              <span className="capitalize">{titleCase(currentPlan)}</span>
              <ArrowRight className="h-4 w-4 text-slate-400" />
              <span className="capitalize text-slate-900 dark:text-white">
                {titleCase(pendingDowngrade ?? '')}
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => {
                  if (!pendingDowngrade) return;
                  setError(null);
                  setNotice(null);
                  downgradeMutation.mutate(pendingDowngrade);
                }}
                disabled={downgradeMutation.isPending}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {downgradeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {downgradeMutation.isPending ? 'Applying…' : 'Confirm downgrade'}
              </button>
              <button
                type="button"
                onClick={() => setPendingDowngrade(null)}
                disabled={downgradeMutation.isPending}
                className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Keep {titleCase(currentPlan)}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default BillingPage;
