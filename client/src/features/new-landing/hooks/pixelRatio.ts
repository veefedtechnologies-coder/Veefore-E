/**
 * Pure pixel-ratio clamp for the new landing page's Three.js scene.
 *
 * The renderer's device pixel ratio is capped at 2 to bound GPU cost on
 * high-DPI displays. This is a DOM-free, side-effect-free helper so the
 * corresponding correctness property can run in isolation.
 *
 * - Property 16: Three.js pixel ratio is capped at 2.
 *
 * _Requirements: 22.2_
 */

/** Maximum device pixel ratio applied to the Three.js renderer. */
export const MAX_PIXEL_RATIO = 2;

/**
 * Returns `min(dpr, 2)`. Guards against invalid input: if `dpr` is not a
 * finite number greater than 0 (NaN, Infinity, zero, or negative), returns 1.
 */
export function clampPixelRatio(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) {
    return 1;
  }
  return Math.min(dpr, MAX_PIXEL_RATIO);
}
