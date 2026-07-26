/**
 * ScrollPath — the animated SVG scroll-path overlay for the New Landing Page.
 *
 * Thin wrapper around {@link useScrollPath}. It reads the shared motion-gating
 * flags and renders nothing itself — the SVG (a dual-layer glow path, tip dot,
 * and section nodes/labels) is injected directly into the supplied container
 * ref by the hook, sits at `z-index: 2` below all content, and uses
 * `pointer-events: none` so it never intercepts clicks.
 *
 * The overlay is suppressed entirely on mobile and under reduced motion: when
 * disabled the component early-returns `null` and the hook does nothing, so no
 * SVG is ever injected (Requirements 5.11, 5.12).
 *
 * Requirements: 5.1, 5.5, 5.9, 5.10, 5.11, 5.12.
 */
import { useLandingMotion } from '../context/LandingMotionProvider';
import { useScrollPath } from '../hooks/useScrollPath';

/** Props for {@link ScrollPath}. */
export interface ScrollPathProps {
  /** The page root element the SVG is injected into and measured against. */
  containerRef: React.RefObject<HTMLElement>;
}

/**
 * Render (via side effect) the scroll-path SVG overlay into `containerRef`.
 *
 * Renders nothing in the React tree; the SVG is DOM-injected by the hook and
 * fully torn down on unmount. Returns `null` on mobile / reduced motion.
 */
export const ScrollPath: React.FC<ScrollPathProps> = ({ containerRef }) => {
  const { isMobile, reducedMotion } = useLandingMotion();
  const enabled = !isMobile && !reducedMotion;

  useScrollPath(containerRef, { enabled });

  // Nothing to render: the SVG lives in the injected DOM, and on
  // mobile/reduced-motion the overlay must not exist at all.
  if (!enabled) return null;

  return null;
};
