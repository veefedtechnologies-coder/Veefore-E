import { COLORS } from '../../constants/colors'
import { TiltCard } from '../../primitives/TiltCard'

/**
 * Props for {@link FloatingCard}.
 */
export interface FloatingCardProps {
  /**
   * When `true`, the card renders fully static: no pointer tilt and no sine
   * float (Requirements 7.9, 21.1).
   *
   * @default false
   */
  reducedMotion?: boolean
}

/** A single bar in the animated bar chart. */
interface Bar {
  /** Height as a percentage of the chart body. */
  height: number
  color: string
}

const BARS: Bar[] = [
  { height: 45, color: COLORS.coral },
  { height: 68, color: COLORS.cyan },
  { height: 38, color: COLORS.gold },
  { height: 82, color: COLORS.coral },
  { height: 56, color: COLORS.cyan },
  { height: 72, color: COLORS.gold },
]

/** A single metric row (Reach / Saves / Shares). */
interface MetricRow {
  label: string
  value: string
  color: string
}

const METRICS: MetricRow[] = [
  { label: 'Reach', value: '128.4K', color: COLORS.coral },
  { label: 'Saves', value: '9,210', color: COLORS.cyan },
  { label: 'Shares', value: '3,847', color: COLORS.gold },
]

/** Engagement gauge target, as a fraction of the full ring (0..1). */
const GAUGE_SCORE = 0.78
const GAUGE_RADIUS = 34
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS

/**
 * The Hero's signature "main floating card" — a CSS/DOM metric dashboard layered
 * over the 3D backdrop. It contains an animated bar chart (coral/cyan/gold), a
 * circular engagement gauge (mint SVG ring), three metric rows, and a gradient
 * avatar (Requirement 7.3).
 *
 * Motion:
 * - Pointer tilt is delegated to {@link TiltCard}, clamped to ±8° X / ±6° Y
 *   (Requirement 7.4) and held when the pointer stops (Requirement 7.5).
 * - A gentle sine float (3s period, 12px amplitude) is applied via the scoped
 *   `veefFloat` keyframe.
 * - A coral ambient glow box-shadow surrounds the card.
 *
 * Under `reducedMotion`, tilt and float are both disabled and the card renders
 * in its final, static state (Requirements 7.9, 21.1).
 *
 * Requirements: 7.3, 7.4, 7.5, 7.9, 21.1
 */
export const FloatingCard: React.FC<FloatingCardProps> = ({ reducedMotion = false }) => {
  return (
    <div
      style={{
        // The sine float wraps the tilt so the two transforms compose cleanly
        // (float on the outer element, tilt on the inner TiltCard).
        animation: reducedMotion ? undefined : 'veefFloat 3s ease-in-out infinite',
        willChange: reducedMotion ? undefined : 'transform',
        width: 'min(360px, 80vw)',
      }}
    >
      <TiltCard reducedMotion={reducedMotion} maxTiltX={8} maxTiltY={6}>
        <div
          style={{
            position: 'relative',
            backgroundColor: COLORS.bgSecondary,
            border: '1px solid rgba(0, 212, 255, 0.1)',
            borderRadius: 20,
            padding: 24,
            // Coral ambient glow (brief: 0 40px 80px rgba(76,130,247,0.15)).
            boxShadow: '0 40px 80px rgba(76, 130, 247, 0.15)',
          }}
        >
          {/* Header: gradient avatar + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div
              aria-hidden="true"
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #4C82F7, #7FA8FF)',
                flexShrink: 0,
              }}
            />
            <div>
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 600,
                  fontSize: 14,
                  color: COLORS.textPrimary,
                }}
              >
                Your Growth
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: COLORS.textSecondary,
                }}
              >
                @veefore.creator
              </div>
            </div>
          </div>

          {/* Bar chart + gauge */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            {/* Animated bar chart */}
            <div
              role="img"
              aria-label="Weekly engagement bar chart"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8,
                height: 96,
              }}
            >
              {BARS.map((bar, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${bar.height}%`,
                    background: bar.color,
                    borderRadius: 4,
                    transformOrigin: 'bottom',
                    animation: reducedMotion
                      ? undefined
                      : `veefBarGrow 0.8s ease-out ${0.1 + i * 0.08}s both`,
                  }}
                />
              ))}
            </div>

            {/* Circular engagement gauge (mint SVG ring) */}
            <div
              role="img"
              aria-label={`Engagement score ${Math.round(GAUGE_SCORE * 100)} percent`}
              style={{ width: 84, height: 84, flexShrink: 0, position: 'relative' }}
            >
              <svg width="84" height="84" viewBox="0 0 84 84">
                <circle
                  cx="42"
                  cy="42"
                  r={GAUGE_RADIUS}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="6"
                />
                <circle
                  cx="42"
                  cy="42"
                  r={GAUGE_RADIUS}
                  fill="none"
                  stroke={COLORS.mint}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={GAUGE_CIRCUMFERENCE}
                  strokeDashoffset={GAUGE_CIRCUMFERENCE * (1 - GAUGE_SCORE)}
                  transform="rotate(-90 42 42)"
                  style={{
                    animation: reducedMotion
                      ? undefined
                      : 'veefGaugeFill 1.2s ease-out 0.3s both',
                  }}
                />
              </svg>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 16,
                  fontWeight: 700,
                  color: COLORS.mint,
                }}
              >
                {Math.round(GAUGE_SCORE * 100)}
              </div>
            </div>
          </div>

          {/* Metric rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {METRICS.map((metric) => (
              <div
                key={metric.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                }}
              >
                <span style={{ color: COLORS.textSecondary }}>{metric.label}</span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                    color: metric.color,
                  }}
                >
                  {metric.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </TiltCard>
    </div>
  )
}

FloatingCard.displayName = 'FloatingCard'
