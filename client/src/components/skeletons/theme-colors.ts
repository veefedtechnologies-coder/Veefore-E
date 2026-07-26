/**
 * Shared, typed skeleton theme color table for the pixel-perfect skeleton
 * loading system.
 *
 * This module mirrors the per-theme placeholder/shimmer color CSS variables
 * defined in `client/src/index.css` (the `--vf-skeleton-base` /
 * `--vf-skeleton-highlight` triplets for `:root`/light, `.dark`, `.dark-blue`,
 * `.dark-black`, `.dark-gray`). Keeping the exact same RGB triplets here in a
 * pure, importable form lets us assert color-contrast properties (Property 6)
 * and the unsupported-theme fallback (Property 7) without parsing CSS.
 *
 * Source of truth:
 *  - `base` / `highlight`: EXACT values from the `--vf-skeleton-base` /
 *    `--vf-skeleton-highlight` declarations in `client/src/index.css`
 *    (SKELETON LOADING SYSTEM section, R6/R7).
 *  - `background`: each theme's page background from `THEME_CONFIGS` in
 *    `client/src/lib/theme.ts` (`colors.background`), converted from hex to an
 *    RGB triplet:
 *      light      → #ffffff → [255, 255, 255]
 *      dark       → #0f172a → [15, 23, 42]   (slate-900)
 *      dark-blue  → #0c1220 → [12, 18, 32]
 *      dark-black → #000000 → [0, 0, 0]
 *      dark-gray  → #1a1a1a → [26, 26, 26]
 *
 * If the values in index.css or theme.ts change, update this table to match.
 */

/** A color expressed as an [r, g, b] triplet, each channel in [0, 255]. */
export type RgbTriplet = [number, number, number];

/** The set of supported skeleton themes (matches the CSS theme classes). */
export type SkeletonTheme =
  | 'light'
  | 'dark'
  | 'dark-blue'
  | 'dark-black'
  | 'dark-gray';

/** Placeholder/shimmer/background colors for a single theme. */
export interface SkeletonThemeColors {
  /** Base placeholder fill (`--vf-skeleton-base`). */
  base: RgbTriplet;
  /** Shimmer highlight (`--vf-skeleton-highlight`). */
  highlight: RgbTriplet;
  /** Page background the placeholder sits on (theme `colors.background`). */
  background: RgbTriplet;
}

/**
 * Per-theme skeleton color table. `base` / `highlight` are the EXACT RGB
 * triplets from `client/src/index.css`; `background` is the theme page
 * background from `client/src/lib/theme.ts`.
 */
export const SKELETON_THEME_COLORS: Record<SkeletonTheme, SkeletonThemeColors> =
  {
    // :root (light) — base slate-200, highlight slate-100; bg #ffffff
    light: {
      base: [226, 232, 240],
      highlight: [241, 245, 249],
      background: [255, 255, 255],
    },
    // .dark — base slate-700, highlight slate-600; bg #0f172a (slate-900)
    dark: {
      base: [51, 65, 85],
      highlight: [71, 85, 105],
      background: [15, 23, 42],
    },
    // .dark-blue — bg #0c1220
    'dark-blue': {
      base: [45, 55, 72],
      highlight: [58, 70, 92],
      background: [12, 18, 32],
    },
    // .dark-black — bg #000000
    'dark-black': {
      base: [51, 51, 51],
      highlight: [68, 68, 68],
      background: [0, 0, 0],
    },
    // .dark-gray — bg #1a1a1a
    'dark-gray': {
      base: [64, 64, 64],
      highlight: [82, 82, 82],
      background: [26, 26, 26],
    },
  };

/** The light theme entry, used as the fallback for unknown themes (R7.6). */
export const LIGHT_SKELETON_COLORS: SkeletonThemeColors =
  SKELETON_THEME_COLORS.light;

/** Type guard: is `theme` one of the supported skeleton themes? */
export function isSkeletonTheme(theme: string): theme is SkeletonTheme {
  return Object.prototype.hasOwnProperty.call(SKELETON_THEME_COLORS, theme);
}

/**
 * Resolve a theme identifier to its skeleton colors.
 *
 * Supported themes return their own entry; any unknown/unsupported theme
 * identifier falls back to the `light` colors, matching the CSS behavior where
 * no theme class matches and the `:root` values apply (R7.6).
 *
 * Pure: no side effects, deterministic for a given input.
 */
export function resolveSkeletonThemeColors(theme: string): SkeletonThemeColors {
  return isSkeletonTheme(theme)
    ? SKELETON_THEME_COLORS[theme]
    : LIGHT_SKELETON_COLORS;
}
