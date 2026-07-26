import { m, AnimatePresence } from 'framer-motion'
import {
  Send,
  Calendar,
  Sparkles,
  BarChart3,
  Zap,
  CheckCheck,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

import { useLandingMotion } from '../context/LandingMotionProvider'
import { useInViewOnce } from '../hooks/useInViewOnce'
import { COLORS } from '../constants/colors'
import { PHASE_1_REVIEW_MODE } from '../constants/reviewMode'
import { PhoneMockup } from '../primitives/PhoneMockup'

/* ================================================================== *
 * Window chrome — used by every DESKTOP visual
 * ================================================================== */
const Window: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({
  title, children, className,
}) => (
  <div
    className={`relative flex flex-col overflow-hidden rounded-2xl text-left ${className ?? ''}`}
    style={{
      background:'linear-gradient(180deg,rgba(18,19,24,0.96),rgba(9,10,13,0.96))',
      border:'1px solid rgba(255,255,255,0.10)',
      boxShadow:'0 1px 0 rgba(255,255,255,0.06) inset,0 50px 140px -40px rgba(0,0,0,0.85)',
      minHeight: '620px',
    }}
  >
    <div className="flex flex-shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 py-3">
      <span className="h-3 w-3 rounded-full" style={{background:'#FF5F57'}}/>
      <span className="h-3 w-3 rounded-full" style={{background:'#FEBC2E'}}/>
      <span className="h-3 w-3 rounded-full" style={{background:'#28C840'}}/>
      <img src="/veefore.svg" alt="Veefore" className="ml-3 h-4 w-4 object-contain"/>
      <span className="veef-mono text-[12px] text-[#5A6172]">{title}</span>
    </div>
    <div className="flex flex-1 flex-col">{children}</div>
  </div>
)

/* ================================================================== *
 * Reusable Linear-style feature block:
 *   - split header (headline left, copy + version eyebrow right)
 *   - large product surface below
 * ================================================================== */
interface FeatureBlockProps {
  version: string
  tag: string
  headline: string
  copy: string
  visual: React.ReactNode
  /** Bleed the visual toward this edge (Linear alternates sides). */
  bleed?: 'left' | 'right'
}

const FeatureBlock: React.FC<FeatureBlockProps> = ({
  version,
  tag,
  headline,
  copy,
  visual,
  bleed = 'right',
}) => {
  const { reducedMotion } = useLandingMotion()
  const [ref, inView] = useInViewOnce<HTMLDivElement>({ threshold: 0.12 })

  const reveal = (delay: number) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 22 },
          animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 },
          transition: { delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
        }

  return (
    <div ref={ref} className="mx-auto max-w-[1400px] px-6">
      {/* Split header */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-end">
        <m.h2
          className="veef-display max-w-[15ch] text-[clamp(32px,4.6vw,56px)] font-extrabold text-[#F5F6F8]"
          style={{ lineHeight: 1.2 }}
          {...reveal(0.05)}
        >
          {headline}
        </m.h2>

        <m.div {...reveal(0.14)}>
          <p className="max-w-md text-[16px] leading-relaxed text-[#9BA3B4] md:ml-auto md:text-[17px]">
            {copy}
          </p>
          <p className="veef-mono mt-5 text-[13px] text-[#5A6172] md:text-right">
            <span className="text-[#9BA3B4]">{version}</span>{' '}
            <span style={{ color: COLORS.coral }}>{tag}</span> →
          </p>
        </m.div>
      </div>

      {/* Product surface — width matched to the hero dashboard (max 1340px). */}
      <m.div className="relative mx-auto mt-14 w-full max-w-[1340px]" {...reveal(0.24)}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-10 -top-16 bottom-0"
          style={{
            background: `radial-gradient(50% 40% at ${bleed === 'right' ? '60%' : '40%'} 0%, ${COLORS.coral}12, transparent 70%)`,
            filter: 'blur(50px)',
          }}
        />
        <div className="relative w-full">{visual}</div>
      </m.div>
    </div>
  )
}

/* ================================================================== *
 * Shared small UI primitives used inside phone screens
 * ================================================================== */

/** Tiny coloured dot status badge */
const LiveDot: React.FC<{ color?: string }> = ({ color = '#3FB950' }) => (
  <span
    className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
    style={{ background: color, boxShadow: `0 0 5px ${color}` }}
  />
)

/* ------------------------------------------------------------------ *
 * Visual 1 — Scheduling phone screen
 * ------------------------------------------------------------------ */
const SchedulingVisual: React.FC = () => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const todayIdx = 2 // Wednesday highlighted

  const posts = [
    { time: '9:00 AM', type: 'Reel', label: '5 AI hooks', color: COLORS.coral },
    { time: '12:30 PM', type: 'Carousel', label: 'Case study', color: COLORS.gold },
    { time: '5:00 PM', type: 'Story', label: 'Poll', color: COLORS.cyan },
    { time: '8:00 AM', type: 'Reel', label: 'Behind scenes', color: COLORS.coral },
  ]

  return (
    <>
      {/* ── Mobile: phone mockup ──── */}
      <div className="flex justify-center md:hidden">
        <PhoneMockup className="w-full max-w-[280px] sm:max-w-[320px]">
          {/* App header */}
          <div className="flex items-center justify-between px-4 pb-2 pt-1">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" style={{ color: COLORS.coral }} />
              <span className="text-[13px] font-semibold text-[#E6E8EC]">Schedule</span>
            </div>
            <span className="veef-mono rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ background:`${COLORS.cyan}1A`,color:COLORS.cyan,border:`1px solid ${COLORS.cyan}33` }}>Queue: 12</span>
          </div>
          <div className="mx-3 mb-2 rounded-xl p-2" style={{ background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)' }}>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {days.map((d,i)=>{const isToday=i===todayIdx;return(
                <div key={d} className="flex flex-col items-center gap-0.5">
                  <span className="veef-mono text-[8px]" style={{color:isToday?COLORS.coral:'#5A6172'}}>{d}</span>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold" style={isToday?{background:COLORS.coral,color:'#fff'}:{color:'#9BA3B4'}}>{14+i}</div>
                </div>
              )})}
            </div>
          </div>
          <div className="mx-3 flex flex-col gap-2">
            <div className="veef-mono mb-0.5 text-[9px] uppercase tracking-wide text-[#5A6172]">Upcoming</div>
            {posts.map((p)=>(
              <div key={p.label} className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{background:`${p.color}0F`,border:`1px solid ${p.color}30`,borderLeft:`3px solid ${p.color}`}}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="veef-mono text-[8px] font-semibold" style={{color:p.color}}>{p.type}</span>
                    <span className="veef-mono text-[8px] text-[#5A6172]">{p.time}</span>
                  </div>
                  <div className="truncate text-[11px] font-medium text-[#D7DBE3]">{p.label}</div>
                </div>
                <LiveDot color={p.color}/>
              </div>
            ))}
          </div>
        </PhoneMockup>
      </div>

      {/* ── Desktop: Window with calendar ──── */}
      <div className="hidden w-full md:block" style={{ minHeight: '620px' }}>
        <Window title="scheduler · october">
          <div className="flex flex-1">
            <div className="hidden w-48 flex-shrink-0 flex-col border-r border-white/[0.07] p-4 sm:flex">
              <div className="mb-5 flex items-center gap-2"><Calendar className="h-4 w-4" style={{color:COLORS.coral}}/><span className="text-[13px] font-medium text-[#F5F6F8]">Schedule</span></div>
              {[{l:'Queue',n:'12',active:true},{l:'Drafts',n:'5'},{l:'Published',n:'248'},{l:'Best times',n:''}].map((item)=>(
                <div key={item.l} className="mb-1 flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[12.5px]" style={item.active?{background:'rgba(76,130,247,0.12)',color:'#F5F6F8'}:{color:'#5A6172'}}>
                  <span>{item.l}</span>
                  {item.n&&<span className="veef-mono text-[10px]" style={{color:item.active?COLORS.coral:'#3A4150'}}>{item.n}</span>}
                </div>
              ))}
              <div className="mt-8">
                <div className="veef-mono mb-2 text-[10px] uppercase tracking-wide text-[#3A4150]">Up next</div>
                {[{l:'Reel · 5 AI hooks',time:'Today 9:00',c:COLORS.coral},{l:'Story · Poll',time:'Wed 17:00',c:COLORS.cyan}].map((u)=>(
                  <div key={u.l} className="mb-2 flex items-center gap-2">
                    <span className="h-7 w-7 flex-shrink-0 rounded-md" style={{background:`${u.c}1F`,border:`1px solid ${u.c}44`}}/>
                    <div className="min-w-0"><div className="truncate text-[11.5px] text-[#D7DBE3]">{u.l}</div><div className="veef-mono text-[9.5px] text-[#5A6172]">{u.time}</div></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[14px] font-semibold text-[#F5F6F8]">October 2026</span>
                <span className="veef-mono rounded-full px-2.5 py-1 text-[11px]" style={{background:'rgba(94,230,196,0.12)',color:'#5EE6C4'}}>12 scheduled</span>
              </div>
              <div className="mb-2 grid grid-cols-7 gap-2 text-center veef-mono text-[10px] text-[#5A6172]">
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,i)=><span key={i}>{d}</span>)}
              </div>
              <div className="grid flex-1 grid-cols-7 gap-2">
                {Array.from({length:28}).map((_,i)=>{
                  const cellMap: Record<number,number> = {2:0,8:1,11:2,16:3,19:3,24:0}
                  const postIdx = cellMap[i]
                  const matchI = postIdx !== undefined ? posts[postIdx] : undefined
                  const isToday=i===16
                  if(matchI){return(
                    <div key={i} className="relative flex min-h-[80px] flex-1 flex-col justify-between overflow-hidden rounded-lg p-2" style={{background:`${matchI.color}14`,borderLeft:`2.5px solid ${matchI.color}`,border:`1px solid ${matchI.color}33`}}>
                      <span className="veef-mono text-[9px] font-semibold" style={{color:matchI.color}}>{matchI.type}</span>
                      <span className="text-[10px] font-medium leading-tight text-[#D7DBE3]">{matchI.label}</span>
                      <span className="veef-mono text-[9px] text-[#5A6172]">{matchI.time}</span>
                    </div>
                  )}
                  return<div key={i} className="min-h-[80px] rounded-lg" style={{background:isToday?'rgba(76,130,247,0.05)':'rgba(255,255,255,0.02)',border:isToday?`1px solid ${COLORS.coral}45`:'1px solid rgba(255,255,255,0.05)'}}/>
                })}
              </div>
            </div>
          </div>
        </Window>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Typewriter hook — types out a string character by character
 * ------------------------------------------------------------------ */
function useTypewriter(text: string, speed = 38, startDelay = 0, trigger = true) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!trigger) return
    setDisplayed('')
    setDone(false)
    let i = 0
    const start = setTimeout(() => {
      const iv = setInterval(() => {
        i++
        setDisplayed(text.slice(0, i))
        if (i >= text.length) { clearInterval(iv); setDone(true) }
      }, speed)
      return () => clearInterval(iv)
    }, startDelay)
    return () => clearTimeout(start)
  }, [text, speed, startDelay, trigger])
  return { displayed, done }
}

/* ------------------------------------------------------------------ *
 * Live counter — animates from 0 to target
 * ------------------------------------------------------------------ */
function useLiveCounter(target: number, duration = 1800, trigger = true) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!trigger) return
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      setVal(Math.round(ease * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, trigger])
  return val
}

/* ------------------------------------------------------------------ *
 * Mini floating screen — Comment thread (Screen 1)
 * Shows: user comments → AI replies on comment + fires DM
 * ------------------------------------------------------------------ */
const CommentScreen: React.FC<{ trigger: boolean }> = ({ trigger }) => {
  // Step 0: idle | 1: user comment arrives | 2: AI types reply | 3: DM sent badge
  const [step, setStep] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const aiCommentReply = useTypewriter(
    'Hey! DM sent 📩 Check your inbox for pricing details 🎯',
    32, 0, step === 2,
  )

  useEffect(() => {
    if (!trigger) return
    const seq = () => {
      setStep(0)
      timerRef.current = setTimeout(() => setStep(1), 600)
      timerRef.current = setTimeout(() => setStep(2), 2000)
      timerRef.current = setTimeout(() => setStep(3), 4200)
      timerRef.current = setTimeout(() => { seq() }, 7000)
    }
    seq()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [trigger])

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(180deg,rgba(16,17,22,0.98),rgba(10,11,15,0.98))',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 24px 60px -16px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.06) inset',
        width: '280px',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#FF5F57' }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#FEBC2E' }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#28C840' }} />
          </div>
          <span className="veef-mono text-[10px] text-[#5A6172]">instagram · comments</span>
        </div>
        <LiveDot color="#3FB950" />
      </div>

      {/* Post preview */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <div className="h-8 w-8 flex-shrink-0 rounded-lg" style={{ background: `linear-gradient(135deg, ${COLORS.coral}44, ${COLORS.gold}33)` }} />
        <div>
          <div className="text-[11px] font-semibold text-[#E6E8EC]">veefore_official</div>
          <div className="text-[10px] text-[#5A6172]">New reel: "5 growth hacks 🚀"</div>
        </div>
      </div>

      {/* Comments */}
      <div className="flex flex-col gap-2 px-3 py-3" style={{ minHeight: '130px' }}>
        {/* Existing comments */}
        <div className="flex gap-2">
          <div className="h-5 w-5 flex-shrink-0 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <div>
            <span className="text-[10px] font-semibold text-[#9BA3B4]">ananya.k </span>
            <span className="text-[10px] text-[#7A8FA8]">this is 🔥🔥</span>
          </div>
        </div>

        {/* Live user comment */}
        <AnimatePresence>
          {step >= 1 && (
            <m.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex gap-2"
            >
              <div
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
                style={{ background: `${COLORS.coral}28`, color: COLORS.coral }}
              >P</div>
              <div>
                <span className="text-[10px] font-semibold" style={{ color: COLORS.coral }}>priya_creates </span>
                <span className="text-[10px] text-[#D7DBE3]">what&apos;s the price? 👀</span>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* AI reply to comment */}
        <AnimatePresence>
          {step >= 2 && (
            <m.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex gap-2 pl-4"
            >
              <div
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
                style={{ background: `${COLORS.coral}30`, color: COLORS.coral, border: `1px solid ${COLORS.coral}44` }}
              >V</div>
              <div className="rounded-xl rounded-tl-sm px-2 py-1.5" style={{ background: `${COLORS.coral}16`, border: `1px solid ${COLORS.coral}28` }}>
                <div className="mb-0.5 flex items-center gap-1">
                  <span className="text-[9px] font-semibold" style={{ color: COLORS.coral }}>veefore_official</span>
                  <span className="veef-mono rounded px-1 text-[8px]" style={{ background: `${COLORS.coral}22`, color: COLORS.coral }}>AI</span>
                </div>
                <p className="text-[10px] leading-relaxed text-[#D7DBE3]">
                  {aiCommentReply.displayed}
                  {!aiCommentReply.done && step === 2 && (
                    <span className="inline-block h-3 w-0.5 translate-y-0.5 rounded-sm veef-caret" style={{ background: COLORS.coral }} />
                  )}
                </p>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* DM sent badge */}
      <AnimatePresence>
        {step >= 3 && (
          <m.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-3 mb-3 flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: 'rgba(63,185,80,0.12)', border: '1px solid rgba(63,185,80,0.25)' }}
          >
            <CheckCheck className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#3FB950' }} />
            <span className="text-[10.5px] font-medium" style={{ color: '#3FB950' }}>DM auto-sent to priya_creates</span>
            <m.span
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.4 }}
              className="ml-auto"
            >
              <Send className="h-3 w-3" style={{ color: '#3FB950' }} />
            </m.span>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Mini floating screen — DM thread (Screen 2)
 * Shows: user receives DM, reads it, replies back
 * ------------------------------------------------------------------ */
const DMScreen: React.FC<{ trigger: boolean }> = ({ trigger }) => {
  const [step, setStep] = useState(0)
  const timerRef2 = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dmText = useTypewriter(
    'Hey Priya! Check out our mentorship plans here → veefore.com/plans 🎯',
    30, 0, step >= 1,
  )
  const userReply = useTypewriter('omg this is exactly what I needed 🙌', 40, 0, step >= 3)

  useEffect(() => {
    if (!trigger) return
    const seq = () => {
      setStep(0)
      timerRef2.current = setTimeout(() => setStep(1), 1200)
      timerRef2.current = setTimeout(() => setStep(2), 3000)
      timerRef2.current = setTimeout(() => setStep(3), 4000)
      timerRef2.current = setTimeout(() => setStep(4), 5800)
      timerRef2.current = setTimeout(() => seq(), 9000)
    }
    seq()
    return () => { if (timerRef2.current) clearTimeout(timerRef2.current) }
  }, [trigger])

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(180deg,rgba(16,17,22,0.98),rgba(10,11,15,0.98))',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 24px 60px -16px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.06) inset',
        width: '280px',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#FF5F57' }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#FEBC2E' }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#28C840' }} />
          </div>
          <span className="veef-mono text-[10px] text-[#5A6172]">instagram · direct</span>
        </div>
        <AnimatePresence>
          {step >= 1 && step < 2 && (
            <m.span
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="veef-mono rounded-full px-1.5 py-0.5 text-[8px] font-bold"
              style={{ background: 'rgba(63,185,80,0.2)', color: '#3FB950' }}
            >new</m.span>
          )}
        </AnimatePresence>
      </div>

      {/* Contact row */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ background: `${COLORS.coral}28`, color: COLORS.coral }}
        >P</div>
        <div className="flex-1">
          <div className="text-[11px] font-semibold text-[#E6E8EC]">priya_creates</div>
          <div className="veef-mono text-[9px] text-[#5A6172]">via auto-reply · just now</div>
        </div>
        <AnimatePresence>
          {step >= 2 && (
            <m.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="flex items-center gap-1 rounded-full px-2 py-0.5"
              style={{ background: 'rgba(63,185,80,0.14)', border: '1px solid rgba(63,185,80,0.28)' }}
            >
              <CheckCheck className="h-3 w-3" style={{ color: '#3FB950' }} />
              <span className="veef-mono text-[9px]" style={{ color: '#3FB950' }}>read</span>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* Messages */}
      <div className="flex flex-col gap-2.5 px-3 py-3" style={{ minHeight: '140px' }}>
        {/* AI DM */}
        <AnimatePresence>
          {step >= 1 && (
            <m.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-row-reverse gap-2"
            >
              <div
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                style={{ background: `${COLORS.coral}30`, color: COLORS.coral, border: `1px solid ${COLORS.coral}44` }}
              >V</div>
              <div className="max-w-[180px]">
                <div
                  className="rounded-2xl rounded-tr-sm px-2.5 py-2 text-[11px] leading-relaxed"
                  style={{ background: `${COLORS.coral}1E`, color: '#E6E8EC', border: `1px solid ${COLORS.coral}30` }}
                >
                  {dmText.displayed}
                  {!dmText.done && step === 1 && (
                    <span className="inline-block h-3 w-0.5 translate-y-0.5 rounded-sm veef-caret" style={{ background: COLORS.coral }} />
                  )}
                </div>
                <div className="mt-0.5 text-right veef-mono text-[8px] text-[#3A4150]">Veefore AI · now</div>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* User reply */}
        <AnimatePresence>
          {step >= 3 && (
            <m.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex gap-2"
            >
              <div
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#9BA3B4' }}
              >P</div>
              <div className="max-w-[180px]">
                <div
                  className="rounded-2xl rounded-tl-sm px-2.5 py-2 text-[11px] leading-relaxed"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#D7DBE3', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {userReply.displayed}
                  {!userReply.done && step === 3 && (
                    <span className="inline-block h-3 w-0.5 translate-y-0.5 rounded-sm veef-caret" style={{ background: '#9BA3B4' }} />
                  )}
                </div>
                <div className="mt-0.5 veef-mono text-[8px] text-[#3A4150]">priya_creates · now</div>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* Lead captured badge */}
        <AnimatePresence>
          {step >= 4 && (
            <m.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 rounded-xl px-2.5 py-1.5"
              style={{ background: `${COLORS.coral}12`, border: `1px solid ${COLORS.coral}28` }}
            >
              <Sparkles className="h-3 w-3 flex-shrink-0" style={{ color: COLORS.coral }} />
              <span className="text-[10px] font-medium" style={{ color: COLORS.coral }}>Lead captured → CRM synced</span>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input bar */}
      <div className="border-t border-white/[0.07] p-2.5">
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span className="flex-1 text-[10px] text-[#3A4150]">Reply as veefore_official…</span>
          <div
            className="flex h-5 w-5 items-center justify-center rounded-lg"
            style={{ background: COLORS.coral }}
          >
            <Send className="h-2.5 w-2.5 text-white" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Visual 2 — Automation: kanban board + two floating mini screens
 * ------------------------------------------------------------------ */
const AutomationVisual: React.FC = () => {
  const [visRef, inView] = useInViewOnce<HTMLDivElement>({ threshold: 0.15 })

  const firedCount = useLiveCounter(1268, 1400, inView)
  const repliedCount = useLiveCounter(892, 1600, inView)
  const leadsCount = useLiveCounter(134, 2000, inView)

  const COLS = [
    {
      t: 'Active Triggers', color: '#3FB950', n: 6,
      cards: [
        { id: 'IG-901', title: 'Comment "price"', meta: `${firedCount.toLocaleString()} fired`, dot: '#3FB950', tag: 'Keyword' },
        { id: 'IG-884', title: 'New follower', meta: `${repliedCount} welcomed`, dot: '#3FB950', tag: 'Event' },
        { id: 'IG-872', title: 'Story mention', meta: '88 replied', dot: COLORS.gold, tag: 'Story' },
        { id: 'IG-861', title: 'Link in bio click', meta: '56 captured', dot: '#3FB950', tag: 'CTA' },
      ],
    },
    {
      t: 'Running Flows', color: COLORS.coral, n: 4,
      cards: [
        { id: 'IG-848', title: 'Send pricing + CTA', meta: '247 sent today', dot: '#3FB950', tag: 'DM' },
        { id: 'IG-839', title: 'Welcome sequence', meta: '89 in progress', dot: '#3FB950', tag: 'Seq' },
        { id: 'IG-820', title: `${leadsCount} leads to CRM`, meta: 'Syncing live', dot: COLORS.coral, tag: 'CRM' },
        { id: 'IG-815', title: 'Re-engage cold leads', meta: '12 nudged', dot: COLORS.gold, tag: 'AI' },
      ],
    },
    {
      t: 'Queued / Scheduled', color: COLORS.gold, n: 9,
      cards: [
        { id: 'IG-806', title: 'Reel drop 9:00 AM', meta: 'in 2h', dot: COLORS.gold, tag: 'Post' },
        { id: 'IG-799', title: 'Carousel: case study', meta: 'Tomorrow', dot: COLORS.gold, tag: 'Post' },
        { id: 'IG-781', title: 'Story poll + follow-up', meta: 'Wed 6PM', dot: COLORS.gold, tag: 'Story' },
        { id: 'IG-770', title: 'Weekly report digest', meta: 'Sun 10AM', dot: '#5A6172', tag: 'Report' },
      ],
    },
  ]

  const rules = [
    { trigger: 'Comment "price"', action: 'Send pricing DM', fired: `${firedCount.toLocaleString()}`, dot: '#3FB950' },
    { trigger: 'New follower', action: 'Welcome + follow-up', fired: `${repliedCount}`, dot: '#3FB950' },
    { trigger: 'Story mention', action: 'Reply + tag', fired: '88', dot: COLORS.gold },
  ]

  return (
    <div ref={visRef}>
      {/* Mobile */}
      <div className="flex justify-center md:hidden">
        <PhoneMockup className="w-full max-w-[280px] sm:max-w-[320px]">
          <div className="flex items-center justify-between px-4 pb-2 pt-1">
            <div className="flex items-center gap-2"><Zap className="h-4 w-4" style={{color:COLORS.coral}}/><span className="text-[13px] font-semibold text-[#E6E8EC]">Automations</span></div>
            <span className="veef-mono rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{background:'rgba(63,185,80,0.14)',color:'#3FB950',border:'1px solid rgba(63,185,80,0.3)'}}>4 active</span>
          </div>
          <div className="mx-3 flex flex-col gap-2">
            {rules.map((r)=>(
              <div key={r.trigger} className="rounded-xl p-3" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)'}}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="veef-mono text-[8px] uppercase tracking-wide text-[#5A6172]">Trigger to Action</span>
                  <span className="flex items-center gap-1 text-[8px]" style={{color:r.dot}}><LiveDot color={r.dot}/>Live</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-[#D7DBE3]">
                  <span className="rounded px-1.5 py-0.5 text-[9px]" style={{background:`${COLORS.coral}18`,color:COLORS.coral}}>{r.trigger}</span>
                  <span className="text-[#5A6172]">to</span>
                  <span className="truncate text-[#9BA3B4]">{r.action}</span>
                </div>
                <div className="veef-mono mt-1 text-[8px] text-[#5A6172]">{r.fired} fired today</div>
              </div>
            ))}
          </div>
        </PhoneMockup>
      </div>

      {/* Desktop: Linear-style — board in back, floating card on top-left */}
      <div className="relative hidden w-full md:block" style={{ minHeight: '620px' }}>

        {/* ── Background: full-width kanban board ── */}
        <Window title="automations · live dashboard">
          <div className="flex flex-1 overflow-hidden">
            {/* Board area */}
            <div className="flex flex-1 flex-col bg-[#0A0B0F]">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-[12px] font-semibold text-[#E6E8EC]">Automation Board</span>
                  <span className="veef-mono rounded-full px-2 py-0.5 text-[10px]"
                    style={{ background: 'rgba(63,185,80,0.12)', color: '#3FB950' }}>
                    {firedCount.toLocaleString()} fired today
                  </span>
                </div>
                <div className="flex items-center gap-2 veef-mono text-[10px] text-[#5A6172]">
                  <span>Filter</span><span>·</span><span>Sort</span>
                </div>
              </div>
              <div className="grid flex-1 grid-cols-3 gap-px bg-white/[0.03]">
                {COLS.map((col) => (
                  <div key={col.t} className="flex flex-col bg-[#0A0B0F] p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: col.color }} />
                      <span className="text-[11.5px] font-semibold text-[#E6E8EC]">{col.t}</span>
                      <span className="veef-mono text-[10px] text-[#3A4150]">{col.n}</span>
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      {col.cards.map((card, ci) => (
                        <m.div
                          key={card.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={inView ? { opacity: 1, y: 0 } : {}}
                          transition={{ delay: 0.1 + ci * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] as const }}
                          className="group cursor-default rounded-lg p-2.5"
                          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', transition: 'border-color 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = `${col.color}35` }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <span className="veef-mono text-[9px] text-[#3A4150]">{card.id}</span>
                            <div className="flex items-center gap-1">
                              <span className="veef-mono rounded px-1 py-0.5 text-[8px]"
                                style={{ background: `${col.color}12`, color: col.color }}>{card.tag}</span>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: card.dot }} />
                            </div>
                          </div>
                          <p className="text-[11.5px] font-medium leading-snug text-[#D7DBE3]">{card.title}</p>
                          <p className="veef-mono mt-1 text-[9.5px] text-[#5A6172]">{card.meta}</p>
                        </m.div>
                      ))}
                      <div className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[10.5px] text-[#3A4150] hover:text-[#5A6172]"
                        style={{ border: '1px dashed rgba(255,255,255,0.05)' }}>
                        <span>+ Add automation</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Window>

        {/* ── Foreground: floating card stacked on top-left of the board ──
             This is the key Linear pattern: a self-contained card that sits
             physically on top of (and partially hides) the background board.
             It has its OWN rounded corners, border and deep drop shadow.       */}
        <m.div
          initial={{ opacity: 0, x: -32, y: 16 }}
          animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
          transition={{ delay: 0.35, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="absolute overflow-hidden rounded-2xl"
          style={{
            top: '48px',
            left: '16px',
            width: '320px',
            bottom: '16px',
            zIndex: 20,
            background: 'linear-gradient(180deg, #0F1016 0%, #0B0C10 100%)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: [
              '0 0 0 1px rgba(0,0,0,0.5)',
              '8px 0 32px rgba(0,0,0,0.6)',
              '24px 0 80px rgba(0,0,0,0.4)',
              '0 24px 60px rgba(0,0,0,0.5)',
            ].join(', '),
          }}
        >
          {/* Card header */}
          <div className="flex items-center gap-2.5 border-b border-white/[0.08] px-4 py-3">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full" style={{ background: '#FF5F57' }} />
              <span className="h-3 w-3 rounded-full" style={{ background: '#FEBC2E' }} />
              <span className="h-3 w-3 rounded-full" style={{ background: '#28C840' }} />
            </div>
            <span className="veef-mono ml-1 text-[11px] text-[#5A6172]">live automation feed</span>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#3FB950', boxShadow: '0 0 5px #3FB950' }} />
              <span className="veef-mono text-[9px]" style={{ color: '#3FB950' }}>live</span>
            </div>
          </div>

          {/* Section 1: Comment thread */}
          <div className="flex flex-col border-b border-white/[0.07]">
            <div className="flex items-center gap-2 bg-white/[0.02] px-4 py-1.5">
              <span className="veef-mono text-[9px] uppercase tracking-wide text-[#3A4150]">Comment trigger</span>
              <span className="h-px flex-1 bg-white/[0.04]" />
              <span className="veef-mono text-[9px]" style={{ color: COLORS.coral }}>keyword: price</span>
            </div>
            <div className="px-3 py-3">
              <CommentScreen trigger={inView} />
            </div>
          </div>

          {/* Section 2: DM reply */}
          <div className="flex flex-1 flex-col min-h-0">
            <div className="flex items-center gap-2 bg-white/[0.02] px-4 py-1.5">
              <span className="veef-mono text-[9px] uppercase tracking-wide text-[#3A4150]">Auto DM sent</span>
              <span className="h-px flex-1 bg-white/[0.04]" />
              <CheckCheck className="h-3 w-3" style={{ color: '#3FB950' }} />
              <span className="veef-mono text-[9px]" style={{ color: '#3FB950' }}>delivered</span>
            </div>
            <div className="flex-1 overflow-hidden px-3 py-3">
              <DMScreen trigger={inView} />
            </div>
          </div>
        </m.div>

      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Visual 3 — Analytics phone screen
 * ------------------------------------------------------------------ */
const AnalyticsVisual: React.FC = () => {
  // Mini line chart path (normalised 0–100)
  const chartVals = [30, 38, 34, 48, 44, 60, 56, 72, 68, 82, 78, 94, 88, 100]
  const W = 240
  const H = 48
  const max = 100
  const pts = chartVals.map((v, i) => {
    const x = (i / (chartVals.length - 1)) * W
    const y = H - (v / max) * (H - 4) - 2
    return [x, y] as const
  })
  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`

  const stats = [
    { label: 'Reach', value: '156K', delta: '+18%', color: COLORS.coral },
    { label: 'Engagement', value: '8.7%', delta: '+2.1%', color: COLORS.gold },
    { label: 'Saves', value: '9.2K', delta: '+34%', color: COLORS.cyan },
    { label: 'Followers', value: '24.5K', delta: '+12%', color: '#3FB950' },
  ]

  return (
    <>
      {/* ── Mobile: phone mockup ──── */}
      <div className="flex justify-center md:hidden">
        <PhoneMockup className="w-full max-w-[280px] sm:max-w-[320px]">
          {/* App header */}
          <div className="flex items-center justify-between px-4 pb-2 pt-1">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" style={{ color: COLORS.coral }} />
              <span className="text-[13px] font-semibold text-[#E6E8EC]">Analytics</span>
            </div>
            <span className="veef-mono text-[9px] text-[#5A6172]">vs last week ↑</span>
          </div>
          <div className="mx-3 mb-2 grid grid-cols-2 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wide text-[#5A6172]">{s.label}</span>
                  <span className="veef-mono text-[9px] font-semibold" style={{ color: '#3FB950' }}>{s.delta}</span>
                </div>
                <div className="veef-mono mt-0.5 text-[15px] font-semibold text-[#F5F6F8]">{s.value}</div>
              </div>
            ))}
          </div>
          <div className="mx-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium text-[#D7DBE3]">Reach · 14 days</span>
              <span className="veef-mono text-[9px]" style={{ color: COLORS.coral }}>▲ 18%</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-full" preserveAspectRatio="none" aria-hidden="true">
              <defs><linearGradient id="areaGrad3m" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.coral} stopOpacity="0.28"/><stop offset="100%" stopColor={COLORS.coral} stopOpacity="0"/></linearGradient></defs>
              <path d={areaPath} fill="url(#areaGrad3m)"/>
              <path d={linePath} fill="none" stroke={COLORS.coral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
              <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="3" fill={COLORS.coral}/>
            </svg>
          </div>
        </PhoneMockup>
      </div>

      {/* ── Desktop: Window with KPI cards + chart ──── */}
      <div className="hidden w-full md:block" style={{ minHeight: '620px' }}>
        <Window title="analytics · overview">
          <div className="flex flex-1 flex-col p-5">
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wide text-[#5A6172]">{s.label}</span>
                    <span className="veef-mono text-[10px]" style={{ color: '#5EE6C4' }}>{s.delta}</span>
                  </div>
                  <div className="veef-mono mt-1 text-[19px] font-medium text-[#F5F6F8]">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="relative flex-1 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-[#D7DBE3]">Reach · last 28 days</span>
                <div className="flex gap-1.5">
                  <span className="rounded px-2 py-0.5 text-[10px]" style={{ background:'rgba(76,130,247,0.16)',color:COLORS.coral }}>28D</span>
                  <span className="rounded bg-white/[0.05] px-2 py-0.5 text-[10px] text-[#5A6172]">90D</span>
                </div>
              </div>
              <svg viewBox="0 0 560 150" className="h-full min-h-[220px] w-full" preserveAspectRatio="none" aria-hidden="true">
                <defs><linearGradient id="reachAreaD" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.coral} stopOpacity="0.22"/><stop offset="100%" stopColor={COLORS.coral} stopOpacity="0"/></linearGradient></defs>
                {[0.25,0.5,0.75].map((g)=><line key={g} x1="0" x2="560" y1={150*g} y2={150*g} stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>)}
                <path d={areaPath} fill="url(#reachAreaD)"/>
                <path d={linePath} fill="none" stroke={COLORS.coral} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
              </svg>
            </div>
          </div>
        </Window>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Visual 4 — AI captions phone screen
 * ------------------------------------------------------------------ */
const AIContentVisual: React.FC = () => {
  const captions = [
    `Your 6AM espresso ritual, but make it content. ☕ Here's how I batch a week of reels before the world wakes up…`,
    'POV: your coffee is brewing and so is your content calendar. Steal my 3-step morning flow ↓',
  ]
  const tags = ['#morningroutine', '#creatortips', '#coffeecontent', '#reels']

  return (
    <>
      {/* ── Mobile: phone mockup ──── */}
      <div className="flex justify-center md:hidden">
        <PhoneMockup className="w-full max-w-[280px] sm:max-w-[320px]">
          <div className="flex items-center justify-between px-4 pb-2 pt-1">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4" style={{color:COLORS.coral}}/><span className="text-[13px] font-semibold text-[#E6E8EC]">AI Captions</span></div>
            <span className="rounded-full px-2 py-0.5 text-[9px]" style={{background:`${COLORS.coral}1A`,color:COLORS.coral,border:`1px solid ${COLORS.coral}33`}}>✨ Ready</span>
          </div>
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl p-3" style={{background:'rgba(255,255,255,0.03)',border:`1px solid ${COLORS.coral}30`}}>
            <Sparkles className="h-3 w-3 flex-shrink-0" style={{color:COLORS.coral}}/>
            <span className="text-[10px] text-[#D7DBE3]">morning coffee routine for busy creators</span>
          </div>
          <div className="mx-3 flex flex-col gap-2">
            <div className="veef-mono mb-0.5 text-[9px] uppercase tracking-wide text-[#5A6172]">Generated captions</div>
            {captions.map((c,i)=>(
              <div key={c} className="rounded-xl p-3" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderLeft:`3px solid ${COLORS.coral}`}}>
                <div className="mb-1 flex items-center gap-1.5"><span className="veef-mono text-[8px]" style={{color:COLORS.coral}}>Caption {i+1}</span><span className="veef-mono ml-auto text-[8px] text-[#5A6172]">↑ High reach</span></div>
                <p className="text-[10px] leading-relaxed text-[#D7DBE3] line-clamp-2">{c}</p>
              </div>
            ))}
          </div>
          <div className="mx-3 mt-2 flex flex-wrap gap-1">
            {tags.map((t)=><span key={t} className="veef-mono rounded-full px-2 py-0.5 text-[8px]" style={{background:`${COLORS.coral}10`,color:COLORS.coral,border:`1px solid ${COLORS.coral}25`}}>{t}</span>)}
          </div>
        </PhoneMockup>
      </div>

      {/* ── Desktop: Window with AI content engine ──── */}
      <div className="hidden w-full md:block" style={{ minHeight: '620px' }}>
        <Window title="ai · content engine">
          <div className="flex flex-1 flex-col p-5">
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
              <Sparkles className="h-4 w-4" style={{color:COLORS.coral}}/>
              <span className="text-[13px] text-[#D7DBE3]">Topic: morning coffee routine for busy creators</span>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
              {captions.concat([
                `The secret to consistent posting? Pair it with something you already do daily. Mine's coffee. What's yours?`,
                'Stop forcing 9PM caption sessions. Your best hooks happen at 6AM with a warm cup. Try this →',
              ]).map((c,i)=>(
                <div key={c} className="flex flex-col justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5" style={{borderLeft:`3px solid ${COLORS.coral}`}}>
                  <p className="text-[12.5px] leading-relaxed text-[#D7DBE3]">{c}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="veef-mono text-[10px] text-[#5A6172]">Caption {i+1}</span>
                    <span className="veef-mono text-[10px]" style={{color:'#3FB950'}}>↑ High reach</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {['#morningroutine','#creatortips','#coffeecontent','#reels','#batchcontent'].map((t)=>(
                <span key={t} className="veef-mono rounded-full px-2.5 py-1 text-[11px]" style={{background:`rgba(76,130,247,0.10)`,color:COLORS.coral,border:`1px solid rgba(76,130,247,0.25)`}}>{t}</span>
              ))}
            </div>
          </div>
        </Window>
      </div>
    </>
  )
}

/* ================================================================== *
 * Phase-1 replacement visual — Content Library / Multi-account
 * Shown INSTEAD of AutomationVisual while DM/comment permissions are
 * under Meta review. Advertises a non-automation capability.
 * ================================================================== */
const ContentLibraryVisual: React.FC = () => {
  const [visRef, inView] = useInViewOnce<HTMLDivElement>({ threshold: 0.15 })
  const queuedCount = useLiveCounter(48, 1400, inView)

  const accounts = [
    { handle: '@yourbrand', tag: 'Main', posts: '24 queued', c: COLORS.coral },
    { handle: '@yourbrand.shop', tag: 'Store', posts: '16 queued', c: COLORS.cyan },
    { handle: '@yourbrand.blog', tag: 'Blog', posts: '8 queued', c: COLORS.gold },
  ]

  const library = [
    { title: 'Reel · 5 AI hooks', when: 'Today 9:00 AM', kind: 'Reel', c: COLORS.coral },
    { title: 'Carousel · Case study', when: 'Tomorrow 12:30 PM', kind: 'Carousel', c: COLORS.gold },
    { title: 'Story · Poll', when: 'Wed 5:00 PM', kind: 'Story', c: COLORS.cyan },
    { title: 'Reel · Behind the scenes', when: 'Thu 8:00 AM', kind: 'Reel', c: COLORS.coral },
    { title: 'Carousel · Tips roundup', when: 'Fri 11:00 AM', kind: 'Carousel', c: COLORS.gold },
  ]

  return (
    <div ref={visRef}>
      {/* Mobile */}
      <div className="flex justify-center md:hidden">
        <PhoneMockup className="w-full max-w-[280px] sm:max-w-[320px]">
          <div className="flex items-center justify-between px-4 pb-2 pt-1">
            <div className="flex items-center gap-2"><Calendar className="h-4 w-4" style={{color:COLORS.coral}}/><span className="text-[13px] font-semibold text-[#E6E8EC]">Content Library</span></div>
            <span className="veef-mono rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{background:`${COLORS.cyan}1A`,color:COLORS.cyan,border:`1px solid ${COLORS.cyan}33`}}>3 accounts</span>
          </div>
          <div className="mx-3 mb-2 flex flex-col gap-1.5">
            {accounts.map((a)=>(
              <div key={a.handle} className="flex items-center justify-between rounded-xl px-3 py-2" style={{background:`${a.c}0F`,border:`1px solid ${a.c}30`}}>
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 flex-shrink-0 rounded-lg" style={{background:`${a.c}33`}}/>
                  <span className="text-[11px] font-medium text-[#D7DBE3]">{a.handle}</span>
                </div>
                <span className="veef-mono text-[9px]" style={{color:a.c}}>{a.posts}</span>
              </div>
            ))}
          </div>
          <div className="mx-3 flex flex-col gap-2">
            <div className="veef-mono mb-0.5 text-[9px] uppercase tracking-wide text-[#5A6172]">Scheduled</div>
            {library.slice(0,3).map((p)=>(
              <div key={p.title} className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{background:`${p.c}0F`,border:`1px solid ${p.c}30`,borderLeft:`3px solid ${p.c}`}}>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[11px] font-medium text-[#D7DBE3]">{p.title}</div>
                  <div className="veef-mono text-[8px] text-[#5A6172]">{p.when}</div>
                </div>
                <LiveDot color={p.c}/>
              </div>
            ))}
          </div>
        </PhoneMockup>
      </div>

      {/* Desktop */}
      <div className="hidden w-full md:block" style={{ minHeight: '620px' }}>
        <Window title="content library · all accounts">
          <div className="flex flex-1 overflow-hidden">
            {/* Account rail */}
            <div className="hidden w-56 flex-shrink-0 flex-col border-r border-white/[0.07] p-4 sm:flex">
              <div className="mb-4 flex items-center gap-2"><Calendar className="h-4 w-4" style={{color:COLORS.coral}}/><span className="text-[13px] font-medium text-[#F5F6F8]">Accounts</span></div>
              {accounts.map((a, i)=>(
                <div key={a.handle} className="mb-2 rounded-xl p-3" style={{background:i===0?'rgba(76,130,247,0.10)':'rgba(255,255,255,0.02)',border:`1px solid ${i===0?`${COLORS.coral}33`:'rgba(255,255,255,0.06)'}`}}>
                  <div className="flex items-center gap-2">
                    <span className="h-7 w-7 flex-shrink-0 rounded-lg" style={{background:`${a.c}2A`,border:`1px solid ${a.c}44`}}/>
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium text-[#E6E8EC]">{a.handle}</div>
                      <div className="veef-mono text-[9.5px]" style={{color:a.c}}>{a.tag}</div>
                    </div>
                  </div>
                  <div className="veef-mono mt-2 text-[10px] text-[#5A6172]">{a.posts}</div>
                </div>
              ))}
              <div className="mt-auto rounded-xl p-3" style={{background:'rgba(94,230,196,0.08)',border:'1px solid rgba(94,230,196,0.2)'}}>
                <div className="veef-mono text-[10px] uppercase tracking-wide text-[#5A6172]">Total queued</div>
                <div className="veef-mono mt-1 text-[20px] font-semibold" style={{color:'#5EE6C4'}}>{queuedCount}</div>
              </div>
            </div>

            {/* Library grid */}
            <div className="flex flex-1 flex-col p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[14px] font-semibold text-[#F5F6F8]">Scheduled content</span>
                <span className="veef-mono rounded-full px-2.5 py-1 text-[11px]" style={{background:'rgba(94,230,196,0.12)',color:'#5EE6C4'}}>auto-published</span>
              </div>
              <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
                {library.map((p, ci)=>(
                  <m.div
                    key={p.title}
                    initial={{ opacity: 0, y: 8 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ delay: 0.1 + ci * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }}
                    className="flex flex-col justify-between rounded-xl p-4"
                    style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderLeft:`3px solid ${p.c}`}}
                  >
                    <div className="flex items-center justify-between">
                      <span className="veef-mono rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{background:`${p.c}18`,color:p.c}}>{p.kind}</span>
                      <LiveDot color={p.c}/>
                    </div>
                    <p className="mt-3 text-[13px] font-medium leading-snug text-[#D7DBE3]">{p.title}</p>
                    <p className="veef-mono mt-2 text-[10px] text-[#5A6172]">{p.when}</p>
                  </m.div>
                ))}
              </div>
            </div>
          </div>
        </Window>
      </div>
    </div>
  )
}

/* ================================================================== *
 * The four-feature showcase
 * ================================================================== */
export const FeatureShowcaseSection: React.FC = () => {
  return (
    <section id="features" aria-label="Veefore features" className="relative w-full overflow-hidden">
      <div className="flex flex-col gap-20 py-16 md:gap-36 md:py-28">
        <FeatureBlock
          version="1.0"
          tag="Scheduling"
          headline="Post at the perfect time, automatically"
          copy="Plan a week of content in minutes. Veefore queues every post for when your audience is most active and publishes through Instagram's official API — no midnight alarms."
          visual={<SchedulingVisual />}
          bleed="right"
        />
        {PHASE_1_REVIEW_MODE ? (
          <FeatureBlock
            version="2.0"
            tag="Content Library"
            headline="Plan every account from one calm workspace"
            copy="Organise, schedule, and publish across all your Instagram accounts from a single content library — drafts, queues, and calendars in one place, no tab juggling."
            visual={<ContentLibraryVisual />}
            bleed="right"
          />
        ) : (
          <FeatureBlock
            version="2.0"
            tag="Automations"
            headline="Turn DMs and comments into a 24/7 funnel"
            copy="Keyword triggers fire automated reply flows that qualify leads, send links, and route conversations to the right place — all while you sleep."
            visual={<AutomationVisual />}
            bleed="right"
          />
        )}
        <FeatureBlock
          version="3.0"
          tag="Analytics"
          headline="Understand what's actually working"
          copy="Reach, saves, and engagement turned into plain-language insight. See which formats win and double down — no spreadsheets required."
          visual={<AnalyticsVisual />}
          bleed="left"
        />
        <FeatureBlock
          version="4.0"
          tag="AI Content"
          headline="Never stare at a blank caption again"
          copy="Type a topic and the AI content engine writes captions, hooks, and hashtags in your voice — then predicts which one will reach the most people."
          visual={<AIContentVisual />}
          bleed="left"
        />
      </div>
    </section>
  )
}

FeatureShowcaseSection.displayName = 'FeatureShowcaseSection'
