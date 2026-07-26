/**
 * Veefore New Landing Page — Colour Guard
 *
 * Pure, dependency-free, DOM-free helpers that enforce the Colour_System and
 * the zero-purple constraint (Requirements 4.1, 4.2 / Correctness Property 1).
 *
 * The `COLORS` palette in `./colors` is the single source of truth. These
 * helpers answer two questions about any colour or arbitrary style string:
 *   1. Is this colour part of the approved palette? (`isInPalette`)
 *   2. Does this colour resolve to a purple hue? (`isPurpleHue`)
 * and provide an assertion (`assertNoPurple`) used by tests/dev guards to fail
 * loudly if any purple sneaks into a gradient/style string.
 *
 * @see design.md — "Colour system + zero-purple enforcement", Correctness Property 1
 */

import { COLORS } from './colors';

/**
 * Purple hue band, in degrees on the HSL colour wheel.
 *
 * Why 270–320?
 * - Purple / violet / magenta live roughly between blue (240°) and pink (330°).
 * - The brand rose `#FF2D7A` resolves to hue ~338°, so any upper bound below
 *   ~325° guarantees rose is NOT mis-classified as purple. We use 320° to keep
 *   a safe margin away from rose and the coral/pink family above it.
 * - The lower bound of 270° sits just above pure blue-violet so we flag true
 *   purples (e.g. `#A020F0` ~277°) and magenta (`#FF00FF` 300°) while leaving
 *   the blue/cyan family (`#00D4FF` ~190°) untouched.
 * - Saturation and lightness gates below ensure near-black, near-white, and
 *   greyish colours in this hue range are not flagged (they read as neutral,
 *   not purple).
 */
const PURPLE_HUE_MIN = 270;
const PURPLE_HUE_MAX = 320;

/** Minimum saturation for a hue to read as a meaningful, non-grey colour. */
const MIN_SATURATION = 0.15;
/** Lightness must sit away from pure black / pure white to read as a colour. */
const MIN_LIGHTNESS = 0.1;
const MAX_LIGHTNESS = 0.95;

/** Matches a `#rgb` or `#rrggbb` hex colour token. */
const HEX_COLOR_PATTERN = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;

/**
 * Normalise a hex colour string: trim whitespace, lowercase, and expand a
 * 3-digit shorthand (`#abc`) to its 6-digit form (`#aabbcc`).
 *
 * Non-hex input is returned trimmed + lowercased unchanged (callers that need
 * validity should use {@link isInPalette} / {@link isPurpleHue}).
 */
export function normalizeHex(color: string): string {
  const trimmed = color.trim().toLowerCase();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(trimmed);
  if (!match) {
    return trimmed;
  }
  const hex = match[1];
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return `#${hex}`;
}

/** Set of normalised palette hex values for O(1) membership checks. */
const PALETTE_SET = new Set<string>(
  Object.values(COLORS).map((value) => normalizeHex(value)),
);

/**
 * True if the given colour, once normalised, matches any hex value in the
 * Colour_System palette.
 */
export function isInPalette(color: string): boolean {
  return PALETTE_SET.has(normalizeHex(color));
}

/**
 * Parse a normalised 6-digit hex string into `[r, g, b]` channels in 0..255,
 * or `null` when the input is not a valid hex colour.
 */
function hexToRgb(color: string): [number, number, number] | null {
  const normalized = normalizeHex(color);
  if (!/^#[0-9a-f]{6}$/.test(normalized)) {
    return null;
  }
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return [r, g, b];
}

/** Convert `[r, g, b]` (0..255) to HSL with hue in degrees, s/l in 0..1. */
function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

/**
 * True if a hex colour resolves to a purple / violet / magenta hue.
 *
 * Returns `false` gracefully for any non-hex string. The brand rose
 * `#FF2D7A` (hue ~338°) is intentionally NOT classified as purple — see the
 * {@link PURPLE_HUE_MIN}/{@link PURPLE_HUE_MAX} band documentation.
 */
export function isPurpleHue(color: string): boolean {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return false;
  }
  const { h, s, l } = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  if (s < MIN_SATURATION || l < MIN_LIGHTNESS || l > MAX_LIGHTNESS) {
    return false;
  }
  return h >= PURPLE_HUE_MIN && h <= PURPLE_HUE_MAX;
}

/**
 * Extract every `#rgb` / `#rrggbb` hex colour substring from an arbitrary
 * CSS / gradient / inline-style string, returned in order of appearance.
 */
export function extractHexColors(styleString: string): string[] {
  const matches = styleString.match(HEX_COLOR_PATTERN);
  return matches ? [...matches] : [];
}

/**
 * Throw if any hex colour found in the style string resolves to a purple hue.
 * Used by tests/dev guards to enforce the zero-purple constraint (Req 4.2).
 */
export function assertNoPurple(styleString: string): void {
  const offenders = extractHexColors(styleString).filter((color) =>
    isPurpleHue(color),
  );
  if (offenders.length > 0) {
    throw new Error(
      `Zero-purple constraint violated: purple hue(s) detected in style string: ${offenders.join(', ')}`,
    );
  }
}
