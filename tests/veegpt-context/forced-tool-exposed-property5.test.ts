import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  selectTools,
  ALL_VEEGPT_TOOLS,
} from '../../server/routes/veegpt-tool-selection.logic';
import { isToolAllowedForTier, type VeeGPTTier } from '../../server/config/veegpt-tiers';
import {
  ALL_CAPABILITIES,
  FORCED_TOOL_CAPABILITY,
  type Capability,
} from '../../server/routes/veegpt-intent.logic';

// Feature: veegpt-context-optimization, Property 5: A forced, tier-permitted tool is always exposed
// Validates: Requirements 11.6
//
// For any forced tool that is permitted for the user's tier and any intents, the
// exposed tool set contains the forced tool even when the intent did not select
// it (Req 11.6 / correctness > tokens). An explicitly forced tool is a direct
// user signal, so as long as the tier permits it, selective exposure must never
// drop it — regardless of intent, ambiguity, or selective-exposure support.

const TIERS: readonly VeeGPTTier[] = ['basic', 'full', 'advanced'];

/** A tier drawn from the real tier space. */
const tierArb = fc.constantFrom<VeeGPTTier>(...TIERS);

/** A forced tool drawn from the real forced-tool → capability table. */
const forcedToolArb = fc.constantFrom<string>(...Object.keys(FORCED_TOOL_CAPABILITY));

/** An arbitrary (possibly empty) deduplicated set of capability intents. */
const intentsArb = fc
  .array(fc.constantFrom<Capability>(...ALL_CAPABILITIES), {
    maxLength: ALL_CAPABILITIES.length,
  })
  .map((caps) => Array.from(new Set(caps)));

/** Look up whether a tool name is present in a selection result. */
function containsTool(tools: { function?: { name?: string } }[], name: string): boolean {
  return tools.some((t) => t.function?.name === name);
}

describe('Property 5: a forced, tier-permitted tool is always exposed (R11.6)', () => {
  it('exposes the forced tool whenever the tier permits it, across all intents/flags', () => {
    fc.assert(
      fc.property(
        forcedToolArb,
        tierArb,
        intentsArb,
        fc.boolean(),
        fc.boolean(),
        (forcedTool, tier, intents, ambiguous, selectiveToolsSupported) => {
          const result = selectTools({
            tier,
            intents,
            ambiguous,
            forcedTool,
            selectiveToolsSupported,
          });

          const tierPermits = isToolAllowedForTier(forcedTool, tier);

          if (tierPermits) {
            // The forced, tier-permitted tool MUST be exposed regardless of
            // intent, ambiguity, or selective-exposure support.
            expect(containsTool(result.tools, forcedTool)).toBe(true);
          } else {
            // A tool above the user's tier is never exposed, even when forced
            // (tier filter is applied FIRST, Req 11.4).
            expect(containsTool(result.tools, forcedTool)).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('exposes the forced tool even when the intents deliberately exclude its capability', () => {
    fc.assert(
      fc.property(
        forcedToolArb,
        tierArb,
        intentsArb,
        (forcedTool, tier, rawIntents) => {
          // Remove the forced tool's own capability so the intent-mapped union
          // could NEVER include it — only the forced-tool rule can (Req 11.6).
          const forcedCapability = FORCED_TOOL_CAPABILITY[forcedTool];
          const intents = rawIntents.filter((c) => c !== forcedCapability);

          const result = selectTools({
            tier,
            intents,
            ambiguous: false,
            forcedTool,
            selectiveToolsSupported: true,
          });

          if (isToolAllowedForTier(forcedTool, tier)) {
            expect(containsTool(result.tools, forcedTool)).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('sanity: every forced-tool table entry maps to a real registered tool', () => {
    const registered = new Set(ALL_VEEGPT_TOOLS.map((t) => t.function?.name));
    for (const name of Object.keys(FORCED_TOOL_CAPABILITY)) {
      expect(registered.has(name)).toBe(true);
    }
  });
});
