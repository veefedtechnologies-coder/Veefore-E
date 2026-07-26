import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

import { useLandingMotion } from '../context/LandingMotionProvider'
import { FEATURE_PANELS, type FeaturePanel } from '../constants/content'
import { COLORS } from '../constants/colors'

// Register the ScrollTrigger plugin exactly once at module load — browser only
// (it touches the DOM and breaks SSR import).
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger)
}

/** Resolve a panel accent key to its Colour_System hex. ZERO purple. */
function accentHex(accent: FeaturePanel['accent']): string {
  return COLORS[accent]
}

// ── Lightweight CSS/SVG mock visuals (one per panel.visual) ─────────────────
// Each visual is a self-contained, motion-light mock that conveys the feature.
// They use only Colour_System colours and reserve their own box so the pinned
// horizontal layout stays stable.

/** Calendar mock — post cards dropped into time slots (AI scheduling). */
const CalendarVisual: React.FC<{ accent: string }> = ({ accent }) => (
  <div
    className="w-full max-w-sm rounded-2xl p-5"
    style={{ background: COLORS.bgSecondary, border: `1px solid ${accent}33` }}
  >
    <div className="mb-4 flex items-center justify-between">
      <span
        className="text-sm font-semibold text-white"
        style={{ fontFamily: "'Syne', sans-serif" }}
      >
        October
      </span>
      <span
        className="text-xs"
        style={{ fontFamily: "'JetBrains Mono', monospace", color: accent }}
      >
        12 scheduled
      </span>
    </div>
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 28 }).map((_, i) => {
        const filled = [3, 8, 11, 15, 19, 22, 26].includes(i)
        return (
          <div
            key={i}
            className="aspect-square rounded-md"
            style={{
              background: filled ? accent : 'rgba(255,255,255,0.04)',
              opacity: filled ? 0.9 : 1,
            }}
          />
        )
      })}
    </div>
    <div
      className="mt-4 flex items-center gap-2 rounded-lg p-2"
      style={{ background: 'rgba(255,255,255,0.04)' }}
    >
      <span className="h-7 w-7 rounded-md" style={{ background: accent }} />
      <div className="flex-1">
        <div className="h-2 w-3/4 rounded" style={{ background: 'rgba(255,255,255,0.18)' }} />
        <div
          className="mt-1.5 h-2 w-1/2 rounded"
          style={{ background: 'rgba(255,255,255,0.10)' }}
        />
      </div>
      <span
        className="text-[10px]"
        style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.textSecondary }}
      >
        9:00 AM
      </span>
    </div>
  </div>
)

/** Chat mock — comment trigger → automated DM flow (DM automation). */
const ChatVisual: React.FC<{ accent: string }> = ({ accent }) => (
  <div
    className="w-full max-w-sm rounded-2xl p-5"
    style={{ background: COLORS.bgSecondary, border: `1px solid ${accent}33` }}
  >
    <div className="space-y-3">
      <div className="flex justify-start">
        <div
          className="max-w-[75%] rounded-2xl rounded-tl-sm px-3 py-2 text-xs text-white"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          Hey! How much is the course? 💬
        </div>
      </div>
      <div className="flex justify-end">
        <div
          className="max-w-[75%] rounded-2xl rounded-tr-sm px-3 py-2 text-xs text-white"
          style={{ background: accent }}
        >
          Hi! Sending you the details now ✨
        </div>
      </div>
      <div className="flex justify-end">
        <div
          className="flex items-center gap-1 rounded-2xl rounded-tr-sm px-3 py-2.5"
          style={{ background: accent, opacity: 0.5 }}
          aria-label="Typing indicator"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        </div>
      </div>
    </div>
    <div
      className="mt-4 flex items-center justify-between rounded-lg p-2 text-[10px]"
      style={{
        background: 'rgba(255,255,255,0.04)',
        fontFamily: "'JetBrains Mono', monospace",
        color: COLORS.textSecondary,
      }}
    >
      <span>Trigger: &ldquo;price&rdquo;</span>
      <span style={{ color: accent }}>● Auto-reply on</span>
    </div>
  </div>
)

/** Generator mock — topic in, captions + hashtag chips out (AI content). */
const GeneratorVisual: React.FC<{ accent: string }> = ({ accent }) => (
  <div
    className="w-full max-w-sm rounded-2xl p-5"
    style={{ background: COLORS.bgSecondary, border: `1px solid ${accent}33` }}
  >
    <div
      className="mb-4 rounded-lg px-3 py-2 text-xs text-white"
      style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${accent}55` }}
    >
      Topic: morning coffee routine
    </div>
    <div className="space-y-2">
      {[1, 0.7, 0.85].map((w, i) => (
        <div
          key={i}
          className="rounded-lg p-2.5"
          style={{ background: 'rgba(255,255,255,0.04)', borderLeft: `3px solid ${accent}` }}
        >
          <div className="h-2 rounded" style={{ background: 'rgba(255,255,255,0.18)' }} />
          <div
            className="mt-1.5 h-2 rounded"
            style={{ width: `${w * 100}%`, background: 'rgba(255,255,255,0.10)' }}
          />
        </div>
      ))}
    </div>
    <div className="mt-4 flex flex-wrap gap-1.5">
      {['#coffee', '#morningvibes', '#reels', '#creator'].map((tag) => (
        <span
          key={tag}
          className="rounded-full px-2.5 py-1 text-[10px]"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: accent,
            background: `${accent}1A`,
            border: `1px solid ${accent}44`,
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  </div>
)

/** Dashboard mock — growing bars + counted metrics (analytics). */
const DashboardVisual: React.FC<{ accent: string }> = ({ accent }) => (
  <div
    className="w-full max-w-sm rounded-2xl p-5"
    style={{ background: COLORS.bgSecondary, border: `1px solid ${accent}33` }}
  >
    <div className="mb-4 grid grid-cols-3 gap-2">
      {[
        { label: 'Reach', value: '48.2K' },
        { label: 'Saves', value: '3.1K' },
        { label: 'Shares', value: '892' },
      ].map((m) => (
        <div key={m.label} className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div
            className="text-sm font-bold"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: accent }}
          >
            {m.value}
          </div>
          <div className="text-[9px]" style={{ color: COLORS.textSecondary }}>
            {m.label}
          </div>
        </div>
      ))}
    </div>
    <div className="flex h-28 items-end gap-2">
      {[40, 65, 50, 80, 60, 95, 72].map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t"
          style={{
            height: `${h}%`,
            background: accent,
            opacity: 0.35 + (h / 100) * 0.6,
          }}
        />
      ))}
    </div>
  </div>
)

/** Credits mock — circular gauge with balance (credit system). */
const CreditsVisual: React.FC<{ accent: string }> = ({ accent }) => {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const filled = 0.68
  return (
    <div
      className="flex w-full max-w-sm flex-col items-center rounded-2xl p-6"
      style={{ background: COLORS.bgSecondary, border: `1px solid ${accent}33` }}
    >
      <div className="relative">
        <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="10"
          />
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={accent}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - filled)}
            transform="rotate(-90 70 70)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-2xl font-bold text-white"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            204
          </span>
          <span className="text-[10px]" style={{ color: COLORS.textSecondary }}>
            credits left
          </span>
        </div>
      </div>
      <button
        type="button"
        className="mt-5 rounded-lg px-4 py-2 text-xs font-semibold text-white"
        style={{ background: `${accent}22`, border: `1px solid ${accent}` }}
      >
        Top up balance
      </button>
    </div>
  )
}

/** Map a panel's `visual` key to its mock component. */
const VISUALS: Record<FeaturePanel['visual'], React.FC<{ accent: string }>> = {
  calendar: CalendarVisual,
  chat: ChatVisual,
  generator: GeneratorVisual,
  dashboard: DashboardVisual,
  credits: CreditsVisual,
}

/** A single feature panel — text + mock visual, with side alternating by index. */
const Panel: React.FC<{ panel: FeaturePanel; index: number; pinned: boolean }> = ({
  panel,
  index,
  pinned,
}) => {
  const accent = accentHex(panel.accent)
  const Visual = VISUALS[panel.visual]
  // Alternate which side the text sits on per panel (Section 5 brief).
  const textFirst = index % 2 === 0

  const text = (
    <div className="flex max-w-md flex-col justify-center">
      <span
        className="mb-3 text-xs uppercase tracking-widest"
        style={{ fontFamily: "'JetBrains Mono', monospace", color: accent }}
      >
        {String(index + 1).padStart(2, '0')} / 05
      </span>
      <h3
        className="text-3xl font-bold leading-tight text-white md:text-4xl"
        style={{ fontFamily: "'Syne', sans-serif" }}
      >
        {panel.title}
      </h3>
      <p
        className="mt-4 text-base leading-relaxed"
        style={{ fontFamily: "'DM Sans', sans-serif", color: COLORS.textSecondary }}
      >
        {panel.description}
      </p>
    </div>
  )

  const visual = (
    <div className="flex items-center justify-center">
      <Visual accent={accent} />
    </div>
  )

  return (
    <div
      className={
        pinned
          ? 'feature-panel flex h-screen w-screen flex-shrink-0 items-center'
          : 'feature-panel flex min-h-screen w-full items-center'
      }
      style={{
        // Subtle accent wash from the panel's edge — keeps each panel distinct.
        background: `radial-gradient(circle at ${textFirst ? '80%' : '20%'} 50%, ${accent}12, transparent 60%)`,
      }}
    >
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 md:grid-cols-2 md:gap-16">
        {textFirst ? (
          <>
            {text}
            {visual}
          </>
        ) : (
          <>
            <div className="order-2 md:order-1">{visual}</div>
            <div className="order-1 md:order-2">{text}</div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Features section (Section 5, `id="features"`).
 *
 * Presents the five {@link FEATURE_PANELS}, each with its Colour_System accent
 * (coral / cyan / gold / mint / rose) and a lightweight CSS/SVG mock visual
 * matching its `visual` kind. Text and visual alternate sides per panel.
 *
 * Motion behaviour:
 *   - Desktop with motion allowed (`!isMobile && !reducedMotion`): a GSAP
 *     `ScrollTrigger` pins the section to the viewport and pans the horizontal
 *     track across all five panels over ~400vh of vertical scroll (Req 10.2).
 *     The timeline + ScrollTrigger are created in a `useLayoutEffect` via a
 *     `gsap.context` and fully reverted (killed) in cleanup.
 *   - Mobile (`<=768px`) OR reduced motion: panels render in a vertically
 *     stacked, scrollable layout with NO pin/horizontal animation
 *     (Req 10.4 / 10.5 / 20.2 / 21.1).
 *
 * Colour system: deep-navy backgrounds with accent washes only — ZERO purple.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 20.2, 21.1
 */
export const FeaturesSection: React.FC = () => {
  const { isMobile, reducedMotion } = useLandingMotion()
  const pinned = !isMobile && !reducedMotion

  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    // Stacked layout (mobile / reduced motion): no pin, no horizontal pan.
    if (!pinned) return
    const container = containerRef.current
    const track = trackRef.current
    if (!container || !track) return

    const panels = FEATURE_PANELS.length

    // Scope every tween + ScrollTrigger to this context so a single revert()
    // tears the whole thing down on cleanup (Req 10.2 — created/killed in effect).
    const ctx = gsap.context(() => {
      gsap.to(track, {
        // Pan from the first panel to the last (n-1 viewport widths).
        xPercent: -100 * (panels - 1),
        ease: 'none',
        scrollTrigger: {
          trigger: container,
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          // ~400vh of vertical scroll drives the full horizontal pan.
          end: () => `+=${window.innerHeight * panels}`,
          invalidateOnRefresh: true,
        },
      })
    }, container)

    return () => {
      // Reverts all tweens AND kills the ScrollTrigger created above,
      // restoring inline styles and the pin spacer.
      ctx.revert()
    }
  }, [pinned])

  return (
    <section
      id="features"
      aria-label="Veefore features"
      className="relative w-full overflow-hidden"
      style={{ background: COLORS.bgPrimary }}
    >
      <h2
        className="px-6 pb-4 pt-20 text-center text-4xl font-bold text-white md:text-5xl"
        style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700 }}
      >
        Everything Your Instagram Needs
      </h2>

      {pinned ? (
        // Desktop: pinned horizontal pan. The container is pinned; the track
        // holds all panels in a horizontal row and is translated on scroll.
        <div ref={containerRef} className="relative overflow-hidden">
          <div ref={trackRef} className="flex h-screen w-max flex-nowrap">
            {FEATURE_PANELS.map((panel, index) => (
              <Panel key={panel.title} panel={panel} index={index} pinned />
            ))}
          </div>
        </div>
      ) : (
        // Mobile / reduced motion: vertically stacked, scrollable panels.
        <div className="flex flex-col">
          {FEATURE_PANELS.map((panel, index) => (
            <Panel key={panel.title} panel={panel} index={index} pinned={false} />
          ))}
        </div>
      )}
    </section>
  )
}
