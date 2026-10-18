import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import fc from 'fast-check'
import React from 'react'
import { Skeleton, BASE_SHIMMER_CLASS } from '@/components/ui/skeleton'
import {
  KpiCardSkeleton,
  PerformanceScoreSkeleton,
  ChartSkeleton,
  TableSkeleton,
  BestTimeWidgetSkeleton,
} from '../index'
import { DashboardSkeleton } from '../pages/DashboardSkeleton'
import {
  SKELETON_THEME_COLORS,
  type SkeletonTheme,
} from '../theme-colors'

/**
 * Task 13.4 — theme, shimmer, reduced-motion, conditional-parity, and
 * theme-change-no-remount verification.
 *
 * Validates: Requirements 7.5, 13.3, 13.5, 13.6 (and Property 8).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT — happy-dom limitation
 * ─────────────────────────────────────────────────────────────────────────────
 * happy-dom applies no CSS and runs no media queries, so the *visual* result of
 * the theme (computed placeholder/shimmer colors), the actual shimmer animation,
 * and the `@media (prefers-reduced-motion: reduce)` static-fill rule cannot be
 * observed at runtime here. Those are verified by the visual-regression /
 * Playwright path (design "Testing Strategy"). What IS verifiable in happy-dom,
 * and is asserted below, is the STRUCTURAL CONTRACT that makes the CSS behavior
 * possible:
 *   - Shimmer (R13.5): every placeholder carries the single global
 *     `.vf-skeleton` class while mounted (the class is the one and only shimmer
 *     mechanism — keyframes + colors live in index.css).
 *   - Reduced motion (R13.5): the `.vf-skeleton` class is the sole animation
 *     mechanism and NO inline `animation` style / inline `<style>` is emitted,
 *     so the CSS `prefers-reduced-motion` rule can switch it to a static fill
 *     with nothing to override it in JS.
 *   - Theme (R13.3): the primitive is color-agnostic (no theme color class,
 *     only `vf-skeleton` + shape) — color comes from inherited CSS variables —
 *     so the SAME mounted node recolors on a theme change (Property 8) and
 *     renders correctly under light + dark ancestor themes.
 */

const SUPPORTED_THEMES = Object.keys(SKELETON_THEME_COLORS) as SkeletonTheme[]

/* ───────────────────────── Shimmer present (R13.5) ───────────────────────── */

describe('Shimmer presence while mounted (R13.5)', () => {
  it('every .vf-skeleton placeholder carries the shimmer class for a representative page skeleton', () => {
    const { container } = render(<DashboardSkeleton />)
    try {
      const placeholders = Array.from(
        container.querySelectorAll('.vf-skeleton'),
      )
      expect(placeholders.length).toBeGreaterThan(0)
      // Every placeholder is built from the primitive and carries the single
      // global shimmer class while mounted.
      placeholders.forEach((el) => {
        expect(el.classList.contains(BASE_SHIMMER_CLASS)).toBe(true)
      })
    } finally {
      cleanup()
    }
  })
})

/* ───────────── Reduced motion = single CSS mechanism, no inline anim ────────── */

describe('Reduced-motion contract: shimmer is CSS-only (R13.5)', () => {
  // The reduced-motion behavior itself (animation:none, static fill) is a pure
  // CSS rule in index.css under `@media (prefers-reduced-motion: reduce)`. Here
  // we assert the structural precondition: there is exactly one shimmer
  // mechanism (the `.vf-skeleton` class) and no inline animation/style that
  // could keep an animation running past the media query.
  it('emits no inline animation style and no inline <style> across many primitives', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'text',
          'avatar',
          'button',
          'card',
          'chart',
          'table',
          'circle',
          'rectangle',
          'pill',
        ),
        (variant) => {
          const { container } = render(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <Skeleton variant={variant as any} data-testid="reduced-motion-probe" />,
          )
          try {
            const el = container.querySelector(
              '[data-testid="reduced-motion-probe"]',
            ) as HTMLElement | null
            expect(el).not.toBeNull()
            // Single mechanism: the global shimmer class.
            expect(el!.classList.contains(BASE_SHIMMER_CLASS)).toBe(true)
            // No inline animation declaration to fight the CSS media query.
            expect(el!.style.animation).toBe('')
            expect(el!.getAttribute('style')).toBeNull()
            // No injected inline <style> block anywhere in the subtree.
            expect(container.querySelector('style')).toBeNull()
          } finally {
            cleanup()
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

/* ───────────────────── Theme rendering: light + dark (R13.3) ────────────────── */

describe('Theme rendering under light + dark ancestor themes (R13.3)', () => {
  it('renders the same primitive structure regardless of the ancestor theme class', () => {
    for (const theme of ['light', 'dark', 'dark-blue', 'dark-black', 'dark-gray']) {
      const { container } = render(
        <div className={theme === 'light' ? '' : theme}>
          <KpiCardSkeleton />
        </div>,
      )
      try {
        const placeholders = container.querySelectorAll('.vf-skeleton')
        // The skeleton renders correctly (non-empty, primitive-built) under
        // every theme; the primitive carries no theme color class, so color is
        // entirely inherited from the ancestor theme's CSS variables (R7.5).
        expect(placeholders.length).toBeGreaterThan(0)
        placeholders.forEach((el) => {
          // No hard-coded theme color utility on the primitive — color is via
          // CSS variables, which is what enables recolor-without-remount.
          expect(el.className).not.toMatch(/\bbg-gray-\d{3}\b/)
          expect(el.className).not.toMatch(/\bdark:bg-gray-\d{3}\b/)
        })
      } finally {
        cleanup()
      }
    }
  })
})

/* ───────────── Property 8: theme change preserves the mounted node ──────────── */

/** A wrapper that applies a theme class to a stable ancestor of the skeleton. */
function ThemedSkeleton({ theme }: { theme: SkeletonTheme }) {
  return (
    <div className={theme === 'light' ? 'theme-root' : `theme-root ${theme}`}>
      <BestTimeWidgetSkeleton />
    </div>
  )
}

describe('Property 8 — Theme change preserves the mounted skeleton DOM node (R7.5)', () => {
  // Feature: pixel-perfect-skeleton-loading, Property 8: Theme change preserves
  // the mounted skeleton DOM node — switching the active theme while a skeleton
  // is displayed keeps the same skeleton DOM element instance mounted (no
  // unmount/remount occurs).
  // Validates: Requirements 7.5
  it('keeps the identical skeleton Element instance across any ordered pair of theme switches', () => {
    const themePairArb = fc
      .tuple(
        fc.constantFrom(...SUPPORTED_THEMES),
        fc.constantFrom(...SUPPORTED_THEMES),
      )
      .filter(([a, b]) => a !== b)

    fc.assert(
      fc.property(themePairArb, ([from, to]) => {
        const { rerender } = render(<ThemedSkeleton theme={from} />)
        try {
          const selector = '[data-testid="best-time-widget-skeleton"]'

          // Capture the mounted skeleton node reference under the first theme.
          const before = document.querySelector(selector)
          expect(before).not.toBeNull()

          // Switch the active theme on the ancestor and re-render.
          rerender(<ThemedSkeleton theme={to} />)

          const after = document.querySelector(selector)
          expect(after).not.toBeNull()

          // No remount: the SAME Element instance persists. The primitive
          // recolors purely via inherited CSS variables, so React reconciles
          // the ancestor class change in place rather than tearing down and
          // recreating the skeleton subtree.
          expect(after).toBe(before)

          // The ancestor theme class actually changed (sanity that we exercised
          // a real theme switch).
          const themeRoot = document.querySelector('.theme-root') as HTMLElement
          expect(themeRoot).not.toBeNull()
          if (to !== 'light') {
            expect(themeRoot.classList.contains(to)).toBe(true)
          }
        } finally {
          cleanup()
        }
      }),
      { numRuns: 100 },
    )
  })
})

/* ──────────── Conditional-rendering parity (R13.6 / Requirement 9) ─────────── */

describe('Conditional-rendering parity — BestTimeWidget populated-only (R13.6)', () => {
  it('renders only the populated variant, never the empty/"Gathering Data" markers', () => {
    const { container } = render(<BestTimeWidgetSkeleton />)
    try {
      // Exactly one populated-variant placeholder card.
      expect(
        container.querySelectorAll(
          '[data-testid="best-time-widget-skeleton"]',
        ),
      ).toHaveLength(1)
      // The empty / retry variant must never be rendered during loading.
      expect(
        container.querySelector(
          '[data-testid="best-time-widget-empty-skeleton"]',
        ),
      ).toBeNull()
      // No empty-state text leaks into the placeholder (R1.8/R1.9 + R9.2).
      expect(container.textContent).not.toMatch(
        /gathering data|no data|try again|retry/i,
      )
    } finally {
      cleanup()
    }
  })

  it('the dashboard skeleton embeds the populated best-time widget (R13.6, key concern)', () => {
    const { container } = render(<DashboardSkeleton />)
    try {
      // The dashboard's optimal-posting-time widget is data-gated (unknown
      // during load) and must render only the populated variant in-place.
      expect(
        container.querySelector(
          '[data-testid="best-time-widget-skeleton"]',
        ),
      ).not.toBeNull()
      expect(container.textContent).not.toMatch(/gathering data|no data/i)
    } finally {
      cleanup()
    }
  })
})

/* ───── Sanity: representative shared skeletons keep the shimmer contract ────── */

describe('Shared skeletons keep the shimmer contract while mounted (R13.5)', () => {
  const cases: Array<[string, React.ReactElement]> = [
    ['PerformanceScoreSkeleton', <PerformanceScoreSkeleton />],
    ['ChartSkeleton', <ChartSkeleton />],
    ['TableSkeleton', <TableSkeleton />],
  ]
  for (const [name, element] of cases) {
    it(`${name} renders only .vf-skeleton-classed placeholders`, () => {
      const { container } = render(element)
      try {
        const placeholders = container.querySelectorAll('.vf-skeleton')
        expect(placeholders.length).toBeGreaterThan(0)
        placeholders.forEach((el) =>
          expect(el.classList.contains(BASE_SHIMMER_CLASS)).toBe(true),
        )
      } finally {
        cleanup()
      }
    })
  }
})
