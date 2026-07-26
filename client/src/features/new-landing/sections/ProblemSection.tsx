import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { Clock, TrendingDown, MessageSquareText, Check, X, Flame, Sparkles } from 'lucide-react'

import { useLandingMotion } from '../context/LandingMotionProvider'
import { COLORS } from '../constants/colors'
import { PHASE_1_REVIEW_MODE } from '../constants/reviewMode'

/* ================================================================== *
 * Tabbed before / after comparison.
 *   - eyebrow + headline with an accent phrase
 *   - 3 tab pills (the 3 growth-killers)
 *   - WITHOUT Veefore (red, problem) vs WITH Veefore (green, solution)
 * ================================================================== */

const RED = '#F4664A'
const GREEN = '#3FB950'

interface Row {
  left: string
  /** small trailing chip on each row */
  tag: string
  /** optional emoji glyph */
  glyph?: string
}

interface Problem {
  /** short tab label */
  tab: string
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  /** WITHOUT side */
  badProblemTitle: string
  badCopy: string
  badListLabel: string
  badRows: Row[]
  badFooter: string
  /** WITH side */
  goodTitle: string
  goodCopy: string
  goodListLabel: string
  goodRows: Row[]
  goodFooter: string
}

const PROBLEM_SCHEDULING: Problem = {
  tab: 'Posting at the wrong time',
  Icon: Clock,
  badProblemTitle: 'Posting at the wrong time',
  badCopy:
    'Most creators post when it\u2019s convenient for them, not when their audience is actually online — killing organic reach before it starts.',
  badListLabel: 'Your posting schedule',
  badRows: [
    { left: 'Mon \u2014 11:00 PM', tag: 'Low traffic', glyph: '\uD83D\uDE34' },
    { left: 'Wed \u2014 2:00 AM', tag: 'Low traffic', glyph: '\uD83C\uDF19' },
    { left: 'Fri \u2014 10:00 PM', tag: 'Low traffic', glyph: '\uD83D\uDE2A' },
  ],
  badFooter: 'Avg reach: 430 accounts',
  goodTitle: 'AI finds your perfect window',
  goodCopy:
    'Veefore analyzes your follower activity patterns and auto-schedules your posts at the exact moment they\u2019ll get maximum eyeballs.',
  goodListLabel: 'Veefore smart schedule',
  goodRows: [
    { left: 'Tue \u2014 10:30 AM', tag: 'Peak', glyph: '\uD83D\uDD25' },
    { left: 'Thu \u2014 7:45 PM', tag: 'Peak', glyph: '\uD83D\uDD25' },
    { left: 'Sat \u2014 9:15 AM', tag: 'High', glyph: '\u2728' },
  ],
  goodFooter: 'Projected reach: 9,200+ accounts',
}

const PROBLEM_CAPTIONS: Problem = {
  tab: 'Captions that don\u2019t convert',
  Icon: MessageSquareText,
  badProblemTitle: 'Captions that fall flat',
  badCopy:
    'Generic captions and guessed hashtags mean your best content gets buried. You\u2019re posting into the void.',
  badListLabel: 'Typical post',
  badRows: [
    { left: '"New post! Check it out 🙏"', tag: 'Weak hook', glyph: '\uD83D\uDE12' },
    { left: '#love #instagood #photo', tag: 'Saturated', glyph: '\uD83D\uDCC9' },
    { left: 'No call to action', tag: 'No saves', glyph: '\u274C' },
  ],
  badFooter: 'Engagement: 1.2%',
  goodTitle: 'AI writes captions that land',
  goodCopy:
    'Type a topic and the AI content engine writes scroll-stopping hooks, on-brand captions, and hashtags tuned to your niche.',
  goodListLabel: 'AI-optimized post',
  goodRows: [
    { left: 'Scroll-stopping hook', tag: 'Strong', glyph: '\uD83C\uDFAF' },
    { left: 'Niche-tuned hashtags', tag: 'Reachable', glyph: '\uD83D\uDCC8' },
    { left: 'Clear save-worthy CTA', tag: '+Saves', glyph: '\u2728' },
  ],
  goodFooter: 'Projected engagement: 8.7%',
}

// Phase-1 set: middle tab avoids DM/comment automation framing, focusing on
// multi-account publishing + scheduling instead.
const PROBLEMS_PHASE1: Problem[] = [
  PROBLEM_SCHEDULING,
  {
    tab: 'Hours lost to manual work',
    Icon: TrendingDown,
    badProblemTitle: 'Drowning in manual busywork',
    badCopy:
      'Resizing every post, copy-pasting captions, juggling tabs across accounts — the admin work eats the hours you should spend creating.',
    badListLabel: 'Your week',
    badRows: [
      { left: 'Posting one account at a time', tag: '6 hrs', glyph: '\uD83D\uDCF1' },
      { left: 'Manual scheduling', tag: '3 hrs', glyph: '\uD83D\uDDD3\uFE0F' },
      { left: 'Reformatting posts', tag: '4 hrs', glyph: '\u270B' },
    ],
    badFooter: 'Time lost: ~13 hrs / week',
    goodTitle: 'Veefore does the busywork',
    goodCopy:
      'Auto-scheduling, multi-account publishing, and one-click repurposing run in the background, so you reclaim your week for content.',
    goodListLabel: 'Running on autopilot',
    goodRows: [
      { left: 'Schedule all accounts at once', tag: 'Always on', glyph: '\u26A1' },
      { left: 'Smart scheduling', tag: 'Always on', glyph: '\u2705' },
      { left: 'Repurpose to all formats', tag: '1 click', glyph: '\u2728' },
    ],
    goodFooter: 'Time saved: ~11 hrs / week',
  },
  PROBLEM_CAPTIONS,
]

// Full set keeps the DM-automation framing for the middle tab.
const PROBLEMS_FULL: Problem[] = [
  PROBLEM_SCHEDULING,
  {
    tab: 'Hours lost to manual work',
    Icon: TrendingDown,
    badProblemTitle: 'Drowning in manual busywork',
    badCopy:
      'Replying to every DM, resizing every post, copy-pasting links — the admin work eats the hours you should spend creating.',
    badListLabel: 'Your week',
    badRows: [
      { left: 'Answering DMs by hand', tag: '6 hrs', glyph: '\uD83D\uDCAC' },
      { left: 'Manual scheduling', tag: '3 hrs', glyph: '\uD83D\uDDD3\uFE0F' },
      { left: 'Reformatting posts', tag: '4 hrs', glyph: '\u270B' },
    ],
    badFooter: 'Time lost: ~13 hrs / week',
    goodTitle: 'Automations do the busywork',
    goodCopy:
      'Keyword DM flows, auto-scheduling, and one-click repurposing run in the background, so you reclaim your week for content.',
    goodListLabel: 'Running on autopilot',
    goodRows: [
      { left: 'Auto-reply to "price"', tag: '247 today', glyph: '\u26A1' },
      { left: 'Smart scheduling', tag: 'Always on', glyph: '\u2705' },
      { left: 'Repurpose to all formats', tag: '1 click', glyph: '\u2728' },
    ],
    goodFooter: 'Time saved: ~11 hrs / week',
  },
  PROBLEM_CAPTIONS,
]

const PROBLEMS: Problem[] = PHASE_1_REVIEW_MODE ? PROBLEMS_PHASE1 : PROBLEMS_FULL

/** A single comparison column (WITHOUT or WITH Veefore). */
const CompareCard: React.FC<{ p: Problem; good: boolean }> = ({ p, good }) => {
  const accent = good ? GREEN : RED
  const rows = good ? p.goodRows : p.badRows
  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-[20px] p-6 md:p-7"
      style={{
        background: good
          ? `linear-gradient(180deg, ${GREEN}1F, #0C0D11 55%)`
          : `linear-gradient(180deg, ${RED}1F, #0C0D11 55%)`,
        border: `1px solid ${accent}33`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 40px 90px -50px ${accent}66`,
      }}
    >
      {/* badge */}
      <span
        className="mb-5 inline-flex w-max items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{ background: `${accent}1F`, color: accent, border: `1px solid ${accent}40` }}
      >
        {good ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        {good ? 'With Veefore' : 'Without Veefore'}
      </span>

      <h3 className="text-[19px] font-semibold text-[#F5F6F8] md:text-[21px]" style={{ fontFamily: "'Syne', sans-serif" }}>
        {good ? p.goodTitle : p.badProblemTitle}
      </h3>
      <p className="mt-2.5 text-[14px] leading-relaxed text-[#9BA3B4]">
        {good ? p.goodCopy : p.badCopy}
      </p>

      {/* mini list */}
      <div className="veef-mono mb-2.5 mt-6 text-[10px] uppercase tracking-wide text-[#5A6172]">
        {good ? p.goodListLabel : p.badListLabel}
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.left}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="flex items-center gap-2 text-[12.5px] text-[#D7DBE3]">
              {r.glyph && <span aria-hidden="true">{r.glyph}</span>}
              {r.left}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: accent }}>
              {good && (r.tag === 'Peak' ? <Flame className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />)}
              {r.tag}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 text-center text-[12px] font-medium" style={{ color: accent }}>
        {good ? <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" />{p.goodFooter}</span> : p.badFooter}
      </div>
    </div>
  )
}

/**
 * Problem section (Section 4 — `id="problem"`).
 *
 * A tabbed before/after comparison: an eyebrow + headline with an accent
 * phrase, three tab pills for the growth-killers, and a two-column WITHOUT
 * (red, problem) vs WITH (green, solution) Veefore comparison that swaps as the
 * active tab changes. Status colours are functional (red problem / green win),
 * the brand accent appears only on the eyebrow + active tab. ZERO purple.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 20.2, 21.1
 */
export const ProblemSection: React.FC = () => {
  const { reducedMotion } = useLandingMotion()
  const [active, setActive] = useState(0)
  // Pause auto-rotation while the user is interacting with the tabs.
  const [paused, setPaused] = useState(false)
  const p = PROBLEMS[active]

  // Auto-advance the active tab every 6s (looping). Disabled under reduced
  // motion and while the user is hovering/focusing the tab area.
  useEffect(() => {
    if (reducedMotion || paused) return
    const id = setInterval(() => {
      setActive((prev) => (prev + 1) % PROBLEMS.length)
    }, 6000)
    return () => clearInterval(id)
  }, [reducedMotion, paused])

  // Manual selection: switch immediately and briefly hold the rotation so it
  // doesn't jump again right after a click.
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectTab = (i: number) => {
    setActive(i)
    setPaused(true)
    if (holdRef.current) clearTimeout(holdRef.current)
    holdRef.current = setTimeout(() => setPaused(false), 6000)
  }
  useEffect(() => () => { if (holdRef.current) clearTimeout(holdRef.current) }, [])

  return (
    <section id="problem" aria-labelledby="problem-heading" className="relative w-full px-4 py-16 md:px-6 md:py-28">
      <div className="mx-auto max-w-[1320px]">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="mx-auto mb-10 max-w-2xl text-center">
          <span
            className="veef-mono inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
            style={{ color: COLORS.coral, background: `${COLORS.coral}14`, border: `1px solid ${COLORS.coral}33` }}
          >
            <Flame className="h-3 w-3" />
            Why creators plateau
          </span>

          <h2
            id="problem-heading"
            className="veef-display mt-5 text-[clamp(32px,5vw,56px)] font-extrabold text-[#F5F6F8]"
            style={{ lineHeight: 1.2 }}
          >
            The 3 things that{' '}
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
              kill your growth
            </span>
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-[#9BA3B4] md:text-[16px]">
            It&rsquo;s not your content. It&rsquo;s the invisible bottlenecks eating your
            reach, your time, and your momentum — every single day.
          </p>
        </header>

        {/* ── Tab pills ──────────────────────────────────────────────── */}
        <div
          className="mb-10 flex flex-wrap items-center justify-center gap-2.5"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {PROBLEMS.map((item, i) => {
            const isActive = i === active
            const Icon = item.Icon
            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => selectTab(i)}
                className="flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-200"
                style={
                  isActive
                    ? { background: 'rgba(255,255,255,0.08)', color: '#F5F6F8', border: '1px solid rgba(255,255,255,0.16)' }
                    : { background: 'rgba(255,255,255,0.02)', color: '#7A8499', border: '1px solid rgba(255,255,255,0.07)' }
                }
              >
                <Icon className="h-3.5 w-3.5" style={{ color: isActive ? COLORS.coral : '#5A6172' }} />
                <span className="max-w-[140px] truncate sm:max-w-none">{item.tab}</span>
              </button>
            )
          })}
        </div>

        {/* ── Comparison ─────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <m.div
            key={active}
            className="grid grid-cols-1 gap-5 md:grid-cols-2"
            initial={reducedMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: reducedMotion ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <CompareCard p={p} good={false} />
            <CompareCard p={p} good />
          </m.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

ProblemSection.displayName = 'ProblemSection'
