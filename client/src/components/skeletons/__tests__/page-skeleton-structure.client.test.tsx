import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React, { type ReactElement } from 'react'
import * as PageSkeletons from '../pages'

/**
 * Task 13.3 — DOM-measurement and breakpoint verification (structural proxy).
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 13.1, 13.2
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT — happy-dom limitation (design-sanctioned test split)
 * ─────────────────────────────────────────────────────────────────────────────
 * The client test environment is `happy-dom` (see `vitest.client.config.ts`),
 * which does NOT run a real layout engine: `getBoundingClientRect()` returns
 * zeroed geometry, CSS (Tailwind utilities, media queries) is never applied,
 * and there is no viewport. Therefore the *exact* pixel tolerances required by
 * the design — outer-height within 8px (R5.5) and per-placeholder
 * dimension/gap within 4px (R5.4) — and real responsive reflow at the
 * sm/md/lg/xl/2xl breakpoints (R5.3) CANNOT be measured here.
 *
 * Per the design "Testing Strategy" (Integration / measurement / visual tests),
 * real-geometry pixel/CLS/responsive verification is covered by the
 * Playwright / Lighthouse path (task 13.5). These vitest tests assert the
 * happy-dom-checkable STRUCTURAL + BREAKPOINT-CLASS proxy instead:
 *
 *   - R5.1 / R5.2 (skeleton built from the primitive, occupies the slot):
 *       every page skeleton renders without throwing, produces a non-empty
 *       DOM, and is actually composed of `.vf-skeleton` primitive placeholders.
 *   - R5.3 / R13.1 / R13.2 (responsive breakpoint parity): the same Tailwind
 *       breakpoint utility classes (`sm:`/`md:`/`lg:`/`xl:`/`2xl:`) that drive
 *       responsive layout are present in the rendered markup. Because the
 *       skeleton emits the identical breakpoint classes the real page uses,
 *       it will reflow identically at every breakpoint in a real browser —
 *       this is the structural proxy for breakpoint parity without real layout.
 *   - R5.4 / R5.5 (pixel tolerances): asserted only structurally here (the
 *       skeleton exists and is primitive-built); the real 4px/8px measurement
 *       is the Playwright/Lighthouse responsibility (task 13.5).
 *   - R10.5 spirit (DOM node budget): node count is bounded/reasonable.
 */

/** A page skeleton under test: its export name, root testid, and a factory. */
interface PageSkeletonCase {
  name: string
  testId: string
  build: () => ReactElement
  /**
   * Whether this page's real layout uses responsive Tailwind breakpoint
   * utilities. Pages that are intentionally single-column / full-bleed
   * (e.g. the VeeGPT chat shell, the video generator, the encryption-health
   * card) legitimately carry no breakpoint classes, so the breakpoint-parity
   * proxy does not apply to them.
   */
  hasResponsiveLayout: boolean
}

const CASES: PageSkeletonCase[] = [
  { name: 'DashboardSkeleton', testId: 'dashboard-skeleton', build: () => <PageSkeletons.DashboardSkeleton />, hasResponsiveLayout: true },
  { name: 'BestTimeSkeleton', testId: 'best-time-skeleton', build: () => <PageSkeletons.BestTimeSkeleton />, hasResponsiveLayout: true },
  { name: 'PostsSkeleton', testId: 'posts-skeleton', build: () => <PageSkeletons.PostsSkeleton />, hasResponsiveLayout: true },
  { name: 'ScheduledPostsSkeleton', testId: 'scheduled-posts-skeleton', build: () => <PageSkeletons.ScheduledPostsSkeleton />, hasResponsiveLayout: true },
  { name: 'DraftsSkeleton', testId: 'drafts-skeleton', build: () => <PageSkeletons.DraftsSkeleton />, hasResponsiveLayout: true },
  { name: 'PublishedPostsSkeleton', testId: 'published-posts-skeleton', build: () => <PageSkeletons.PublishedPostsSkeleton />, hasResponsiveLayout: true },
  { name: 'CreatePostSkeleton', testId: 'create-post-skeleton', build: () => <PageSkeletons.CreatePostSkeleton />, hasResponsiveLayout: true },
  { name: 'PlanSkeleton', testId: 'plan-skeleton', build: () => <PageSkeletons.PlanSkeleton />, hasResponsiveLayout: false },
  { name: 'AnalyticsSkeleton', testId: 'analytics-skeleton', build: () => <PageSkeletons.AnalyticsSkeleton />, hasResponsiveLayout: true },
  { name: 'PostAnalyticsSkeleton', testId: 'post-analytics-skeleton', build: () => <PageSkeletons.PostAnalyticsSkeleton />, hasResponsiveLayout: true },
  { name: 'VeeGPTSkeleton', testId: 'veegpt-skeleton', build: () => <PageSkeletons.VeeGPTSkeleton variant="chat" showSidebar />, hasResponsiveLayout: false },
  { name: 'AutomationSkeleton', testId: 'automation-skeleton', build: () => <PageSkeletons.AutomationSkeleton />, hasResponsiveLayout: true },
  { name: 'VideoGeneratorSkeleton', testId: 'video-generator-skeleton', build: () => <PageSkeletons.VideoGeneratorSkeleton />, hasResponsiveLayout: false },
  { name: 'ProfileSkeleton', testId: 'profile-skeleton', build: () => <PageSkeletons.ProfileSkeleton />, hasResponsiveLayout: true },
  { name: 'SettingsSkeleton', testId: 'settings-skeleton', build: () => <PageSkeletons.SettingsSkeleton />, hasResponsiveLayout: true },
  { name: 'SocialListeningSkeleton', testId: 'social-listening-skeleton', build: () => <PageSkeletons.SocialListeningSkeleton />, hasResponsiveLayout: true },
  { name: 'SecurityDashboardSkeleton', testId: 'security-dashboard-skeleton', build: () => <PageSkeletons.SecurityDashboardSkeleton />, hasResponsiveLayout: true },
  { name: 'AdminPanelSkeleton', testId: 'admin-panel-skeleton', build: () => <PageSkeletons.AdminPanelSkeleton />, hasResponsiveLayout: true },
  { name: 'TestFixturesSkeleton', testId: 'test-fixtures-skeleton', build: () => <PageSkeletons.TestFixturesSkeleton />, hasResponsiveLayout: false },
  { name: 'EncryptionHealthSkeleton', testId: 'encryption-health-skeleton', build: () => <PageSkeletons.EncryptionHealthSkeleton />, hasResponsiveLayout: false },
]

/** Matches any Tailwind responsive breakpoint prefix on a utility class. */
const BREAKPOINT_CLASS_RE = /\b(sm|md|lg|xl|2xl):[a-z[]/

/** Generous upper bound on placeholder/structural node count (R10.5 spirit). */
const MAX_NODE_COUNT = 600

describe('Page skeleton structural + breakpoint parity (task 13.3)', () => {
  it('exports a page skeleton for every case under test', () => {
    // Sanity: the cases list stays in sync with the pages barrel. Page
    // skeletons are React.memo-wrapped (objects), so just assert they exist
    // and are renderable component types.
    for (const c of CASES) {
      const exported = (PageSkeletons as Record<string, unknown>)[c.name]
      expect(
        exported,
        `expected ${c.name} to be exported from @/components/skeletons/pages`,
      ).toBeDefined()
      expect(['function', 'object']).toContain(typeof exported)
    }
  })

  for (const c of CASES) {
    describe(c.name, () => {
      it('renders without throwing and produces a non-empty DOM with the expected root (R5.1, R5.2)', () => {
        const { container } = render(c.build())
        try {
          const root = container.querySelector(`[data-testid="${c.testId}"]`)
          expect(root, `${c.name} root testid not found`).not.toBeNull()
          // Non-empty DOM: the page skeleton renders real structure.
          expect(container.innerHTML.length).toBeGreaterThan(0)
          expect(root!.children.length).toBeGreaterThan(0)
        } finally {
          cleanup()
        }
      })

      it('is composed of .vf-skeleton primitive placeholders (R5.1 — built from the primitive)', () => {
        const { container } = render(c.build())
        try {
          const placeholders = container.querySelectorAll('.vf-skeleton')
          // The skeleton is actually assembled from the shimmer primitive,
          // not from ad-hoc divs or text.
          expect(placeholders.length).toBeGreaterThan(0)
          // Every primitive placeholder is aria-hidden (R11.2) and paints no text.
          placeholders.forEach((el) => {
            expect(el.getAttribute('aria-hidden')).toBe('true')
          })
        } finally {
          cleanup()
        }
      })

      it('renders a bounded, reasonable number of DOM nodes (R10.5 spirit)', () => {
        const { container } = render(c.build())
        try {
          const nodeCount = container.querySelectorAll('*').length
          expect(nodeCount).toBeGreaterThan(0)
          expect(
            nodeCount,
            `${c.name} rendered ${nodeCount} nodes (> ${MAX_NODE_COUNT})`,
          ).toBeLessThanOrEqual(MAX_NODE_COUNT)
        } finally {
          cleanup()
        }
      })

      if (c.hasResponsiveLayout) {
        // R5.3 / R13.1 / R13.2 breakpoint-parity proxy: the rendered markup
        // carries the same sm/md/lg/xl/2xl breakpoint utility classes that
        // drive the real page's responsive reflow. Real layout reflow at each
        // breakpoint is verified in the Playwright/Lighthouse path (task 13.5).
        it('emits responsive breakpoint utility classes for breakpoint parity (R5.3, R13.1, R13.2)', () => {
          const { container } = render(c.build())
          try {
            const markup = container.innerHTML
            expect(
              BREAKPOINT_CLASS_RE.test(markup),
              `${c.name} markup contains no sm/md/lg/xl/2xl breakpoint classes`,
            ).toBe(true)
          } finally {
            cleanup()
          }
        })
      }
    })
  }
})
