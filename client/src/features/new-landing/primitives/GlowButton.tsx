import { forwardRef } from 'react'

import { COLORS } from '../constants/colors'

/**
 * Props for {@link GlowButton}.
 *
 * A landing-scoped call-to-action button. Extends the native button props so
 * callers can forward `onClick`, `type`, `disabled`, `aria-*`, etc.
 */
export interface GlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual style.
   * - `'coral'` — solid coral background (primary CTA).
   * - `'ghost'` — transparent with a coral-tinted border (secondary CTA).
   *
   * @default 'coral'
   */
  variant?: 'coral' | 'ghost'
  /**
   * Enable the coral glow box-shadow on hover.
   *
   * @default true
   */
  glow?: boolean
  /**
   * Control padding / text size.
   * - `'sm'` — compact, for header nav controls.
   * - `'md'` — default, for hero / section CTAs.
   *
   * @default 'md'
   */
  size?: 'sm' | 'md'
}

/** Soft accent glow applied on hover. */
const GLOW_SHADOW = '0 8px 30px rgba(76,130,247,0.35)'

const BASE_CLASSES =
  'veef-glow-button inline-flex items-center justify-center gap-2 rounded-full ' +
  'font-medium cursor-pointer select-none ' +
  'transition-[transform,box-shadow,background-color,border-color,color] duration-300 ' +
  '[transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C82F7] ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070A] ' +
  'active:scale-[0.98] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100'

/** Per-size padding + text. */
const SIZE_CLASSES: Record<NonNullable<GlowButtonProps['size']>, string> = {
  sm: 'px-4 py-2 text-[13.5px]',
  md: 'px-6 py-3 text-[15px]',
}

const VARIANT_CLASSES: Record<NonNullable<GlowButtonProps['variant']>, string> = {
  // Primary: solid warm accent, white text, subtle lift on hover.
  coral:
    'bg-[#4C82F7] text-white border border-transparent shadow-[0_1px_0_rgba(255,255,255,0.15)_inset] ' +
    'hover:-translate-y-0.5 hover:bg-[#FF6A48]',
  // Secondary: glassy, hairline border, brightens on hover.
  ghost:
    'bg-white/[0.04] text-[#F5F6F8] border border-white/[0.12] backdrop-blur-sm ' +
    'hover:bg-white/[0.07] hover:border-white/[0.22]',
}

/**
 * Coral CTA button with a hover glow, active press, and a visible focus ring.
 *
 * - `coral` renders a solid `#4C82F7` background; `ghost` is transparent with a
 *   coral border. Both use only Colour_System tokens — ZERO purple
 *   (Requirements 4.1, 4.2).
 * - On hover (when `glow`), a coral glow box-shadow is applied; on press the
 *   button scales to `0.97`; focus shows a coral ring offset against the navy
 *   background (Requirements 6.5, 16.3, 21.4).
 * - Glow and scale are CSS-driven, so they sit out gracefully for users with
 *   reduced-motion preferences honoured at the document level and never block
 *   interaction.
 * - All remaining button props and `className` are forwarded; the ref points at
 *   the underlying `<button>`.
 *
 * Requirements: 6.5, 16.3, 21.1, 21.4
 */
export const GlowButton = forwardRef<HTMLButtonElement, GlowButtonProps>(
  ({ variant = 'coral', glow = true, size = 'md', className, style, onMouseEnter, onMouseLeave, ...rest }, ref) => {
    const classes = [BASE_CLASSES, SIZE_CLASSES[size], VARIANT_CLASSES[variant], className].filter(Boolean).join(' ')

    // Apply the glow via inline styles on hover so the rgba shadow stays exact
    // and scoped to this button without a global CSS rule.
    const handleEnter: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      if (glow && !event.currentTarget.disabled) {
        event.currentTarget.style.boxShadow = GLOW_SHADOW
      }
      onMouseEnter?.(event)
    }

    const handleLeave: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      event.currentTarget.style.boxShadow = ''
      onMouseLeave?.(event)
    }

    return (
      <button
        ref={ref}
        className={classes}
        style={{ color: COLORS.textPrimary, ...style }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        {...rest}
      />
    )
  },
)

GlowButton.displayName = 'GlowButton'
