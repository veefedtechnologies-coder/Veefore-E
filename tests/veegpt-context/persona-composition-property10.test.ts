import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  CONTEXT_MODULES,
  type ComposeInput,
  type ContextModule,
} from '../../server/routes/veegpt-modules';
import {
  VEEGPT_AGENTS,
  getAgentDirectivesForTier,
} from '../../server/routes/veegpt-agents';
import type { VeeGPTTier } from '../../server/config/veegpt-tiers';

// Feature: veegpt-context-optimization, Property 10: Persona composition matches the tier-resolved selection exactly
// Validates: Requirements 10.1, 10.2, 10.3, 10.4
//
// For any selected agent id and tier, the persona directives in the composed
// request equal `getAgentDirectivesForTier(id, tier)` and contain no directives
// belonging to any other persona:
//   • Only the applicable persona's directives are included; every other
//     persona's directives are excluded (Req 10.1).
//   • A persona above the user's tier resolves to no directives, reproducing the
//     pre-refactor tier-gating outcome (Req 10.2).
//   • Single-selection precedence is delegated to `getAgentDirectivesForTier`,
//     producing the identical selected-persona outcome (Req 10.3).
//   • No second (potentially conflicting) persona's directives are ever composed
//     alongside the applicable one (Req 10.4).

/** The `persona` module under test, resolved from the shared registry. */
const personaModule: ContextModule = (() => {
  const m = CONTEXT_MODULES.find((mod) => mod.id === 'persona');
  if (!m) throw new Error('persona module not found in CONTEXT_MODULES');
  return m;
})();

/** The exact `ACTIVE EXPERT MODE` wrapper `renderPersona` applies (kept in sync). */
const PERSONA_HEADER =
  '━━━ ACTIVE EXPERT MODE (the user selected this specialist — fully embody it) ━━━\n';
const PERSONA_FOOTER =
  "\nStay in character as this expert for the entire conversation: think, prioritize, and answer the way this specialist would, at the top of their field. This expertise governs HOW you answer; the platform rules below still apply (use tools for real data, be accurate, follow the user's config).\n\n";

const tierArb: fc.Arbitrary<VeeGPTTier> = fc.constantFrom(
  'basic',
  'full',
  'advanced'
);

/**
 * An arbitrary agent id spanning the whole input space: every real agent id
 * (default + all expert personas), `null`/`undefined` (no persona selected),
 * and crafted/unknown ids (e.g. an attempt to force a non-existent persona).
 */
const agentIdArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  fc.constantFrom(...VEEGPT_AGENTS.map((a) => a.id)),
  fc.constant(null),
  fc.constant(undefined),
  fc.string()
);

/** A minimal-but-valid ComposeInput; persona rendering only reads id + tier. */
function makeCtx(
  selectedAgentId: string | null | undefined,
  tier: VeeGPTTier
): ComposeInput {
  return {
    prefs: {},
    history: [],
    currentMessage: '',
    selectedAgentId,
    tier,
  };
}

describe('veegpt-modules · Property 10 — persona composition matches the tier-resolved selection exactly', () => {
  it('renders exactly the tier-resolved directives and no other persona’s directives', () => {
    fc.assert(
      fc.property(agentIdArb, tierArb, (id, tier) => {
        const rendered = personaModule.render(makeCtx(id, tier));

        // The single source of truth for what persona (if any) applies.
        const expected = getAgentDirectivesForTier(id, tier).trim();

        if (!expected) {
          // Tier-gated out, default, or unknown persona → no directives at all
          // (Req 10.2). The module contributes nothing.
          expect(rendered).toBe('');
          return;
        }

        // The composed block is exactly the wrapper around the tier-resolved
        // directives — byte-for-byte, nothing more (Req 10.1, 10.3).
        expect(rendered).toBe(PERSONA_HEADER + expected + PERSONA_FOOTER);

        // The applicable persona's directives are present…
        expect(rendered).toContain(expected);

        // …and NO other persona's directives leak in (Req 10.1, 10.4).
        for (const other of VEEGPT_AGENTS) {
          const otherDirectives = (other.directives || '').trim();
          if (!otherDirectives) continue; // default persona has none
          if (otherDirectives === expected) continue; // the applicable one
          expect(rendered.includes(otherDirectives)).toBe(false);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('a persona above the user’s tier is never applied (tier-gating parity, Req 10.2)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VEEGPT_AGENTS.map((a) => a.id)),
        tierArb,
        (id, tier) => {
          const rendered = personaModule.render(makeCtx(id, tier));
          const gated = getAgentDirectivesForTier(id, tier).trim();
          // When the agents layer gates the persona out, the module emits nothing.
          if (!gated) expect(rendered).toBe('');
          else expect(rendered).toContain(gated);
        }
      ),
      { numRuns: 200 }
    );
  });
});
