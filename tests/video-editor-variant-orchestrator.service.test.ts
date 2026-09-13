/**
 * Unit tests for the Variant orchestrator service
 * (`server/features/video-editor/services/variant-orchestrator.service.ts`).
 *
 * Task 19.3 — independent per-variant plan/render/meter (Req 16.9, 16.10). The
 * pure variant ceiling + fan-out is exercised by `editing-planner.logic.test.ts`
 * (Property 39); these tests cover the ONLY responsibilities the orchestration
 * shell owns:
 *   • rejecting a >5 request wholesale, creating NOTHING (Req 16.10),
 *   • fanning 1..5 variants into independent version + job + render + meter,
 *   • independence — one variant's failure/block never affects another,
 *   • metering only variants with a generative cost basis (Req 16.9),
 *   • deterministic variants rendering with no metering wrapper.
 *
 * Framework: vitest. All collaborators are injected fakes — no DB, queue,
 * FFmpeg, or ledger is touched.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  VariantOrchestratorService,
  VARIANT_ERROR_VERSION,
  VARIANT_ERROR_METERING_BLOCKED,
  type OrchestrateVariantsRequest,
  type PlannerPort,
  type VersionManagerPort,
  type JobSystemPort,
  type RenderPort,
  type MeteringPort,
} from '../server/features/video-editor/services/variant-orchestrator.service';
import type {
  EditingPlan,
  PlannerAnalysis,
} from '../server/features/video-editor/services/editing-planner.logic';
import {
  normalizeVideoIntent,
  type VideoIntentCandidate,
} from '../server/features/video-editor/services/intent-extraction.logic';
import type { RenderResult } from '../server/features/video-editor/services/render-engine.service';

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

const ANALYSIS: PlannerAnalysis = { sourceDurationMs: 30_000, sceneBoundariesMs: [0, 15_000] };

const INTENT = normalizeVideoIntent({
  action: 'VIDEO_SHORTEN',
  confidence: 1,
  requestedChanges: ['trim to 15 seconds'],
} as VideoIntentCandidate);

function makePlan(goal: string): EditingPlan {
  return {
    projectGoal: goal,
    target: {
      platform: null,
      aspectRatio: null,
      maxDurationMs: null,
      recommendedDurationMs: null,
      exportProfile: '',
    },
    operations: [],
    brand: null,
  };
}

/** A minimal successful render result (only the fields tests assert on matter). */
function okRender(jobId: string): RenderResult {
  return {
    ok: true,
    jobState: 'COMPLETED',
    artifact: { artifactId: `art-${jobId}` } as any,
    storageKey: `key-${jobId}`,
    url: `https://signed/${jobId}`,
    command: 'ffmpeg',
    outcome: {} as any,
  };
}

/** A failing render result. */
function failedRender(errorCode: string): RenderResult {
  return { ok: false, jobState: 'FAILED', errorCode, failedChecks: [] };
}

// ---- Fake collaborator ports ----------------------------------------------

/** Planner fake: fans out `variantCount` distinct plan objects. */
function fakePlanner(): PlannerPort & { calls: number } {
  const state = { calls: 0 };
  return {
    calls: 0,
    async plan(request) {
      state.calls++;
      (this as any).calls = state.calls;
      const count = request.variantCount ?? 1;
      const variants = Array.from({ length: count }, (_, i) => makePlan(`goal-${i}`));
      return {
        plan: variants[0],
        variants: count > 1 ? variants : undefined,
        reasoning: { projectGoal: 'goal-0', editingStyle: null, usedLLM: false },
        usage: [],
        warnings: [],
      } as any;
    },
  };
}

interface RecordingVersionManager extends VersionManagerPort {
  createdVersionIds: string[];
  createCalls: number;
}

/** Version-manager fake: returns a fresh version id per call. */
function fakeVersionManager(
  behaviour?: (index: number) => { ok: true } | { ok: false; error: string },
): RecordingVersionManager {
  const createdVersionIds: string[] = [];
  let createCalls = 0;
  return {
    createdVersionIds,
    get createCalls() {
      return createCalls;
    },
    async createVersion(_identity, request) {
      const index = createCalls;
      createCalls++;
      const decision = behaviour ? behaviour(index) : { ok: true as const };
      if (!decision.ok) {
        return { ok: false, error: decision.error };
      }
      const versionId = `ver-${request.timelineId}`;
      createdVersionIds.push(versionId);
      return { ok: true, version: { versionId, parentVersionId: null, timelineId: request.timelineId, createdAt: 0 } } as any;
    },
  };
}

interface RecordingJobSystem extends JobSystemPort {
  createdJobIds: string[];
}

/** Job-system fake: returns a deterministic job id per version+op. */
function fakeJobSystem(): RecordingJobSystem {
  const createdJobIds: string[] = [];
  return {
    createdJobIds,
    async createJob(input) {
      const jobId = `job-${input.versionId}-${input.opId}`;
      createdJobIds.push(jobId);
      return {
        jobId,
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        idempotencyKey: jobId,
        state: 'QUEUED',
        attempt: 1,
        timeoutSec: 60,
        progress: 0,
        completedStages: [],
        inputArtifactIds: [],
        outputArtifactIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;
    },
  };
}

interface RecordingRender extends RenderPort {
  renderedJobIds: string[];
}

/** Render fake: succeeds unless the jobId is in `failFor`. */
function fakeRender(failFor: Set<string> = new Set()): RecordingRender {
  const renderedJobIds: string[] = [];
  return {
    renderedJobIds,
    async render(request) {
      renderedJobIds.push(request.jobId);
      return failFor.has(request.jobId)
        ? failedRender('RENDER_VALIDATION_DURATION')
        : okRender(request.jobId);
    },
  };
}

/** Metering fake: wraps the operation, charging a fixed amount per variant. */
function fakeMetering(
  outcome: 'completed' | 'blocked' = 'completed',
): MeteringPort & { runs: number } {
  const state = { runs: 0 };
  return {
    get runs() {
      return state.runs;
    },
    async runGenerativeOperation(input) {
      state.runs++;
      if (outcome === 'blocked') {
        return {
          status: 'blocked',
          estimate: {} as any,
          reason: 'insufficient credits',
          required: 10,
          remaining: 2,
          upgradePath: { type: 'upgrade_or_add_credits', message: 'x', actions: ['add_credits'] },
        } as any;
      }
      const result = await input.operation(input.signal);
      return {
        status: 'completed',
        result,
        settlement: { charged: 5, remaining: 95 },
        estimate: {} as any,
      } as any;
    },
  };
}

function baseRequest(
  overrides: Partial<OrchestrateVariantsRequest> = {},
): OrchestrateVariantsRequest {
  return {
    identity: { projectId: 'proj-1', workspaceId: 'ws-1', userId: 'user-1' },
    intent: INTENT,
    analysis: ANALYSIS,
    variantCount: 3,
    exportProfileId: 'mp4_1080p',
    buildTimeline: () => ({ sequences: [], elements: [] }) as any,
    ...overrides,
  };
}

function makeService(ports: {
  planner?: PlannerPort;
  versionManager?: VersionManagerPort;
  jobSystem?: JobSystemPort;
  renderEngine?: RenderPort;
  metering?: MeteringPort;
}) {
  return new VariantOrchestratorService({
    planner: ports.planner ?? fakePlanner(),
    versionManager: ports.versionManager ?? fakeVersionManager(),
    jobSystem: ports.jobSystem ?? fakeJobSystem(),
    renderEngine: ports.renderEngine ?? fakeRender(),
    metering: ports.metering ?? fakeMetering(),
    logger: silentLogger,
  });
}

// ---------------------------------------------------------------------------
// Req 16.10 — >5 rejected, nothing created
// ---------------------------------------------------------------------------

describe('Variant orchestrator — ceiling (Req 16.10)', () => {
  it('rejects >5 variants and creates nothing (no plan, version, job, render, or charge)', async () => {
    const planner = fakePlanner();
    const versionManager = fakeVersionManager();
    const jobSystem = fakeJobSystem();
    const renderEngine = fakeRender();
    const metering = fakeMetering();
    const service = makeService({ planner, versionManager, jobSystem, renderEngine, metering });

    const result = await service.orchestrate(baseRequest({ variantCount: 6 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VARIANT_LIMIT_EXCEEDED');

    // Nothing was created.
    expect(planner.calls).toBe(0);
    expect(versionManager.createdVersionIds).toHaveLength(0);
    expect(jobSystem.createdJobIds).toHaveLength(0);
    expect(renderEngine.renderedJobIds).toHaveLength(0);
    expect(metering.runs).toBe(0);
  });

  it('rejects an invalid (non-integer / < 1) variant count with no work', async () => {
    const service = makeService({});
    const zero = await service.orchestrate(baseRequest({ variantCount: 0 }));
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.error.code).toBe('INVALID_VARIANT_COUNT');
  });
});

// ---------------------------------------------------------------------------
// Req 16.9 — 1..5 independent variants
// ---------------------------------------------------------------------------

describe('Variant orchestrator — independent fan-out (Req 16.9)', () => {
  it('produces one independent version, job, and render per requested variant', async () => {
    const versionManager = fakeVersionManager();
    const jobSystem = fakeJobSystem();
    const renderEngine = fakeRender();
    const service = makeService({ versionManager, jobSystem, renderEngine });

    const result = await service.orchestrate(baseRequest({ variantCount: 5 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.variants).toHaveLength(5);
    expect(result.variants.every((v) => v.ok)).toBe(true);

    // One distinct version + job + render per variant.
    expect(new Set(versionManager.createdVersionIds).size).toBe(5);
    expect(new Set(jobSystem.createdJobIds).size).toBe(5);
    expect(new Set(renderEngine.renderedJobIds).size).toBe(5);

    // Each variant carries its own version/job/render.
    result.variants.forEach((v, i) => {
      expect(v.index).toBe(i);
      expect(v.versionId).toBeTruthy();
      expect(v.jobId).toBeTruthy();
      expect(v.render?.ok).toBe(true);
    });
  });

  it('handles a single-variant request (planner returns only a primary plan)', async () => {
    const service = makeService({});
    const result = await service.orchestrate(baseRequest({ variantCount: 1 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Independence — one variant's failure never affects another
// ---------------------------------------------------------------------------

describe('Variant orchestrator — variant isolation (Req 16.9)', () => {
  it('a failed render on one variant leaves the others successful', async () => {
    const versionManager = fakeVersionManager();
    const jobSystem = fakeJobSystem();
    // Fail exactly the middle variant's job.
    const failing = new Set(['job-ver-variant-1-variant-1']);
    const renderEngine = fakeRender(failing);
    const service = makeService({ versionManager, jobSystem, renderEngine });

    const result = await service.orchestrate(baseRequest({ variantCount: 3 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.variants[0].ok).toBe(true);
    expect(result.variants[1].ok).toBe(false);
    expect(result.variants[1].render?.ok).toBe(false);
    expect(result.variants[2].ok).toBe(true);
    // All three still rendered independently.
    expect(renderEngine.renderedJobIds).toHaveLength(3);
  });

  it('a version-creation failure on one variant does not stop the others', async () => {
    // Reject only variant index 0's version.
    const versionManager = fakeVersionManager((index) =>
      index === 0 ? { ok: false, error: 'VERSION_PROJECT_NOT_FOUND' } : { ok: true },
    );
    const renderEngine = fakeRender();
    const service = makeService({ versionManager, renderEngine });

    const result = await service.orchestrate(baseRequest({ variantCount: 3 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.variants[0].ok).toBe(false);
    expect(result.variants[0].error?.code).toBe(VARIANT_ERROR_VERSION);
    expect(result.variants[0].render).toBeUndefined();
    expect(result.variants[1].ok).toBe(true);
    expect(result.variants[2].ok).toBe(true);
    // Only the two successful variants rendered.
    expect(renderEngine.renderedJobIds).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Metering per variant (Req 16.9)
// ---------------------------------------------------------------------------

describe('Variant orchestrator — independent metering (Req 16.9)', () => {
  it('meters each variant with a generative cost basis and records a settlement', async () => {
    const metering = fakeMetering('completed');
    const renderEngine = fakeRender();
    const service = makeService({ metering, renderEngine });

    const result = await service.orchestrate(
      baseRequest({
        variantCount: 3,
        costBasisFor: () => ({ outputSeconds: 5, costPerOutputSecondInr: 2 }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // One metered run per variant, each with its own settlement.
    expect(metering.runs).toBe(3);
    expect(result.variants.every((v) => v.metered)).toBe(true);
    expect(result.variants.every((v) => v.settlement?.charged === 5)).toBe(true);
    expect(renderEngine.renderedJobIds).toHaveLength(3);
  });

  it('does not meter purely deterministic variants (no cost basis)', async () => {
    const metering = fakeMetering('completed');
    const service = makeService({ metering });

    const result = await service.orchestrate(baseRequest({ variantCount: 2 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(metering.runs).toBe(0);
    expect(result.variants.every((v) => v.metered === false)).toBe(true);
  });

  it('a blocked variant (insufficient credits) fails alone without rendering', async () => {
    const metering = fakeMetering('blocked');
    const renderEngine = fakeRender();
    const service = makeService({ metering, renderEngine });

    const result = await service.orchestrate(
      baseRequest({
        variantCount: 2,
        costBasisFor: () => ({ outputSeconds: 5, costPerOutputSecondInr: 2 }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.variants.every((v) => !v.ok)).toBe(true);
    expect(result.variants[0].error?.code).toBe(VARIANT_ERROR_METERING_BLOCKED);
    // Blocked before any provider/render call.
    expect(renderEngine.renderedJobIds).toHaveLength(0);
  });
});
