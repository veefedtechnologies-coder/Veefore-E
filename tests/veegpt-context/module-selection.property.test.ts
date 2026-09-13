import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  selectModules,
  STATIC_MODULES,
  type ComposeInput,
} from '../../server/routes/veegpt-modules';
import {
  ALL_CAPABILITIES,
  type Capability,
  type IntentResult,
} from '../../server/routes/veegpt-intent.logic';
import type { VeeGPTTier } from '../../server/config/veegpt-tiers';

// Feature: veegpt-context-optimization, Property 1: Static modules are always present
// Validates: Requirements 5.4, 6.6, 19.1
//
// For any IntentResult (including empty, ambiguous, or fallback), the module set
// returned by selectModules() MUST contain every module marked `always` (the
// static core-behavior, safety-policy, reasoning-formatting, rich-output, and
// output-contract modules). Static context is VeeGPT's identity/safety/formatting
// contract and can never be dropped regardless of the classified intent.

/** The ids of the modules that are guaranteed present on every request. */
const STATIC_MODULE_IDS = STATIC_MODULES.map((m) => m.id);

/** An arbitrary VeeGPT tier. */
const tierArb: fc.Arbitrary<VeeGPTTier> = fc.constantFrom(
  'basic',
  'full',
  'advanced'
);

/** An arbitrary capability drawn from the full capability space. */
const capabilityArb: fc.Arbitrary<Capability> = fc.constantFrom(
  ...(ALL_CAPABILITIES as readonly Capability[])
);

/**
 * An arbitrary IntentResult spanning the whole input space: empty intents,
 * single/multi intents, and every combination of the ambiguous/usedFallback
 * flags — this deliberately includes the empty, ambiguous, and fallback cases
 * called out by Property 1.
 */
const intentResultArb: fc.Arbitrary<IntentResult> = fc.record({
  intents: fc.uniqueArray(capabilityArb, { maxLength: ALL_CAPABILITIES.length }),
  ambiguous: fc.boolean(),
  usedFallback: fc.boolean(),
});

/** A minimal-but-valid ComposeInput; selection does not depend on its fields. */
const composeInputArb: fc.Arbitrary<ComposeInput> = fc.record({
  prefs: fc.constant({}),
  history: fc.constant([]),
  currentMessage: fc.string(),
  tier: tierArb,
});

describe('veegpt-modules · Property 1 — static modules are always present', () => {
  it('includes every `always` module for any IntentResult (incl. empty/ambiguous/fallback)', () => {
    fc.assert(
      fc.property(intentResultArb, composeInputArb, (intent, ctx) => {
        const selected = selectModules(intent, ctx);
        const selectedIds = new Set(selected.map((m) => m.id));
        // Every static module id must be present in the selection.
        for (const id of STATIC_MODULE_IDS) {
          expect(selectedIds.has(id)).toBe(true);
        }
        // And the actual module objects (identity preserved) must all appear.
        for (const staticModule of STATIC_MODULES) {
          expect(selected).toContain(staticModule);
        }
      }),
      { numRuns: 200 }
    );
  });
});
