import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  selectTools,
  CAPABILITY_TOOLS,
  ALL_VEEGPT_TOOLS,
} from '../../server/routes/veegpt-tool-selection.logic';
import { filterToolsByTier, type VeeGPTTier } from '../../server/config/veegpt-tiers';
import {
  ALL_CAPABILITIES,
  type Capability,
} from '../../server/routes/veegpt-intent.logic';

// Feature: veegpt-context-optimization, Property 4: Exposed tools are bounded by tier and equal the intent-mapped union
// Validates: Requirements 11.1, 11.3, 11.4, 11.5
//
// For ANY set of intents and ANY tier, the exposed tool set must:
//   (a) be a SUBSET of `filterToolsByTier(allTools, tier)` — a tool above the
//       user's tier can never be exposed (Req 11.4 tier filter first); and
//   (b) EQUAL the union of the tier-permitted tools mapped to the identified
//       intents (Req 11.1 / 11.3 intent-mapped union); and
//   (c) hold regardless of any token budget value — the selector exposes no
//       token/budget parameter, so an intent-selected, tier-permitted tool is
//       never dropped to save tokens (Req 11.5 no token-driven dropping).
//
// To isolate the intent-mapped-union invariant (not the fail-open widen), this
// exercises the clean selective path: selectiveToolsSupported=true,
// ambiguous=false, non-empty intents, and no forcedTool.

const ALL_TIERS: readonly VeeGPTTier[] = ['basic', 'full', 'advanced'] as const;

const tierArb: fc.Arbitrary<VeeGPTTier> = fc.constantFrom(...ALL_TIERS);

const capabilityArb: fc.Arbitrary<Capability> = fc.constantFrom(...ALL_CAPABILITIES);

/** A non-empty, unique set of capabilities to force the intent-driven path. */
const nonEmptyIntentsArb: fc.Arbitrary<Capability[]> = fc
  .uniqueArray(capabilityArb, { minLength: 1, maxLength: ALL_CAPABILITIES.length })
  .map((caps) => [...caps]);

/** Stable tool-name extractor. */
const nameOf = (t: { function?: { name?: string } }): string => t.function?.name ?? '';

/** The expected intent-mapped union, intersected with the tier-permitted set. */
function expectedNames(intents: Capability[], tier: VeeGPTTier): Set<string> {
  const permitted = new Set(
    filterToolsByTier([...ALL_VEEGPT_TOOLS], tier).map(nameOf).filter(Boolean),
  );
  const union = new Set<string>();
  for (const intent of intents) {
    for (const tool of CAPABILITY_TOOLS[intent] ?? []) {
      const n = nameOf(tool);
      if (n && permitted.has(n)) union.add(n);
    }
  }
  return union;
}

describe('Property 4: exposed tools bounded by tier and equal intent-mapped union (R11.1, R11.3, R11.4, R11.5)', () => {
  it('exposed set is a subset of the tier-permitted set AND equals the intent-mapped union', () => {
    fc.assert(
      fc.property(nonEmptyIntentsArb, tierArb, (intents, tier) => {
        const { tools, usedFallback } = selectTools({
          tier,
          intents,
          ambiguous: false,
          selectiveToolsSupported: true,
        });

        const exposed = new Set(tools.map(nameOf).filter(Boolean));
        const permitted = new Set(
          filterToolsByTier([...ALL_VEEGPT_TOOLS], tier).map(nameOf).filter(Boolean),
        );

        // Clean selective path — no fail-open widen expected.
        expect(usedFallback).toBe(false);

        // (a) subset of tier-permitted set (Req 11.4).
        for (const n of exposed) {
          expect(permitted.has(n)).toBe(true);
        }

        // (b) equals the intent-mapped union (Req 11.1 / 11.3).
        const expected = expectedNames(intents, tier);
        expect(exposed).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('no token budget parameter exists, so retention is invariant (Req 11.5)', () => {
    // The selector takes no budget argument. Selecting twice for identical input
    // yields the identical tool set — there is no path by which token pressure
    // could drop an intent-selected, tier-permitted tool.
    fc.assert(
      fc.property(nonEmptyIntentsArb, tierArb, (intents, tier) => {
        const a = selectTools({ tier, intents, ambiguous: false, selectiveToolsSupported: true });
        const b = selectTools({ tier, intents, ambiguous: false, selectiveToolsSupported: true });
        expect(a.tools.map(nameOf)).toEqual(b.tools.map(nameOf));

        // Every intent-mapped, tier-permitted tool is retained (nothing dropped).
        const exposed = new Set(a.tools.map(nameOf).filter(Boolean));
        expect(exposed).toEqual(expectedNames(intents, tier));
      }),
      { numRuns: 200 },
    );
  });
});
