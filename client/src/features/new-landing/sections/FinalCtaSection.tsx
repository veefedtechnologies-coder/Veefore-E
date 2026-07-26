import { useLandingMotion } from '../context/LandingMotionProvider'
import { COLORS } from '../constants/colors'
import { PHASE_1_REVIEW_MODE } from '../constants/reviewMode'
import { GlowButton } from '../primitives/GlowButton'
import { usePrimaryCta } from '../hooks/usePrimaryCta'

/** Trust badges shown beneath the CTAs. */
const TRUST_BADGES = [
  { icon: '🔒', label: 'Meta Official API' },
  { icon: '🇮🇳', label: 'Made in India' },
  { icon: '⚡', label: 'Setup in 10 mins' },
  { icon: '🆓', label: 'Free to start' },
] as const

/**
 * Final CTA — prominent full-bleed closing section.
 *
 * Blue-themed, matches the Veefore logo palette. Strong radial glow,
 * eyebrow pill, no particles. Scroll path (z-index 10) passes through
 * this section cleanly since the background is transparent (inherits
 * from the global .veef-bg-layer).
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 21.1
 */
export const FinalCtaSection: React.FC<{ onNavigate?: (page: string) => void }> = ({
  onNavigate,
}) => {
  const { reducedMotion } = useLandingMotion()
  const cta = usePrimaryCta(onNavigate)
  void reducedMotion

  return (
    <section
      id="cta"
      aria-label="Get started with Veefore"
      className="relative w-full overflow-hidden"
      style={{ background: 'transparent' }}
    >
      {/* Top hairline accent */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${COLORS.coral}55, transparent)`,
        }}
      />

      {/* Blue radial glow orbs — centered */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Primary deep blue bloom */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: '1000px',
            height: '700px',
            background: `radial-gradient(ellipse, ${COLORS.coral}22 0%, transparent 60%)`,
            filter: 'blur(80px)',
          }}
        />
        {/* Inner bright core */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: '480px',
            height: '320px',
            background: `radial-gradient(ellipse, ${COLORS.coral}30 0%, transparent 70%)`,
            filter: 'blur(40px)',
          }}
        />
        {/* Subtle teal secondary */}
        <div
          className="absolute left-[35%] top-[60%] rounded-full"
          style={{
            width: '400px',
            height: '300px',
            background: `radial-gradient(ellipse, ${COLORS.cyan}0F 0%, transparent 65%)`,
            filter: 'blur(60px)',
          }}
        />
      </div>

      {/* Foreground content */}
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 py-28 text-center md:py-44">
        {/* Eyebrow pill */}
        <span
          className="veef-mono mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.2em]"
          style={{
            color: COLORS.coral,
            background: `${COLORS.coral}14`,
            border: `1px solid ${COLORS.coral}33`,
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: COLORS.coral, boxShadow: `0 0 8px ${COLORS.coral}` }}
          />
          Start for free today
        </span>

        {/* Headline */}
        <h2
          className="veef-display text-balance font-extrabold leading-[1.2] tracking-tight text-[#F5F6F8]"
          style={{ fontSize: 'clamp(40px,7vw,84px)' }}
        >
          {PHASE_1_REVIEW_MODE ? 'Ready to put your content' : 'Ready to put your automation'}{' '}
          <span
            className="veef-gradient-text relative inline-block"
            style={{
              background: `linear-gradient(120deg, ${COLORS.coral}, #7FA8FF)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
            }}
          >
            on autopilot?
          </span>
        </h2>

        {/* Subhead */}
        <p
          className="mt-7 max-w-xl text-[17px] leading-relaxed text-[#9BA3B4] md:text-[19px]"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          Built for Indian creators and teams. No credit card, no commitment.
          Start free and scale when you&rsquo;re ready.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <GlowButton variant="coral" glow onClick={cta.go}>
            {cta.label} →
          </GlowButton>
          <GlowButton variant="ghost">Book a Demo</GlowButton>
        </div>

        {/* Trust badges */}
        <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {TRUST_BADGES.map((badge) => (
            <li
              key={badge.label}
              className="flex items-center gap-2 text-[13px] text-[#5A6172]"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              <span aria-hidden="true">{badge.icon}</span>
              <span>{badge.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom fade into footer */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-32 pointer-events-none"
        style={{
          background: 'linear-gradient(0deg, rgba(3,3,8,0.6) 0%, transparent 100%)',
        }}
      />
    </section>
  )
}

FinalCtaSection.displayName = 'FinalCtaSection'
