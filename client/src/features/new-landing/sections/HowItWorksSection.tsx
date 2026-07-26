import { useEffect, useRef, useState } from 'react'
import { Plug, Workflow, Rocket, Check, Zap, TrendingUp, Instagram } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AnimatePresence, m } from 'framer-motion'

import { COLORS } from '../constants/colors'
import { HOW_STEPS } from '../constants/content'
import { PHASE_1_REVIEW_MODE } from '../constants/reviewMode'
import type { HowStep } from '../constants/content'
import { useInViewOnce } from '../hooks/useInViewOnce'
import { useLandingMotion } from '../context/LandingMotionProvider'

/** Maps a step's `glow` accent key to its Colour_System hex value. */
const GLOW_HEX: Record<HowStep['glow'], string> = {
  coral: COLORS.coral,
  cyan: COLORS.cyan,
  gold: COLORS.gold,
}

const STEP_ICON: Record<HowStep['index'], LucideIcon> = {
  1: Plug,
  2: Workflow,
  3: Rocket,
}

const STEP_TAG: Record<HowStep['index'], string> = {
  1: 'Connect',
  2: PHASE_1_REVIEW_MODE ? 'Plan' : 'Configure',
  3: 'Grow',
}

const STEP_TIME: Record<HowStep['index'], string> = {
  1: '~1 min',
  2: '~8 min',
  3: 'Ongoing',
}

/* ------------------------------------------------------------------ *
 * Interactive preview panes — one per step, shown on the right column.
 * ------------------------------------------------------------------ */

const ConnectPreview: React.FC = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg,#FA8B30,#EC2855)' }}>
        <Instagram className="h-5 w-5 text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-[#F5F6F8]">@yourbrand</div>
        <div className="veef-mono text-[11px] text-[#5A6172]">Instagram Business</div>
      </div>
      <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]" style={{ background: 'rgba(63,185,80,0.14)', color: '#3FB950' }}>
        <Check className="h-3 w-3" /> Connected
      </span>
    </div>
    {(PHASE_1_REVIEW_MODE
      ? ['Read insights', 'Schedule posts', 'Publish posts']
      : ['Read insights', 'Manage DMs', 'Publish posts']
    ).map((perm) => (
      <div key={perm} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.015] px-3.5 py-2.5">
        <span className="text-[12.5px] text-[#9BA3B4]">{perm}</span>
        <span className="flex h-5 w-9 items-center rounded-full p-0.5" style={{ background: COLORS.coral }}>
          <span className="ml-auto h-4 w-4 rounded-full bg-white" />
        </span>
      </div>
    ))}
  </div>
)

const ConfigurePreview: React.FC = () => (
  <div className="flex flex-col gap-3">
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <div className="veef-mono mb-2 text-[10px] uppercase tracking-wide text-[#5A6172]">When someone comments</div>
      <div className="flex flex-wrap gap-1.5">
        {['"price"', '"link"', '"how"'].map((kw) => (
          <span key={kw} className="veef-mono rounded-md px-2 py-1 text-[11px]" style={{ background: `${COLORS.cyan}1A`, color: COLORS.cyan, border: `1px solid ${COLORS.cyan}33` }}>{kw}</span>
        ))}
      </div>
    </div>
    <div className="flex items-center justify-center">
      <span className="veef-mono text-[16px] text-[#5A6172]">↓</span>
    </div>
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <div className="veef-mono mb-2 text-[10px] uppercase tracking-wide text-[#5A6172]">Veefore replies</div>
      <div className="flex items-start gap-2.5">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: `${COLORS.cyan}1A` }}>
          <Zap className="h-3.5 w-3.5" style={{ color: COLORS.cyan }} />
        </span>
        <p className="text-[12.5px] leading-relaxed text-[#D7DBE3]">Sends pricing + a booking link instantly, then captures the lead.</p>
      </div>
    </div>
  </div>
)

// Phase 1 Meta review: step 2 preview shows content planning + AI captions
// instead of keyword → DM automation.
const PlanContentPreview: React.FC = () => (
  <div className="flex flex-col gap-3">
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <div className="veef-mono mb-2 text-[10px] uppercase tracking-wide text-[#5A6172]">Topic</div>
      <div className="flex items-center gap-2">
        <Zap className="h-3.5 w-3.5" style={{ color: COLORS.cyan }} />
        <span className="text-[12.5px] text-[#D7DBE3]">morning coffee routine for busy creators</span>
      </div>
    </div>
    <div className="flex items-center justify-center">
      <span className="veef-mono text-[16px] text-[#5A6172]">↓</span>
    </div>
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <div className="veef-mono mb-2 text-[10px] uppercase tracking-wide text-[#5A6172]">AI drafts + schedules</div>
      <div className="flex flex-col gap-2">
        <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${COLORS.cyan}26`, borderLeft: `3px solid ${COLORS.cyan}` }}>
          <p className="text-[11.5px] leading-relaxed text-[#D7DBE3]">Your 6AM espresso ritual, but make it content ☕ Here&apos;s how I batch a week of reels…</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['#morningroutine', '#creatortips', '#reels'].map((t) => (
            <span key={t} className="veef-mono rounded-md px-2 py-1 text-[10px]" style={{ background: `${COLORS.cyan}1A`, color: COLORS.cyan, border: `1px solid ${COLORS.cyan}33` }}>{t}</span>
          ))}
        </div>
        <div className="veef-mono text-[10px] text-[#5A6172]">Queued · Today 9:00 AM</div>
      </div>
    </div>
  </div>
)

const GrowPreview: React.FC = () => {
  const bars = [40, 52, 48, 64, 72, 86, 100]
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {[['Reach', '156K', '+18%'], ['Saves', '9.2K', '+34%'], ['Leads', '312', '+22%']].map(([k, v, d]) => (
          <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="veef-mono text-[10px] uppercase tracking-wide text-[#5A6172]">{k}</div>
            <div className="mt-1 text-[16px] font-semibold text-[#F5F6F8]">{v}</div>
            <div className="veef-mono text-[10px]" style={{ color: '#3FB950' }}>{d}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" style={{ color: COLORS.gold }} />
          <span className="text-[12.5px] font-medium text-[#D7DBE3]">Growth, on autopilot</span>
        </div>
        <div className="flex h-24 items-end gap-2">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-[3px]"
              style={{
                height: `${h}%`,
                background: i === bars.length - 1 ? COLORS.gold : 'rgba(155,163,180,0.28)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const PREVIEW: Record<HowStep['index'], React.FC> = {
  1: ConnectPreview,
  2: PHASE_1_REVIEW_MODE ? PlanContentPreview : ConfigurePreview,
  3: GrowPreview,
}

/**
 * "How It Works" — interactive two-column timeline.
 *
 * Left: three clickable/hoverable step cards on a connected rail (each tagged
 * `data-veef-waypoint` so the global scroll path threads through them). Right:
 * a sticky live preview pane that swaps to an interactive mock for the active
 * step (Instagram connect → automation flow → growth analytics). Selecting a
 * step animates the preview, filling the previously-empty side.
 *
 * Requirements: 11.1, 11.2, 11.3, 21.1
 */
export const HowItWorksSection: React.FC = () => {
  const { reducedMotion } = useLandingMotion()
  const [ref, inView] = useInViewOnce<HTMLDivElement>({ threshold: 0.18 })
  const [active, setActive] = useState<HowStep['index']>(1)
  /** Refs to each step node so we can find which one the scroll-path frontier
   *  has reached. */
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([])
  /** Mirrors `active` for the scroll handler so it can read the current step
   *  without re-subscribing the effect on every change. */
  const activeRef = useRef<HowStep['index']>(1)

  // Sync the active step with the global scroll-path frontier. The path draws
  // up to `scrollY + innerHeight * 0.62` (see useScrollPath#onProgress); we mark
  // the step whose node centre is the last one above that frontier as active,
  // so the preview switches in lock-step with the path reaching each node.
  // The step is driven ONLY by the scroll path — hover/click never changes it.
  useEffect(() => {
    if (reducedMotion) return

    // Cache each node's absolute document-centre Y so the scroll handler never
    // calls getBoundingClientRect() during scrolling (that forced a sync layout
    // every frame and made the sticky dashboard jitter on mobile). Positions
    // are recomputed only on resize / load.
    let centers: number[] = []
    const measure = () => {
      centers = nodeRefs.current.map((el) => {
        if (!el) return Number.POSITIVE_INFINITY
        const r = el.getBoundingClientRect()
        return r.top + window.scrollY + r.height / 2
      })
    }

    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (centers.length === 0) return

        // The path tip draws up to this frontier (matches useScrollPath).
        const frontier = window.scrollY + window.innerHeight * 0.62

        // Direction-aware hysteresis so the active step changes ONLY when the
        // path tip actually reaches a node — in BOTH directions:
        //   • scrolling down → advance to the next step once the tip reaches
        //     that step's node (frontier passes the next node centre).
        //   • scrolling up   → revert to the previous step only once the tip
        //     retracts back up to the previous step's node.
        // (The old logic reverted as soon as the frontier left the current
        //  node's band, so going back changed the step before the path tip
        //  had retracted to it.)
        let idx = HOW_STEPS.findIndex((s) => s.index === activeRef.current)
        if (idx < 0) idx = 0

        // Advance downward while the next node has been reached.
        while (idx < centers.length - 1 && frontier >= centers[idx + 1]) {
          idx++
        }
        // Retract upward while the current node is now above the frontier
        // (i.e. the tip has pulled back past this step's own node).
        while (idx > 0 && frontier < centers[idx]) {
          idx--
        }

        const candidate = HOW_STEPS[idx]?.index
        if (!candidate || candidate === activeRef.current) return

        activeRef.current = candidate
        setActive(candidate)
      })
    }

    const onResize = () => {
      measure()
      onScroll()
    }

    // Measure after layout settles, then bind.
    measure()
    requestAnimationFrame(measure)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    window.addEventListener('load', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('load', onResize)
    }
  }, [reducedMotion])

  const activeStep = HOW_STEPS.find((s) => s.index === active) ?? HOW_STEPS[0]
  const activeHex = GLOW_HEX[activeStep.glow]
  const Preview = PREVIEW[active]

  return (
    <section id="how-it-works" className="relative w-full overflow-x-clip px-6 py-28 md:py-36">
      <div ref={ref} className="mx-auto max-w-[1120px]">
        {/* Heading */}
        <header className="mb-14 text-center md:mb-20">
          <span
            className="veef-mono inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
            style={{ color: COLORS.coral, background: `${COLORS.coral}14`, border: `1px solid ${COLORS.coral}33` }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: COLORS.coral, boxShadow: `0 0 8px ${COLORS.coral}` }} />
            How it works
          </span>
          <h2
            className="veef-display mt-5 text-[clamp(32px,5vw,56px)] font-extrabold text-[#F5F6F8]"
            style={{ lineHeight: 1.2 }}
          >
            Up and running in{' '}
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
              10 minutes
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-[#9BA3B4] md:text-[16px]">
            No setup headaches. Connect, configure once, and let Veefore run in the background.
          </p>
        </header>

        {/* ════════════════════════════════════════════════════════════
            MOBILE layout (< lg): a simple vertical timeline. Each step is a
            self-contained card with its own compact inline preview — no sticky
            dashboard, no scroll-sync. Clean and native-feeling on phones.
           ════════════════════════════════════════════════════════════ */}
        <ol className="relative flex flex-col gap-8 lg:hidden">
          {/* Continuous rail behind the nodes */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-[23px] top-10 bottom-10 w-px"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.16), rgba(255,255,255,0.04))' }}
          />

          {HOW_STEPS.map((step) => {
            const hex = GLOW_HEX[step.glow]
            const Icon = STEP_ICON[step.index]
            const StepPreview = PREVIEW[step.index]

            return (
              <m.li
                key={step.index}
                className="relative flex flex-col gap-4"
                initial={reducedMotion ? false : { opacity: 0, y: 24 }}
                whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Step header row: node + title block */}
                <div className="flex items-start gap-3.5">
                  <div className="relative z-[1] flex-shrink-0">
                    <div
                      data-veef-waypoint=""
                      data-veef-color={hex}
                      className="flex h-12 w-12 items-center justify-center rounded-2xl"
                      style={{
                        background: `linear-gradient(155deg, ${hex}30, #0C0D11 75%)`,
                        border: `1px solid ${hex}`,
                        boxShadow: `0 0 24px -8px ${hex}`,
                      }}
                    >
                      <Icon size={20} strokeWidth={1.75} style={{ color: hex }} aria-hidden="true" />
                    </div>
                    <span
                      className="veef-mono absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold"
                      style={{ background: hex, color: '#07070A' }}
                    >
                      {step.index}
                    </span>
                  </div>

                  <div className="flex-1 pt-0.5">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="veef-mono text-[11px] uppercase tracking-wide" style={{ color: hex }}>
                        {STEP_TAG[step.index]}
                      </span>
                      <span className="veef-mono text-[11px] text-[#5A6172]">{STEP_TIME[step.index]}</span>
                    </div>
                    <h3 className="text-[18px] font-semibold leading-tight text-[#F5F6F8]" style={{ fontFamily: '"Syne", sans-serif' }}>
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#9BA3B4]">{step.body}</p>
                  </div>
                </div>

                {/* Inline preview card for this step (offset to align past the rail) */}
                <div className="ml-[60px]">
                  <div
                    className="relative overflow-hidden rounded-2xl p-4"
                    style={{
                      background: '#0B0C10',
                      border: `1px solid ${hex}26`,
                      boxShadow: '0 24px 60px -40px rgba(0,0,0,0.9)',
                    }}
                  >
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-x-8 -top-10 h-24"
                      style={{ background: `radial-gradient(50% 60% at 50% 0%, ${hex}1F, transparent 70%)`, filter: 'blur(30px)' }}
                    />
                    <div className="relative">
                      <StepPreview />
                    </div>
                  </div>
                </div>
              </m.li>
            )
          })}
        </ol>

        {/* ════════════════════════════════════════════════════════════
            DESKTOP layout (lg+): two-column with sticky live preview pane.
           ════════════════════════════════════════════════════════════ */}
        <div className="hidden lg:grid lg:grid-cols-2 lg:items-start lg:gap-14">
          {/* ── Left: interactive step list ──────────────────────────── */}
          <ol className="relative order-2 flex flex-col gap-4 lg:order-1">
            {/* Continuous rail behind the nodes */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-[31px] top-8 bottom-8 w-px"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.14), rgba(255,255,255,0.04))' }}
            />

            {HOW_STEPS.map((step, i) => {
              const hex = GLOW_HEX[step.glow]
              const Icon = STEP_ICON[step.index]
              const isActive = step.index === active

              return (
                <m.li
                  key={step.index}
                  className="group relative flex items-center gap-4"
                  initial={reducedMotion ? false : { opacity: 0, y: 20 }}
                  animate={inView ? { opacity: 1, y: 0 } : reducedMotion ? {} : { opacity: 0, y: 20 }}
                  transition={
                    reducedMotion ? { duration: 0 } : { delay: 0.1 + i * 0.12, duration: 0.55, ease: [0.16, 1, 0.3, 1] }
                  }
                >
                  {/* Node */}
                  <div className="relative z-[1] flex-shrink-0" ref={(el) => { nodeRefs.current[i] = el }}>
                    <div
                      data-veef-waypoint=""
                      data-veef-color={hex}
                      className="flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300"
                      style={{
                        background: isActive ? `linear-gradient(155deg, ${hex}30, #0C0D11 75%)` : '#0C0D11',
                        border: `1px solid ${isActive ? hex : 'rgba(255,255,255,0.10)'}`,
                        boxShadow: isActive ? `0 0 28px -8px ${hex}` : 'inset 0 1px 0 rgba(255,255,255,0.05)',
                      }}
                    >
                      <Icon size={22} strokeWidth={1.75} style={{ color: isActive ? hex : '#6B7280' }} aria-hidden="true" />
                    </div>
                    <span
                      className="veef-mono absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-colors duration-300"
                      style={{ background: isActive ? hex : '#2A2E38', color: isActive ? '#07070A' : '#9BA3B4' }}
                    >
                      {step.index}
                    </span>
                  </div>

                  {/* Card */}
                  <div
                    className="flex-1 rounded-2xl p-4 transition-all duration-300 md:p-5"
                    style={{
                      background: isActive
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)), #0C0D11'
                        : '#0C0D11',
                      border: `1px solid ${isActive ? `${hex}40` : 'rgba(255,255,255,0.07)'}`,
                    }}
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="veef-mono text-[11px] uppercase tracking-wide" style={{ color: isActive ? hex : '#5A6172' }}>
                        {STEP_TAG[step.index]}
                      </span>
                      <span className="veef-mono text-[11px] text-[#5A6172]">{STEP_TIME[step.index]}</span>
                    </div>
                    <h3
                      className="text-[17px] font-semibold text-[#F5F6F8] md:text-[19px]"
                      style={{ fontFamily: '"Syne", sans-serif' }}
                    >
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#9BA3B4]">{step.body}</p>
                  </div>
                </m.li>
              )
            })}
          </ol>

          {/* ── Right: sticky live preview pane ─────────────────────────────── */}
          <div className="lg:sticky lg:top-28">
            <div
              className="relative overflow-hidden rounded-2xl"
              style={{
                background: 'linear-gradient(180deg, rgba(18,19,24,0.96), rgba(9,10,13,0.96))',
                border: '1px solid rgba(255,255,255,0.10)',
                boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 40px 90px -50px rgba(0,0,0,0.9)',
              }}
            >
              {/* Accent glow keyed to the active step */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-10 -top-16 h-40 transition-colors duration-500"
                style={{ background: `radial-gradient(50% 60% at 50% 0%, ${activeHex}22, transparent 70%)`, filter: 'blur(40px)' }}
              />

              {/* Window chrome */}
              <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
                <span className="h-3 w-3 rounded-full" style={{ background: '#FF5F57' }} />
                <span className="h-3 w-3 rounded-full" style={{ background: '#FEBC2E' }} />
                <span className="h-3 w-3 rounded-full" style={{ background: '#28C840' }} />
                <img src="/veefore.svg" alt="Veefore" className="ml-3 h-4 w-4 object-contain" />
                <span className="veef-mono text-[12px] text-[#5A6172]">
                  step {active} · {STEP_TAG[active].toLowerCase()}
                </span>
              </div>

              {/* Animated preview body */}
              <div className="relative grid p-5">
                <AnimatePresence mode="sync">
                  <m.div
                    key={active}
                    className="col-start-1 row-start-1"
                    initial={reducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0 }}
                    transition={{ duration: reducedMotion ? 0 : 0.35, ease: 'easeInOut' }}
                  >
                    <Preview />
                  </m.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Progress indicator — reflects the scroll-path position (not clickable) */}
            <div className="mt-5 flex items-center justify-center gap-2" aria-hidden="true">
              {HOW_STEPS.map((s) => (
                <span
                  key={s.index}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: s.index === active ? '24px' : '8px',
                    background: s.index === active ? GLOW_HEX[s.glow] : 'rgba(255,255,255,0.18)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

HowItWorksSection.displayName = 'HowItWorksSection'
