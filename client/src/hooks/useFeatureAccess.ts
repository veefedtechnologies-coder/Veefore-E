/**
 * useFeatureAccess
 *
 * Thin client-side helper over `useSubscription` for plan-feature gating.
 * The SERVER is always the source of truth (every gated route returns 403 with
 * an upgradeHint); this hook exists purely so the UI can proactively lock /
 * hide features the current plan doesn't include — instead of letting the user
 * open a page and hit a wall of 403s.
 *
 * Usage:
 *   const { hasFeature, isLoading } = useFeatureAccess()
 *   if (!isLoading && !hasFeature('socialListening')) return <Locked/>
 */

import useSubscription, { type SubscriptionFeatures } from './useSubscription'

export type PlanFeatureKey = keyof Omit<
  SubscriptionFeatures,
  'veeGPTLevel' | 'aiRecommendationsLevel' | 'analyticsExport'
>

export interface UseFeatureAccessReturn {
  /** True when the current plan includes the given boolean feature. */
  hasFeature: (key: PlanFeatureKey) => boolean
  /** The raw features object (or undefined while loading). */
  features: SubscriptionFeatures | undefined
  /** Current plan id (e.g. 'free', 'creator', 'pro'). */
  plan: string | undefined
  /** True while the subscription state is still loading. */
  isLoading: boolean
}

export function useFeatureAccess(): UseFeatureAccessReturn {
  const { limits, plan, isLoading } = useSubscription()
  const features = limits?.features

  const hasFeature = (key: PlanFeatureKey): boolean => {
    // Enterprise / unknown → fail open only when we genuinely have no data yet;
    // once features are loaded, respect them exactly.
    if (!features) return false
    return features[key] === true
  }

  return { hasFeature, features, plan, isLoading }
}

export default useFeatureAccess
