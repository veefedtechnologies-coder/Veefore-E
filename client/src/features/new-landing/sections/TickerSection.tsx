import { useState } from 'react'
import { useLandingMotion } from '../context/LandingMotionProvider'
import { COLORS } from '../constants/colors'
import { PHASE_1_REVIEW_MODE } from '../constants/reviewMode'

/**
 * Feature Ticker (replaces testimonial ticker for pre-launch).
 *
 * Scrolls a list of concrete, factual product capabilities — no social proof,
 * no fake quotes. Each item is a short benefit statement about what Veefore
 * actually does.
 *
 * During Meta Phase 1 review, DM/comment-automation items are swapped out for
 * other (non-automation) product benefits.
 */

/** Factual feature benefit statements — no fake social proof. */
const TICKER_ITEMS_FULL = [
  { icon: '📅', text: 'Schedule posts at peak audience times — automatically' },
  { icon: '🤖', text: 'Auto-reply to comments with keyword-triggered DM flows' },
  { icon: '✍️', text: 'Generate a week of captions in under 2 minutes with AI' },
  { icon: '📊', text: 'Track reach, engagement and saves from one dashboard' },
  { icon: '🔒', text: 'Built on Meta\'s Official Content Publishing API' },
  { icon: '🇮🇳', text: 'Priced in rupees — built for the Indian creator economy' },
  { icon: '📥', text: 'DM automation that qualifies leads while you sleep' },
  { icon: '⚡', text: 'Set up in under 10 minutes — no technical skills needed' },
  { icon: '📱', text: 'Manage multiple Instagram accounts from one place' },
  { icon: '🎯', text: 'AI finds your best posting window based on your audience' },
] as const

/** Phase-1 set — automation items replaced with scheduling / analytics / AI. */
const TICKER_ITEMS_PHASE1 = [
  { icon: '📅', text: 'Schedule posts at peak audience times — automatically' },
  { icon: '🗂️', text: 'Plan a full content calendar across all your accounts' },
  { icon: '✍️', text: 'Generate a week of captions in under 2 minutes with AI' },
  { icon: '📊', text: 'Track reach, engagement and saves from one dashboard' },
  { icon: '🔒', text: 'Built on Meta\'s Official Content Publishing API' },
  { icon: '🇮🇳', text: 'Priced in rupees — built for the Indian creator economy' },
  { icon: '#️⃣', text: 'AI suggests hooks and hashtags tuned to your niche' },
  { icon: '⚡', text: 'Set up in under 10 minutes — no technical skills needed' },
  { icon: '📱', text: 'Manage multiple Instagram accounts from one place' },
  { icon: '🎯', text: 'AI finds your best posting window based on your audience' },
] as const

const TICKER_ITEMS = PHASE_1_REVIEW_MODE ? TICKER_ITEMS_PHASE1 : TICKER_ITEMS_FULL

export const TickerSection: React.FC = () => {
  const { reducedMotion } = useLandingMotion()
  const [paused, setPaused] = useState(false)

  // Triple the content for a seamless -33.3333% loop.
  const track = [...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS]

  const playState = reducedMotion ? undefined : paused ? 'paused' : 'running'

  return (
    <section
      aria-label="What Veefore can do for you"
      className="relative w-full overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
      onMouseEnter={reducedMotion ? undefined : () => setPaused(true)}
      onMouseLeave={reducedMotion ? undefined : () => setPaused(false)}
    >
      <div
        className="flex w-max items-center whitespace-nowrap py-4"
        style={
          reducedMotion
            ? undefined
            : {
                animation: 'veefMarquee 50s linear infinite',
                animationPlayState: playState,
                willChange: 'transform',
              }
        }
      >
        {track.map((item, index) => (
          <div
            key={`${item.text.slice(0, 12)}-${index}`}
            className="flex items-center"
            aria-hidden={index >= TICKER_ITEMS.length ? true : undefined}
          >
            <span className="flex items-center gap-2 px-6 text-[13px] md:text-[14px]">
              <span aria-hidden="true">{item.icon}</span>
              <span
                className="text-[#9BA3B4]"
                style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400 }}
              >
                {item.text}
              </span>
            </span>
            <span
              className="px-2 text-xs"
              aria-hidden="true"
              style={{ color: COLORS.coral, opacity: 0.5 }}
            >
              ◆
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

TickerSection.displayName = 'TickerSection'
