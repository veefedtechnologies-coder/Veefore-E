import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  selectModules,
  CONTEXT_MODULES,
  type ComposeInput,
} from '../../server/routes/veegpt-modules';
import {
  ALL_CAPABILITIES,
  type Capability,
  type IntentResult,
} from '../../server/routes/veegpt-intent.logic';

// Feature: veegpt-context-optimization, Property 2: Intent-mapped modules are included
// Validates: Requirements 5.3, 6.1
//
// For ANY IntentResult, every module whose `appliesTo` intersects
// `intent.intents` must appear in the module set returned by `selectModules`.
// This holds on both selection paths:
//   • the normal intent-driven path includes a module when its `appliesTo`
//     intersects the identified intents (Req 5.3 / 6.1);
//   • the fail-open path returns the COMPLETE registry, which is a superset of
//     any intent-mapped subset, so the guarantee is preserved there too.

/** The compose input is unused by `selectModules`, so a minimal stub suffices. */
const CTX = {
  prefs: {},
  history: [],
  currentMessage: '',
  tier: 'basic',
} as unknown as ComposeInput;

/** An arbitrary single capability drawn from the canonical capability space. */
const capabilityArb: fc.Arbitrary<Capability> = fc.constantFrom(
  ...ALL_CAPABILITIES
);

/** An arbitrary (possibly empty) set of unique capabilities. */
const intentsArb: fc.Arbitrary<Capability[]> = fc
  .uniqueArray(capabilityArb, { maxLength: ALL_CAPABILITIES.length })
  .map((caps) => [...caps]);

/** An arbitrary IntentResult spanning normal + ambiguous + fallback shapes. */
const intentResultArb: fc.Arbitrary<IntentResult> = fc.record({
  intents: intentsArb,
  ambiguous: fc.boolean(),
  usedFallback: fc.boolean(),
});

/** All modules whose `appliesTo` intersects the given intents. */
function intentMappedModules(intents: Capability[]): string[] {
  const intentSet = new Set<Capability>(intents);
  return CONTEXT_MODULES.filter(
    (m) => !m.always && m.appliesTo.some((cap) => intentSet.has(cap))
  ).map((m) => m.id);
}

describe('Property 2: intent-mapped modules are included (R5.3, R6.1)', () => {
  it('every module whose appliesTo intersects the intents is selected — any IntentResult', () => {
    fc.assert(
      fc.property(intentResultArb, (intent) => {
        const selectedIds = new Set(
          selectModules(intent, CTX).map((m) => m.id)
        );
        for (const id of intentMappedModules(intent.intents)) {
          expect(selectedIds.has(id)).toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('holds on the clean intent-driven path (non-ambiguous, non-fallback, non-empty)', () => {
    // A non-empty subset of intents with ambiguous=false and usedFallback=false
    // forces the normal `appliesTo`-intersection path (not the fail-open widen),
    // so this specifically exercises Req 5.3 / 6.1 mapping — not the superset.
    const cleanIntentArb: fc.Arbitrary<IntentResult> = fc
      .uniqueArray(capabilityArb, {
        minLength: 1,
        maxLength: ALL_CAPABILITIES.length,
      })
      .map((caps) => ({
        intents: [...caps],
        ambiguous: false,
        usedFallback: false,
      }));

    fc.assert(
      fc.property(cleanIntentArb, (intent) => {
        const selectedIds = new Set(
          selectModules(intent, CTX).map((m) => m.id)
        );
        const mapped = intentMappedModules(intent.intents);
        for (const id of mapped) {
          expect(selectedIds.has(id)).toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });
});
