import { Fragment } from 'react'
import { m } from 'framer-motion'
import type { Variants } from 'framer-motion'

/**
 * Props for {@link SplitText}.
 *
 * Splits `text` into characters or words and reveals each piece with a
 * staggered rise + fade (framer-motion). Replaces the design brief's vanilla
 * Splitting.js (design.md — "Vanilla-JS → React mapping").
 */
export interface SplitTextProps {
  /** The full text to render and animate. */
  text: string
  /**
   * The element to render as the container.
   *
   * @default 'span'
   */
  as?: keyof JSX.IntrinsicElements
  /**
   * Split granularity — by individual character or by whole word.
   *
   * @default 'char'
   */
  by?: 'char' | 'word'
  /**
   * Delay between successive pieces, in milliseconds.
   *
   * @default 30
   */
  staggerMs?: number
  /** Optional class names applied to the container element. */
  className?: string
  /**
   * When `true`, render plain text in its final visible state with no
   * animation (Requirements 21.1, 23.x reduced-motion gating).
   *
   * @default false
   */
  reducedMotion?: boolean
  /**
   * When the reveal should play.
   * - `'mount'` — animate once when the element mounts.
   * - `'inView'` — animate once when the element scrolls into view.
   *
   * @default 'mount'
   */
  trigger?: 'mount' | 'inView'
}

/** Per-piece rise + fade. Final state is `{ opacity: 1, y: 0 }`. */
const pieceVariants: Variants = {
  hidden: { opacity: 0, y: '0.6em' },
  visible: { opacity: 1, y: 0 },
}

/**
 * Splits `text` into animated chars/words, each rising and fading in with a
 * configurable stagger.
 *
 * Accessibility: the animated pieces are wrapped in an `aria-hidden` layer and
 * the full text is exposed to assistive technology via an adjacent visually
 * hidden copy, so screen readers read the whole string once rather than every
 * fragmented span (Requirements 21.2, 21.3).
 *
 * Under `reducedMotion`, the component renders the plain text in its final
 * state with no motion (Requirement 21.1).
 *
 * Requirements: 4.4, 6.5, 16.3, 21.1
 */
export const SplitText: React.FC<SplitTextProps> = ({
  text,
  as = 'span',
  by = 'char',
  staggerMs = 30,
  className,
  reducedMotion = false,
  trigger = 'mount',
}) => {
  const Container = as as React.ElementType

  // Reduced motion: plain text, final state, no animation, fully accessible.
  if (reducedMotion) {
    return <Container className={className}>{text}</Container>
  }

  const pieces = by === 'word' ? splitWords(text) : Array.from(text)

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: Math.max(0, staggerMs) / 1000 },
    },
  }

  const animationProps =
    trigger === 'inView'
      ? { initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true, amount: 0.3 } }
      : { initial: 'hidden' as const, animate: 'visible' as const }

  return (
    <Container className={className}>
      {/* Full text for screen readers — read once, not fragment-by-fragment. */}
      <span className="sr-only">{text}</span>

      {/* Animated, decorative layer hidden from assistive technology. */}
      <m.span aria-hidden="true" variants={containerVariants} {...animationProps}>
        {pieces.map((piece, index) => {
          // Stable key: the piece content combined with its fixed position.
          // The split text never reorders, and the suffix disambiguates
          // repeated characters/words.
          const pieceKey = `${piece}-${index}`
          // Preserve spaces: render a non-collapsing space rather than an
          // animated empty glyph, so word/char spacing is retained.
          if (piece === ' ') {
            return <Fragment key={pieceKey}>{'\u00A0'}</Fragment>
          }

          return (
            <m.span
              key={pieceKey}
              variants={pieceVariants}
              style={{ display: 'inline-block', whiteSpace: 'pre' }}
            >
              {piece}
            </m.span>
          )
        })}
      </m.span>
    </Container>
  )
}

/**
 * Split a string into words while preserving the spaces between them as their
 * own pieces, so spacing survives the per-piece `inline-block` layout.
 */
function splitWords(text: string): string[] {
  // Split on spaces but keep the separators as standalone ' ' pieces.
  return text.split(/( )/).filter((piece) => piece.length > 0)
}
