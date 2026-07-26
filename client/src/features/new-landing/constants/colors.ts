/**
 * Veefore New Landing Page — Colour System (premium / restrained)
 *
 * Aesthetic target: Linear / Framer / Raycast. A near-black canvas with ONE
 * cool blue accent (drawn from the Veefore logo) used sparingly and a lighter
 * blue secondary. Cool grey text ramp. ZERO purple anywhere.
 *
 * The keys below intentionally keep their original names so existing section
 * code (`COLORS.coral`, `COLORS.cyan`, `COLORS.bgSecondary`, …) keeps compiling
 * — but the VALUES now map onto the restrained BLUE system:
 *   - coral  → THE blue accent (logo-derived)
 *   - gold   → lighter sky-blue secondary
 *   - cyan / mint → a single muted teal, used extremely sparingly
 *   - rose   → folded back onto the accent
 */

export const COLORS = {
  // Canvas — near-black
  bgPrimary: '#07070A', // page canvas
  bgSecondary: '#0C0D11', // elevated surface / cards
  bgTertiary: '#0C0D11', // alternates (kept identical — depth via borders, not fills)
  bgFooter: '#050507', // footer

  // Accents (blue family, from the Veefore logo)
  coral: '#4C82F7', // THE blue accent
  cyan: '#5EE6C4', // muted teal — used rarely
  gold: '#7FA8FF', // lighter sky-blue secondary
  mint: '#5EE6C4', // same muted teal
  rose: '#4C82F7', // folded onto the accent

  // Text ramp (cool greys)
  textPrimary: '#F5F6F8',
  textSecondary: '#9BA3B4',
  textMuted: '#5A6172',
} as const;

/** Gradient tokens — restrained, cool blue, no purple. */
export const GRADIENTS = {
  hero: 'linear-gradient(135deg,#4C82F7,#7FA8FF)',
  cyan: 'linear-gradient(135deg,#5EE6C4,#9BA3B4)',
  hot: 'linear-gradient(135deg,#4C82F7,#7FA8FF)',
  card: 'linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))',
} as const;

/** Key of a single colour token (e.g. `'coral'`, `'bgPrimary'`). */
export type ColorKey = keyof typeof COLORS;

/** Key of a single gradient token (e.g. `'hero'`). */
export type GradientKey = keyof typeof GRADIENTS;
