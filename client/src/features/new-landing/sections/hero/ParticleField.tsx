import { useMemo } from 'react'

import { COLORS } from '../../constants/colors'

/**
 * Props for {@link ParticleField}.
 */
export interface ParticleFieldProps {
  /**
   * When `true`, particles are still rendered but do not drift — they sit at
   * their static positions (Requirements 7.9, 16.2, 21.1).
   *
   * @default false
   */
  reducedMotion?: boolean
  /**
   * Number of particles to render.
   *
   * @default 60
   */
  count?: number
}

/** Particle accent palette — coral / cyan / gold only (Requirement 7.8). */
const PARTICLE_COLORS = [COLORS.coral, COLORS.cyan, COLORS.gold] as const

/** A single particle's static, deterministic layout. */
interface Particle {
  left: number // %
  top: number // %
  size: number // px (1–3)
  color: string
  opacity: number // 0.2–0.4
  duration: number // s
  delay: number // s (negative offset)
  drift: number // px upward travel
}

/**
 * Build a deterministic particle layout. A seeded PRNG keeps positions stable
 * across re-renders (no layout jitter) while still looking scattered.
 */
function buildParticles(count: number): Particle[] {
  let seed = 13
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    const size = 1 + rand() * 2 // 1–3px
    particles.push({
      left: rand() * 100,
      top: rand() * 100,
      size,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      opacity: 0.2 + rand() * 0.2, // 20%–40%
      duration: 6 + rand() * 8, // 6–14s
      delay: -rand() * 14,
      drift: -(80 + rand() * 80), // upward 80–160px
    })
  }
  return particles
}

/**
 * Background particle field for the Hero: small dots (1–3px) in coral, cyan, and
 * gold at 20–40% opacity that drift slowly upward (Requirements 7.8).
 *
 * The upward drift uses the scoped `veefParticleDrift` keyframe, with the travel
 * distance supplied per-particle via the `--veef-drift` custom property.
 *
 * Under `reducedMotion`, the particles are still rendered (Requirement 16.2 /
 * the drift-disabled case) but no drift animation runs (Requirements 7.9,
 * 21.1).
 *
 * Requirements: 7.8, 7.9, 16.2, 21.1
 */
export const ParticleField: React.FC<ParticleFieldProps> = ({
  reducedMotion = false,
  count = 60,
}) => {
  const particles = useMemo(() => buildParticles(count), [count])

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            backgroundColor: p.color,
            opacity: p.opacity,
            // Per-particle travel distance consumed by the keyframe.
            ['--veef-drift' as string]: `${p.drift}px`,
            animation: reducedMotion
              ? undefined
              : `veefParticleDrift ${p.duration}s linear infinite`,
            animationDelay: reducedMotion ? undefined : `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

ParticleField.displayName = 'ParticleField'
