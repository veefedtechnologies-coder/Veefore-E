/**
 * Pure visibility predicates for the new landing page.
 *
 * These are DOM-free, side-effect-free functions used to decide whether
 * motion-heavy decorative elements should be rendered. Keeping them pure
 * lets the corresponding correctness properties run under happy-dom without
 * touching the real DOM.
 *
 * - Property 6:  Scroll path renders only on desktop with motion enabled.
 * - Property 14: Custom cursor renders only on fine-pointer desktop with
 *                motion enabled.
 *
 * _Requirements: 5.11, 5.12, 18.4, 18.5_
 */

/** Default viewport width (px) below/at which the layout is considered mobile. */
export const DEFAULT_MOBILE_BREAKPOINT = 768;

export interface ShouldRenderScrollPathArgs {
  /** Current viewport width in CSS pixels. */
  width: number;
  /** Whether the user has requested reduced motion. */
  reducedMotion: boolean;
  /** Width (px) at or below which the layout is treated as mobile. */
  mobileBreakpoint?: number;
}

/**
 * The Scroll_Path is rendered if and only if the viewport width is greater
 * than the Mobile_Breakpoint and Reduced_Motion is not active.
 */
export function shouldRenderScrollPath({
  width,
  reducedMotion,
  mobileBreakpoint = DEFAULT_MOBILE_BREAKPOINT,
}: ShouldRenderScrollPathArgs): boolean {
  return width > mobileBreakpoint && !reducedMotion;
}

export interface ShouldRenderCustomCursorArgs {
  /** Whether the device supports a fine pointer (e.g. a mouse). */
  finePointer: boolean;
  /** Whether the user has requested reduced motion. */
  reducedMotion: boolean;
  /** Current viewport width in CSS pixels. */
  width: number;
  /** Width (px) at or below which the layout is treated as mobile. */
  mobileBreakpoint?: number;
}

/**
 * The Custom_Cursor is rendered if and only if the device supports a fine
 * pointer, Reduced_Motion is not active, and the viewport width is greater
 * than the Mobile_Breakpoint; otherwise the native cursor is used.
 */
export function shouldRenderCustomCursor({
  finePointer,
  reducedMotion,
  width,
  mobileBreakpoint = DEFAULT_MOBILE_BREAKPOINT,
}: ShouldRenderCustomCursorArgs): boolean {
  return finePointer && !reducedMotion && width > mobileBreakpoint;
}
