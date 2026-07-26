import { useRef, useState } from 'react'

import { useLandingMotion } from '../context/LandingMotionProvider'
import { COLORS } from '../constants/colors'
import { PRICING_TIERS } from '../constants/pricing'
import type { PricingTier } from '../constants/pricing'
import { useCountUp } from '../hooks/useCountUp'
import { GlowButton } from '../primitives/GlowButton'
import { usePrimaryCta } from '../hooks/usePrimaryCta'
import { selectedPrice } from './pricingReducer'
import type { BillingPeriod } from './pricingReducer'

/**
 * Pricing (Section 8) — `id="pricing"`.
 *
 * Renders the three INR pricing tiers (Starter / Growth / Agency) from
 * `PRICING_TIERS`. The Growth tier is `popular`: it is visually elevated with a
 * coral/gold gradient border glow and a mint "Most Popular" badge
 * (Requirements 13.1, 13.2).
 *
 * A Monthly / Annual (Save 20%) toggle sits above the cards. The displayed
 * price always equals the table value for the currently selected billing
 * period (`selectedPrice`), and toggling animates the number via `useCountUp`
 * (Requirement 13.3). Under reduced motion the prices update instantly with no
 * counting animation — `useCountUp` handles this internally (Requirement 13.4).
 *
 * Colour system: ZERO purple. Backgrounds use deep navy tokens; accents use
 * coral / gold / mint only. Plan names in Syne 700, prices in JetBrains Mono.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 21.1
 */
export const PricingSection: React.FC<{ onNavigate?: (page: string) => void }> = ({ onNavigate }) => {
  const { reducedMotion } = useLandingMotion()
  const [period, setPeriod] = useState<BillingPeriod>('monthly')

  return (
    <section
      id="pricing"
      aria-label="Pricing"
      className="relative w-full overflow-hidden bg-[#040C18] px-6 py-24 md:py-32"
    >
      <div className="mx-auto max-w-6xl">
        {/* Heading */}
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2
            className="text-3xl font-bold tracking-tight text-white md:text-5xl"
            style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700 }}
          >
            Simple Pricing. No Dollar Confusion.
          </h2>
          <p
            className="mt-4 text-base md:text-lg"
            style={{ fontFamily: "'DM Sans', sans-serif", color: COLORS.textSecondary }}
          >
            Everything in Indian Rupees. No credit card to start.
          </p>
        </div>

        {/* Monthly / Annual toggle */}
        <BillingToggle period={period} onChange={setPeriod} />

        {/* Tier cards */}
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3 md:items-center">
          {PRICING_TIERS.map((tier) => (
            <PricingCard
              key={tier.name}
              tier={tier}
              period={period}
              reducedMotion={reducedMotion}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {/* Trust line */}
        <p
          className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center text-sm"
          style={{ fontFamily: "'DM Sans', sans-serif", color: COLORS.textSecondary }}
        >
          <span>
            <span className="text-[#00FF87]" aria-hidden="true">
              ✓
            </span>{' '}
            Cancel anytime
          </span>
          <span>
            <span className="text-[#00FF87]" aria-hidden="true">
              ✓
            </span>{' '}
            No hidden fees
          </span>
          <span>
            <span className="text-[#00FF87]" aria-hidden="true">
              ✓
            </span>{' '}
            UPI, cards, net banking
          </span>
        </p>
      </div>
    </section>
  )
}

/** Segmented Monthly / Annual control. */
const BillingToggle: React.FC<{
  period: BillingPeriod
  onChange: (period: BillingPeriod) => void
}> = ({ period, onChange }) => {
  const baseTab =
    'relative z-10 rounded-full px-5 py-2 text-sm font-semibold transition-colors duration-200 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C82F7] ' +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-[#040C18]'

  return (
    <div
      role="group"
      aria-label="Billing period"
      className="mx-auto flex w-max items-center gap-1 rounded-full border border-white/10 bg-[#071428] p-1"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <button
        type="button"
        className={baseTab}
        aria-pressed={period === 'monthly'}
        onClick={() => onChange('monthly')}
        style={{
          backgroundColor: period === 'monthly' ? COLORS.coral : 'transparent',
          color: period === 'monthly' ? COLORS.textPrimary : COLORS.textSecondary,
        }}
      >
        Monthly
      </button>
      <button
        type="button"
        className={baseTab}
        aria-pressed={period === 'annual'}
        onClick={() => onChange('annual')}
        style={{
          backgroundColor: period === 'annual' ? COLORS.coral : 'transparent',
          color: period === 'annual' ? COLORS.textPrimary : COLORS.textSecondary,
        }}
      >
        Annual{' '}
        <span className="text-[#00FF87]" style={{ color: period === 'annual' ? COLORS.textPrimary : COLORS.mint }}>
          (Save 20%)
        </span>
      </button>
    </div>
  )
}

/** A single pricing tier card. */
const PricingCard: React.FC<{
  tier: PricingTier
  period: BillingPeriod
  reducedMotion: boolean
  onNavigate?: (page: string) => void
}> = ({ tier, period, reducedMotion, onNavigate }) => {
  const isPopular = tier.popular
  const cta = usePrimaryCta(onNavigate)

  return (
    <div
      className="relative flex h-full flex-col rounded-2xl p-7"
      style={{
        background: 'linear-gradient(145deg,#071428,#0A1F3A)',
        // Popular tier: coral/gold gradient border glow. Others: hairline border.
        border: isPopular ? '1px solid transparent' : '1px solid rgba(255,255,255,0.08)',
        backgroundImage: isPopular
          ? 'linear-gradient(145deg,#071428,#0A1F3A), linear-gradient(135deg,#4C82F7,#7FA8FF)'
          : undefined,
        backgroundOrigin: isPopular ? 'border-box' : undefined,
        backgroundClip: isPopular ? 'padding-box, border-box' : undefined,
        boxShadow: isPopular ? '0 0 40px rgba(76,130,247,0.25)' : undefined,
        transform: isPopular ? 'scale(1.03)' : undefined,
      }}
    >
      {isPopular && (
        <span
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold uppercase tracking-wide"
          style={{
            backgroundColor: COLORS.mint,
            color: COLORS.bgPrimary,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Most Popular
        </span>
      )}

      {/* Plan name */}
      <h3
        className="text-xl text-white"
        style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700 }}
      >
        {tier.name}
      </h3>

      {/* Price */}
      <div className="mt-4 flex items-baseline gap-1">
        <PriceDisplay tier={tier} period={period} reducedMotion={reducedMotion} />
        <span
          className="text-sm"
          style={{ fontFamily: "'DM Sans', sans-serif", color: COLORS.textSecondary }}
        >
          /mo
        </span>
      </div>
      <p
        className="mt-1 text-xs"
        style={{ fontFamily: "'DM Sans', sans-serif", color: COLORS.textMuted }}
      >
        {period === 'annual' ? 'billed annually' : 'billed monthly'}
      </p>

      {/* Credits badge */}
      <span
        className="mt-4 w-max rounded-full px-3 py-1 text-xs font-semibold"
        style={{
          backgroundColor: 'rgba(127,168,255,0.12)',
          color: COLORS.gold,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {tier.credits.toLocaleString('en-IN')} AI Credits
      </span>

      {/* Feature list */}
      <ul className="mt-6 flex-1 space-y-3">
        {tier.features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-sm"
            style={{ fontFamily: "'DM Sans', sans-serif", color: COLORS.textSecondary }}
          >
            <span className="mt-0.5 shrink-0 text-[#4C82F7]" aria-hidden="true">
              ✓
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <GlowButton
        variant={isPopular ? 'coral' : 'ghost'}
        className="mt-7 w-full"
        onClick={cta.go}
      >
        {cta.label}
      </GlowButton>
    </div>
  )
}

/**
 * Animated price for a tier. Counts from the previously displayed price to the
 * newly selected period's price via `useCountUp`; under reduced motion the
 * value snaps instantly (handled by `useCountUp`).
 */
const PriceDisplay: React.FC<{
  tier: PricingTier
  period: BillingPeriod
  reducedMotion: boolean
}> = ({ tier, period, reducedMotion }) => {
  const target = selectedPrice(tier, period)

  // Remember the last target so the count-up animates from the previous price
  // to the new one on toggle, rather than always from zero.
  const prevRef = useRef<number>(target)
  const start = prevRef.current
  prevRef.current = target

  const value = useCountUp(target, { start, duration: 600, reducedMotion })
  const rounded = Math.round(value)

  return (
    <span
      className="text-4xl font-bold text-white md:text-5xl"
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
      aria-label={`₹${target.toLocaleString('en-IN')} per month`}
    >
      <span aria-hidden="true">₹{rounded.toLocaleString('en-IN')}</span>
    </span>
  )
}
