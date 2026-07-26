import { COLORS } from '../../constants/colors'

/**
 * Props for {@link NotificationToasts}.
 */
export interface NotificationToastsProps {
  /**
   * When `true`, a single static toast is shown with no cycling animation
   * (Requirements 7.9, 21.1).
   *
   * @default false
   */
  reducedMotion?: boolean
}

/** The four hero notification messages from the design brief. */
const TOASTS: string[] = [
  '🔥 Your Reel just hit 50K views!',
  '✅ 127 DMs sent automatically',
  '📈 Engagement up 34% this week',
  '🤑 New lead captured via automation',
]

/** Total seconds for one toast's slide-in → pause → slide-out cycle. */
const CYCLE_DURATION = 8

const TOAST_BASE_STYLE: React.CSSProperties = {
  backgroundColor: COLORS.bgSecondary,
  borderLeft: `3px solid ${COLORS.coral}`,
  borderRadius: 10,
  padding: '12px 16px',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  color: COLORS.textPrimary,
  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
  whiteSpace: 'nowrap',
}

/**
 * Floating notification toasts for the Hero. The four messages cycle endlessly:
 * each slides in from the right, pauses, then slides out, staggered so roughly
 * one is visible at a time (Requirement 7.7).
 *
 * The cycle is driven by the scoped `veefToastCycle` keyframe; each toast gets a
 * staggered negative `animation-delay` so they take turns.
 *
 * Under `reducedMotion`, the looping is suppressed and a single static toast is
 * rendered in its visible resting state (Requirements 7.9, 21.1).
 *
 * Requirements: 7.7, 7.9, 21.1
 */
export const NotificationToasts: React.FC<NotificationToastsProps> = ({
  reducedMotion = false,
}) => {
  if (reducedMotion) {
    // One static toast, no cycling.
    return (
      <div
        role="status"
        style={{
          position: 'absolute',
          top: 24,
          right: 0,
          pointerEvents: 'none',
        }}
      >
        <div style={TOAST_BASE_STYLE}>{TOASTS[0]}</div>
      </div>
    )
  }

  const stagger = CYCLE_DURATION / TOASTS.length

  return (
    <div
      role="status"
      aria-live="off"
      style={{
        position: 'absolute',
        top: 24,
        right: 0,
        height: 60,
        pointerEvents: 'none',
      }}
    >
      {TOASTS.map((toast, i) => (
        <div
          key={toast}
          style={{
            ...TOAST_BASE_STYLE,
            position: 'absolute',
            top: 0,
            right: 0,
            opacity: 0,
            animation: `veefToastCycle ${CYCLE_DURATION}s ease-in-out infinite`,
            // Stagger each toast so they appear in sequence.
            animationDelay: `${-i * stagger}s`,
          }}
        >
          {toast}
        </div>
      ))}
    </div>
  )
}

NotificationToasts.displayName = 'NotificationToasts'
