/**
 * Tests for the per-WORKSPACE generative video DAILY BUDGET guardrail.
 *
 * Why the guardrail exists: `generativeVideoApiKey()` resolves only server env
 * keys, so every workspace shares ONE Google key, and Google meters its daily
 * generate-request quota PER KEY. This app-side counter stops one workspace from
 * burning the shared pool.
 *
 * Covers:
 *  - the PURE helpers (`resolveDailyLimit`, `msUntilNextUtcMidnight`) with zero Redis;
 *  - the counter + FAIL-OPEN behaviour of `GenerativeDailyBudget` against a fake Redis;
 *  - the chat driver gate: under budget proceeds, over budget returns needs_async
 *    with NO provider call, a throwing budget fails open, and no env var = no gating.
 *
 * No real Google calls: the generative service is always an injected fake.
 *
 * Framework: vitest.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  GenerativeDailyBudget,
  resolveDailyLimit,
  msUntilNextUtcMidnight,
  budgetKey,
  DAILY_LIMIT_ENV_VAR,
  type DailyBudgetRedis,
} from '../server/features/video-editor/services/generative-daily-budget';
import { runChatVideoEditTurn } from '../server/features/video-editor/services/chat-video-edit.service';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('resolveDailyLimit (pure)', () => {
  it('is DISABLED (0) when the env var is unset or blank', () => {
    expect(resolveDailyLimit({})).toBe(0);
    expect(resolveDailyLimit({ [DAILY_LIMIT_ENV_VAR]: '' })).toBe(0);
    expect(resolveDailyLimit({ [DAILY_LIMIT_ENV_VAR]: '   ' })).toBe(0);
  });

  it('is DISABLED for zero, negative, and non-integer/garbage values', () => {
    expect(resolveDailyLimit({ [DAILY_LIMIT_ENV_VAR]: '0' })).toBe(0);
    expect(resolveDailyLimit({ [DAILY_LIMIT_ENV_VAR]: '-3' })).toBe(0);
    expect(resolveDailyLimit({ [DAILY_LIMIT_ENV_VAR]: 'abc' })).toBe(0);
    expect(resolveDailyLimit({ [DAILY_LIMIT_ENV_VAR]: '1.5' })).toBe(0);
    expect(resolveDailyLimit({ [DAILY_LIMIT_ENV_VAR]: 'NaN' })).toBe(0);
  });

  it('resolves a positive integer limit', () => {
    expect(resolveDailyLimit({ [DAILY_LIMIT_ENV_VAR]: '5' })).toBe(5);
    expect(resolveDailyLimit({ [DAILY_LIMIT_ENV_VAR]: ' 20 ' })).toBe(20);
  });
});

describe('msUntilNextUtcMidnight (pure)', () => {
  const DAY_MS = 86_400_000;

  it('returns a full day exactly at UTC midnight', () => {
    expect(msUntilNextUtcMidnight(Date.UTC(2024, 4, 17, 0, 0, 0))).toBe(DAY_MS);
  });

  it('returns the remaining window mid-day', () => {
    expect(msUntilNextUtcMidnight(Date.UTC(2024, 4, 17, 23, 59, 59))).toBe(1_000);
    expect(msUntilNextUtcMidnight(Date.UTC(2024, 4, 17, 12, 0, 0))).toBe(DAY_MS / 2);
  });

  it('always stays inside (0, DAY_MS] and tolerates a non-finite input', () => {
    for (const ms of [0, 1, 1_700_000_000_123, Date.UTC(2030, 0, 1, 6, 30, 0)]) {
      const remaining = msUntilNextUtcMidnight(ms);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(DAY_MS);
    }
    expect(msUntilNextUtcMidnight(Number.NaN)).toBe(DAY_MS);
  });

  it('buckets the key by workspace + UTC date', () => {
    expect(budgetKey('w1', Date.UTC(2024, 4, 17, 12, 0, 0))).toBe(
      'veditor:genbudget:w1:2024-05-17',
    );
  });
});

// ---------------------------------------------------------------------------
// GenerativeDailyBudget — counter + fail-open (fake Redis, no connection)
// ---------------------------------------------------------------------------

/** Minimal in-memory Redis double recording INCR/EXPIRE. */
function fakeRedis(): DailyBudgetRedis & { counts: Map<string, number>; ttls: Map<string, number> } {
  const counts = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
    counts,
    ttls,
    async incr(key: string) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    async expire(key: string, seconds: number) {
      ttls.set(key, seconds);
      return 1;
    },
  };
}

describe('GenerativeDailyBudget', () => {
  const now = Date.UTC(2024, 4, 17, 12, 0, 0);

  it('short-circuits (allowed, no Redis touched) when disabled', async () => {
    const redis = fakeRedis();
    const budget = new GenerativeDailyBudget({ env: {}, getRedis: () => redis });

    const decision = await budget.tryConsume('w1', now);

    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBe(0);
    expect(redis.counts.size).toBe(0);
  });

  it('allows up to the limit then blocks, and sets the TTL only on the new key', async () => {
    const redis = fakeRedis();
    const budget = new GenerativeDailyBudget({
      env: { [DAILY_LIMIT_ENV_VAR]: '2' },
      getRedis: () => redis,
    });

    const first = await budget.tryConsume('w1', now);
    const second = await budget.tryConsume('w1', now);
    const third = await budget.tryConsume('w1', now);

    expect([first.allowed, second.allowed, third.allowed]).toEqual([true, true, false]);
    expect(third.used).toBe(3);
    expect(third.limit).toBe(2);
    expect(third.resetsInMs).toBe(43_200_000);
    // TTL written exactly once (when INCR returned 1), covering the UTC day.
    expect(redis.ttls.get(budgetKey('w1', now))).toBe(43_200);
  });

  it('counts each workspace and each UTC day separately', async () => {
    const redis = fakeRedis();
    const budget = new GenerativeDailyBudget({
      env: { [DAILY_LIMIT_ENV_VAR]: '1' },
      getRedis: () => redis,
    });

    expect((await budget.tryConsume('w1', now)).allowed).toBe(true);
    expect((await budget.tryConsume('w1', now)).allowed).toBe(false);
    // Different workspace → its own bucket.
    expect((await budget.tryConsume('w2', now)).allowed).toBe(true);
    // Next UTC day → fresh bucket for w1.
    expect((await budget.tryConsume('w1', now + 86_400_000)).allowed).toBe(true);
  });

  it('FAILS OPEN when Redis is unavailable or a command throws', async () => {
    const warn = vi.fn();
    const throwingClient: DailyBudgetRedis = {
      async incr() {
        throw new Error('ECONNREFUSED');
      },
      async expire() {
        return 1;
      },
    };
    const budget = new GenerativeDailyBudget({
      env: { [DAILY_LIMIT_ENV_VAR]: '1' },
      getRedis: () => throwingClient,
      logger: { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() },
    });

    const decision = await budget.tryConsume('w1', now);

    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBe(1);
    // String-first logging contract.
    expect(typeof warn.mock.calls[0][0]).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// runChatVideoEditTurn — the generative gate
// ---------------------------------------------------------------------------

describe('runChatVideoEditTurn — generative daily budget gate', () => {
  const source = {
    sourceId: 'src-1',
    storageKey: 'video-editor/p1/sources/x.mp4',
    fileName: 'src-1.mp4',
    durationMs: 30_000,
  };

  let savedKey: string | undefined;
  let savedLimit: string | undefined;

  beforeEach(() => {
    savedKey = process.env.GEMINI_IMAGE_API_KEY;
    savedLimit = process.env[DAILY_LIMIT_ENV_VAR];
    // The driver only routes to the generative path when a Google key exists.
    // The provider itself is an injected fake, so no real call can happen.
    process.env.GEMINI_IMAGE_API_KEY = 'test-key-not-used';
    delete process.env[DAILY_LIMIT_ENV_VAR];
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.GEMINI_IMAGE_API_KEY;
    else process.env.GEMINI_IMAGE_API_KEY = savedKey;
    if (savedLimit === undefined) delete process.env[DAILY_LIMIT_ENV_VAR];
    else process.env[DAILY_LIMIT_ENV_VAR] = savedLimit;
  });

  /** A generative-only (object_removal) turn with every collaborator faked. */
  function generativeDeps() {
    return {
      store: {
        findById: vi.fn().mockResolvedValue({
          projectId: 'p1',
          userId: 'u1',
          workspaceId: 'w1',
          name: 'x',
          activeVersionId: 'v0',
          retentionPolicyAllowsSourceDeletion: false,
          status: 'active' as const,
        }),
      } as any,
      getSourceForEdit: vi.fn().mockResolvedValue(source),
      intentRouter: {
        classify: vi.fn().mockResolvedValue({
          status: 'classified',
          usage: [],
          intent: {
            action: 'VIDEO_EDIT',
            inputAssets: [],
            targetPlatform: null,
            targetAspectRatio: null,
            targetDurationMs: null,
            editingStyle: null,
            requestedChanges: ['remove the person'],
            protectedElements: [],
            brandRequirements: null,
            audioRequirements: null,
            captionRequirements: null,
            outputRequirements: null,
            qualityRequirements: null,
            confidence: 1,
            requiresGenerativeAI: true,
            requiresDeterministicEditing: false,
          },
        }),
      } as any,
      versionManager: {
        createVersion: vi.fn().mockResolvedValue({
          ok: true,
          version: { versionId: 'v1', parentVersionId: 'v0', timelineId: 't1' },
        }),
      } as any,
      planner: {
        plan: vi.fn().mockResolvedValue({
          plan: {
            projectGoal: 'remove',
            target: {
              platform: null,
              aspectRatio: null,
              maxDurationMs: null,
              recommendedDurationMs: null,
              exportProfile: '',
            },
            brand: null,
            operations: [
              {
                sequenceIndex: 0,
                type: 'generative',
                kind: 'object_removal',
                range: { startMs: 0, endMs: 30_000 },
                preservationConstraints: [],
                status: 'executable',
                params: { source: 'remove the person' },
              },
            ],
          },
          reasoning: { projectGoal: 'remove', editingStyle: null, usedLLM: false },
          usage: [],
          warnings: [],
        }),
      } as any,
      deterministicEditor: { execute: vi.fn(), executeAssembly: vi.fn() } as any,
      // Never hits FFmpeg/Gemini: the localizer honestly falls back to whole-clip.
      editLocalizer: { localize: vi.fn().mockResolvedValue({ kind: 'whole-clip' }) } as any,
      generativeVideo: {
        editVideo: vi.fn().mockResolvedValue({
          outcome: 'rendered',
          artifactId: 'art-gen-1',
          storageKey: 'video-editor/p1/renders/gen.mp4',
          mimeType: 'video/mp4',
          provider: 'google',
          model: 'gemini-omni-flash-preview',
        }),
        generateVideo: vi.fn(),
      } as any,
    };
  }

  it('proceeds to the provider when the workspace is UNDER budget', async () => {
    const deps = generativeDeps();
    const tryConsume = vi
      .fn()
      .mockResolvedValue({ allowed: true, limit: 5, used: 1, resetsInMs: 3_600_000 });

    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'remove the person' },
      { ...deps, generativeBudget: { tryConsume } },
    );

    expect(tryConsume).toHaveBeenCalledWith('w1');
    expect(deps.generativeVideo.editVideo).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('rendered');
  });

  it('returns needs_async with NO provider call when OVER budget', async () => {
    const deps = generativeDeps();
    const tryConsume = vi
      .fn()
      .mockResolvedValue({ allowed: false, limit: 5, used: 6, resetsInMs: 7_200_000 });

    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'remove the person' },
      { ...deps, generativeBudget: { tryConsume } },
    );

    expect(result.outcome).toBe('needs_async');
    if (result.outcome === 'needs_async') {
      expect(result.kind).toBe('object_removal');
      // Honest messaging: the limit, no charge, and when it resets.
      expect(result.message).toMatch(/daily limit/i);
      expect(result.message).toMatch(/not charged/i);
      expect(result.message).toMatch(/2 hours/);
    }
    // No provider call and no fabricated artifact.
    expect(deps.generativeVideo.editVideo).not.toHaveBeenCalled();
    expect(deps.generativeVideo.generateVideo).not.toHaveBeenCalled();
  });

  it('FAILS OPEN when the budget check itself rejects', async () => {
    const deps = generativeDeps();
    const tryConsume = vi.fn().mockRejectedValue(new Error('redis down'));

    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'remove the person' },
      { ...deps, generativeBudget: { tryConsume } },
    );

    expect(deps.generativeVideo.editVideo).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('rendered');
  });

  it('does NOT gate by default (env var unset → production singleton short-circuits)', async () => {
    const deps = generativeDeps();

    // No `generativeBudget` injected: the real singleton runs and, with the env
    // var unset, returns allowed WITHOUT touching Redis.
    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'remove the person' },
      deps,
    );

    expect(deps.generativeVideo.editVideo).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('rendered');
  });
});
