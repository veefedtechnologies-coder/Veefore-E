import { m } from 'framer-motion'
import {
  Heart,
  MessageSquare,
  Eye,
  TrendingUp,
  Zap,
  Bell,
  BarChart3,
  Users,
  Clock,
  Target,
  Inbox,
  FileText,
  ChevronDown,
  Search,
  SlidersHorizontal,
} from 'lucide-react'

import { useLandingMotion } from '../context/LandingMotionProvider'
import { useCountUp } from '../hooks/useCountUp'
import { useInViewOnce } from '../hooks/useInViewOnce'
import { GlowButton } from '../primitives/GlowButton'
import { PhoneMockup } from '../primitives/PhoneMockup'
import { COLORS } from '../constants/colors'
import { PHASE_1_REVIEW_MODE } from '../constants/reviewMode'
import { FloatingPlatformLogos } from './hero/FloatingPlatformLogos'
import { usePrimaryCta } from '../hooks/usePrimaryCta'
import { useTypewriter } from '../hooks/useTypewriter'

/* Static lead, then the highlighted word cycles with a typewriter effect. */
const HERO_LEAD = 'Grow your Instagram on'
const HERO_WORDS = ['autopilot', 'your terms', 'demand', 'steroids', 'every post']

export interface HeroSectionProps {
  onNavigate?: (page: string) => void
}

/* ------------------------------------------------------------------ *
 * Proof stats
 * ------------------------------------------------------------------ */
interface TrustStat {
  target: number
  format: (value: number) => string
  ariaValue: string
  label: string
}

const TRUST_STATS: TrustStat[] = [
  { target: 100, format: () => '100%', ariaValue: '100%', label: 'Meta Official API' },
  { target: 499, format: () => '₹499/mo', ariaValue: '₹499/mo', label: 'Starting price' },
  { target: 4, format: () => '4-in-1', ariaValue: '4-in-1', label: 'Tools in one platform' },
]

const TrustStatItem: React.FC<{ stat: TrustStat; reducedMotion: boolean }> = ({ stat, reducedMotion }) => {
  const [ref, inView] = useInViewOnce<HTMLDivElement>({ threshold: 0.4 })
  const value = useCountUp(stat.target, { duration: 1400, reducedMotion, active: inView })
  return (
    <div ref={ref} aria-label={`${stat.ariaValue} ${stat.label}`} className="flex flex-col items-center">
      <span aria-hidden="true" className="veef-mono text-xl text-[#F5F6F8] md:text-2xl" style={{ fontWeight: 500 }}>
        {stat.format(value)}
      </span>
      <span aria-hidden="true" className="mt-1 text-[12px] uppercase tracking-wider text-[#5A6172]">
        {stat.label}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * HeroVisual — Veefore dashboard in a phone frame.
 * Fits entirely within the screen without scrolling, showing:
 *  - A minimal top-bar with the Veefore logo and a notification bell
 *  - 4 metric cards (Followers, Reach, Engagement, Saves)
 *  - A bar chart strip
 *  - 2 quick-action automation pills
 * ------------------------------------------------------------------ */
const CHART_BARS = [35, 52, 44, 68, 60, 80, 72, 94, 86, 100]

const HeroVisual: React.FC = () => (
  <PhoneMockup className="w-full max-w-[280px] sm:max-w-[320px]">
    {/* App top bar */}
    <div className="flex items-center justify-between px-4 pt-2 pb-3">
      <div className="flex items-center gap-2">
        <img src="/veefore.svg" alt="Veefore" className="h-6 w-6 object-contain" />
        <span className="text-[13px] font-semibold text-[#E6E8EC]" style={{ fontFamily: "'Syne', sans-serif" }}>
          Dashboard
        </span>
      </div>
      <div className="relative flex items-center">
        <Bell className="h-4.5 w-4.5 text-[#9BA3B4]" />
        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white" style={{ background: COLORS.coral }}>3</span>
      </div>
    </div>

    {/* Metric cards 2×2 */}
    <div className="grid grid-cols-2 gap-2 px-3">
      {[
        { label: 'Followers', value: '24.5K', change: '+12.3%', Icon: MessageSquare, c: COLORS.coral },
        { label: 'Reach', value: '156K', change: '+18%', Icon: Eye, c: COLORS.cyan },
        { label: 'Engagement', value: '8.7%', change: '+2.1%', Icon: Heart, c: COLORS.gold },
        { label: 'Saves', value: '9.2K', change: '+34%', Icon: TrendingUp, c: '#A78BFA' },
      ].map((m) => (
        <div
          key={m.label}
          className="rounded-xl p-3"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="mb-1 flex items-center justify-between">
            <m.Icon className="h-3.5 w-3.5" style={{ color: m.c }} />
            <span className="text-[9px] font-medium" style={{ color: '#3FB950' }}>{m.change}</span>
          </div>
          <div className="text-[15px] font-bold text-[#F5F6F8]">{m.value}</div>
          <div className="text-[9px] text-[#5A6172]">{m.label}</div>
        </div>
      ))}
    </div>

    {/* Growth bar chart */}
    <div className="mx-3 mt-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium text-[#D7DBE3]">Weekly reach</span>
        <span className="text-[9px]" style={{ color: COLORS.coral }}>▲ 18%</span>
      </div>
      <div className="flex h-12 items-end gap-1">
        {CHART_BARS.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[2px]"
            style={{
              height: `${h}%`,
              background: i === CHART_BARS.length - 1
                ? COLORS.coral
                : 'rgba(155,163,180,0.28)',
            }}
          />
        ))}
      </div>
    </div>

    {/* Status pills — automation hidden during Phase 1 Meta review */}
    <div className="mx-3 mt-3 space-y-2">
      <div className="text-[9px] uppercase tracking-wide text-[#5A6172]">
        {PHASE_1_REVIEW_MODE ? 'Active workflows' : 'Active automations'}
      </div>
      {(PHASE_1_REVIEW_MODE
        ? [
            { name: 'Smart scheduler', meta: '12 queued', c: COLORS.coral },
            { name: 'AI caption engine', meta: '8 drafted', c: COLORS.cyan },
          ]
        : [
            { name: 'Comment auto-reply', meta: '247 today', c: '#3FB950' },
            { name: 'Smart scheduler', meta: '12 queued', c: COLORS.coral },
          ]
      ).map((a) => (
        <div key={a.name} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: a.c }} />
            <span className="text-[10px] text-[#D7DBE3]">{a.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3" style={{ color: a.c }} />
            <span className="text-[9px] text-[#5A6172]">{a.meta}</span>
          </div>
        </div>
      ))}
    </div>
  </PhoneMockup>
)

/* ------------------------------------------------------------------ *
 * HeroDashboard — desktop-only Linear-style campaigns table.
 * ------------------------------------------------------------------ */
const PLATFORM_TINT: Record<'ig' | 'yt' | 'wa' | 'meta', string> = {
  ig: '#C13584', yt: '#C44', wa: '#3FB950', meta: '#4C7EF3',
}
type Health = 'on' | 'risk' | 'off'
const HEALTH: Record<Health, { dot: string; label: string }> = {
  on: { dot: '#3FB950', label: 'On track' },
  risk: { dot: '#D29922', label: 'At risk' },
  off: { dot: '#F85149', label: 'Off track' },
}
const DASH_ROWS_FULL = [
  { name: 'Q3 Growth Push', platform: 'ig', target: 'Sep 2026', health: 'on', done: 23, total: 32, spark: [3,5,4,7,6,9,11] },
  { name: 'Reels engine', sub: 'Daily short-form pipeline', platform: 'ig', target: 'Sep 2026', health: 'on', done: 41, total: 60, spark: [5,6,6,8,9,10,12], indent: true },
  { name: 'DM funnel v2', sub: 'Keyword → reply → lead', platform: 'wa', target: 'Q3 2026', health: 'risk', done: 12, total: 28, spark: [2,3,3,4,3,5,4], indent: true },
  { name: 'Creator collabs', platform: 'yt', target: 'Q4 2026', health: 'off', done: 4, total: 18, spark: [1,2,1,3,2,2,3] },
  { name: 'Festive campaign', platform: 'meta', target: 'Oct 2026', health: 'on', done: 9, total: 14, spark: [4,5,7,6,8,9,10] },
  { name: 'Always-on retargeting', platform: 'meta', target: '2026', health: 'on', done: 79, total: 92, spark: [8,8,9,10,11,11,12] },
  { name: 'Story polls + quizzes', sub: 'Interactive engagement loop', platform: 'ig', target: 'Q4 2026', health: 'on', done: 18, total: 24, spark: [3,4,5,5,7,8,9], indent: true },
  { name: 'UGC repost program', platform: 'ig', target: 'Q4 2026', health: 'risk', done: 6, total: 20, spark: [2,2,3,2,4,3,5] },
  { name: 'Comment auto-reply', sub: 'Pricing + booking link', platform: 'wa', target: 'Live', health: 'on', done: 247, total: 260, spark: [9,10,10,11,11,12,12], indent: true },
  { name: 'YouTube Shorts sync', platform: 'yt', target: 'Q1 2027', health: 'off', done: 2, total: 16, spark: [1,1,2,1,2,2,2] },
  { name: 'Weekly insights digest', platform: 'meta', target: 'Live', health: 'on', done: 52, total: 52, spark: [6,7,8,9,10,11,12] },
] as const

// Phase 1 Meta review: replace the two DM/comment-automation rows with
// scheduling / analytics campaigns so the dashboard advertises no automation.
const DASH_ROWS_PHASE1 = [
  { name: 'Q3 Growth Push', platform: 'ig', target: 'Sep 2026', health: 'on', done: 23, total: 32, spark: [3,5,4,7,6,9,11] },
  { name: 'Reels engine', sub: 'Daily short-form pipeline', platform: 'ig', target: 'Sep 2026', health: 'on', done: 41, total: 60, spark: [5,6,6,8,9,10,12], indent: true },
  { name: 'Content calendar', sub: 'Auto-scheduled at peak times', platform: 'ig', target: 'Q3 2026', health: 'on', done: 28, total: 40, spark: [4,5,6,7,8,9,11], indent: true },
  { name: 'Creator collabs', platform: 'yt', target: 'Q4 2026', health: 'off', done: 4, total: 18, spark: [1,2,1,3,2,2,3] },
  { name: 'Festive campaign', platform: 'meta', target: 'Oct 2026', health: 'on', done: 9, total: 14, spark: [4,5,7,6,8,9,10] },
  { name: 'Always-on retargeting', platform: 'meta', target: '2026', health: 'on', done: 79, total: 92, spark: [8,8,9,10,11,11,12] },
  { name: 'Story polls + quizzes', sub: 'Interactive engagement loop', platform: 'ig', target: 'Q4 2026', health: 'on', done: 18, total: 24, spark: [3,4,5,5,7,8,9], indent: true },
  { name: 'UGC repost program', platform: 'ig', target: 'Q4 2026', health: 'risk', done: 6, total: 20, spark: [2,2,3,2,4,3,5] },
  { name: 'AI caption batch', sub: 'Captions + hooks + hashtags', platform: 'ig', target: 'Live', health: 'on', done: 64, total: 70, spark: [9,10,10,11,11,12,12], indent: true },
  { name: 'YouTube Shorts sync', platform: 'yt', target: 'Q1 2027', health: 'off', done: 2, total: 16, spark: [1,1,2,1,2,2,2] },
  { name: 'Weekly insights digest', platform: 'meta', target: 'Live', health: 'on', done: 52, total: 52, spark: [6,7,8,9,10,11,12] },
] as const

const DASH_ROWS = PHASE_1_REVIEW_MODE ? DASH_ROWS_PHASE1 : DASH_ROWS_FULL

const RowSpark: React.FC<{ vals: readonly number[]; up: boolean }> = ({ vals, up }) => {
  const m = Math.max(...vals); const w=52; const h=16
  const d = vals.map((v,i)=>`${i===0?'M':'L'}${((i/(vals.length-1))*w).toFixed(1)},${(h-(v/m)*(h-2)-1).toFixed(1)}`).join(' ')
  return <svg width={w} height={h} aria-hidden="true"><path d={d} fill="none" stroke={up?'#3FB950':'#6B7280'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.85}/></svg>
}

const HeroDashboard: React.FC = () => (
  <div
    className="relative w-full overflow-hidden rounded-2xl text-left"
    style={{
      background:'linear-gradient(180deg,rgba(18,19,24,0.96),rgba(9,10,13,0.96))',
      border:'1px solid rgba(255,255,255,0.10)',
      boxShadow:'0 1px 0 rgba(255,255,255,0.06) inset,0 50px 140px -40px rgba(0,0,0,0.85),0 0 100px -60px rgba(76,130,247,0.3)',
    }}
  >
    <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
      <span className="h-3 w-3 rounded-full" style={{background:'#FF5F57'}}/>
      <span className="h-3 w-3 rounded-full" style={{background:'#FEBC2E'}}/>
      <span className="h-3 w-3 rounded-full" style={{background:'#28C840'}}/>
      <img src="/veefore.svg" alt="Veefore" className="ml-3 h-4 w-4 object-contain"/>
      <span className="veef-mono text-[12px] text-[#5A6172]">app.veefore.com</span>
    </div>
    <div className="flex">
      <aside className="hidden w-[200px] flex-shrink-0 flex-col border-r border-white/[0.07] p-3 lg:flex">
        <div className="mb-4 flex items-center gap-2 px-2 py-1">
          <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{background:`linear-gradient(135deg,${COLORS.coral},${COLORS.gold})`}}>
            <img src="/veefore.svg" alt="" className="h-3.5 w-3.5 object-contain brightness-0 invert"/>
          </span>
          <span className="text-[13px] font-semibold text-[#E6E8EC]">Veefore</span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 text-[#5A6172]"/>
        </div>
        {[{l:'Inbox',Icon:Inbox},{l:'My posts',Icon:FileText},{l:'Insights',Icon:BarChart3}].map(({l,Icon})=>(
          <div key={l} className="mb-0.5 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] text-[#9BA3B4]"><Icon className="h-4 w-4 text-[#6B7280]"/>{l}</div>
        ))}
        <div className="veef-mono mb-1 mt-4 px-2 text-[10px] uppercase tracking-wide text-[#3A4150]">Workspace</div>
        {[{l:'Campaigns',Icon:Target,a:true},{l:'Schedule',Icon:Clock},...(PHASE_1_REVIEW_MODE?[{l:'AI Content',Icon:Zap}]:[{l:'Automations',Icon:Zap}]),{l:'Audience',Icon:Users}].map(({l,Icon,a})=>(
          <div key={l} className="mb-0.5 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px]" style={a?{background:'rgba(255,255,255,0.06)',color:'#E6E8EC'}:{color:'#9BA3B4'}}>
            <Icon className="h-4 w-4" style={{color:a?COLORS.coral:'#6B7280'}}/>{l}
          </div>
        ))}
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-5 border-b border-white/[0.07] px-5 pt-4">
          {['Campaigns','Active','Planned','Done'].map((t,i)=>(
            <span key={t} className="relative pb-3 text-[13px]" style={{color:i===0?'#E6E8EC':'#5A6172'}}>
              {t}{i===0&&<span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full" style={{background:COLORS.coral}}/>}
            </span>
          ))}
          <div className="ml-auto flex items-center gap-2 pb-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-[#5A6172]"/>
            <Search className="h-3.5 w-3.5 text-[#5A6172]"/>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_88px_104px_92px_64px] items-center gap-3 px-5 py-2.5 veef-mono text-[10.5px] uppercase tracking-wide text-[#5A6172]">
          <span>Name</span><span>Target</span><span>Status</span><span>Progress</span><span className="text-right">Activity</span>
        </div>
        <div>
          {DASH_ROWS.map((r) => {
            const health = HEALTH[r.health as Health]
            const pct = Math.round((r.done/r.total)*100)
            return (
              <div key={r.name} className="grid grid-cols-[1fr_88px_104px_92px_64px] items-center gap-3 border-t border-white/[0.05] px-5 py-3 transition-colors hover:bg-white/[0.02]">
                <div className={`flex min-w-0 items-center gap-2.5 ${r.indent?'pl-5':''}`}>
                  <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]" style={{background:PLATFORM_TINT[r.platform as keyof typeof PLATFORM_TINT]}}/>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-[#E6E8EC]">{r.name}</div>
                    {r.sub&&<div className="truncate text-[11px] text-[#5A6172]">{r.sub}</div>}
                  </div>
                </div>
                <span className="veef-mono text-[11.5px] text-[#9BA3B4]">{r.target}</span>
                <span className="flex items-center gap-1.5 text-[12px]" style={{color:health.dot}}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{background:health.dot}}/>{health.label}
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                    <div className="h-full rounded-full" style={{width:`${pct}%`,background:'#6B7280'}}/>
                  </div>
                  <span className="veef-mono text-[10.5px] text-[#5A6172]">{r.done}</span>
                </div>
                <div className="flex justify-end"><RowSpark vals={r.spark} up={r.health!=='off'}/></div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  </div>
)

/* ------------------------------------------------------------------ *
 * TypewriterWord — isolated so the per-keystroke state update only
 * re-renders this small node, NOT the entire hero (the floating logos,
 * phone dashboard, etc.). Keeping the timer here prevents the whole hero
 * from repainting ~10×/sec, which competed with scroll painting and
 * caused visible jitter while scrolling.
 * ------------------------------------------------------------------ */
const TypewriterWord: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const typedWord = useTypewriter(HERO_WORDS, { reducedMotion, typeSpeed: 90, backSpeed: 45, pause: 1800 })
  return (
    <span
      aria-live="polite"
      className="inline-flex items-center justify-center whitespace-nowrap"
      style={{ minHeight: '1.25em' }}
    >
      <span
        className="veef-gradient-text"
        style={{
          background: `linear-gradient(120deg, ${COLORS.coral}, ${COLORS.gold})`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
        }}
      >
        {typedWord || '\u00A0'}
      </span>
      {!reducedMotion && (
        <span
          aria-hidden="true"
          className="veef-caret ml-1.5 inline-block"
          style={{
            width: '0.07em',
            height: '0.82em',
            background: COLORS.coral,
            borderRadius: '2px',
          }}
        />
      )}
    </span>
  )
}

/**
 * Hero — restrained, premium (Linear / Framer / Raycast).
 *
 * Centred column: small bordered eyebrow → huge tight Syne headline with ONE
 * accent word → calm subhead → two refined CTAs → thin proof row → a wide
 * glassy product window behind a soft accent halo that anchors the section.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.9, 20.1, 21.1, 21.2
 */
export const HeroSection: React.FC<HeroSectionProps> = ({ onNavigate }) => {
  const { reducedMotion } = useLandingMotion()
  const cta = usePrimaryCta(onNavigate)

  const rise = (delay: number) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
        }

  const handleWatchDemo = () => {
    if (typeof document === 'undefined') return
    document.getElementById('demo')?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="relative mx-auto flex w-full max-w-[1400px] flex-col items-center overflow-hidden px-4 pb-16 pt-24 text-center sm:px-6 sm:pb-24 sm:pt-32 md:pt-44"
    >
      {/* Floating 3D platform logos on both rails */}
      <FloatingPlatformLogos reducedMotion={reducedMotion} />

      {/* Eyebrow */}
      <m.div className="relative z-10" {...rise(0.05)}>
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px]"
          style={{
            borderColor: 'rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.03)',
            color: '#9BA3B4',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.04em',
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: COLORS.coral, boxShadow: `0 0 8px ${COLORS.coral}` }}
            aria-hidden="true"
          />
          India&rsquo;s AI social operating system
        </span>
      </m.div>

      {/* Headline — static lead on top, highlighted word cycles below */}
      <m.h1
        id="hero-heading"
        className="veef-display relative z-10 mx-auto mt-8 flex max-w-[18ch] flex-col items-center text-[clamp(40px,7.5vw,96px)] font-extrabold text-[#F5F6F8]"
        style={{ lineHeight: 1.2 }}
        {...rise(0.12)}
      >
        <span>{HERO_LEAD}</span>
        {/* Reserve a full line so the layout never jumps as the word types.
            Isolated into its own component so the per-keystroke re-render
            doesn't repaint the whole hero (prevents scroll jitter). */}
        <TypewriterWord reducedMotion={reducedMotion} />
      </m.h1>

      {/* Subhead */}
      <m.p className="relative z-10 mx-auto mt-7 max-w-[42ch] text-[15px] leading-relaxed text-[#9BA3B4] md:text-[19px]" {...rise(0.2)}>
        {PHASE_1_REVIEW_MODE
          ? 'Scheduling, analytics, and AI content — one calm, fast platform built for Indian creators and teams.'
          : 'Scheduling, DM automation, analytics, and AI content — one calm, fast platform built for Indian creators and teams.'}
      </m.p>

      {/* CTAs */}
      <m.div className="relative z-10 mt-9 flex flex-col items-center gap-3 sm:flex-row" {...rise(0.28)}>
        <GlowButton variant="coral" onClick={cta.go}>
          {cta.label}
          <span aria-hidden="true">→</span>
        </GlowButton>
        <GlowButton variant="ghost" glow={false} onClick={handleWatchDemo}>
          See it work
        </GlowButton>
      </m.div>

      <m.p className="relative z-10 mt-4 text-[13px] text-[#5A6172]" {...rise(0.32)}>
        No credit card · Free forever plan · Starts at ₹499/mo
      </m.p>

      {/* Visual: phone mockup on mobile, desktop dashboard on md+ */}
      <m.div className="relative z-10 mt-12 flex w-full justify-center sm:mt-16 md:mt-20" {...rise(0.42)}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-12 -top-20 bottom-0"
          style={{
            background: `radial-gradient(55% 45% at 50% 0%, ${COLORS.coral}18, transparent 70%)`,
            filter: 'blur(50px)',
          }}
        />
        {/* Phone mockup — mobile only (< 768px) */}
        <div className="relative md:hidden">
          <HeroVisual />
        </div>
        {/* Desktop dashboard table — 768px and up */}
        <div className="relative hidden w-full max-w-[1340px] md:block">
          <HeroDashboard />
        </div>
      </m.div>

      {/* Proof row — below the window, like a trusted-by strip */}
      <m.div className="mt-16 flex items-center justify-center gap-6 sm:gap-12 md:gap-16" {...rise(0.5)}>
        {TRUST_STATS.map((stat) => (
          <TrustStatItem key={stat.label} stat={stat} reducedMotion={reducedMotion} />
        ))}
      </m.div>
    </section>
  )
}

HeroSection.displayName = 'HeroSection'
