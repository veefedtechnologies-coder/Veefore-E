/**
 * Pure, DOM-free tilt math for the Hero animated card.
 *
 * Implements Correctness Property 8 (design.md): hero card tilt is clamped to
 * [-maxX, +maxX] on the X axis and [-maxY, +maxY] on the Y axis.
 *
 * Defaults match the design brief / Requirement 7.4: ±8° X, ±6° Y.
 */

/** Default maximum tilt on the X axis, in degrees (Requirement 7.4). */
export const DEFAULT_MAX_TILT_X = 8;

/** Default maximum tilt on the Y axis, in degrees (Requirement 7.4). */
export const DEFAULT_MAX_TILT_Y = 6;

/** A resolved tilt in degrees on each axis. */
export interface Tilt {
  x: number;
  y: number;
}

/**
 * Clamp a single value into the symmetric range [-max, +max].
 *
 * `NaN` inputs (value or max) resolve to `0` so a degenerate pointer reading can
 * never produce a NaN transform. A negative `max` is treated as `0` magnitude.
 */
function clampSymmetric(value: number, max: number): number {
  if (Number.isNaN(value) || Number.isNaN(max)) {
    return 0;
  }
  const bound = Math.abs(max);
  if (value > bound) return bound;
  if (value < -bound) return -bound;
  return value;
}

/**
 * Clamp raw tilt degrees into the allowed ranges.
 *
 * @param rawX raw X-axis tilt in degrees
 * @param rawY raw Y-axis tilt in degrees
 * @param maxX maximum X magnitude (default 8)
 * @param maxY maximum Y magnitude (default 6)
 * @returns tilt with `x` in [-maxX, +maxX] and `y` in [-maxY, +maxY]
 *
 * `NaN` inputs clamp to `0`.
 */
export function clampTilt(
  rawX: number,
  rawY: number,
  maxX: number = DEFAULT_MAX_TILT_X,
  maxY: number = DEFAULT_MAX_TILT_Y,
): Tilt {
  return {
    x: clampSymmetric(rawX, maxX),
    y: clampSymmetric(rawY, maxY),
  };
}

/**
 * Convert normalised pointer offsets from the card centre into a clamped tilt.
 *
 * `normX`/`normY` are pointer offsets from the card centre, normally in the
 * range [-1, 1] (left/top edge = -1, right/bottom edge = +1), but values beyond
 * that range are accepted: each is multiplied by its max and then clamped, so
 * the result is always within [-maxX, +maxX] / [-maxY, +maxY].
 *
 * @param normX normalised X offset from centre (typically [-1, 1])
 * @param normY normalised Y offset from centre (typically [-1, 1])
 * @param maxX maximum X magnitude (default 8)
 * @param maxY maximum Y magnitude (default 6)
 * @returns clamped tilt in degrees
 *
 * `NaN` inputs clamp to `0`.
 */
export function pointerToTilt(
  normX: number,
  normY: number,
  maxX: number = DEFAULT_MAX_TILT_X,
  maxY: number = DEFAULT_MAX_TILT_Y,
): Tilt {
  // NaN-safe: NaN * anything is NaN, which clampTilt resolves to 0.
  return clampTilt(normX * maxX, normY * maxY, maxX, maxY);
}
