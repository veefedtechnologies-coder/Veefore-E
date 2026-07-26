import { COLORS } from '../../constants/colors'

/**
 * Props for {@link OrbitingBadges}.
 */
export interface OrbitingBadgesProps {
  /**
   * When `true`, badges render at fixed static positions with no orbit and no
   * pulse (Requirements 7.9, 21.1).
   *
   * @default false
   */
  reducedMotion?: boolean
}

/** A single orbiting platform badge descriptor. */
interface Badge {
  label: string
  /** Single-character glyph / emoji shown in the badge. */
  glyph: string
  /** Background (CSS colour or gradient). */
  background: string
  /** Orbit radius in pixels. */
  radius: number
  /** Seconds for one full orbit. */
  orbitDuration: number
  /** Seconds for one pulse cycle. */
  pulseDuration: number
  /** Starting angle offset in degrees so badges don't overlap. */
  startAngle: number
}

const BADGES: Badge[] = [
  {
    label: 'Instagram',
    glyph: '📷',
    background: 'linear-gradient(135deg, #4C82F7, #7FA8FF)', // orange-red gradient
    radius: 120,
    orbitDuration: 18,
    pulseDuration: 3,
    startAngle: 0,
  },
  {
    label: 'YouTube',
    glyph: '▶',
    background: COLORS.coral, // red badge (palette: coral)
    radius: 150,
    orbitDuration: 26,
    pulseDuration: 3.6,
    startAngle: 130,
  },
  {
    label: 'WhatsApp',
    glyph: '💬',
    background: COLORS.mint, // mint green badge
    radius: 96,
    orbitDuration: 14,
    pulseDuration: 2.6,
    startAngle: 240,
  },
]

const BADGE_SIZE = 48

/**
 * CSS 3D-transform orbiting platform badges (Instagram, YouTube, WhatsApp) that
 * encircle the Hero card. Each badge orbits at a different radius and speed and
 * pulses with a soft glow (Requirement 7.6).
 *
 * Implementation: each badge sits on its own absolutely-centred "track" that
 * rotates via the scoped `veefOrbit` keyframe. The badge is pushed out to its
 * orbit radius and counter-rotates (`veefOrbitCounter`) so its glyph stays
 * upright while it travels. A separate inner element pulses scale + glow via
 * `veefPulse`.
 *
 * Under `reducedMotion`, no orbit/pulse animation runs and badges are placed at
 * static offset positions (Requirements 7.9, 21.1).
 *
 * Requirements: 7.6, 7.9, 21.1
 */
export const OrbitingBadges: React.FC<OrbitingBadgesProps> = ({ reducedMotion = false }) => {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      {BADGES.map((badge) => {
        // Static fallback: place each badge at its start angle on its radius.
        const rad = (badge.startAngle * Math.PI) / 180
        const staticX = Math.cos(rad) * badge.radius
        const staticY = Math.sin(rad) * badge.radius

        return (
          <div
            key={badge.label}
            style={{
              position: 'absolute',
              width: 0,
              height: 0,
              // Orbit track rotation (one full turn). Start offset via negative
              // delay so each badge begins at a different angle.
              transform: reducedMotion ? undefined : 'rotate(0deg)',
              animation: reducedMotion
                ? undefined
                : `veefOrbit ${badge.orbitDuration}s linear infinite`,
              animationDelay: reducedMotion
                ? undefined
                : `${-(badge.startAngle / 360) * badge.orbitDuration}s`,
            }}
          >
            <div
              style={{
                position: 'absolute',
                // Push out to the orbit radius. Under reduced motion, use the
                // pre-computed static offset instead.
                transform: reducedMotion
                  ? `translate(${staticX}px, ${staticY}px)`
                  : `translate(${badge.radius}px, 0)`,
              }}
            >
              <div
                style={{
                  // Counter-rotate so the glyph stays upright during orbit.
                  animation: reducedMotion
                    ? undefined
                    : `veefOrbitCounter ${badge.orbitDuration}s linear infinite`,
                  animationDelay: reducedMotion
                    ? undefined
                    : `${-(badge.startAngle / 360) * badge.orbitDuration}s`,
                }}
              >
                <div
                  title={badge.label}
                  style={{
                    width: BADGE_SIZE,
                    height: BADGE_SIZE,
                    marginLeft: -BADGE_SIZE / 2,
                    marginTop: -BADGE_SIZE / 2,
                    borderRadius: 14,
                    background: badge.background,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
                    animation: reducedMotion
                      ? undefined
                      : `veefPulse ${badge.pulseDuration}s ease-in-out infinite`,
                  }}
                >
                  <span aria-hidden="true">{badge.glyph}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

OrbitingBadges.displayName = 'OrbitingBadges'
