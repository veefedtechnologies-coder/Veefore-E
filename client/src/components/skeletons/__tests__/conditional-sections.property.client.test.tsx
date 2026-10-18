import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import fc from 'fast-check'
import React from 'react'
import {
  shouldRenderSection,
  resolveConditionalSection,
  type ConditionalKnowledge,
} from '../render-state'
import { BestTimeWidgetSkeleton } from '../BestTimeWidgetSkeleton'
import { KpiCardSkeleton } from '../KpiCardSkeleton'
import { ChartSkeleton } from '../ChartSkeleton'

/** The three section ids used by the representative composed skeleton. */
const SECTION_IDS = ['kpi', 'bestTime', 'chart'] as const
type SectionId = (typeof SECTION_IDS)[number]

/**
 * Representative composed skeleton (a dashboard-style section group) that gates
 * each section by its ConditionalKnowledge. Known-absent sections are omitted
 * entirely (no wrapper node, no grid/flex slot); other sections render the
 * populated-variant placeholder (R9.1, R9.2).
 */
function ComposedSectionGroup({
  knowledge,
}: {
  knowledge: Record<SectionId, ConditionalKnowledge>
}) {
  return (
    <div data-testid="section-group" className="grid grid-cols-1 gap-6">
      {shouldRenderSection(knowledge.kpi) && (
        <div data-testid="section-kpi">
          <KpiCardSkeleton />
        </div>
      )}
      {shouldRenderSection(knowledge.bestTime) && (
        <div data-testid="section-bestTime">
          <BestTimeWidgetSkeleton />
        </div>
      )}
      {shouldRenderSection(knowledge.chart) && (
        <div data-testid="section-chart">
          <ChartSkeleton />
        </div>
      )}
    </div>
  )
}

/** Arbitrary for a single section's conditional knowledge. */
const knowledgeArb: fc.Arbitrary<ConditionalKnowledge> = fc.constantFrom(
  { kind: 'known-absent' } as const,
  { kind: 'known-present' } as const,
  { kind: 'unknown' } as const,
)

const knowledgeMapArb = fc.record({
  kpi: knowledgeArb,
  bestTime: knowledgeArb,
  chart: knowledgeArb,
})

describe('Conditional sections — Property 9', () => {
  // Feature: pixel-perfect-skeleton-loading, Property 9: Known-absent
  // conditional sections are omitted with no reserved space.
  // Validates: Requirements 9.1
  it('renders zero placeholder nodes and reserves no slot for known-absent sections', () => {
    fc.assert(
      fc.property(knowledgeMapArb, (knowledge) => {
        const { container } = render(
          <ComposedSectionGroup knowledge={knowledge} />,
        )
        try {
          for (const id of SECTION_IDS) {
            const sectionNode = container.querySelector(
              `[data-testid="section-${id}"]`,
            )
            if (knowledge[id].kind === 'known-absent') {
              // Pure-logic contract: known-absent -> omit.
              expect(resolveConditionalSection(knowledge[id])).toBe('omit')
              expect(shouldRenderSection(knowledge[id])).toBe(false)
              // DOM contract: no wrapper node, hence no reserved grid/flex slot.
              expect(sectionNode).toBeNull()
            } else {
              expect(sectionNode).not.toBeNull()
            }
          }

          // The number of rendered section slots equals the number of
          // non-absent sections — absent sections reserve nothing.
          const expectedRendered = SECTION_IDS.filter(
            (id) => knowledge[id].kind !== 'known-absent',
          ).length
          const group = container.querySelector(
            '[data-testid="section-group"]',
          )
          expect(group?.children.length).toBe(expectedRendered)
        } finally {
          cleanup()
        }
      }),
      { numRuns: 100 },
    )
  })
})

describe('Conditional sections — Property 10', () => {
  // Feature: pixel-perfect-skeleton-loading, Property 10: Unknown conditional
  // sections render only the populated variant.
  // Validates: Requirements 9.2
  it('renders exactly the populated-variant placeholder for unknown sections and no empty-variant markers', () => {
    fc.assert(
      fc.property(fc.constant({ kind: 'unknown' } as const), (knowledge) => {
        // Pure-logic contract: unknown -> render-populated.
        expect(resolveConditionalSection(knowledge)).toBe('render-populated')

        const { container } = render(<BestTimeWidgetSkeleton />)
        try {
          // Exactly one populated-variant placeholder renders.
          const populated = container.querySelectorAll(
            '[data-testid="best-time-widget-skeleton"]',
          )
          expect(populated).toHaveLength(1)

          // The empty / "Gathering Data" variant must never appear, and no
          // duplicate variants are rendered simultaneously.
          expect(
            container.querySelector(
              '[data-testid="best-time-widget-empty-skeleton"]',
            ),
          ).toBeNull()
          expect(container.textContent).not.toMatch(/gathering data|no data/i)
        } finally {
          cleanup()
        }
      }),
      { numRuns: 100 },
    )
  })
})
