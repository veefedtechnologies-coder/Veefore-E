/**
 * Property tests for the Model_Router pure core (task 10.2).
 *
 * Framework: vitest + fast-check, >=100 runs per property.
 *
 * Properties under test (design.md §"Model & Tool Routing"):
 *  - Property 15: Deterministic-performable operations never call a generative provider
 *      Validates: Requirements 6.1, 6.2, 8.1, 8.2, 24.1
 *  - Property 16: Generative provider selection is capability-, health-, and priority-correct
 *      Validates: Requirements 6.3, 6.4, 6.5, 6.7, 6.8
 *  - Property 17: Every non-deterministic routing decision records provider, model, and reason
 *      Validates: Requirements 6.6
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  routeOperation,
  healthViewFromUnhealthy,
  ALL_HEALTHY,
  type RoutableOperation,
  type ProviderHealthView,
  type RoutingPolicy,
} from '../server/features/video-editor/services/model-router.logic';
import {
  ProviderCapabilityRegistryCore,
  DETERMINISTIC_PERFORMABLE_KINDS,
  type VideoModelCapabilities,
} from '../server/features/video-editor/services/provider-capability-registry.logic';

const RUNS = 200;

// ---------------------------------------------------------------------------
// Smart generators constrained to the routing input space
// ---------------------------------------------------------------------------

/**
 * Generative/analysis operation kinds that are NOT deterministic-performable, so
 * the router must go through provider selection rather than the deterministic
 * short-circuit. Kept disjoint from DETERMINISTIC_PERFORMABLE_KINDS.
 */
const GEN_OPS = ['gen_a', 'gen_b', 'gen_c', 'gen_d'] as const;

const genOpKind = fc.constantFrom(...GEN_OPS);

/** Deterministic-performable kinds seeded into the registry core. */
const deterministicKind = fc.constantFrom(...DETERMINISTIC_PERFORMABLE_KINDS);

/** Fill the non-routing-relevant required fields with valid placeholders. */
function makeCaps(
  index: number,
  supportedOperations: string[],
  priorityRank: number,
): VideoModelCapabilities {
  return {
    provider: `p${index}`,
    model: `m${index}`,
    version: 'v1',
    supportedOperations,
    editableInputSeconds: { min: 0, max: 60 },
    outputSeconds: { min: 0, max: 60 },
    outputResolutions: ['1080x1920'],
    inputModalities: ['video'],
    outputModalities: ['video'],
    priorityRank,
    costPerOutputSecondInr: 1,
    guaranteesPreservation: [],
  };
}

/**
 * A candidate spec: the operations it supports (from GEN_OPS), a priority rank,
 * and whether it is currently healthy. Provider/model ids are assigned by array
 * index during registry construction so every candidate is unique.
 */
const candidateSpec = fc.record({
  supportedOperations: fc.uniqueArray(genOpKind, { minLength: 1, maxLength: GEN_OPS.length }),
  priorityRank: fc.integer({ min: 0, max: 10 }),
  healthy: fc.boolean(),
});

type CandidateSpec = { supportedOperations: string[]; priorityRank: number; healthy: boolean };

/**
 * Build a registry core plus the concrete capability records and a health view
 * from an array of candidate specs. Provider/model ids are `p{i}`/`m{i}`.
 */
function buildRegistry(specs: readonly CandidateSpec[]): {
  registry: ProviderCapabilityRegistryCore;
  records: VideoModelCapabilities[];
  health: ProviderHealthView;
  unhealthyProviders: Set<string>;
} {
  const records: VideoModelCapabilities[] = specs.map((s, i) =>
    makeCaps(i, s.supportedOperations, s.priorityRank),
  );
  let registry = ProviderCapabilityRegistryCore.create();
  for (const rec of records) {
    const r = registry.register(rec);
    if (r.ok) registry = r.registry;
  }
  const unhealthyProviders = new Set<string>(
    specs.map((s, i) => (s.healthy ? null : `p${i}`)).filter((x): x is string => x !== null),
  );
  const health = healthViewFromUnhealthy(unhealthyProviders);
  return { registry, records, health, unhealthyProviders };
}

/**
 * Independent oracle: pick the expected candidate for `kind` from raw records —
 * healthy-and-supporting only, highest priorityRank, first-in-registry-order on
 * ties (replace only on strictly greater rank). Mirrors Req 6.3/6.4/6.7 without
 * calling the router's own selection.
 */
function expectedBest(
  records: readonly VideoModelCapabilities[],
  kind: string,
  unhealthyProviders: Set<string>,
): VideoModelCapabilities | null {
  let best: VideoModelCapabilities | null = null;
  for (const r of records) {
    if (!r.supportedOperations.includes(kind)) continue;
    if (unhealthyProviders.has(r.provider)) continue;
    if (best === null || r.priorityRank > best.priorityRank) best = r;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Property 15: Deterministic-performable operations never call a generative provider
// Validates: Requirements 6.1, 6.2, 8.1, 8.2, 24.1
// ---------------------------------------------------------------------------

describe('Property 15: Deterministic-performable operations never call a generative provider', () => {
  it('routes any deterministic-performable kind to the deterministic engine, ignoring provider candidates', () => {
    fc.assert(
      fc.property(
        deterministicKind,
        // Even a generative/analysis-typed op with changesVisualContent set...
        fc.constantFrom<'deterministic' | 'generative' | 'analysis'>(
          'deterministic',
          'generative',
          'analysis',
        ),
        fc.boolean(),
        // ...and a registry that WOULD offer providers supporting that kind.
        fc.array(candidateSpec, { maxLength: 6 }),
        (kind, type, changesVisualContent, specs) => {
          // Make every candidate advertise support for `kind` so a naive router
          // could route it generatively — the deterministic-first rule must win.
          const supportingSpecs = specs.map((s) => ({
            ...s,
            supportedOperations: [...new Set([...s.supportedOperations, kind])],
          }));
          const { registry, health } = buildRegistry(supportingSpecs);

          const op: RoutableOperation = { type, kind, changesVisualContent };
          const decision = routeOperation(op, registry, health);

          // Never a generative/analysis call for a deterministic-performable kind.
          expect(decision.engine).not.toBe('generative');
          expect(decision.engine).not.toBe('analysis');
          // Positively routed to the deterministic engine.
          expect(decision.engine).toBe('deterministic');
          expect(decision).not.toHaveProperty('provider');
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('holds regardless of provider health (a fully-healthy registry still yields deterministic)', () => {
    fc.assert(
      fc.property(deterministicKind, (kind) => {
        const registry = (() => {
          let reg = ProviderCapabilityRegistryCore.create();
          const r = reg.register(makeCaps(0, [kind, 'gen_a'], 9));
          if (r.ok) reg = r.registry;
          return reg;
        })();
        const op: RoutableOperation = { type: 'generative', kind, changesVisualContent: true };
        const decision = routeOperation(op, registry, ALL_HEALTHY);
        expect(decision.engine).toBe('deterministic');
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 16: Generative provider selection is capability-, health-, and priority-correct
// Validates: Requirements 6.3, 6.4, 6.5, 6.7, 6.8
// ---------------------------------------------------------------------------

describe('Property 16: Generative provider selection is capability-, health-, and priority-correct', () => {
  it('selects the highest-priority healthy supporting candidate, else marks unavailable', () => {
    fc.assert(
      fc.property(
        fc.array(candidateSpec, { maxLength: 8 }),
        genOpKind,
        fc.constantFrom<'generative' | 'analysis'>('generative', 'analysis'),
        (specs, kind, type) => {
          const { registry, records, health, unhealthyProviders } = buildRegistry(specs);
          const op: RoutableOperation = { type, kind, changesVisualContent: true };

          // No fallback policy: outcome is fully determined by primary candidates.
          const decision = routeOperation(op, registry, health, {});
          const best = expectedBest(records, kind, unhealthyProviders);

          if (best === null) {
            // (c) No healthy supporting candidate -> explicit unavailable, no call.
            expect(decision.engine).toBe('unavailable');
            expect(decision).not.toHaveProperty('provider');
          } else {
            // (a) supports kind, (b) healthy, (c) highest rank w/ registry-order tie-break.
            expect(decision.engine).toBe(type);
            if (decision.engine === 'generative' || decision.engine === 'analysis') {
              expect(decision.provider).toBe(best.provider);
              expect(decision.model).toBe(best.model);
              // Selected candidate genuinely supports the op and is healthy.
              expect(best.supportedOperations).toContain(kind);
              expect(unhealthyProviders.has(best.provider)).toBe(false);
            }
          }
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('breaks priority ties by registry order (first-listed candidate wins)', () => {
    fc.assert(
      fc.property(
        genOpKind,
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 0, max: 10 }),
        (kind, count, rank) => {
          // All candidates support `kind`, share the same priorityRank, all healthy.
          const specs: CandidateSpec[] = Array.from({ length: count }, () => ({
            supportedOperations: [kind],
            priorityRank: rank,
            healthy: true,
          }));
          const { registry, health } = buildRegistry(specs);
          const decision = routeOperation(
            { type: 'generative', kind, changesVisualContent: true },
            registry,
            health,
          );
          expect(decision.engine).toBe('generative');
          if (decision.engine === 'generative') {
            // The first-registered candidate (p0/m0) wins the tie.
            expect(decision.provider).toBe('p0');
            expect(decision.model).toBe('m0');
          }
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('applies the fallback policy in order when the primary kind has no healthy candidate', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(genOpKind, { minLength: 2, maxLength: 2 }),
        (kinds) => {
          const [primary, fallback] = kinds;
          // Only a provider for the FALLBACK kind exists and is healthy.
          const { registry, health } = buildRegistry([
            { supportedOperations: [fallback], priorityRank: 5, healthy: true },
          ]);
          const policy: RoutingPolicy = { fallbackOperationKinds: [fallback] };
          const decision = routeOperation(
            { type: 'generative', kind: primary, changesVisualContent: true },
            registry,
            health,
            policy,
          );
          expect(decision.engine).toBe('generative');
          if (decision.engine === 'generative') {
            expect(decision.provider).toBe('p0');
          }
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('excludes unhealthy providers and re-includes them once healthy again (Req 6.7, 6.8)', () => {
    fc.assert(
      fc.property(genOpKind, fc.integer({ min: 1, max: 10 }), (kind, rank) => {
        // Single provider supporting `kind`.
        const records = [makeCaps(0, [kind], rank)];
        let registry = ProviderCapabilityRegistryCore.create();
        const r = registry.register(records[0]);
        if (r.ok) registry = r.registry;
        const op: RoutableOperation = { type: 'generative', kind, changesVisualContent: true };

        // While unhealthy: excluded -> unavailable, no provider call.
        const unhealthy = routeOperation(op, registry, healthViewFromUnhealthy(['p0']));
        expect(unhealthy.engine).toBe('unavailable');

        // After recovery (fresh health view): re-included for the next operation.
        const recovered = routeOperation(op, registry, healthViewFromUnhealthy([]));
        expect(recovered.engine).toBe('generative');
        if (recovered.engine === 'generative') expect(recovered.provider).toBe('p0');
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 17: Every non-deterministic routing decision records provider, model, and reason
// Validates: Requirements 6.6
// ---------------------------------------------------------------------------

describe('Property 17: Every non-deterministic routing decision records provider, model, and reason', () => {
  it('generative/analysis selections carry a non-empty provider, model, and reason', () => {
    fc.assert(
      fc.property(
        fc.array(candidateSpec, { maxLength: 8 }),
        genOpKind,
        fc.constantFrom<'generative' | 'analysis'>('generative', 'analysis'),
        (specs, kind, type) => {
          const { registry, health } = buildRegistry(specs);
          const decision = routeOperation({ type, kind, changesVisualContent: true }, registry, health, {});

          // Every decision carries a non-empty reason...
          expect(typeof decision.reason).toBe('string');
          expect(decision.reason.trim().length).toBeGreaterThan(0);

          // ...and non-deterministic selections additionally record provider & model.
          if (decision.engine === 'generative' || decision.engine === 'analysis') {
            expect(typeof decision.provider).toBe('string');
            expect(decision.provider.length).toBeGreaterThan(0);
            expect(typeof decision.model).toBe('string');
            expect(decision.model.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });
});
