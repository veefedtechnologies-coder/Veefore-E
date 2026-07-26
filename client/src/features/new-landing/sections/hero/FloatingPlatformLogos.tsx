import { useEffect, useRef } from 'react'

import {
  InstagramLogo,
  MetaLogo,
  YouTubeLogo,
  WhatsAppLogo,
  TelegramLogo,
  TikTokLogo,
  LinkedInLogo,
  FacebookLogo,
  XLogo,
} from './BrandLogos'

/**
 * Props for {@link FloatingPlatformLogos}.
 */
export interface FloatingPlatformLogosProps {
  /**
   * When `true`, chips render at fixed positions with no drift, no glow pulse,
   * and no pointer interaction (Requirements 7.9, 21.1).
   */
  reducedMotion?: boolean
}

type LogoFC = React.FC<{ className?: string }>

/** A floating platform chip — crisp (foreground) or blurred (depth). */
interface Chip {
  label: string
  Logo: LogoFC
  glow: string
  side: 'left' | 'right'
  top: string
  x: string
  size: number
  /** Interaction weight 0..1 — heavier chips react more to the cursor. */
  weight: number
  rot: number
  drift: 'A' | 'B'
  duration: number
  delay: number
  /** `crisp` = sharp foreground chip; `blur` = soft, blurred depth chip. */
  tier: 'crisp' | 'blur'
}

/**
 * Logos scattered across the whole hero (Buffer-style), tuned for the dark
 * canvas. Crisp foreground chips carry the primary platforms; blurred chips —
 * real logos, just defocused and dimmed — fill the gaps so the field reads as
 * "many logos". Center stays clear for the headline.
 */
const CHIPS: Chip[] = [
  // ── Crisp foreground chips ──────────────────────────────────────
  { label: 'Instagram', Logo: InstagramLogo, glow: '#EC2855', side: 'left', top: '11%', x: '7%', size: 76, weight: 1.0, rot: -8, drift: 'A', duration: 9, delay: 0, tier: 'crisp' },
  { label: 'WhatsApp', Logo: WhatsAppLogo, glow: '#25D366', side: 'left', top: '63%', x: '4%', size: 64, weight: 0.85, rot: 7, drift: 'B', duration: 11, delay: 1.2, tier: 'crisp' },
  { label: 'Telegram', Logo: TelegramLogo, glow: '#2EA6DF', side: 'left', top: '37%', x: '16%', size: 54, weight: 0.7, rot: -4, drift: 'A', duration: 12.5, delay: 0.6, tier: 'crisp' },
  { label: 'Meta', Logo: MetaLogo, glow: '#0080FB', side: 'right', top: '13%', x: '7%', size: 72, weight: 0.95, rot: 9, drift: 'B', duration: 9.8, delay: 0.4, tier: 'crisp' },
  { label: 'YouTube', Logo: YouTubeLogo, glow: '#FF0033', side: 'right', top: '63%', x: '4%', size: 66, weight: 0.85, rot: -6, drift: 'A', duration: 11.4, delay: 1.6, tier: 'crisp' },
  { label: 'TikTok', Logo: TikTokLogo, glow: '#22D3EE', side: 'right', top: '37%', x: '16%', size: 54, weight: 0.7, rot: 5, drift: 'B', duration: 10.4, delay: 0.9, tier: 'crisp' },

  // ── Blurred depth chips (real logos, defocused — Buffer feel) ───
  { label: 'LinkedIn', Logo: LinkedInLogo, glow: '#0A66C2', side: 'left', top: '28%', x: '26%', size: 46, weight: 0.5, rot: 12, drift: 'B', duration: 14, delay: 0.3, tier: 'blur' },
  { label: 'Facebook', Logo: FacebookLogo, glow: '#1877F2', side: 'left', top: '84%', x: '20%', size: 52, weight: 0.6, rot: -10, drift: 'A', duration: 13, delay: 1.0, tier: 'blur' },
  { label: 'X', Logo: XLogo, glow: '#FFFFFF', side: 'left', top: '50%', x: '32%', size: 40, weight: 0.42, rot: 6, drift: 'B', duration: 15, delay: 1.8, tier: 'blur' },
  { label: 'YouTube', Logo: YouTubeLogo, glow: '#FF0033', side: 'left', top: '6%', x: '30%', size: 38, weight: 0.36, rot: -9, drift: 'A', duration: 15.5, delay: 2.4, tier: 'blur' },
  { label: 'Facebook', Logo: FacebookLogo, glow: '#1877F2', side: 'right', top: '27%', x: '26%', size: 48, weight: 0.5, rot: -12, drift: 'A', duration: 14.5, delay: 0.7, tier: 'blur' },
  { label: 'LinkedIn', Logo: LinkedInLogo, glow: '#0A66C2', side: 'right', top: '84%', x: '19%', size: 50, weight: 0.6, rot: 9, drift: 'B', duration: 12.8, delay: 1.4, tier: 'blur' },
  { label: 'Instagram', Logo: InstagramLogo, glow: '#EC2855', side: 'right', top: '50%', x: '32%', size: 38, weight: 0.4, rot: -5, drift: 'A', duration: 16, delay: 2.1, tier: 'blur' },
  { label: 'WhatsApp', Logo: WhatsAppLogo, glow: '#25D366', side: 'right', top: '6%', x: '30%', size: 36, weight: 0.34, rot: 8, drift: 'B', duration: 16.5, delay: 2.8, tier: 'blur' },
]

/** Per-chip live animation state, mutated imperatively inside the rAF loop. */
interface ChipMotion {
  el: HTMLDivElement | null
  x: number
  y: number
  rx: number
  ry: number
  weight: number
}

/** Radius (px) around the cursor within which a chip is pushed away. */
const REPEL_RADIUS = 240
/** Peak push distance (px) at the cursor, before weight scaling. */
const REPEL_STRENGTH = 90
/** Easing factor toward the target each frame (higher = snappier). */
const EASE = 0.14

/**
 * Floating, cursor-reactive platform logos for the Hero (reference: Buffer's
 * scattered logo field, reimagined for the dark premium canvas).
 *
 * Nine current official brand marks render as rounded app-icon tiles scattered
 * across the hero. Crisp foreground chips carry the headline platforms; a layer
 * of blurred, dimmed chips (real logos, just defocused) fills the gaps so the
 * field reads as "many logos" with real depth. A faint masked perspective grid
 * sits behind everything.
 *
 * Interaction model:
 *  - A single `requestAnimationFrame` loop drives every chip imperatively via
 *    refs — no React re-render per pointer move, so motion stays buttery.
 *  - The cursor is a magnet: chips within {@link REPEL_RADIUS} are pushed away
 *    (force falls off with distance, scaled by `weight`) and tilt on X/Y toward
 *    the push direction, easing back to rest when the cursor leaves.
 *  - Each crisp chip is individually hoverable: hovering lifts + scales it and
 *    intensifies its brand glow.
 *  - Idle drift/bob runs on an inner CSS layer so chips are never fully still.
 *
 * Hidden below `md`. Under `reducedMotion`, chips are static, glows calm, and
 * the rAF/pointer loop never starts (Requirements 7.6, 7.9, 21.1).
 */
export const FloatingPlatformLogos: React.FC<FloatingPlatformLogosProps> = ({
  reducedMotion = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const motionsRef = useRef<ChipMotion[]>(
    CHIPS.map((c) => ({ el: null, x: 0, y: 0, rx: 0, ry: 0, weight: c.weight })),
  )

  useEffect(() => {
    if (reducedMotion) return
    const container = containerRef.current
    if (!container) return

    const pointer = { x: 0, y: 0, active: false }

    const onMove = (e: PointerEvent) => {
      const r = container.getBoundingClientRect()
      pointer.x = e.clientX - r.left
      pointer.y = e.clientY - r.top
      pointer.active =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    }
    const onLeave = () => {
      pointer.active = false
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerout', onLeave, { passive: true })

    // Only run the animation loop while the hero is actually on screen — once
    // the user scrolls past it there's nothing to see, so we stop burning
    // frames (a major source of scroll-time lag down the page).
    let onScreen = true
    const io = new IntersectionObserver(
      ([entry]) => {
        const wasOn = onScreen
        onScreen = entry.isIntersecting
        if (onScreen && !wasOn && !raf) raf = requestAnimationFrame(tick)
      },
      { threshold: 0 },
    )
    io.observe(container)

    let raf = 0

    // Cache each chip's resting centre ONCE (relative to the container). These
    // never change unless the layout resizes, so reading offsetLeft/offsetTop
    // every frame just forced a synchronous reflow per chip per frame — the
    // source of the scroll-time jitter. We recompute only on resize.
    const bases: { x: number; y: number }[] = motionsRef.current.map(() => ({ x: 0, y: 0 }))
    const measureBases = () => {
      motionsRef.current.forEach((m, i) => {
        const el = m.el
        if (!el) return
        bases[i].x = el.offsetLeft + el.offsetWidth / 2
        bases[i].y = el.offsetTop + el.offsetHeight / 2
      })
    }
    measureBases()

    const tick = () => {
      // Skip all work when the hero is off-screen.
      if (!onScreen) {
        raf = 0
        return
      }

      const cx = container.clientWidth / 2
      const cy = container.clientHeight / 2
      let moved = false

      for (let i = 0; i < motionsRef.current.length; i++) {
        const m = motionsRef.current[i]
        const el = m.el
        if (!el) continue

        const baseX = bases[i].x
        const baseY = bases[i].y

        let tx = 0
        let ty = 0
        let trx = 0
        let tryY = 0

        if (pointer.active) {
          const dx = baseX - pointer.x
          const dy = baseY - pointer.y
          const dist = Math.hypot(dx, dy) || 1
          if (dist < REPEL_RADIUS) {
            const force = (1 - dist / REPEL_RADIUS) ** 1.6
            tx += (dx / dist) * force * REPEL_STRENGTH * m.weight
            ty += (dy / dist) * force * REPEL_STRENGTH * m.weight
          }

          const gx = (pointer.x - cx) / cx
          const gy = (pointer.y - cy) / cy
          tx += gx * 16 * m.weight
          ty += gy * 16 * m.weight
          trx = -gy * 14 * m.weight
          tryY = gx * 14 * m.weight
        }

        m.x += (tx - m.x) * EASE
        m.y += (ty - m.y) * EASE
        m.rx += (trx - m.rx) * EASE
        m.ry += (tryY - m.ry) * EASE

        // Track whether anything is still meaningfully moving so we can idle.
        if (
          Math.abs(tx - m.x) > 0.05 ||
          Math.abs(ty - m.y) > 0.05 ||
          Math.abs(trx - m.rx) > 0.02 ||
          Math.abs(tryY - m.ry) > 0.02
        ) {
          moved = true
        }

        // 2D translate only — no rotateX/Y (those needed a 3D context which
        // made Safari re-composite the whole hero on every scroll frame).
        el.style.transform = `translate3d(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px, 0)`
      }

      // When the pointer is inactive and every chip has settled, the CSS
      // keyframe drift handles idle motion — so we can stop the JS loop until
      // the next pointer move re-activates it.
      if (!pointer.active && !moved) {
        raf = 0
        return
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    // Recompute cached bases on resize (debounced via rAF).
    let resizeRaf = 0
    const onResize = () => {
      cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(measureBases)
    }
    window.addEventListener('resize', onResize)

    // Re-kick the loop on pointer move if it idled out.
    const kick = () => {
      if (!raf && onScreen) raf = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', kick, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(resizeRaf)
      io.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointermove', kick)
      window.removeEventListener('pointerout', onLeave)
    }
  }, [reducedMotion])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 hidden md:block"
    >
      {CHIPS.map((chip, i) => {
        const sideStyle = chip.side === 'left' ? { left: chip.x } : { right: chip.x }
        const isBlur = chip.tier === 'blur'

        return (
          <div
            key={`${chip.label}-${i}`}
            ref={(node) => {
              motionsRef.current[i].el = node
            }}
            className="absolute will-change-transform"
            style={{
              ...sideStyle,
              top: chip.top,
              width: chip.size,
              height: chip.size,
              zIndex: isBlur ? 0 : 1,
            }}
          >
            {/* Idle drift + resting rotation (independent of the cursor) */}
            <div
              className="relative h-full w-full"
              style={{
                transform: `rotate(${chip.rot}deg)`,
                animation: reducedMotion
                  ? undefined
                  : `veefChipDrift${chip.drift} ${chip.duration}s ease-in-out ${chip.delay}s infinite`,
              }}
            >
              {/* Ambient brand glow */}
              <div
                className="pointer-events-none absolute"
                style={{
                  inset: '-32%',
                  borderRadius: '9999px',
                  background: `radial-gradient(closest-side, ${chip.glow}, transparent 72%)`,
                  filter: 'blur(10px)',
                  opacity: reducedMotion ? (isBlur ? 0.18 : 0.4) : isBlur ? 0.28 : undefined,
                  animation: reducedMotion
                    ? undefined
                    : `veefChipGlow ${chip.duration * 0.85}s ease-in-out ${chip.delay}s infinite`,
                }}
              />
              {/* Glassy chip holding the official logo */}
              <div
                title={isBlur ? undefined : chip.label}
                className={`relative h-full w-full ${isBlur ? '' : 'veef-logo-chip pointer-events-auto cursor-pointer'}`}
                style={{
                  borderRadius: 18,
                  padding: Math.round(chip.size * 0.17),
                  background: 'linear-gradient(155deg, rgba(32,33,40,0.98), rgba(13,14,18,0.99))',
                  border: '1px solid rgba(255,255,255,0.16)',
                  boxShadow:
                    '0 1px 0 rgba(255,255,255,0.16) inset, 0 30px 60px -26px rgba(0,0,0,0.9)',
                  // NOTE: no backdrop-filter. The chip bg is already opaque, so
                  // blurring what's behind it added no visual value but forced
                  // the browser to re-rasterize the blur region for all chips on
                  // every scroll frame — the cause of the hero scroll jitter.
                  filter: isBlur ? 'blur(2.2px) saturate(0.9)' : undefined,
                  opacity: isBlur ? 0.62 : 1,
                  transition: isBlur
                    ? undefined
                    : 'transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease, border-color 0.3s ease',
                  ['--veef-chip-glow' as string]: chip.glow,
                }}
              >
                <chip.Logo className="h-full w-full" />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

FloatingPlatformLogos.displayName = 'FloatingPlatformLogos'
