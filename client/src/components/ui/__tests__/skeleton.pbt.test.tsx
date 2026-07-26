import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import '@testing-library/jest-dom';
import {
  Skeleton,
  SKELETON_VARIANTS,
  VARIANT_BASE_CLASS,
  BASE_SHIMMER_CLASS,
  normalizeVariant,
} from '../skeleton';

/**
 * Property-based tests for the variant-based Skeleton primitive.
 * Feature: pixel-perfect-skeleton-loading (design Correctness Properties 1–5).
 *
 * Each test is one fast-check property configured for a minimum of 100 runs.
 * Tests render with @testing-library/react and unmount per iteration to avoid
 * DOM leakage across runs.
 */

const NUM_RUNS = 100;

/** Split a className string into its individual class tokens. */
function classTokens(el: Element): string[] {
  return Array.from(el.classList);
}

describe('Skeleton primitive — property-based tests', () => {
  // Feature: pixel-perfect-skeleton-loading, Property 1: Supported variant applies its base shape class
  it('Property 1: supported variant applies its base shape class', () => {
    fc.assert(
      fc.property(fc.constantFrom(...SKELETON_VARIANTS), (variant) => {
        const { container, unmount } = render(<Skeleton variant={variant} />);
        try {
          const el = container.firstChild as HTMLElement;
          const tokens = classTokens(el);
          // Every base shape/border-radius class for this variant must be present.
          const baseClasses = VARIANT_BASE_CLASS[variant].split(/\s+/).filter(Boolean);
          for (const base of baseClasses) {
            expect(tokens).toContain(base);
          }
        } finally {
          unmount();
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: pixel-perfect-skeleton-loading, Property 2: Invalid variant falls back to rectangle and still renders a visible block
  it('Property 2: invalid variant falls back to rectangle and still renders a visible block', () => {
    const invalidVariant = fc
      .oneof(
        fc.string(),
        fc.integer(),
        fc.double(),
        fc.constant(null),
        fc.constant(undefined),
        fc.object(),
        fc.array(fc.anything()),
        fc.boolean()
      )
      // Exclude any value that is actually a supported variant string.
      .filter(
        (v) =>
          !(typeof v === 'string' && (SKELETON_VARIANTS as readonly string[]).includes(v))
      );

    fc.assert(
      fc.property(invalidVariant, (value) => {
        // normalizeVariant must collapse any non-member value to 'rectangle'.
        expect(normalizeVariant(value)).toBe('rectangle');

        const { container, unmount } = render(<Skeleton variant={value as never} />);
        try {
          const el = container.firstChild as HTMLElement;
          // A real, visible element exists.
          expect(el).toBeInstanceOf(HTMLElement);
          const tokens = classTokens(el);
          // Carries the rectangle base class(es) and the shimmer class.
          const rectangleBase = VARIANT_BASE_CLASS.rectangle.split(/\s+/).filter(Boolean);
          for (const base of rectangleBase) {
            expect(tokens).toContain(base);
          }
          expect(tokens).toContain(BASE_SHIMMER_CLASS);
        } finally {
          unmount();
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: pixel-perfect-skeleton-loading, Property 3: Custom className overrides variant base styling for conflicting properties
  it('Property 3: custom className overrides variant base styling for conflicting properties', () => {
    // Conflicting dimension / border-radius utilities supplied by the consumer.
    const customClassArb = fc.constantFrom('h-20', 'rounded-none', 'w-1/2');

    fc.assert(
      fc.property(
        fc.constantFrom(...SKELETON_VARIANTS),
        customClassArb,
        (variant, custom) => {
          const { container, unmount } = render(
            <Skeleton variant={variant} className={custom} />
          );
          try {
            const el = container.firstChild as HTMLElement;
            const tokens = classTokens(el);

            // Shimmer base class is always retained.
            expect(tokens).toContain(BASE_SHIMMER_CLASS);
            // The custom class wins (is present).
            expect(tokens).toContain(custom);

            // tailwind-merge last-wins: within the conflicting utility group, the
            // custom class must be the ONLY surviving token (no leftover base class
            // from the same group).
            const group = custom.startsWith('rounded')
              ? /^rounded/
              : custom.startsWith('h-')
                ? /^h-/
                : /^w-/;
            const survivingInGroup = tokens.filter((t) => group.test(t));
            expect(survivingInGroup).toEqual([custom]);
          } finally {
            unmount();
          }
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: pixel-perfect-skeleton-loading, Property 4: Primitive render invariants (shimmer class, aria-hidden, no inline animation)
  it('Property 4: primitive render invariants (shimmer class, aria-hidden, no inline animation)', () => {
    // Arbitrary, benign HTML props (id, data-*, title, role, tabIndex, and a
    // style object WITHOUT any animation declaration).
    const htmlPropsArb = fc.record(
      {
        id: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        title: fc.option(fc.string(), { nil: undefined }),
        role: fc.option(fc.constantFrom('presentation', 'img', 'status'), {
          nil: undefined,
        }),
        tabIndex: fc.option(fc.integer({ min: -1, max: 5 }), { nil: undefined }),
        'data-testid': fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        'data-foo': fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        style: fc.option(
          fc
            .record(
              {
                color: fc.option(fc.constantFrom('red', 'blue', '#fff'), { nil: undefined }),
                width: fc.option(fc.constantFrom('10px', '50%', '100px'), { nil: undefined }),
              },
              { requiredKeys: [] }
            )
            // fast-check records have a null prototype; React's style handling
            // calls `hasOwnProperty`, so normalize to a plain object.
            .map((s) => ({ ...s })),
          { nil: undefined }
        ),
      },
      { requiredKeys: [] }
    );

    fc.assert(
      fc.property(
        fc.constantFrom(...SKELETON_VARIANTS),
        htmlPropsArb,
        (variant, rawProps) => {
          // Normalize to a plain object (fast-check records have a null prototype).
          const htmlProps = { ...rawProps };
          const { container, unmount } = render(
            <Skeleton variant={variant} {...(htmlProps as object)} />
          );
          try {
            const el = container.firstChild as HTMLElement;
            // Global shimmer class present.
            expect(classTokens(el)).toContain(BASE_SHIMMER_CLASS);
            // aria-hidden is always "true".
            expect(el.getAttribute('aria-hidden')).toBe('true');
            // No inline <style> element emitted anywhere in the subtree.
            expect(container.querySelector('style')).toBeNull();
            // No inline animation style declaration on the element.
            const inlineStyle = el.getAttribute('style') ?? '';
            expect(inlineStyle).not.toMatch(/animation/i);
            expect(el.style.animation).toBe('');
          } finally {
            unmount();
          }
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: pixel-perfect-skeleton-loading, Property 5: Placeholder renders no final-component text glyphs
  it('Property 5: placeholder renders no final-component text glyphs', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const { container, unmount } = render(<Skeleton>{text}</Skeleton>);
        try {
          const el = container.firstChild as HTMLElement;
          // Children are dropped: the painted output carries zero text characters.
          expect(el.textContent).toBe('');
          expect((el.textContent ?? '').length).toBe(0);
        } finally {
          unmount();
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
