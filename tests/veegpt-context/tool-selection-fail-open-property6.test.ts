import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  selectTools,
  ALL_VEEGPT_TOOLS,
  type SelectToolsInput,
} from '../../server/routes/veegpt-tool-selection.logic';
import { filterToolsByTier, type VeeGPTTier } from '../../server/config/veegpt-tiers';
import { ALL_CAPABILITIES, type Capability } from '../../server/routes/veegpt-intent.logic';

// Feature: veegpt-context-optimization, Property 6: Tool selection fails open to the full tier set
// Validates: Requirements 11.7, 19.6
//
// For any input where tool selection cannot proceed selectively — the active
// model does not support selective exposure, or the intent is ambiguous /
// empty — the exposed tool set equals `filterToolsByTier(allTools, tier)` and
// `usedFallback` is true. Correctness wins over tokens: rather than
// under-exposing under an unresolved intent, selection widens to the full
// tier-permitted set (fail open).

/** The three real VeeGPT tiers. */
const tierArb = fc.constantFrom<VeeGPTTier>('basic', 'full', 'advanced');

/** A single capability drawn from the real capability space. */
const capabilityArb = fc.constantFrom<Capability>(...ALL_CAPABILITIES);

/** An arbitrary (possibly empty) deduplicated set of capability intents. */
const intentsArb = fc
  .array(capabilityArb, { maxLength: ALL_CAPABILITIES.length })
  .map((caps) => Array.from(new Set(caps)));

/** An arbitrary forced tool name (may or may not be a real/permitted tool). */
const forcedToolArb = fc.option(
  fc.constantFrom(...ALL_VEEGPT_TOOLS.map((t) => t.function?.name ?? '__unnamed')),
  { nil: null },
);

/**
 * A `SelectToolsInput` guaranteed to satisfy at least one fail-open trigger:
 *   1) selective exposure unsupported by the model,
 *   2) intent explicitly ambiguous,
 *   3) empty intents (nothing could be resolved).
 * Every branch forces exactly one documented trigger while leaving the other
 * fields arbitrary, so the fallback must dominate regardless of them.
 */
const failOpenInputArb: fc.Arbitrary<SelectToolsInput> = fc.oneof(
  // 1) Model does not support selective tool exposure.
  fc.record({
    tier: tierArb,
    intents: intentsArb,
    ambiguous: fc.boolean(),
    forcedTool: forcedToolArb,
    selectiveToolsSupported: fc.constant(false),
  }),
  // 2) Intent is ambiguous — selection must widen toward completeness.
  fc.record({
    tier: tierArb,
    intents: intentsArb,
    ambiguous: fc.constant(true),
    forcedTool: forcedToolArb,
    selectiveToolsSupported: fc.boolean(),
  }),
  // 3) Empty intents — nothing could be resolved.
  fc.record({
    tier: tierArb,
    intents: fc.constant<Capability[]>([]),
    ambiguous: fc.boolean(),
    forcedTool: forcedToolArb,
    selectiveToolsSupported: fc.boolean(),
  }),
);

describe('Property 6: tool selection fails open to the full tier set (R11.7, R19.6)', () => {
  it('returns filterToolsByTier(allTools, tier) with usedFallback=true for any fail-open input', () => {
    fc.assert(
      fc.property(failOpenInputArb, (input) => {
        const result = selectTools(input);

        // The safe full-tier-set fallback was applied.
        expect(result.usedFallback).toBe(true);

        // The exposed set equals the full tier-permitted set (fail open).
        const expected = filterToolsByTier([...ALL_VEEGPT_TOOLS], input.tier);
        const expectedNames = expected.map((t) => t.function?.name);
        const actualNames = result.tools.map((t) => t.function?.name);

        expect(actualNames).toEqual(expectedNames);
      }),
      { numRuns: 200 },
    );
  });
});
