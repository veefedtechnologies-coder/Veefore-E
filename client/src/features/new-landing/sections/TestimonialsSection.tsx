import { m } from 'framer-motion'
import { Check, X } from 'lucide-react'

import { useLandingMotion } from '../context/LandingMotionProvider'
import { useInViewOnce } from '../hooks/useInViewOnce'
import { COLORS } from '../constants/colors'
import { PHASE_1_REVIEW_MODE } from '../constants/reviewMode'

/**
 * "Why Veefore" section — replaces the Testimonials section for pre-launch.
 *
 * Shows a clean comparison table (Veefore vs. doing it manually) and a grid
 * of product fact cards. No fake social proof, no placeholder user data.
 * Everything shown is factual about the product.
 */

const COMPARISON_ROWS_FULL = [
  {
    feature: 'Schedule posts at peak times',
    veefore: true,
    manual: false,
    note: 'AI picks the best window for your audience',
  },
  {
    feature: 'Auto-reply to DMs & comments',
    veefore: true,
    manual: false,
    note: 'Keyword triggers fire 24/7',
  },
  {
    feature: 'AI caption generation',
    veefore: true,
    manual: false,
    note: 'Full week of captions in 2 minutes',
  },
  {
    feature: 'Analytics in one dashboard',
    veefore: true,
    manual: false,
    note: 'Reach, saves, engagement — all in one place',
  },
  {
    feature: 'Multi-account management',
    veefore: true,
    manual: false,
    note: 'Handle all your pages from one login',
  },
  {
    feature: 'Priced in Indian rupees',
    veefore: true,
    manual: false,
    note: 'Starting at ₹499/month',
  },
] as const

// Phase 1 Meta review: drop the DM/comment automation row, swap in a
// non-automation capability (content calendar planning).
const COMPARISON_ROWS_PHASE1 = [
  {
    feature: 'Schedule posts at peak times',
    veefore: true,
    manual: false,
    note: 'AI picks the best window for your audience',
  },
  {
    feature: 'Plan a full content calendar',
    veefore: true,
    manual: false,
    note: 'Drafts, queues and calendars in one place',
  },
  {
    feature: 'AI caption generation',
    veefore: true,
    manual: false,
    note: 'Full week of captions in 2 minutes',
  },
  {
    feature: 'Analytics in one dashboard',
    veefore: true,
    manual: false,
    note: 'Reach, saves, engagement — all in one place',
  },
  {
    feature: 'Multi-account management',
    veefore: true,
    manual: false,
    note: 'Handle all your pages from one login',
  },
  {
    feature: 'Priced in Indian rupees',
    veefore: true,
    manual: false,
    note: 'Starting at ₹499/month',
  },
] as const

const COMPARISON_ROWS = PHASE_1_REVIEW_MODE ? COMPARISON_ROWS_PHASE1 : COMPARISON_ROWS_FULL

const PRODUCT_FACTS_FULL = [
  {
    icon: '🔒',
    title: 'Meta Official API',
    body: 'Veefore uses Meta\'s official Content Publishing API — not unofficial scraping or third-party workarounds. Your account is always safe.',
    accent: COLORS.coral,
  },
  {
    icon: '🇮🇳',
    title: 'Built for India',
    body: 'Priced in rupees, designed for Indian creators and businesses, with support that understands the local market.',
    accent: COLORS.cyan,
  },
  {
    icon: '⚡',
    title: 'Set up in 10 minutes',
    body: 'Connect your Instagram account, configure your first automation, and your content runs on autopilot — no technical skills needed.',
    accent: COLORS.gold,
  },
  {
    icon: '🤖',
    title: '24/7 DM automation',
    body: 'Comment a keyword, get a DM instantly. Qualify leads, send pricing, and book calls — even while you sleep.',
    accent: COLORS.coral,
  },
  {
    icon: '📊',
    title: 'One dashboard for everything',
    body: 'Scheduling, automations, analytics, and AI content — stop juggling 4 separate tools and logins.',
    accent: COLORS.cyan,
  },
  {
    icon: '🎯',
    title: 'AI that learns your audience',
    body: 'The scheduling engine analyses your audience activity patterns and posts at the exact moment they\'re online.',
    accent: COLORS.gold,
  },
] as const

// Phase 1 Meta review: replace the DM automation fact + tweak the setup/
// dashboard copy so nothing references DM/comment automation.
const PRODUCT_FACTS_PHASE1 = [
  {
    icon: '🔒',
    title: 'Meta Official API',
    body: 'Veefore uses Meta\'s official Content Publishing API — not unofficial scraping or third-party workarounds. Your account is always safe.',
    accent: COLORS.coral,
  },
  {
    icon: '🇮🇳',
    title: 'Built for India',
    body: 'Priced in rupees, designed for Indian creators and businesses, with support that understands the local market.',
    accent: COLORS.cyan,
  },
  {
    icon: '⚡',
    title: 'Set up in 10 minutes',
    body: 'Connect your Instagram account, plan your first week of content, and your posts publish on autopilot — no technical skills needed.',
    accent: COLORS.gold,
  },
  {
    icon: '🗂️',
    title: 'One content library',
    body: 'Organise drafts, queues, and calendars across every account in a single workspace — no more juggling tabs and spreadsheets.',
    accent: COLORS.coral,
  },
  {
    icon: '📊',
    title: 'One dashboard for everything',
    body: 'Scheduling, analytics, and AI content — stop juggling separate tools and logins for every part of your workflow.',
    accent: COLORS.cyan,
  },
  {
    icon: '🎯',
    title: 'AI that learns your audience',
    body: 'The scheduling engine analyses your audience activity patterns and posts at the exact moment they\'re online.',
    accent: COLORS.gold,
  },
] as const

const PRODUCT_FACTS = PHASE_1_REVIEW_MODE ? PRODUCT_FACTS_PHASE1 : PRODUCT_FACTS_FULL

export const TestimonialsSection: React.FC = () => {
  const { reducedMotion } = useLandingMotion()
  const [sectionRef, inView] = useInViewOnce<HTMLDivElement>({ threshold: 0.1 })

  const reveal = (delay: number) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 },
          transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
        }

  return (
    <section
      id="testimonials"
      aria-labelledby="why-veefore-title"
      className="relative w-full px-6 py-24 md:py-32"
    >
      <div ref={sectionRef} className="mx-auto max-w-[1120px]">

        {/* Eyebrow + heading */}
        <div className="mb-16 text-center">
          <span
            className="veef-mono inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-[0.18em]"
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
            Why Veefore
          </span>
          <m.h2
            id="why-veefore-title"
            className="veef-display mt-5 text-[clamp(32px,5vw,56px)] font-extrabold text-[#F5F6F8]"
            style={{ lineHeight: 1.2 }}
            {...reveal(0.05)}
          >
            Everything you need,{' '}
            <span
              className="veef-gradient-text inline-block"
              style={{
                background: `linear-gradient(120deg, ${COLORS.coral}, ${COLORS.gold})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
              }}
            >
              nothing you don&apos;t
            </span>
          </m.h2>
          <m.p
            className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-[#9BA3B4]"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
            {...reveal(0.12)}
          >
            {PHASE_1_REVIEW_MODE
              ? 'One platform that handles scheduling, content planning, analytics, and AI content — built specifically for Indian Instagram creators.'
              : 'One platform that handles scheduling, automations, analytics, and AI content — built specifically for Indian Instagram creators.'}
          </m.p>
        </div>

        {/* Comparison table */}
        <m.div
          className="mb-16 overflow-hidden rounded-2xl"
          style={{
            background: 'linear-gradient(180deg, rgba(14,16,22,0.98) 0%, rgba(8,9,13,0.98) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
          {...reveal(0.18)}
        >
          {/* Table header */}
          <div
            className="grid items-center gap-3 border-b px-4 py-4 sm:gap-4 sm:px-6"
            style={{
              gridTemplateColumns: '1fr 72px 72px',
              borderColor: 'rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.025)',
            }}
          >
            <span className="veef-mono text-[11px] uppercase tracking-wide text-[#5A6172]">
              Feature
            </span>
            <div className="flex items-center justify-center gap-1.5">
              <img src="/veefore.svg" alt="Veefore" className="h-4 w-4 flex-shrink-0" />
              <span className="hidden text-[13px] font-semibold text-[#F5F6F8] sm:inline">Veefore</span>
            </div>
            <div className="flex items-center justify-center">
              <span className="text-[12px] font-medium text-[#5A6172] sm:text-[13px]">Manually</span>
            </div>
          </div>

          {/* Rows */}
          {COMPARISON_ROWS.map((row, i) => (
            <div
              key={row.feature}
              className="grid items-center gap-3 px-4 py-4 sm:gap-4 sm:px-6"
              style={{
                gridTemplateColumns: '1fr 72px 72px',
                borderBottom: i < COMPARISON_ROWS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
              }}
            >
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[#D7DBE3] sm:text-[14px]">{row.feature}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-[#5A6172] sm:text-[12px]">{row.note}</div>
              </div>
              <div className="flex justify-center">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full"
                  style={{ background: 'rgba(63,185,80,0.14)' }}
                >
                  <Check className="h-3.5 w-3.5" style={{ color: '#3FB950' }} />
                </span>
              </div>
              <div className="flex justify-center">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full"
                  style={{ background: 'rgba(255,60,60,0.10)' }}
                >
                  <X className="h-3.5 w-3.5" style={{ color: '#FF6B6B' }} />
                </span>
              </div>
            </div>
          ))}
        </m.div>

        {/* Product facts grid */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_FACTS.map((fact, i) => (
            <m.div
              key={fact.title}
              className="rounded-2xl p-6"
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
                transition: 'border-color 0.25s ease',
              }}
              {...reveal(0.06 + i * 0.06)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${fact.accent}44`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
              }}
            >
              <div
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-xl"
                style={{
                  background: `${fact.accent}14`,
                  border: `1px solid ${fact.accent}28`,
                }}
                aria-hidden="true"
              >
                {fact.icon}
              </div>
              <h3
                className="mb-2 text-[16px] font-semibold text-[#F5F6F8]"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                {fact.title}
              </h3>
              <p
                className="text-[13.5px] leading-relaxed text-[#9BA3B4]"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {fact.body}
              </p>
            </m.div>
          ))}
        </div>
      </div>
    </section>
  )
}

TestimonialsSection.displayName = 'TestimonialsSection'
