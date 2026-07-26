/**
 * Veefore New Landing Page — Scroll Path Configuration
 *
 * Exact parameters for the animated SVG scroll path, ported 1:1 from the
 * `VeefScrollPath` config block in the design brief. All gradient stops and
 * node colours use Colour_System values only — ZERO purple.
 *
 * @see VEEFORE_LANDING_PAGE_PROMPT_COMPLETE.md — "SCROLL PATH SYSTEM"
 * @see design.md — "Scroll_Path system design" + "Data Models"
 */

/** A single gradient stop along the path (top → bottom of the full page). */
export interface ScrollPathGradientStop {
  offset: string;
  color: string;
}

/** Full configuration for the scroll path system. */
export interface ScrollPathConfig {
  /** X-position the path visits per section, as a fraction of page width (0 = left, 0.5 = center, 1 = right). */
  xPattern: number[];
  /** Section anchor IDs — must match the rendered section ids exactly. */
  sectionIds: string[];
  /** Short labels shown beside each section node. */
  nodeLabels: string[];
  /** Gradient colour stops top → bottom (no purple). */
  gradientStops: ScrollPathGradientStop[];
  /** Dot colour per section node (matches `sectionIds` order). */
  nodeColors: string[];
  /** Bezier looseness: 0 = sharp corners, 1 = very loose. */
  tension: number;
  /** Thin crisp line width (px). */
  mainStrokeWidth: number;
  /** Wide blurred copy width that creates the glow (px). */
  glowStrokeWidth: number;
  /** Opacity of the blurred glow copy. */
  glowOpacity: number;
  /** Frontier tip dot radius (px). */
  tipDotRadius: number;
  /** Section node dot radius (px). */
  nodeDotRadius: number;
  /** GSAP ScrollTrigger scrub lag (higher = smoother but laggier). */
  scrub: number;
}

/** The scroll path configuration — single source of truth for `useScrollPath`. */
export const SCROLL_PATH_CONFIG: ScrollPathConfig = {
  xPattern: [
    0.5, // hero         — center
    0.15, // problem      — far left
    0.82, // features     — far right
    0.5, // how-it-works — center
    0.25, // demo         — center-left
    0.5, // pricing      — center (tall pinned section: keep path straight)
    0.18, // testimonials — far left
    0.5, // beta         — center
    0.8, // faq          — far right
    0.5, // cta          — center
  ],
  sectionIds: [
    '#hero',
    '#problem',
    '#features',
    '#how-it-works',
    '#demo',
    '#pricing',
    '#testimonials',
    '#beta',
    '#faq',
    '#cta',
  ],
  nodeLabels: [
    'Hero',
    'Problem',
    'Features',
    'How It Works',
    'Live Demo',
    'Pricing',
    'Creators Say',
    'Beta',
    'FAQ',
    'Get Started',
  ],
  // Restrained gradient: warm coral → amber, drifting to a faint teal and back.
  // A single accent family rather than five competing colours.
  gradientStops: [
    { offset: '0%', color: '#4C82F7' }, // accent
    { offset: '30%', color: '#7FA8FF' }, // amber
    { offset: '55%', color: '#5EE6C4' }, // faint teal
    { offset: '80%', color: '#7FA8FF' }, // amber
    { offset: '100%', color: '#4C82F7' }, // accent
  ],
  nodeColors: [
    '#4C82F7',
    '#7FA8FF',
    '#4C82F7',
    '#5EE6C4',
    '#7FA8FF',
    '#4C82F7',
    '#5EE6C4',
    '#4C82F7',
    '#7FA8FF',
    '#4C82F7',
  ],
  // Looser, calmer curve; a crisp hairline with a soft, wide glow.
  tension: 0.5,
  mainStrokeWidth: 1.25,
  glowStrokeWidth: 10,
  glowOpacity: 0.28,
  tipDotRadius: 3.5,
  nodeDotRadius: 3,
  scrub: 1,
};
