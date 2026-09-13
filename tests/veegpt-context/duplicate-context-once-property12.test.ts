import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  dedupeContext,
  type ComposedSegment,
} from '../../server/routes/veegpt-context-composer';
import type {
  ContextClass,
  TrustLayer,
} from '../../server/routes/veegpt-modules';

// Feature: veegpt-context-optimization, Property 12: Duplicate context appears once
// Validates: Requirements 13.2, 13.3
//
// For any collection of context sources (the rendered `ComposedSegment`s that
// ARE the addressable information units), `dedupeContext`:
//   • includes each NON-`intentionalRepeat` information unit exactly once — a
//     later segment carrying the SAME unit (by trimmed content) as one already
//     included is dropped, so no non-intentional unit is ever sent twice
//     (Req 13.2); and
//   • ALWAYS preserves every unit flagged `intentionalRepeat` verbatim and in
//     order (W1 rich-output, W2 workspace-actions-guidance, W11 output-contract),
//     even when that same content also appears elsewhere in the request
//     (Req 13.3).
//
// A "unit" is compared exactly as `dedupeContext` compares it: by its
// outer-trimmed content, so two segments that share the same information but
// differ only in leading/trailing whitespace are the same unit.

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * A small pool of distinct information units. Drawing content from a SMALL pool
 * makes exact duplicates (and near-duplicates that differ only by surrounding
 * whitespace) highly likely across a generated segment list — which is exactly
 * the input space de-duplication must handle.
 */
const UNIT_POOL = [
  'You are VeeGPT, a social-media co-pilot.',
  'Always follow the output contract.',
  'Use tools when the task requires live data.',
  'Be concise and actionable.',
  'Respect the workspace safety policy.',
  'Prefer rich, structured output blocks.',
] as const;

/** Whitespace padding variants — never change a unit's identity after trim. */
const WHITESPACE = ['', ' ', '\n', '\n\n', '  \t ', ' \r\n'] as const;

/** A non-empty information unit wrapped in arbitrary outer whitespace. */
const paddedContentArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...WHITESPACE),
    fc.constantFrom(...UNIT_POOL),
    fc.constantFrom(...WHITESPACE)
  )
  .map(([left, unit, right]) => `${left}${unit}${right}`);

const CONTEXT_CLASSES: readonly ContextClass[] = [
  'static',
  'task-specific',
  'tool-specific',
  'user-specific',
  'conversation-specific',
  'turn-specific',
  'historical',
  'unnecessary',
];

const TRUST_LAYERS: readonly TrustLayer[] = [
  'system',
  'developer',
  'app-state',
  'retrieved',
  'tool-output',
  'user',
];

const MODULE_IDS = [
  'core-behavior',
  'rich-output',
  'output-contract',
  'workspace-actions-guidance',
  'persona',
  'user-memory',
  'conversation-summary',
  'recent-conversation',
  'current-request',
] as const;

/** A single rendered segment (the unit `dedupeContext` operates on). */
const segmentArb: fc.Arbitrary<ComposedSegment> = fc.record({
  moduleId: fc.constantFrom(...MODULE_IDS),
  trustLayer: fc.constantFrom(...TRUST_LAYERS),
  contextClass: fc.constantFrom(...CONTEXT_CLASSES),
  always: fc.boolean(),
  intentionalRepeat: fc.boolean(),
  content: paddedContentArb,
});

/** A collection of context sources for one request. */
const segmentsArb: fc.Arbitrary<ComposedSegment[]> = fc.array(segmentArb, {
  maxLength: 24,
});

const dedupeKey = (content: string): string => content.trim();

// ---------------------------------------------------------------------------
// Property 12
// ---------------------------------------------------------------------------

describe('Property 12: duplicate context appears once (R13.2, R13.3)', () => {
  it('includes each non-intentional unit at most once and preserves every intentional unit', () => {
    fc.assert(
      fc.property(segmentsArb, (segments) => {
        const out = dedupeContext(segments);

        // The output is a subsequence of the input (order preserved, nothing
        // invented, content never rewritten): every kept segment is one of the
        // originals, in the same relative order.
        let cursor = 0;
        for (const kept of out) {
          const idx = segments.indexOf(kept, cursor);
          expect(idx).toBeGreaterThanOrEqual(0);
          cursor = idx + 1;
        }

        // Req 13.2 — no NON-intentional information unit appears twice.
        const nonIntentionalKeys = out
          .filter((s) => !s.intentionalRepeat)
          .map((s) => dedupeKey(s.content))
          .filter((k) => k.length > 0);
        expect(new Set(nonIntentionalKeys).size).toBe(nonIntentionalKeys.length);

        // Req 13.3 — every intentional-repeat segment is preserved verbatim and
        // in order, even when its content is duplicated elsewhere.
        const inIntentional = segments.filter((s) => s.intentionalRepeat);
        const outIntentional = out.filter((s) => s.intentionalRepeat);
        expect(outIntentional).toEqual(inIntentional);

        // No information is lost: every distinct non-intentional input unit is
        // still represented by some kept segment (itself, or an intentional copy
        // that already covered the same unit).
        const keptKeys = new Set(
          out.map((s) => dedupeKey(s.content)).filter((k) => k.length > 0)
        );
        const inputNonIntentionalKeys = new Set(
          segments
            .filter((s) => !s.intentionalRepeat)
            .map((s) => dedupeKey(s.content))
            .filter((k) => k.length > 0)
        );
        for (const key of inputNonIntentionalKeys) {
          expect(keptKeys.has(key)).toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('always keeps duplicated intentional-repeat units (W1/W2/W11) even when identical', () => {
    // A dedicated intentional-repeat unit whose content also arrives as an
    // ordinary (non-intentional) segment — the intentional copies must ALL
    // survive regardless of duplication.
    const REPEATED = 'Prefer rich, structured output blocks.';
    const intentionalSegArb: fc.Arbitrary<ComposedSegment> = fc.record({
      moduleId: fc.constantFrom(
        'rich-output',
        'output-contract',
        'workspace-actions-guidance'
      ),
      trustLayer: fc.constantFrom(...TRUST_LAYERS),
      contextClass: fc.constant<ContextClass>('static'),
      always: fc.boolean(),
      intentionalRepeat: fc.constant(true),
      content: fc.constant(REPEATED),
    });

    fc.assert(
      fc.property(
        fc.array(intentionalSegArb, { minLength: 1, maxLength: 6 }),
        segmentsArb,
        (intentionalSegs, others) => {
          // Interleave the intentional repeats with an ordinary segment that
          // carries the SAME content (a candidate for de-duplication).
          const duplicateOrdinary: ComposedSegment = {
            moduleId: 'core-behavior',
            trustLayer: 'system',
            contextClass: 'static',
            always: true,
            intentionalRepeat: false,
            content: REPEATED,
          };
          const input = [duplicateOrdinary, ...intentionalSegs, ...others];

          const out = dedupeContext(input);

          // Every intentional-repeat segment survives — same count, verbatim.
          const outIntentional = out.filter((s) => s.intentionalRepeat);
          expect(outIntentional).toEqual(input.filter((s) => s.intentionalRepeat));

          // …and the repeated content is present at least as many times as it
          // was flagged intentional (never collapsed to a single copy).
          const repeatedCount = out.filter(
            (s) => dedupeKey(s.content) === REPEATED
          ).length;
          expect(repeatedCount).toBeGreaterThanOrEqual(intentionalSegs.length);
        }
      ),
      { numRuns: 200 }
    );
  });
});
