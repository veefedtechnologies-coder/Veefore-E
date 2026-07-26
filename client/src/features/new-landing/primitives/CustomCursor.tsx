import { useEffect, useRef } from 'react'

import { COLORS } from '../constants/colors'
import { useLandingMotion } from '../context/LandingMotionProvider'
import { shouldRenderCustomCursor } from '../hooks/visibility'

/**
 * Visual constants for the cursor. All colours come from the Colour_System —
 * ZERO purple (Requirements 4.1, 4.2): coral dot, cyan ring.
 */
const DOT_SIZE = 8 // px — solid coral dot
const RING_SIZE = 32 // px — cyan outlined ring
const RING_HOVER_SIZE = 60 // px — expanded ring on clickable hover
const RING_OPACITY = 0.4 // cyan outline at ~40% opacity
const LERP_FACTOR = 0.12 // ring trails the pointer with this easing
const TRAIL_COUNT = 5 // short trail of fading dots behind the ring

/** Selector for clickable elements that trigger the hover-expand state. */
const CLICKABLE_SELECTOR = 'a, button, [role="button"]'

/** A single trail dot's runtime state. */
interface TrailNode {
  el: HTMLDivElement
  x: number
  y: number
}

/**
 * Landing-scoped custom cursor: a coral dot that snaps instantly to the pointer
 * and a cyan ring that follows with a lerp delay plus a short fading trail.
 *
 * Rendering is gated by {@link shouldRenderCustomCursor}: the cursor only mounts
 * its effect when the device has a fine pointer, Reduced_Motion is not active,
 * and the viewport is wider than the mobile breakpoint. Otherwise it renders
 * nothing and the native cursor is used (Requirements 18.4, 18.5).
 *
 * Behaviour (Requirements 18.1, 18.2):
 * - Dot: `8px` solid coral (`#4C82F7`), `left/top` set directly on every
 *   `mousemove` so it tracks the pointer instantly.
 * - Ring: `32px` cyan (`#00D4FF`) outline at ~40% opacity, eased toward the
 *   pointer with lerp factor `0.12` inside a `requestAnimationFrame` loop.
 * - Trail: a few dots inherit the ring's easing with increasing delay.
 * - Hover over `a`/`button`/`[role="button"]` (event delegation): the ring
 *   expands to `60px` and fills coral at low opacity while the dot hides.
 *
 * All elements are `position: fixed`, `pointer-events: none`, and sit on a high
 * z-index so they never intercept interaction.
 *
 * Cleanup (Requirement 18.6): on unmount every listener is detached and the rAF
 * loop is cancelled. Teardown is wrapped so a failure is logged (the cleanup is
 * treated as incomplete) but the unmount never throws.
 *
 * Requirements: 18.1, 18.2, 18.4, 18.5, 18.6
 */
export const CustomCursor: React.FC = () => {
  const { finePointer, reducedMotion, isMobile } = useLandingMotion()

  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const trailRef = useRef<HTMLDivElement>(null)

  // Resolve whether the cursor should be active. Width is read from the
  // resolved `isMobile` flag (already <= breakpoint aware), so the predicate
  // reduces to: fine pointer, motion enabled, and not mobile.
  const enabled =
    typeof window !== 'undefined' &&
    shouldRenderCustomCursor({
      finePointer,
      reducedMotion,
      width: isMobile ? 0 : window.innerWidth,
      mobileBreakpoint: 768,
    })

  useEffect(() => {
    if (!enabled) {
      return
    }

    const dot = dotRef.current
    const ring = ringRef.current
    const trailContainer = trailRef.current
    if (!dot || !ring || !trailContainer) {
      return
    }

    // Pointer target (snapped) and the ring's eased position.
    let pointerX = window.innerWidth / 2
    let pointerY = window.innerHeight / 2
    let ringX = pointerX
    let ringY = pointerY
    // Ring hover scale (eased) — animated via transform instead of width/height.
    let ringScale = 1
    let ringScaleTarget = 1
    let rafId: number | null = null

    // Build the trail nodes. Each rides the previous node's eased position, so
    // delay increases naturally down the chain.
    const trail: TrailNode[] = []
    for (let i = 0; i < TRAIL_COUNT; i += 1) {
      const node = document.createElement('div')
      const size = Math.max(2, DOT_SIZE - i)
      Object.assign(node.style, {
        position: 'fixed',
        left: '0px',
        top: '0px',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '9999px',
        backgroundColor: COLORS.cyan,
        opacity: `${0.25 * (1 - i / TRAIL_COUNT)}`,
        transform: 'translate3d(0,0,0) translate(-50%, -50%)',
        pointerEvents: 'none',
        willChange: 'transform',
      } satisfies Partial<CSSStyleDeclaration>)
      trailContainer.appendChild(node)
      trail.push({ el: node, x: ringX, y: ringY })
    }

    const handleMouseMove = (event: MouseEvent) => {
      pointerX = event.clientX
      pointerY = event.clientY
      // Dot snaps instantly to the pointer (single GPU-composited transform).
      dot.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0) translate(-50%, -50%)`
    }

    // Event delegation: expand on hovering a clickable, restore on leaving it.
    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (target?.closest?.(CLICKABLE_SELECTOR)) {
        // Scale up via transform (cheap) instead of animating width/height.
        ringScaleTarget = RING_HOVER_SIZE / RING_SIZE
        ring.style.backgroundColor = 'rgba(76,130,247,0.15)'
        ring.style.borderColor = COLORS.coral
        dot.style.opacity = '0'
      }
    }

    const handleMouseOut = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (target?.closest?.(CLICKABLE_SELECTOR)) {
        ringScaleTarget = 1
        ring.style.backgroundColor = 'transparent'
        ring.style.borderColor = COLORS.cyan
        dot.style.opacity = '1'
      }
    }

    const tick = () => {
      // Ring eases toward the pointer. Use a single `transform` write (GPU
      // composited, no per-frame layout) instead of separate left/top writes.
      ringX += (pointerX - ringX) * LERP_FACTOR
      ringY += (pointerY - ringY) * LERP_FACTOR
      ringScale += (ringScaleTarget - ringScale) * LERP_FACTOR
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%) scale(${ringScale})`

      // Trail: each node follows the node ahead of it (ring first).
      let leadX = ringX
      let leadY = ringY
      for (const node of trail) {
        node.x += (leadX - node.x) * LERP_FACTOR
        node.y += (leadY - node.y) * LERP_FACTOR
        node.el.style.transform = `translate3d(${node.x}px, ${node.y}px, 0) translate(-50%, -50%)`
        leadX = node.x
        leadY = node.y
      }

      rafId = window.requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    document.addEventListener('mouseover', handleMouseOver, true)
    document.addEventListener('mouseout', handleMouseOut, true)
    rafId = window.requestAnimationFrame(tick)

    return () => {
      // Cleanup contract (Requirement 18.6): detach every listener, cancel the
      // rAF loop, and remove injected trail nodes. If any step throws the
      // cleanup is considered incomplete — log a warning but never crash the
      // unmount.
      try {
        window.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseover', handleMouseOver, true)
        document.removeEventListener('mouseout', handleMouseOut, true)
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId)
        }
        for (const node of trail) {
          node.el.remove()
        }
      } catch (error) {
        console.warn('[CustomCursor] cursor cleanup did not complete', error)
      }
    }
    // `enabled` collapses all gating flags; re-run only when activation changes.
  }, [enabled])

  // Not enabled → render nothing so the native cursor is used (Req 18.4, 18.5).
  if (!enabled) {
    return null
  }

  return (
    <div aria-hidden="true" className="veef-custom-cursor">
      {/* Coral dot — snaps instantly to the pointer. */}
      <div
        ref={dotRef}
        style={{
          position: 'fixed',
          left: '0px',
          top: '0px',
          width: `${DOT_SIZE}px`,
          height: `${DOT_SIZE}px`,
          borderRadius: '9999px',
          backgroundColor: COLORS.coral,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 9999,
          willChange: 'transform',
        }}
      />
      {/* Trail dots are injected into this container at runtime. */}
      <div
        ref={trailRef}
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9998 }}
      />
      {/* Cyan ring — follows with lerp easing. */}
      <div
        ref={ringRef}
        style={{
          position: 'fixed',
          left: '0px',
          top: '0px',
          width: `${RING_SIZE}px`,
          height: `${RING_SIZE}px`,
          borderRadius: '9999px',
          border: `1px solid ${COLORS.cyan}`,
          backgroundColor: 'transparent',
          opacity: RING_OPACITY,
          transform: 'translate(-50%, -50%)',
          transition: 'background-color 0.2s ease-out, border-color 0.2s ease-out',
          pointerEvents: 'none',
          zIndex: 9998,
          willChange: 'transform',
        }}
      />
    </div>
  )
}

CustomCursor.displayName = 'CustomCursor'
