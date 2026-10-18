import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import fc from 'fast-check'
import React, { type ReactElement } from 'react'
import {
  KpiCardSkeleton,
  PerformanceScoreSkeleton,
  SocialAccountCardSkeleton,
  NotificationCardSkeleton,
  FormSkeleton,
  ChartSkeleton,
  TableSkeleton,
  ConversationListItemSkeleton,
  PostCardSkeleton,
  BestTimeWidgetSkeleton,
  SidebarSkeleton,
  HeaderSkeleton,
  ChatBubbleSkeleton,
} from '../index'

/**
 * The shared Component_Skeleton library, each with its root element's
 * data-testid and a factory that builds the element from bounded props.
 *
 * `props` is the arbitrary used to generate the bounded props for that skeleton
 * (empty record for prop-less skeletons).
 */
interface SkeletonCase {
  name: string
  testId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: fc.Arbitrary<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (props: any) => ReactElement
}

const CASES: SkeletonCase[] = [
  {
    name: 'KpiCardSkeleton',
    testId: 'kpi-card-skeleton',
    props: fc.constant({}),
    build: () => <KpiCardSkeleton />,
  },
  {
    name: 'PerformanceScoreSkeleton',
    testId: 'performance-score-skeleton',
    props: fc.constant({}),
    build: () => <PerformanceScoreSkeleton />,
  },
  {
    name: 'SocialAccountCardSkeleton',
    testId: 'social-account-card-skeleton',
    props: fc.constant({}),
    build: () => <SocialAccountCardSkeleton />,
  },
  {
    name: 'NotificationCardSkeleton',
    testId: 'notification-card-skeleton',
    props: fc.constant({}),
    build: () => <NotificationCardSkeleton />,
  },
  {
    name: 'FormSkeleton',
    testId: 'form-skeleton',
    // Include undefined plus a wide numeric range to exercise clampListCount.
    props: fc.record({
      fields: fc.option(fc.integer({ min: -5, max: 50 }), { nil: undefined }),
    }),
    build: ({ fields }) => <FormSkeleton fields={fields} />,
  },
  {
    name: 'ChartSkeleton',
    testId: 'chart-skeleton',
    props: fc.constant({}),
    build: () => <ChartSkeleton />,
  },
  {
    name: 'TableSkeleton',
    testId: 'table-skeleton',
    props: fc.record({
      rows: fc.option(fc.integer({ min: -5, max: 50 }), { nil: undefined }),
    }),
    build: ({ rows }) => <TableSkeleton rows={rows} />,
  },
  {
    name: 'ConversationListItemSkeleton',
    testId: 'conversation-list-item-skeleton',
    props: fc.constant({}),
    build: () => <ConversationListItemSkeleton />,
  },
  {
    name: 'PostCardSkeleton',
    testId: 'post-card-skeleton',
    props: fc.constant({}),
    build: () => <PostCardSkeleton />,
  },
  {
    name: 'BestTimeWidgetSkeleton',
    testId: 'best-time-widget-skeleton',
    props: fc.constant({}),
    build: () => <BestTimeWidgetSkeleton />,
  },
  {
    name: 'SidebarSkeleton',
    testId: 'sidebar-skeleton',
    props: fc.constant({}),
    build: () => <SidebarSkeleton />,
  },
  {
    name: 'HeaderSkeleton',
    testId: 'header-skeleton',
    props: fc.constant({}),
    build: () => <HeaderSkeleton />,
  },
  {
    name: 'ChatBubbleSkeleton',
    testId: 'chat-bubble-skeleton',
    props: fc.record({
      role: fc.constantFrom('user', 'assistant', undefined),
    }),
    build: ({ role }) => <ChatBubbleSkeleton role={role} />,
  },
]

/** Arbitrary that picks a case and matching bounded props for it. */
const caseWithPropsArb = fc
  .integer({ min: 0, max: CASES.length - 1 })
  .chain((idx) => {
    const c = CASES[idx]
    return c.props.map((props) => ({ c, props }))
  })

describe('Component skeletons — Property 13', () => {
  // Feature: pixel-perfect-skeleton-loading, Property 13: Component skeletons
  // are pure and deterministic.
  // Validates: Requirements 10.2
  it('produces identical serialized DOM across two independent renders for any props', () => {
    fc.assert(
      fc.property(caseWithPropsArb, ({ c, props }) => {
        // Two independent renders in separate containers.
        const first = render(c.build(props))
        const firstHtml = first.container.innerHTML
        cleanup()

        const second = render(c.build(props))
        const secondHtml = second.container.innerHTML
        cleanup()

        // Pure & deterministic: identical structure, ordering, and styling.
        expect(secondHtml).toBe(firstHtml)
      }),
      { numRuns: 100 },
    )
  })
})

describe('Component skeletons — Property 14', () => {
  // Feature: pixel-perfect-skeleton-loading, Property 14: Unmounting removes the
  // skeleton element and stops its animation.
  // Validates: Requirements 10.7
  it('removes the skeleton root element from the document after unmount', () => {
    fc.assert(
      fc.property(caseWithPropsArb, ({ c, props }) => {
        const { unmount } = render(c.build(props))

        // Mounted: the root element is present.
        const selector = `[data-testid="${c.testId}"]`
        expect(document.querySelector(selector)).not.toBeNull()

        unmount()

        // Unmounted: the root element (and therefore its animating placeholder
        // descendants) is gone from the document, so no shimmer runs for it.
        expect(document.querySelector(selector)).toBeNull()
        expect(document.querySelector('.vf-skeleton')).toBeNull()

        cleanup()
      }),
      { numRuns: 100 },
    )
  })
})
