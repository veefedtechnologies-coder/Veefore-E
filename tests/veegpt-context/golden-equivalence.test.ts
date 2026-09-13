import { describe, it, expect } from 'vitest';
import {
  EQUIVALENCE_CASES,
  checkEquivalence,
  runOptimized,
  buildLegacyBaseline,
  toComposeInput,
  toolNames,
  LEDGER_META_KEYS,
  type EquivalenceCase,
} from './golden-equivalence.harness';
import { STATIC_MODULES } from '../../server/routes/veegpt-modules';

// Feature: veegpt-context-optimization — golden/equivalence Regression_Suite (task 10.1)
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 20.1, 20.2, 20.3, 20.4, 20.5
//
// The optimized (flag-on) context path must be BEHAVIOR-EQUIVALENT to the legacy
// (flag-off) path for identical deterministic inputs (mocked provider): same
// tool/module selection safeguards, memory behavior, persona outcome, streaming
// event / API / ledger shape — asserted over the composed request and the
// deterministic behaviors, never the stochastic model prose. On any failing case
// the harness reverts to baseline behavior for that case and surfaces a
// regression indicator (Req 3.6 / 20.5).

describe('Golden/equivalence Regression_Suite · optimized path ≡ legacy path', () => {
  it('covers the representative deterministic categories (Req 2.2 / 20.1)', () => {
    const categories = new Set(EQUIVALENCE_CASES.map((c) => c.category));
    // A spread across the behavior categories the Baseline_Benchmark defines.
    for (const expected of [
      'simple-chat',
      'follow-up',
      'content-creation',
      'analytics',
      'social-listening',
      'scheduling',
      'automation-multitool',
      'memory-dependent',
      'persona-dependent',
      'ambiguous',
      'complex-reasoning',
      'long-conversation',
    ]) {
      expect(categories.has(expected)).toBe(true);
    }
    expect(EQUIVALENCE_CASES.length).toBeGreaterThanOrEqual(12);
  });

  describe.each(EQUIVALENCE_CASES.map((c) => [c.name, c] as const))(
    'case: %s',
    (_name, testCase: EquivalenceCase) => {
      const report = checkEquivalence(testCase);

      it('is behavior-equivalent to the legacy baseline on every dimension', () => {
        const failing = report.dimensions.filter((d) => !d.pass);
        // Surface exactly which dimension(s) diverged for a fast diagnosis.
        expect(
          failing,
          `regressions: ${failing.map((f) => `${f.dimension} → ${f.detail ?? ''}`).join('; ')}`
        ).toEqual([]);
        expect(report.equivalent).toBe(true);
        expect(report.regression).toBe(false);
        expect(report.revertedTo).toBeNull();
      });
    }
  );

  it('every case exposes only tools within the user’s tier (Req 11.4 / 20.2)', () => {
    for (const c of EQUIVALENCE_CASES) {
      const legacy = buildLegacyBaseline(c);
      const opt = runOptimized(c);
      // Optimized never exposes a tool the legacy tier-permitted set didn't have.
      const legacySet = new Set(legacy.tierToolNames);
      for (const name of opt.exposedToolNames) {
        expect(legacySet.has(name), `${c.name}: ${name} not in legacy tier set`).toBe(true);
      }
    }
  });

  it('static safety/instruction modules render byte-identically on both paths (Req 3.3)', () => {
    for (const c of EQUIVALENCE_CASES) {
      const ctx = toComposeInput(c.input);
      const opt = runOptimized(c);
      for (const sm of STATIC_MODULES) {
        const legacyRender = sm.render(ctx);
        if (!legacyRender.trim()) continue;
        const seg = opt.segments.find((s) => s.moduleId === sm.id);
        expect(seg, `${c.name}: static module ${sm.id} missing`).toBeDefined();
        expect(seg!.content).toBe(legacyRender);
      }
    }
  });

  it('the composed telemetry maps to the stable ledger meta shape (Req 24 / 20)', () => {
    for (const c of EQUIVALENCE_CASES) {
      const opt = runOptimized(c);
      const report = checkEquivalence(c);
      const metaDim = report.dimensions.find((d) => d.dimension === 'contract:ledger-meta-shape');
      expect(metaDim?.pass, `${c.name}: ${metaDim?.detail}`).toBe(true);
      // The exposed-tools list in telemetry matches what was actually exposed.
      expect([...opt.telemetry.exposedTools].sort()).toEqual(opt.exposedToolNames);
      // Every ledger meta key is a string label the metering path expects.
      expect(LEDGER_META_KEYS.length).toBeGreaterThan(0);
    }
  });
});

describe('Golden/equivalence harness · regression detection + revert-to-baseline (Req 3.6 / 20.5)', () => {
  it('surfaces a regression and reverts the affected case to baseline when a needed tool is dropped', () => {
    // Inject a divergence: declare a required tool that the optimized path will
    // NOT expose for this simple-chat case (it exposes none). The harness must
    // detect the mismatch, flag a regression, and revert that case to baseline.
    const broken: EquivalenceCase = {
      name: 'injected regression — needed tool dropped',
      category: 'simple-chat',
      input: { message: 'hey there!', tier: 'advanced' },
      golden: { requiredTools: ['schedule_post'] },
    };

    const report = checkEquivalence(broken);
    expect(report.regression).toBe(true);
    expect(report.equivalent).toBe(false);
    expect(report.revertedTo).toBe('baseline');
    expect(report.dimensions.some((d) => d.dimension === 'tools:required-retained' && !d.pass)).toBe(true);
  });

  it('surfaces a regression when an exact golden tool set does not match', () => {
    const broken: EquivalenceCase = {
      name: 'injected regression — wrong exact set',
      category: 'content-creation',
      input: { message: 'write me a caption', tier: 'advanced' },
      // Claim NO tools should be exposed, but content_generation intent exposes some.
      golden: { exposedTools: [], requiredTools: [] },
    };
    const report = checkEquivalence(broken);
    expect(report.regression).toBe(true);
    expect(report.revertedTo).toBe('baseline');
  });

  it('passes clean (no regression) for a well-formed case', () => {
    const clean: EquivalenceCase = {
      name: 'clean case',
      category: 'simple-chat',
      input: { message: 'hi', tier: 'advanced' },
      golden: { exposedTools: [], requiredTools: [] },
    };
    const report = checkEquivalence(clean);
    expect(report.regression).toBe(false);
    expect(report.revertedTo).toBeNull();
  });
});
