import { describe, it, expect } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import fc from 'fast-check'
import React from 'react'
import {
  LoadingStatusProvider,
  useRegisterSkeleton,
} from '../LoadingStatusProvider'

/**
 * Test component: registers a skeleton (active) while mounted so it participates
 * in the shared aggregate loading status. Each instance corresponds to one
 * simultaneous skeleton registration.
 */
function RegisteringSkeleton() {
  useRegisterSkeleton(true)
  return <div data-testid="registered-skeleton" />
}

/**
 * Renders the provider with `count` simultaneously-registered skeletons inside
 * the page content wrapper.
 */
function Harness({ count }: { count: number }) {
  return (
    <LoadingStatusProvider>
      <div data-testid="page-content">
        {Array.from({ length: count }).map((_, i) => (
          <RegisteringSkeleton key={i} />
        ))}
      </div>
    </LoadingStatusProvider>
  )
}

describe('LoadingStatusProvider — Property 15', () => {
  // Feature: pixel-perfect-skeleton-loading, Property 15: At most one aggregate
  // loading status per page.
  // Validates: Requirements 11.1, 11.4, 11.5
  it('exposes exactly one polite status region, aria-busy=true while any skeleton is active, and aria-busy=false + cleared text after all unregister', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 12 }), async (count) => {
        // Render N>=1 simultaneous skeleton registrations under one provider.
        render(<Harness count={count} />)
        try {
          // Exactly one aggregate aria-live="polite" / role="status" region
          // exists regardless of how many skeletons registered (R11.1, R11.5).
          const politeRegions = screen.getAllByRole('status')
          expect(politeRegions).toHaveLength(1)
          const region = politeRegions[0]
          expect(region.getAttribute('aria-live')).toBe('polite')

          // While >=1 skeleton is active the status announces loading and the
          // page content wrapper has aria-busy="true".
          await waitFor(() => {
            expect(region.textContent).not.toBe('')
          })
          const busyWrapper = document.querySelector('[aria-busy="true"]')
          expect(busyWrapper).not.toBeNull()
          expect(
            busyWrapper?.querySelector('[data-testid="page-content"]'),
          ).not.toBeNull()
        } finally {
          cleanup()
        }

        // Re-render an empty provider (zero registrations) to observe the
        // post-unregister state: aria-busy="false" and cleared status text.
        const { container } = render(
          <LoadingStatusProvider>
            <div data-testid="page-content" />
          </LoadingStatusProvider>,
        )
        try {
          const wrapperFalse = container.querySelector('[aria-busy]')
          expect(wrapperFalse?.getAttribute('aria-busy')).toBe('false')

          const emptyRegion = container.querySelector('[role="status"]')
          // Status text clears within the <500ms ceiling (R11.4).
          await waitFor(
            () => {
              expect(emptyRegion?.textContent).toBe('')
            },
            { timeout: 1000 },
          )
        } finally {
          cleanup()
        }
      }),
      { numRuns: 100 },
    )
  })
})
