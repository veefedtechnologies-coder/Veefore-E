/**
 * BillingPage — Subscription pricing & management UI.
 * Route: /settings/billing
 *
 * Shows:
 * - Current plan status + usage via useSubscription()
 * - Pricing cards for all 5 plans
 * - Upgrade/downgrade CTA that calls POST /api/v2/subscription/create
 * - Active add-ons list
 */

import React, { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import useSubscription from '@/hooks/useSubscription'
import { Check, Zap, Star, Building2, Crown, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'
import { SubscriptionUsagePanel } from '@/components/subscription/SubscriptionUsagePanel'
import { openRazorpayCheckout } from '@/lib/razorpayCheckout'

// ---------------------------------------------------------------------------
// Plan definitions (display only — limits come from server via useSubscription)
// ---------------------------------------------------------------------------

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: { monthly: 0, yearly: 0 },
    icon: Star,
    color: 'text-gray-500',
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    border: 'border-gray-200 dark:border-gray-700',
    features: [
      '1 Workspace',
      '6 Social Profiles',
      '30 Scheduled Posts/month',
      '50 AI Credits/month',
      'Basic VeeGPT',
      'Basic Analytics (30 days)',
    ],
  },
  {
    id: 'creator',
    name: 'Creator',
    price: { monthly: 799, yearly: 7999 },
    icon: Zap,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    popular: true,
    features: [
      '2 Workspaces',
      '15 Social Profiles',
      'Unlimited Scheduling',
      '500 AI Credits/month',
      'Full VeeGPT',
      '1 Year Analytics History',
      'Bulk Scheduling',
      'Basic Social Listening',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: { monthly: 1999, yearly: 19999 },
    icon: Star,
    color: 'text-purple-600',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    border: 'border-purple-200 dark:border-purple-800',
    features: [
      '5 Workspaces',
      '75 Social Profiles',
      '5 Team Members',
      '2,000 AI Credits/month',
      'Advanced VeeGPT',
      '2 Years Analytics History',
      'Custom Dashboards',
      'Advanced Social Listening',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: { monthly: 4999, yearly: 49999 },
    icon: Building2,
    color: 'text-orange-600',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
    features: [
      '20 Workspaces',
      '300 Social Profiles',
      '20 Team Members',
      '5,000 AI Credits/month',
      'White-label Reports',
      'Client Reporting',
      'Approval Workflow',
      'Priority Chat Support',
    ],
  },
]

const PLAN_ORDER = ['free', 'creator', 'pro', 'business', 'enterprise']

// ---------------------------------------------------------------------------
// BillingPage component
// ---------------------------------------------------------------------------

export function BillingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { user } = useFirebaseAuth()
  const { plan: currentPlan, status, isLoading: subLoading } = useSubscription()
  const queryClient = useQueryClient()

  // After Razorpay's redirect-mode checkout finishes, checkoutCallback
  // (server) 302s the browser back here with a `checkout` query param.
  // Refresh subscription state and surface failure/cancellation, then strip
  // the param so a page refresh doesn't re-trigger this.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkoutResult = params.get('checkout')
    if (!checkoutResult) return

    if (checkoutResult === 'success') {
      queryClient.invalidateQueries({ queryKey: ['subscription', 'me'] })
    } else if (checkoutResult === 'failed') {
      setError('Payment could not be completed. Please try again.')
    } else if (checkoutResult === 'cancelled') {
      setError('Checkout was cancelled before payment completed.')
    }

    params.delete('checkout')
    const newSearch = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: userDataRaw } = useQuery({
    queryKey: ['/api/user'],
    queryFn: () => apiRequest('/api/user'),
    enabled: !!user,
  })
  const userData = (userDataRaw as any)?.data?.user ?? (userDataRaw as any)?.data ?? (userDataRaw as any)?.user ?? userDataRaw

  const subscribeMutation = useMutation({
    mutationFn: async ({ planId, cycle }: { planId: string; cycle: 'monthly' | 'yearly' }) => {
      const res = await apiRequest('/api/v2/subscription/create', {
        method: 'POST',
        body: JSON.stringify({
          planId,
          billingCycle: cycle,
          workspaceId: userData?.currentWorkspaceId ?? '',
          email: userData?.email ?? user?.email ?? '',
          phone: userData?.preferences?.phone ?? user?.phoneNumber ?? '9999999999',
        }),
      })
      return res
    },
    onSuccess: async (data: any) => {
      if (data?.subscriptionId) {
        // Open Razorpay Checkout.js directly on top of THIS page — Razorpay's
        // widget is always an overlay/modal (that part isn't something we
        // control), but opening it here instead of navigating to a separate
        // page first means the dimmed backdrop behind it is the actual app,
        // not a blank loading screen. Prefilling email/phone (already known
        // from the user's account) skips Razorpay's mandatory "Contact
        // details" step when possible.
        try {
          await openRazorpayCheckout({
            subscriptionId: data.subscriptionId,
            email: userData?.email ?? user?.email ?? undefined,
            // preferences.phone is set automatically once Razorpay collects
            // a real contact number during any successful mandate
            // registration (see persistPhoneFromPayment in
            // webhook.controller.ts) — subsequent subscribe/resubscribe
            // attempts prefill it and skip the "Contact details" step.
            phone: userData?.preferences?.phone ?? user?.phoneNumber ?? undefined,
            onDismiss: () => setPurchasing(null),
          })
        } catch (e: any) {
          setPurchasing(null)
          setError(e?.message ?? 'Failed to open payment window. Please try again.')
        }
      } else if (data?.checkoutUrl) {
        setPurchasing(null)
        window.location.href = data.checkoutUrl
      } else {
        setPurchasing(null)
        queryClient.invalidateQueries({ queryKey: ['subscription', 'me'] })
      }
    },
    onError: (err: any) => {
      setPurchasing(null)
      setError(err?.message ?? 'Failed to start subscription. Please try again.')
    },
  })

  const upgradeMutation = useMutation({
    mutationFn: async (newPlanId: string) => {
      return apiRequest('/api/v2/subscription/upgrade', {
        method: 'POST',
        body: JSON.stringify({ newPlanId }),
      })
    },
    onSuccess: () => {
      setPurchasing(null)
      queryClient.invalidateQueries({ queryKey: ['subscription', 'me'] })
    },
    onError: (err: any) => {
      setPurchasing(null)
      setError(err?.message ?? 'Failed to upgrade. Please try again.')
    },
  })

  const downgradeMutation = useMutation({
    mutationFn: async (newPlanId: string) => {
      return apiRequest('/api/v2/subscription/downgrade-to-free', {
        method: 'POST',
        body: JSON.stringify({ newPlanId }),
      })
    },
    onSuccess: () => {
      setPurchasing(null)
      queryClient.invalidateQueries({ queryKey: ['subscription', 'me'] })
    },
    onError: (err: any) => {
      setPurchasing(null)
      setError(err?.message ?? 'Failed to downgrade. Please try again.')
    },
  })

  const handleSelectPlan = async (planId: string) => {
    if (planId === currentPlan) return
    setError(null)
    setPurchasing(planId)

    const currentOrder = PLAN_ORDER.indexOf(currentPlan ?? 'free')
    const newOrder = PLAN_ORDER.indexOf(planId)

    if (planId === 'free') {
      // Immediate downgrade to free — cancel any active/started subscription
      await downgradeMutation.mutateAsync(planId)
    } else if (status === 'active' && currentPlan && currentPlan !== 'free' && newOrder > currentOrder) {
      // Only use the upgrade path (no checkout) when the user has an ACTIVE
      // paid subscription and is moving to a higher tier.
      await upgradeMutation.mutateAsync(planId)
    } else {
      // New subscription / re-subscribe — go through Razorpay checkout
      await subscribeMutation.mutateAsync({ planId, cycle: billingCycle })
    }
  }

  const cancelMutation = useMutation({
    mutationFn: () => apiRequest('/api/v2/subscription/cancel', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subscription', 'me'] }),
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-16">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Billing & Plans</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your subscription and billing preferences</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-8 space-y-8">

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-300">Error</p>
              <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 text-lg leading-none">×</button>
          </div>
        )}

        {/* Current plan status */}
        {!subLoading && currentPlan && currentPlan !== 'free' && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Plan</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 capitalize mt-1">{currentPlan}</p>
                <p className={cn('text-sm mt-0.5 capitalize', status === 'active' ? 'text-emerald-600' : 'text-amber-600')}>
                  {status}
                </p>
              </div>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="text-sm text-gray-500 hover:text-red-600 transition-colors"
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Cancel subscription'}
              </button>
            </div>
          </div>
        )}

        {/* Usage panel */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Your Usage</h2>
          <SubscriptionUsagePanel />
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Choose a Plan</h2>
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-all', billingCycle === 'monthly' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500')}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5', billingCycle === 'yearly' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500')}
            >
              Yearly
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full">Save 17%</span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => {
            const isCurrentPlan = currentPlan === plan.id
            const price = billingCycle === 'yearly' ? plan.price.yearly : plan.price.monthly
            const monthlyEquiv = billingCycle === 'yearly' && plan.price.yearly > 0
              ? Math.round(plan.price.yearly / 12)
              : plan.price.monthly
            const Icon = plan.icon
            const isPurchasing = purchasing === plan.id
            const currentOrder = PLAN_ORDER.indexOf(currentPlan ?? 'free')
            const planOrder = PLAN_ORDER.indexOf(plan.id)
            const isDowngrade = planOrder < currentOrder
            const isUpgrade = planOrder > currentOrder

            let ctaLabel = 'Get started'
            if (isCurrentPlan) ctaLabel = 'Current Plan'
            else if (plan.id === 'free') ctaLabel = isDowngrade ? 'Downgrade to Free' : 'Get started free'
            else if (status === 'active' && isUpgrade) ctaLabel = `Upgrade to ${plan.name}`
            else if (status === 'active' && isDowngrade) ctaLabel = `Downgrade to ${plan.name}`
            else ctaLabel = `Subscribe to ${plan.name}`

            return (
              <div
                key={plan.id}
                className={cn(
                  'relative flex flex-col rounded-2xl border-2 p-5 transition-all',
                  plan.popular ? 'border-blue-500 shadow-lg shadow-blue-500/10' : 'border-gray-200 dark:border-gray-800',
                  isCurrentPlan ? 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-gray-950' : '',
                  'bg-white dark:bg-gray-900'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    Most Popular
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute -top-3 right-4 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    Active
                  </div>
                )}

                {/* Plan header */}
                <div className={cn('flex items-center gap-2 rounded-xl p-2.5 mb-4 w-fit', plan.bg)}>
                  <Icon className={cn('h-5 w-5', plan.color)} />
                  <span className={cn('text-sm font-bold', plan.color)}>{plan.name}</span>
                </div>

                {/* Price */}
                <div className="mb-5">
                  {price === 0 ? (
                    <p className="text-3xl font-black text-gray-900 dark:text-gray-100">Free</p>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xs font-medium text-gray-500">₹</span>
                        <span className="text-3xl font-black text-gray-900 dark:text-gray-100">
                          {billingCycle === 'yearly' ? monthlyEquiv.toLocaleString() : price.toLocaleString()}
                        </span>
                        <span className="text-sm text-gray-500">/mo</span>
                      </div>
                      {billingCycle === 'yearly' && (
                        <p className="text-xs text-gray-400 mt-0.5">₹{price.toLocaleString()} billed yearly</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Check className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => !isCurrentPlan && handleSelectPlan(plan.id)}
                  disabled={isCurrentPlan || isPurchasing || !!(purchasing && !isPurchasing)}
                  className={cn(
                    'w-full rounded-xl py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-2',
                    isCurrentPlan
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 cursor-default'
                      : plan.popular
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-900 dark:bg-white hover:opacity-90 text-white dark:text-gray-900',
                    (purchasing && !isPurchasing) ? 'opacity-50 cursor-not-allowed' : ''
                  )}
                >
                  {isPurchasing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {ctaLabel}
                </button>
              </div>
            )
          })}
        </div>

        {/* Enterprise callout */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-900 to-gray-600 dark:from-gray-100 dark:to-gray-400 flex items-center justify-center">
              <Crown className="h-5 w-5 text-white dark:text-gray-900" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">Enterprise</p>
              <p className="text-sm text-gray-500">Unlimited workspaces, custom AI credits, SSO, SLA, dedicated support</p>
            </div>
          </div>
          <a
            href="mailto:sales@veefore.com?subject=Enterprise Plan Inquiry"
            className="px-5 py-2.5 rounded-xl border-2 border-gray-900 dark:border-gray-100 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:bg-gray-900 hover:text-white dark:hover:bg-gray-100 dark:hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            Contact Sales
          </a>
        </div>

        {/* Test mode note */}
        {process.env.NODE_ENV === 'development' && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300">
            <strong>Test mode:</strong> Using Razorpay test mode. Use test card/UPI details from{' '}
            <a href="https://razorpay.com/docs/payments/payments/test-card-details/" target="_blank" rel="noreferrer" className="underline">
              Razorpay test data docs
            </a>.
          </div>
        )}

      </div>
    </div>
  )
}

export default BillingPage
