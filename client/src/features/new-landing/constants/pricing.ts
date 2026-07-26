/**
 * Veefore New Landing Page — Pricing Tables
 *
 * Three INR pricing tiers (Starter / Growth / Agency). The `annual` value is
 * the effective monthly price when billed annually (20% off the monthly rate,
 * rounded to a sensible rupee figure). Growth is the elevated "Most Popular"
 * tier. ZERO purple — colours are applied at the section level from COLORS.
 *
 * @see VEEFORE_LANDING_PAGE_PROMPT_COMPLETE.md — "SECTION 8 — PRICING"
 * @see design.md — "Data Models" (PricingTier)
 */

/** A single pricing tier in the Pricing section. */
export interface PricingTier {
  name: 'Starter' | 'Growth' | 'Agency';
  /** Monthly price in INR (when billed monthly). */
  monthly: number;
  /** Effective monthly price in INR when billed annually (20% off). */
  annual: number;
  /** AI credits included per billing cycle. */
  credits: number;
  /** Feature bullet list shown on the card. */
  features: string[];
  /** Whether this tier is visually elevated and badged "Most Popular". */
  popular: boolean;
}

/**
 * Annual = monthly × 0.8 (20% off), rounded sensibly:
 *  - Starter: 499 × 0.8 = 399.2 → 399
 *  - Growth:  1199 × 0.8 = 959.2 → 959
 *  - Agency:  3299 × 0.8 = 2639.2 → 2639
 */
export const PRICING_TIERS_FULL: PricingTier[] = [
  {
    name: 'Starter',
    monthly: 499,
    annual: 399,
    credits: 100,
    features: [
      '1 Instagram account',
      '100 AI credits / month',
      'Smart post scheduling',
      'Basic DM automation',
      'Core analytics dashboard',
      'UPI, cards & net banking',
    ],
    popular: false,
  },
  {
    name: 'Growth',
    monthly: 1199,
    annual: 959,
    credits: 300,
    features: [
      '1 Instagram account',
      '300 AI credits / month',
      'Advanced DM automation flows',
      'AI content engine — captions & hashtags',
      'Full analytics with insights',
      'Priority support',
    ],
    popular: true,
  },
  {
    name: 'Agency',
    monthly: 3299,
    annual: 2639,
    credits: 1000,
    features: [
      'Multiple Instagram accounts',
      '1,000 AI credits / month',
      'Unlimited automation flows',
      'AI content engine for every account',
      'Team access & client dashboards',
      'Dedicated priority support',
    ],
    popular: false,
  },
];

// Phase 1 Meta review: DM/comment-automation bullets are swapped out for
// scheduling / content / analytics capabilities (those permissions are not
// yet granted, so they must not be advertised).
export const PRICING_TIERS_PHASE1: PricingTier[] = [
  {
    name: 'Starter',
    monthly: 499,
    annual: 399,
    credits: 100,
    features: [
      '1 Instagram account',
      '100 AI credits / month',
      'Smart post scheduling',
      'Content calendar & drafts',
      'Core analytics dashboard',
      'UPI, cards & net banking',
    ],
    popular: false,
  },
  {
    name: 'Growth',
    monthly: 1199,
    annual: 959,
    credits: 300,
    features: [
      '1 Instagram account',
      '300 AI credits / month',
      'Advanced scheduling & content library',
      'AI content engine — captions & hashtags',
      'Full analytics with insights',
      'Priority support',
    ],
    popular: true,
  },
  {
    name: 'Agency',
    monthly: 3299,
    annual: 2639,
    credits: 1000,
    features: [
      'Multiple Instagram accounts',
      '1,000 AI credits / month',
      'Unlimited scheduling & content planning',
      'AI content engine for every account',
      'Team access & client dashboards',
      'Dedicated priority support',
    ],
    popular: false,
  },
];

export const PRICING_TIERS: PricingTier[] =
  import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true'
    ? PRICING_TIERS_PHASE1
    : PRICING_TIERS_FULL;
