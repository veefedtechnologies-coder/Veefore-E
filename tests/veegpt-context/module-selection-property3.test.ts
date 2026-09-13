import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  selectModules,
  CONTEXT_MODULES,
  CONTEXT_MODULE_IDS,
  STATIC_MODULES,
  type ComposeInput,
} from '../../server/routes/veegpt-modules';
import {
  ALL_CAPABILITIES,
  type Capability,
  type IntentResult,
} from '../../server/routes/veegpt-intent.logic';

// Feature: veegpt-context-optimization, Property 3: Module selection fails open to the complete set
// Validates: Requirements 5.6, 6.6, 19.1
//
// For any input where the intent is empty, ambiguous, or the classifier failed,
// `selectModules` returns the COMPLETE module registry and the `static` modules
// are present. Correctness wins over tokens: rather than guessing under an
// unresolved intent, selection widens to everything (fail open).

/** A single capability drawn from the real capability space. */
const capabilityArb = fc.constantFrom<Capability>(...ALL_CAPABILITIES);

/** An arbitrary (possibly empty) set of capability intents, deduplicated. */
const intentsArb = fc
  .array(capabilityArb, { maxLength: ALL_CAPABILITIES.length })
  .map((caps) => Array.from(new Set(caps)));

/**
 * A minimal, valid `ComposeInput`. `selectModules` ignores ctx today, but the
 * contract accepts it, so we pass a realistic minimal object rather than a cast.
 */
const ctx: ComposeInput = {
  prefs: {},
  history: [],
  currentMessage: 'hello',
  tier: 'basic',
};

/**
 * An `IntentResult` (or null) guaranteed to satisfy at least one fail-open
 * condition: empty intents, `ambiguous`, `usedFallback`, or a null/missing
 * intent (classifier produced nothing). Each branch forces exactly one of the
 * three documented triggers while leaving the other fields arbitrary.
 */
const failOpenIntentArb: fc.Arbitrary<IntentResult | null> = fc.oneof(
  // 1) Empty intents — nothing could be resolved.
  fc.record({
    intents: fc.constant<Capability[]>([]),
    ambiguous: fc.boolean(),
    usedFallback: fc.boolean(),
  }),
  // 2) Ambiguous — selection must widen toward completeness.
  fc.record({
    intents: intentsArb,
    ambiguous: fc.constant(true),
    usedFallback: fc.boolean(),
  }),
  // 3) Fallback — the classifier failed and returned its safe fallback.
  fc.record({
    intents: intentsArb,
    ambiguous: fc.boolean(),
    usedFallback: fc.constant(true),
  }),
  // 4) Missing intent object entirely (classifier produced nothing).
  fc.constant(null)
);

describe('Property 3: module selection fails open to the complete set (R5.6, R6.6, R19.1)', () => {
  it('returns the complete registry with all static modules present for any fail-open intent', () => {
    fc.assert(
      fc.property(failOpenIntentArb, (intent) => {
        const selected = selectModules(intent as IntentResult, ctx);
        const selectedIds = selected.map((m) => m.id);

        // The COMPLETE registry is returned — same size and exact id set/order.
        expect(selected).toHaveLength(CONTEXT_MODULES.length);
        expect(selectedIds).toEqual([...CONTEXT_MODULE_IDS]);

        // Every static (always) module is present (Req 5.4 preserved under fail open).
        for (const staticModule of STATIC_MODULES) {
          expect(selectedIds).toContain(staticModule.id);
        }
      }),
      { numRuns: 200 }
    );
  });
});
