import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import React from 'react'

import { PostCardSkeleton } from '../PostCardSkeleton'
import { KpiCardSkeleton } from '../KpiCardSkeleton'
import { ChartSkeleton } from '../ChartSkeleton'
import { PlanSkeleton } from '../pages/PlanSkeleton'

/**
 * Structural zero-layout-shift CONTRACT proxy — pixel-perfect-skeleton-loading
 * task 13.5 (runnable companion to the Playwright harness in
 * `tests/e2e/skeleton-cls.pw.ts`).
 *
 * Validates: Requirements 8.1, 8.4, 8.5, 13.4 — via the design's actual
 * zero-layout-shift MECHANISM (R8.2 same grid/flex slot, R8.3 identical reserved
 * fixed dimensions for media/charts).
 *
 * WHY A PROXY?
 * ------------
 * Route-level CLS can only be measured by a real layout engine emitting
 * `layout-shift` performance entries; `happy-dom` performs no layout, so the
 * authenticated browser run lives in the gated Playwright harness. What IS
 * checkable here without a browser is the structural reason CLS stays ≤ 0.1:
 * every skeleton reserves the SAME fixed dimensions and the SAME wrapper as the
 * final component it swaps to. If those match, the swap moves nothing.
 *
 * This test asserts that contract two ways:
 *   (A) The rendered skeleton DOM actually carries the fixed-dimension utility
 *       class on the reserved media/chart/grid slot.
 *   (B) The final component's source reserves the IDENTICAL token, so the swap
 *       target occupies the same space (R8.3) — verified pairs only.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
// __tests__ → skeletons → components → src → client → <repo root>
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..')

function readSource(relFromRepo: string): string {
  return readFileSync(resolve(REPO_ROOT, relFromRepo), 'utf8')
}

/**
 * Verified parity pairs: a fixed dimension / wrapper token that MUST appear in
 * both the skeleton (the reserved slot) and at least one final component it
 * swaps to. These tokens were confirmed present in both sources at authoring
 * time; the test fails if either side drifts (which would reintroduce CLS risk).
 */
interface ParityPair {
  label: string
  token: string
  skeletonFile: string
  finalFiles: string[]
}

const PARITY_PAIRS: ParityPair[] = [
  {
    label: 'PostCard media slot reserves aspect-[4/5]',
    token: 'aspect-[4/5]',
    skeletonFile: 'client/src/components/skeletons/PostCardSkeleton.tsx',
    finalFiles: [
      'client/src/pages/ScheduledPostsPage.tsx',
      'client/src/pages/PublishedPostsPage.tsx',
      'client/src/pages/DraftsPage.tsx',
    ],
  },
  {
    label: 'PostAnalytics media slot reserves aspect-[4/5]',
    token: 'aspect-[4/5]',
    skeletonFile: 'client/src/components/skeletons/pages/PostAnalyticsSkeleton.tsx',
    finalFiles: ['client/src/pages/PostAnalyticsPage.tsx'],
  },
  {
    label: 'KPI / quick-action card reserves min-h-[200px]',
    token: 'min-h-[200px]',
    skeletonFile: 'client/src/components/skeletons/KpiCardSkeleton.tsx',
    finalFiles: ['client/src/components/dashboard/quick-actions.tsx'],
  },
  {
    label: 'Calendar body reserves a 7-column grid',
    token: 'grid-cols-7',
    skeletonFile: 'client/src/components/skeletons/pages/PlanSkeleton.tsx',
    finalFiles: ['client/src/components/calendar/calendar-view.tsx'],
  },
  {
    label: 'Calendar body reserves min-h-[600px]',
    token: 'min-h-[600px]',
    skeletonFile: 'client/src/components/skeletons/pages/PlanSkeleton.tsx',
    finalFiles: ['client/src/components/calendar/calendar-view.tsx'],
  },
  {
    label: 'Social-listening trend chart card reserves h-[380px]',
    token: 'h-[380px]',
    skeletonFile: 'client/src/components/skeletons/pages/SocialListeningSkeleton.tsx',
    finalFiles: ['client/src/pages/SocialListeningPage.tsx'],
  },
  {
    label: 'Social-listening mood chart card reserves h-[300px]',
    token: 'h-[300px]',
    skeletonFile: 'client/src/components/skeletons/pages/SocialListeningSkeleton.tsx',
    finalFiles: ['client/src/pages/SocialListeningPage.tsx'],
  },
]

describe('Skeleton zero-layout-shift structural contract (R8.2, R8.3, R8.4, R13.4)', () => {
  describe('(B) source-level fixed-dimension parity: skeleton slot === swap target', () => {
    for (const pair of PARITY_PAIRS) {
      it(`${pair.label} — present in skeleton and ${pair.finalFiles.length} final component(s)`, () => {
        const skeletonSrc = readSource(pair.skeletonFile)
        expect(
          skeletonSrc.includes(pair.token),
          `skeleton ${pair.skeletonFile} must reserve "${pair.token}"`,
        ).toBe(true)

        // Every listed swap target reserves the IDENTICAL token, so the
        // skeleton→content swap occupies the same space (no shift).
        for (const finalFile of pair.finalFiles) {
          const finalSrc = readSource(finalFile)
          expect(
            finalSrc.includes(pair.token),
            `final ${finalFile} must reserve the same "${pair.token}" as its skeleton`,
          ).toBe(true)
        }
      })
    }
  })

  describe('(A) rendered skeletons actually carry the reserved fixed-dimension class', () => {
    it('PostCardSkeleton renders an aspect-[4/5] media slot', () => {
      const { getByTestId } = render(<PostCardSkeleton />)
      expect(getByTestId('post-card-skeleton').querySelector('.aspect-\\[4\\/5\\]')).not.toBeNull()
    })

    it('KpiCardSkeleton renders a min-h-[200px] container', () => {
      const { getByTestId } = render(<KpiCardSkeleton />)
      expect(getByTestId('kpi-card-skeleton').className).toContain('min-h-[200px]')
    })

    it('ChartSkeleton reserves a fixed-height plot area (h-[280px])', () => {
      const { getByTestId } = render(<ChartSkeleton />)
      expect(getByTestId('chart-skeleton').querySelector('.h-\\[280px\\]')).not.toBeNull()
    })

    it('PlanSkeleton renders a 7-column min-h-[600px] calendar body', () => {
      const { getByTestId } = render(<PlanSkeleton />)
      const root = getByTestId('plan-skeleton')
      const body = root.querySelector('.grid-cols-7.min-h-\\[600px\\]')
      expect(body, 'calendar body must reserve the same grid + min height as the real calendar').not.toBeNull()
    })
  })
})
