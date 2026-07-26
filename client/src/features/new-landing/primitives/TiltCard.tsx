import { useEffect, useRef, useState } from 'react'

import {
  DEFAULT_MAX_TILT_X,
  DEFAULT_MAX_TILT_Y,
  pointerToTilt,
  type Tilt,
} from './tilt'

/**
 * Props for {@link TiltCard}.
 */
export interface TiltCardProps {
  /**
   * Maximum tilt magnitude on the X axis, in degrees. The resolved tilt is
   * always clamped to `[-maxTiltX, +maxTiltX]` (Requirement 7.4).
   *
   * @default 8
   */
  maxTiltX?: number
  /**
   * Maximum tilt magnitude on the Y axis, in degrees. The resolved tilt is
   * always clamped to `[-maxTiltY, +maxTiltY]` (Requirement 7.4).
   *
   * @default 6
   */
  maxTiltY?: number
  /**
   * When `true`, the card renders static with no tilt and no pointer listeners
   * (Requirement 21.1). Callers should pass the page's Reduced_Motion state.
   *
   * @default false
   */
  reducedMotion?: boolean
  /** Extra classes merged onto the wrapper element. */
  className?: string
  /** Card content to tilt. */
  children: React.ReactNode
}

const ZERO_TILT: Tilt = { x: 0, y: 0 }

/**
 * Build the CSS transform string for a given tilt.
 *
 * `rotateX` is driven by the vertical pointer offset and `rotateY` by the
 * horizontal offset so the card leans toward the pointer. A fixed perspective
 * gives the rotation depth.
 */
function tiltTransform({ x, y }: Tilt): string {
  return `perspective(1000px) rotateX(${(-y).toFixed(3)}deg) rotateY(${x.toFixed(3)}deg)`
}

/**
 * Pointer-reactive 3D tilt wrapper for the Hero animated card.
 *
 * As the pointer moves, the card leans toward it, with the tilt clamped to
 * `[-maxTiltX, +maxTiltX]` on X and `[-maxTiltY, +maxTiltY]` on Y via the pure
 * {@link pointerToTilt} helper, so the tilt can never exceed the configured
 * bounds (Requirement 7.4, Correctness Property 8).
 *
 * When the pointer stops moving, the card HOLDS its current tilt — it is never
 * reset to flat on pointer idle (Requirement 7.5). A smooth CSS transition
 * eases between tilt states.
 *
 * When `reducedMotion` is `true`, the card renders flat with no listeners
 * attached (Requirement 21.1).
 *
 * All listeners are detached on unmount.
 *
 * Requirements: 7.4, 7.5, 21.1
 */
export const TiltCard: React.FC<TiltCardProps> = ({
  maxTiltX = DEFAULT_MAX_TILT_X,
  maxTiltY = DEFAULT_MAX_TILT_Y,
  reducedMotion = false,
  className,
  children,
}) => {
  const cardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState<Tilt>(ZERO_TILT)

  useEffect(() => {
    // Reduced motion: hold flat, attach nothing (Requirement 21.1).
    if (reducedMotion) {
      setTilt(ZERO_TILT)
      return
    }

    const handlePointerMove = (event: PointerEvent | MouseEvent) => {
      const node = cardRef.current
      if (!node) return

      const rect = node.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      // Normalise the pointer position relative to the card centre into
      // [-1, 1] on each axis; pointerToTilt clamps the resulting degrees.
      const normX = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const normY = ((event.clientY - rect.top) / rect.height) * 2 - 1

      setTilt(pointerToTilt(normX, normY, maxTiltX, maxTiltY))
    }

    // Listen globally so the card keeps reacting even when the pointer is near
    // (but not directly over) it. When the pointer stops, no event fires and
    // the last tilt is retained — the card holds its tilt (Requirement 7.5).
    window.addEventListener('mousemove', handlePointerMove)

    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
    }
  }, [reducedMotion, maxTiltX, maxTiltY])

  return (
    <div
      ref={cardRef}
      className={className}
      style={{
        transform: tiltTransform(tilt),
        transformStyle: 'preserve-3d',
        transition: 'transform 0.2s ease-out',
        willChange: reducedMotion ? undefined : 'transform',
      }}
    >
      {children}
    </div>
  )
}

TiltCard.displayName = 'TiltCard'
