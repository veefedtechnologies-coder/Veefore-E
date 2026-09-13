/**
 * GenerativeDotGridSurface — the ONE animated "Veefore is working on it" surface
 * shared by the generative chat cards (image + video).
 *
 * WHY this exists: the image card grew a hand-tuned dot-grid/mask/WAAPI treatment
 * that the video editor card now needs too. Copying it would mean two drifting
 * implementations of the same visual language, so the animation lives here once
 * and each card picks a `variant`.
 *
 * HOW it works (and why it is built this way):
 *   - Everything visual is INLINE (no dependency on a stylesheet having loaded)
 *     and the motion is driven by the Web Animations API rather than CSS
 *     keyframes, so the reveal can be randomised/looped from JS.
 *   - There is exactly ONE dot layer. It is invisible except under a soft,
 *     feathered mask; moving the MASK (not the dots) is what makes dots light up,
 *     which keeps us on compositor-friendly properties and avoids layout work.
 *   - `variant='image'` keeps the original behaviour: an amorphous blob that hops
 *     to random positions and re-rolls its size each hop, so the reveal has no
 *     hard edge and never reads as a circle sliding around.
 *   - `variant='video'` sweeps HORIZONTALLY like a playhead scrubbing a timeline,
 *     because video is a time medium. A faint vertical playhead line leads the
 *     sweep and quiet frame ticks sit along the bottom edge like a film strip.
 *     The sweep range is deliberately wide enough that the bright core of the
 *     mask is off-frame at both ends, so the loop restart is never visible.
 *
 * Accessibility: every decorative layer is `aria-hidden`; the stage text is the
 * only thing exposed, as a polite live region so stage changes are announced.
 * `prefers-reduced-motion` (and `animate={false}`, used for idle cards) renders
 * the static dot grid with a centered soft reveal and starts no animation loop.
 *
 * Blue accent only (never purple), dark-mode aware, and every animation is
 * cancelled on unmount — several of these can live in one chat transcript.
 */

import React, { useEffect, useRef, useState } from 'react'

export type GenerativeSurfaceVariant = 'image' | 'video'

export interface GenerativeDotGridSurfaceProps {
  /** Which motion language to use. Defaults to the original image behaviour. */
  variant?: GenerativeSurfaceVariant
  /** Primary status/stage text, overlaid top-left. */
  stageText?: string
  /** Optional quieter second line under the stage text (e.g. a real percentage). */
  secondaryText?: string
  /** When false the grid renders static/dimmed and no animation loop starts. */
  animate?: boolean
  /** Whether to show the pulsing blue "live" dot next to the stage text. */
  showPing?: boolean
  /** Optional overlay chrome rendered above the decorative layers. */
  children?: React.ReactNode
}

/** The image variant's amorphous, edgeless radial reveal. */
const IMAGE_MASK =
  'radial-gradient(circle, #000 0%, rgba(0,0,0,0.6) 32%, rgba(0,0,0,0.18) 55%, transparent 78%)'

/**
 * The video variant's reveal: a wide feathered vertical band. Fully transparent
 * at both ends so the band has no edge as it scrubs across the frame.
 */
const VIDEO_MASK =
  'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.10) 12%, rgba(0,0,0,0.5) 32%, #000 50%, rgba(0,0,0,0.5) 68%, rgba(0,0,0,0.10) 88%, transparent 100%)'

/** Duration of one playhead pass. Slow enough to read as calm, not busy. */
const VIDEO_SWEEP_MS = 3200

/** Apply a mask position on both the standard and the WebKit-prefixed property. */
function setMaskPosition(el: HTMLElement, value: string): void {
  el.style.setProperty('-webkit-mask-position', value)
  el.style.maskPosition = value
}

/** Apply a mask size on both the standard and the WebKit-prefixed property. */
function setMaskSize(el: HTMLElement, value: string): void {
  el.style.setProperty('-webkit-mask-size', value)
  el.style.maskSize = value
}

/** Whether the user asked for reduced motion (SSR-safe). */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Rotate through pipeline-stage messages while a card is working; loops so it
 * never stops. Shared by both cards so the cadence stays identical.
 *
 * The interval is always cleared on unmount / when `active` goes false — a timer
 * that outlives a chat card would keep re-rendering a dead transcript entry.
 */
export function useRotatingStage(active: boolean, stages: string[]): string {
  const [idx, setIdx] = useState(0)
  const idxRef = useRef(0)
  useEffect(() => {
    if (!active) return
    idxRef.current = 0
    setIdx(0)
    const t = setInterval(() => {
      idxRef.current = (idxRef.current + 1) % stages.length
      setIdx(idxRef.current)
    }, 1900)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stages.length])
  return stages[idx % stages.length]
}

/**
 * Crossfade the stage label WITHOUT remounting it.
 *
 * WHY: the label used to carry `key={stageText}`, so every status change
 * UNMOUNTED and REMOUNTED the element and restarted its 0.5s entrance animation
 * (opacity 0→1 plus a 6px slide). The video editor re-emits progress on every
 * execution step AND on every step tick, so that fired constantly and the whole
 * status line — the live dot included, since it sits in the same flex row —
 * visibly flickered.
 *
 * This drives a compositor-only opacity transition through a ref instead: the
 * node is stable (better for the `aria-live` region too, which needs a persistent
 * element to announce reliably), the neighbouring ping dot is never touched, and
 * no extra React render is triggered.
 */
function useLabelCrossfade(text: string | undefined, ref: React.RefObject<HTMLElement>) {
  const previous = useRef(text)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (previous.current === text) return
    previous.current = text
    if (prefersReducedMotion()) return
    el.style.opacity = '0'
    // Force a style flush so the browser cannot coalesce 0→1 into no transition.
    void el.offsetWidth
    el.style.opacity = '1'
  }, [text, ref])
}

export const GenerativeDotGridSurface: React.FC<GenerativeDotGridSurfaceProps> = ({
  variant = 'image',
  stageText,
  secondaryText,
  animate = true,
  showPing = true,
  children,
}) => {
  const sweepRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  useLabelCrossfade(stageText, labelRef)
  const isDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  useEffect(() => {
    const el = sweepRef.current
    if (!el) return

    const reduce = prefersReducedMotion()
    const canAnimate = animate && !reduce && typeof el.animate === 'function'

    // Static, centered soft reveal: reduced-motion and idle cards get the grid
    // with no loop at all (no timers, no animations to leak).
    if (!canAnimate) {
      setMaskSize(el, variant === 'video' ? '75% 100%' : '120% 120%')
      setMaskPosition(el, '50% 50%')
      return
    }

    let cancelled = false
    const running: Animation[] = []

    if (variant === 'video') {
      setMaskSize(el, '60% 100%')
      // The range is wider than the frame on purpose: at both endpoints the
      // bright core of the band sits off-frame, so the infinite loop never
      // shows a visible snap back to the left.
      const sweep = el.animate(
        [
          { maskPosition: '-120% 50%', WebkitMaskPosition: '-120% 50%' },
          { maskPosition: '220% 50%', WebkitMaskPosition: '220% 50%' },
        ] as unknown as Keyframe[],
        { duration: VIDEO_SWEEP_MS, iterations: Infinity, easing: 'ease-in-out' },
      )
      running.push(sweep)

      // The playhead shares the sweep's timing but travels a slightly further
      // range, so it reads as leading the reveal rather than sitting inside it.
      const head = playheadRef.current
      if (head && typeof head.animate === 'function') {
        running.push(
          head.animate(
            [{ transform: 'translateX(-6%)' }, { transform: 'translateX(106%)' }],
            { duration: VIDEO_SWEEP_MS, iterations: Infinity, easing: 'ease-in-out' },
          ),
        )
      }
    } else {
      // Image: wander to random spots AND re-roll the blob size each hop so the
      // dots light up in organic uneven patches with NO defined edge.
      const rndPos = () =>
        `${4 + Math.round(Math.random() * 92)}% ${4 + Math.round(Math.random() * 92)}%`
      // Non-uniform size => an oval/amorphous blob, not a perfect circle.
      const rndSize = () =>
        `${95 + Math.round(Math.random() * 70)}% ${95 + Math.round(Math.random() * 70)}%`
      let cur = rndPos()
      setMaskPosition(el, cur)

      let current: Animation | null = null
      const runPass = () => {
        if (cancelled) return
        setMaskSize(el, rndSize())
        const next = rndPos()
        current = el.animate(
          [
            { maskPosition: cur, WebkitMaskPosition: cur },
            { maskPosition: next, WebkitMaskPosition: next },
          ] as unknown as Keyframe[],
          { duration: 650 + Math.random() * 750, easing: 'ease-in-out', fill: 'forwards' },
        )
        running.push(current)
        current.onfinish = () => {
          cur = next
          runPass()
        }
      }
      runPass()
    }

    return () => {
      cancelled = true
      running.forEach(a => a.cancel())
    }
  }, [variant, animate])

  const isVideo = variant === 'video'
  // In the LIGHT theme the video grid read as an almost-empty rectangle against
  // the pale surface, so the video variant gets a modestly darker, slightly
  // larger dot there — perceptible, not loud. Dark mode already read fine, and
  // the IMAGE variant's appearance is deliberately left untouched.
  const dotColor = isDark
    ? 'rgba(148,163,184,0.55)'
    : isVideo
      ? 'rgba(100,116,139,0.62)'
      : 'rgba(148,163,184,0.5)'
  // Both stops move together so the gradient stops stay strictly increasing.
  const dotStops = !isDark && isVideo ? ['1.05px', '1.2px'] : ['0.9px', '1px']
  const tickColor = isDark ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.28)'
  const mask = isVideo ? VIDEO_MASK : IMAGE_MASK

  return (
    <div
      className="absolute inset-0"
      style={{ backgroundColor: isDark ? '#2a2b30' : '#f3f5f8' }}
    >
      {/* The ONLY dot layer — invisible except under the soft reveal that the
          effect above drives (a wandering blob for images, a scrubbing band for
          video). Moving the mask keeps this off the layout path entirely. */}
      <div
        ref={sweepRef}
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(${dotColor} ${dotStops[0]}, transparent ${dotStops[1]})`,
          backgroundSize: '20px 20px',
          opacity: animate ? 1 : 0.6,
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskSize: isVideo ? '60% 100%' : '120% 120%',
          maskSize: isVideo ? '60% 100%' : '120% 120%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: '50% 50%',
          maskPosition: '50% 50%',
        }}
      />

      {isVideo && (
        <>
          {/* Playhead: a full-width wrapper translated across the frame so the
              hairline it carries rides along on the compositor. */}
          {animate && (
            <div
              ref={playheadRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-full"
              style={{ willChange: 'transform' }}
            >
              <div
                className="absolute inset-y-0 left-0 w-px"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(59,130,246,0) 0%, rgba(59,130,246,0.55) 18%, rgba(96,165,250,0.95) 50%, rgba(59,130,246,0.55) 82%, rgba(59,130,246,0) 100%)',
                  boxShadow: '0 0 14px 2px rgba(59,130,246,0.28)',
                }}
              />
            </div>
          )}

          {/* Timeline ruler: quiet frame ticks fading up from the bottom edge. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-4"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${tickColor} 0px, ${tickColor} 1px, transparent 1px, transparent 14px)`,
              WebkitMaskImage: 'linear-gradient(to top, #000 0%, transparent 100%)',
              maskImage: 'linear-gradient(to top, #000 0%, transparent 100%)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-px"
            style={{ backgroundColor: tickColor }}
          />
        </>
      )}

      {/* Stage label — the only non-decorative content, announced politely. */}
      {stageText && (
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
          {showPing && (
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="veegpt-img-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
          )}
          {/* NO `key` here on purpose — see useLabelCrossfade. A keyed remount
              restarted the entrance animation on every emit and made the whole
              status line (dot included) flicker. The element is stable and the
              text swap crossfades via a CSS opacity transition. */}
          <span
            ref={labelRef}
            role="status"
            aria-live="polite"
            className="veegpt-stage-label text-[13px] font-medium text-gray-600 dark:text-gray-300"
          >
            {stageText}
          </span>
        </div>
      )}

      {secondaryText && (
        <div className="absolute left-4 top-10 z-10 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
          {secondaryText}
        </div>
      )}

      {children}
    </div>
  )
}

export default GenerativeDotGridSurface
