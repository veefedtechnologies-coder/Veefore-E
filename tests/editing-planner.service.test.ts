/**
 * Unit tests for the Editing_Planner LLM-bearing service shell
 * (`server/features/video-editor/services/editing-planner.service.ts`).
 *
 * Task 9.3 — the thin IO/LLM shell that completes the Editing_Planner. These
 * tests cover ONLY the responsibilities the shell owns (structural planning is
 * exercised by the pure-core property tests in `editing-planner.logic.test.ts`):
 *   • delegating structural planning to the pure core and stamping the LLM goal,
 *   • degrading to the pure-core derived goal on LLM failure/timeout (No-Mock),
 *   • propagating platform-preset / brand rejections as non-fatal warnings,
 *   • bounded variant fan-out,
 *   • prompt construction that never asks the model to plan operations,
 *   • tolerant reasoning-JSON parsing.
 *
 * Framework: vitest (per design test stack). A fake AI service is injected so
 * no real provider call is made.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  EditingPlannerService,
  buildReasoningPrompt,
  parseReasoning,
  type PlanRequest,
} from '../server/features/video-editor/services/editing-planner.service';
import type { PlannerAnalysis } from '../server/features/video-editor/services/editing-planner.logic';
import {
  normalizeVideoIntent,
  type VideoIntentCandidate,
} from '../server/features/video-editor/services/intent-extraction.logic';

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const ANALYSIS: PlannerAnalysis = { sourceDurationMs: 30_000, sceneBoundariesMs: [0, 15_000] };

function intentWith(overrides: Partial<VideoIntentCandidate> = {}) {
  return normalizeVideoIntent({
    action: 'VIDEO_SHORTEN',
    confidence: 1,
    requestedChanges: ['trim to 15 seconds'],
    ...overrides,
  } as VideoIntentCandidate);
}

/** A silent logger to keep test output clean. */
const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

/** Build a service with a stubbed `generateText`. */
function serviceWith(generateText: (...args: any[]) => Promise<string>, timeoutMs?: number) {
  return new EditingPlannerService({
    aiService: { generateText: generateText as any },
    logger: silentLogger,
    timeoutMs,
  });
}

function baseRequest(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return { intent: intentWith(), analysis: ANALYSIS, ...overrides };
}

// ---------------------------------------------------------------------------
// LLM goal/style reasoning + delegation
// ---------------------------------------------------------------------------

describe('EditingPlannerService.plan — LLM goal reasoning', () => {
  it('stamps the LLM-produced goal onto the never-null plan and delegates operations to the pure core', async () => {
    const generateText = vi
      .fn()
      .mockResolvedValue('{"projectGoal":"Tighten to a punchy 15s hook","editingStyle":"fast-paced"}');
    const service = serviceWith(generateText);

    const result = await service.plan(baseRequest());

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(result.reasoning.usedLLM).toBe(true);
    expect(result.plan.projectGoal).toBe('Tighten to a punchy 15s hook');
    expect(result.reasoning.editingStyle).toBe('fast-paced');
    // Operations come from the pure core: a shorten intent yields a trim + render.
    expect(result.plan.operations.length).toBeGreaterThan(0);
    expect(result.plan.operations.map((o) => o.kind)).toContain('trim');
    // Ranges are well-formed (pure core guarantee).
    for (const op of result.plan.operations) {
      expect(op.range.startMs).toBeGreaterThanOrEqual(0);
      expect(op.range.endMs).toBeGreaterThan(op.range.startMs);
      expect(op.range.endMs).toBeLessThanOrEqual(ANALYSIS.sourceDurationMs);
    }
  });

  it('falls back to the pure-core derived goal when the LLM call fails (never fabricates a plan)', async () => {
    const generateText = vi.fn().mockRejectedValue(new Error('provider down'));
    const service = serviceWith(generateText);

    const result = await service.plan(baseRequest());

    expect(result.reasoning.usedLLM).toBe(false);
    // Derived goal is deterministic from the intent — plan is still produced.
    expect(result.plan.projectGoal.length).toBeGreaterThan(0);
    expect(result.plan.operations.length).toBeGreaterThan(0);
    expect(result.usage).toEqual([]);
  });

  it('falls back when the LLM returns unparseable output', async () => {
    const generateText = vi.fn().mockResolvedValue('sorry, I cannot do that');
    const service = serviceWith(generateText);

    const result = await service.plan(baseRequest());

    expect(result.reasoning.usedLLM).toBe(false);
    expect(result.plan.operations.length).toBeGreaterThan(0);
  });

  it('degrades to the derived goal when the reasoning call exceeds its timeout budget', async () => {
    // generateText hangs; the service aborts at its (tiny) timeout and falls back.
    const generateText = vi.fn(
      (_prompt: string, _prefs: unknown, signal?: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const service = serviceWith(generateText, 10);

    const result = await service.plan(baseRequest());

    expect(result.reasoning.usedLLM).toBe(false);
    expect(result.plan.projectGoal.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Platform preset / brand warnings (Req 13.3, 13.5)
// ---------------------------------------------------------------------------

describe('EditingPlannerService.plan — preset & brand application', () => {
  it('surfaces an UNSUPPORTED_PLATFORM warning and leaves the plan unchanged for an unknown platform', async () => {
    const service = serviceWith(vi.fn().mockResolvedValue('{"projectGoal":"g","editingStyle":null}'));

    const result = await service.plan(baseRequest({ platform: 'not-a-real-platform' }));

    expect(result.warnings.map((w) => w.code)).toContain('UNSUPPORTED_PLATFORM');
    // Plan target platform is not set to the bad platform.
    expect(result.plan.target.platform).not.toBe('not-a-real-platform');
  });

  it('surfaces a BRAND_PROFILE_UNAVAILABLE warning when brand styling is requested with no profile', async () => {
    const service = serviceWith(vi.fn().mockResolvedValue('{"projectGoal":"g","editingStyle":null}'));

    const result = await service.plan(baseRequest({ applyBrand: true, brandProfile: null }));

    expect(result.warnings.map((w) => w.code)).toContain('BRAND_PROFILE_UNAVAILABLE');
    expect(result.plan.brand).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Variant fan-out (Req 16.9, 16.10)
// ---------------------------------------------------------------------------

describe('EditingPlannerService.plan — variant fan-out', () => {
  it('returns independent variants when 1 < count <= max', async () => {
    const service = serviceWith(vi.fn().mockResolvedValue('{"projectGoal":"g","editingStyle":null}'));

    const result = await service.plan(baseRequest({ variantCount: 3 }));

    expect(result.variants).toBeDefined();
    expect(result.variants).toHaveLength(3);
    // Variants are distinct object graphs.
    expect(result.variants![0]).not.toBe(result.variants![1]);
    // The primary plan is the first variant, and all carry the reasoned goal.
    for (const v of result.variants!) expect(v.projectGoal).toBe('g');
  });

  it('rejects a variant count above the ceiling with a warning but still returns a valid primary plan', async () => {
    const service = serviceWith(vi.fn().mockResolvedValue('{"projectGoal":"g","editingStyle":null}'));

    const result = await service.plan(baseRequest({ variantCount: 99 }));

    expect(result.warnings.map((w) => w.code)).toContain('VARIANT_LIMIT_EXCEEDED');
    expect(result.variants).toBeUndefined();
    expect(result.plan.operations.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Prompt construction (goal/style ONLY)
// ---------------------------------------------------------------------------

describe('buildReasoningPrompt', () => {
  it('asks only for goal/style JSON and forbids planning operations', () => {
    const prompt = buildReasoningPrompt(intentWith(), ANALYSIS);
    expect(prompt).toContain('projectGoal');
    expect(prompt).toContain('editingStyle');
    expect(prompt.toLowerCase()).toContain('do not');
    // The structured summary is embedded as JSON.
    expect(prompt).toContain('VIDEO_SHORTEN');
  });
});

// ---------------------------------------------------------------------------
// Reasoning JSON parsing
// ---------------------------------------------------------------------------

describe('parseReasoning', () => {
  it('parses a clean JSON object', () => {
    expect(parseReasoning('{"projectGoal":"go","editingStyle":"cinematic"}')).toEqual({
      projectGoal: 'go',
      editingStyle: 'cinematic',
    });
  });

  it('tolerates surrounding prose and markdown fences', () => {
    const raw = 'Here you go:\n```json\n{"projectGoal":"go","editingStyle":null}\n```\nthanks';
    expect(parseReasoning(raw)).toEqual({ projectGoal: 'go', editingStyle: null });
  });

  it('returns null for non-JSON input', () => {
    expect(parseReasoning('no json here')).toBeNull();
  });
});
