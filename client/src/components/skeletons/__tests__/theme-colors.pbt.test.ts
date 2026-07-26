import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  SKELETON_THEME_COLORS,
  LIGHT_SKELETON_COLORS,
  resolveSkeletonThemeColors,
  type RgbTriplet,
  type SkeletonTheme,
} from '../theme-colors';

/**
 * Property-based tests for the skeleton theme color table.
 *
 * Feature: pixel-perfect-skeleton-loading
 */

const THEMES: SkeletonTheme[] = [
  'light',
  'dark',
  'dark-blue',
  'dark-black',
  'dark-gray',
];

/**
 * WCAG relative luminance for an sRGB color.
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
function relativeLuminance([r, g, b]: RgbTriplet): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colors (always >= 1). */
function contrastRatio(a: RgbTriplet, b: RgbTriplet): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('theme-colors property-based tests', () => {
  // Feature: pixel-perfect-skeleton-loading, Property 6: Theme placeholder and shimmer colors meet contrast thresholds
  // Validates: Requirements 7.1, 7.2
  test('Property 6: theme placeholder and shimmer colors meet contrast thresholds', () => {
    fc.assert(
      fc.property(fc.constantFrom(...THEMES), (theme) => {
        const { base, highlight, background } = SKELETON_THEME_COLORS[theme];

        // R7.1: placeholder base distinguishable from the page background.
        const baseVsBackground = contrastRatio(base, background);
        expect(baseVsBackground).toBeGreaterThanOrEqual(1.2);

        // R7.2: shimmer highlight distinguishable from the base fill.
        const highlightVsBase = contrastRatio(highlight, base);
        expect(highlightVsBase).toBeGreaterThanOrEqual(1.1);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: pixel-perfect-skeleton-loading, Property 7: Unsupported theme resolves to light placeholder colors
  // Validates: Requirements 7.6
  test('Property 7: unsupported theme resolves to light placeholder colors', () => {
    const memberSet = new Set<string>(THEMES);

    fc.assert(
      fc.property(
        fc.string().filter((s) => !memberSet.has(s)),
        (unknownTheme) => {
          const resolved = resolveSkeletonThemeColors(unknownTheme);
          // Deep-equals the light entry (R7.6).
          expect(resolved).toEqual(LIGHT_SKELETON_COLORS);
        },
      ),
      { numRuns: 100 },
    );
  });
});
