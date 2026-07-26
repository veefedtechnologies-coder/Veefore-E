/**
 * Pricing billing-period selection (pure, DOM-free).
 *
 * Backs the PricingSection monthly/annual toggle: selects the price to display
 * for a given billing period. The displayed price always equals the table value
 * for the currently selected period, and toggling monthly -> annual -> monthly
 * round-trips back to the original monthly price.
 *
 * Design: Correctness Property 10 ("Pricing toggle shows the selected period's
 * value and round-trips"), PricingSection design.
 * Requirements: 13.3, 13.4.
 */

/** The billing period a visitor can select in the pricing toggle. */
export type BillingPeriod = 'monthly' | 'annual';

/** Minimal shape of a pricing tier needed to resolve a price by period. */
export interface PricingTierLike {
  /** Monthly price (INR). */
  monthly: number;
  /** Effective monthly price when billed annually (INR). */
  annual: number;
}

/**
 * Resolve the price to display for the selected billing period.
 *
 * @param tier - A pricing tier exposing `monthly` and `annual` prices.
 * @param period - The currently selected billing period.
 * @returns `tier.monthly` for `'monthly'`, `tier.annual` for `'annual'`.
 */
export function selectedPrice(tier: PricingTierLike, period: BillingPeriod): number {
  return period === 'annual' ? tier.annual : tier.monthly;
}
