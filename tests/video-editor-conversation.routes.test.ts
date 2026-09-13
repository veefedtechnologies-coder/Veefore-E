/**
 * Tests for the conversational multi-turn editing router (task 20.1,
 * Req 16.1, 16.2, 18.4).
 *
 * Framework: vitest + supertest.
 *
 * These exercise the wiring of a video-editing TURN over the NDJSON streaming
 * transport: Intent_Router → new Video_Version → Editing_Planner → Model_Router
 * → editors, asserting:
 *
 *  - a refinement that NAMES a parent version derives the new version from it
 *    (Req 16.1);
 *  - a refinement that names NONE derives it from the active version (Req 16.2);
 *  - progress is stage-derived and monotonically non-decreasing, reaching 100
 *    only at completion (Req 18.4, 23.2, 23.6);
 *  - a below-threshold intent (clarification) changes NOTHING — no version is
 *    created (Req 2.6);
 *  - the stream uses the same NDJSON event shape as the VeeGPT chat transport.
 *
 * Auth + workspace middleware are stubbed so identity is header-driven
 * (server-derived, Req 19.5); every collaborator is an injected stub, so the
 * test runs with no DB, LLM, or Redis.
 */

import { describe, it, expect, vi } from 'vitest';
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import request from 'supertest';

// Stub auth: identity comes from a test header (Req 19.5).
vi.mock('../server/middleware/require-auth', () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const userId = req.header('x-test-user');
    if (userId) (req as Request & { user?: unknown }).user = { id: userId };
    next();
  },
}));

// Stub workspace access: workspace from a test header.
vi.mock('../server/middleware/workspace-validation', () => ({
  validateWorkspaceAccess:
    () => (req: Request, _res: Response, next: NextFunction) => {
      const workspaceId = req.header('x-test-workspace');
      if (workspaceId) (req as Request & { workspaceId?: unknown }).workspaceId = workspaceId;
      next();
    },
}));

import {
  createVideoEditorConversationRouter,
  type ConversationRouterDeps,
} from '../server/features/video-editor/api/conversation.routes';
import type { VideoProjectStore, VideoProjectRecord } from '../server/features/video-editor/api/project.routes';

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

const OWNER = { user: 'owner-user', ws: 'owner-ws' };

function projectRecord(overrides: Partial<VideoProjectRecord> = {}): VideoProjectRecord {
  const now = new Date();
  return {
    projectId: 'proj-1',
    userId: OWNER.user,
    workspaceId: OWNER.ws,
    name: 'My clip',
    activeVersionId: 'vv-active',
    retentionPolicyAllowsSourceDeletion: false,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeStore(project: VideoProjectRecord): VideoProjectStore {
  return {
    async create() {
      throw new Error('not used');
    },
    async findById(projectId) {
      return projectId === project.projectId ? { ...project } : null;
    },
    async listByOwner() {
      return [{ ...project }];
    },
    async update() {
      return { ...project };
    },
    async softDelete() {
      return { ...project };
    },
  };
}

/** A minimal classified VideoIntent — the planner is stubbed so shape is inert. */
function classifiedIntent(overrides: Record<string, unknown> = {}) {
  return {
    action: 'VIDEO_EDIT',
    confidence: 0.95,
    inputAssets: null,
    targetPlatform: null,
    targetAspectRatio: null,
    targetDurationMs: null,
    editingStyle: null,
    requestedChanges: ['make it more cinematic'],
    protectedElements: null,
    brandRequirements: null,
    audioRequirements: null,
    captionRequirements: null,
    outputRequirements: null,
    qualityRequirements: null,
    requiresGenerativeAI: false,
    requiresDeterministicEditing: true,
    ...overrides,
  };
}

/** A plan with a single deterministic op + render op (planner is stubbed). */
function stubPlan() {
  return {
    plan: {
      projectGoal: 'Make it more cinematic',
      target: {},
      brand: null,
      operations: [
        {
          sequenceIndex: 0,
          type: 'deterministic',
          kind: 'color_grade',
          range: { startMs: 0, endMs: 15000 },
          preservationConstraints: [],
          status: 'executable',
          params: {},
        },
        {
          sequenceIndex: 1,
          type: 'render',
          kind: 'render',
          range: { startMs: 0, endMs: 15000 },
          preservationConstraints: [],
          status: 'executable',
          params: {},
        },
      ],
    },
    warnings: [],
    reasoning: { projectGoal: 'Make it more cinematic', editingStyle: null, usedLLM: false },
    usage: [],
  };
}

/** A single-generative-op plan (planner stubbed) for credit-estimate tests. */
function generativePlan() {
  return {
    plan: {
      projectGoal: 'Remove the background person',
      target: {},
      brand: null,
      operations: [
        {
          sequenceIndex: 0,
          type: 'generative',
          kind: 'remove_object',
          range: { startMs: 1000, endMs: 5000 },
          preservationConstraints: ['face'],
          status: 'executable',
          params: {},
        },
      ],
    },
    warnings: [],
    reasoning: { projectGoal: 'x', editingStyle: null, usedLLM: false },
    usage: [],
  };
}

/** Model-router stub that routes every op to the generative engine. */
function generativeModelRouter() {
  return {
    route: vi.fn(async () => ({
      decision: {
        engine: 'generative' as const,
        provider: 'gemini',
        model: 'omni-1',
        reason: 'stub',
      },
      persisted: true,
    })) as any,
  };
}

/**
 * A fake metering integration whose figures are server-authoritative (Req 17.6).
 * `affordable: false` yields a blocked gate outcome with an upgrade path (Req 17.9).
 */
function fakeMetering(opts: { affordable: boolean; balanceCredits?: number } = { affordable: true }) {
  const estimate = (cost: { outputSeconds: number; costPerOutputSecondInr: number }) => ({
    feature: 'videoGenerativeEdit' as const,
    outputSeconds: cost.outputSeconds,
    costPerOutputSecondInr: cost.costPerOutputSecondInr,
    providerCostInr: cost.outputSeconds * cost.costPerOutputSecondInr,
    estimatedCredits: 12,
    reservationCredits: 20,
  });
  return {
    estimate,
    gate: vi.fn(async (_userId: string, est: any) =>
      opts.affordable
        ? { allowed: true as const, estimate: est, balanceCredits: opts.balanceCredits ?? 100 }
        : {
            allowed: false as const,
            estimate: est,
            balanceCredits: opts.balanceCredits ?? 3,
            reason: 'Insufficient credits to run this edit',
            required: est.reservationCredits,
            remaining: opts.balanceCredits ?? 3,
            upgradePath: {
              type: 'upgrade_or_add_credits' as const,
              message: 'Insufficient credits to run this edit',
              actions: ['upgrade_plan', 'add_credits'] as const,
            },
          },
    ),
  } as any;
}

/** Assemble a router+app with stubbed collaborators; captures the version call. */
function makeApp(
  overrides: Partial<ConversationRouterDeps> = {},
): { app: Express; createVersionCalls: Array<{ identity: unknown; request: any }> } {
  const project = (overrides as { __project?: VideoProjectRecord }).__project ?? projectRecord();
  const createVersionCalls: Array<{ identity: unknown; request: any }> = [];

  const deps: ConversationRouterDeps = {
    store: makeStore(project),
    intentRouter: {
      classify: vi.fn(async () => ({
        status: 'classified' as const,
        intent: classifiedIntent() as any,
        usage: [],
      })),
    },
    versionManager: {
      createVersion: vi.fn(async (identity: unknown, req: any) => {
        createVersionCalls.push({ identity, request: req });
        // Derive the effective parent exactly as the pure core would: an
        // explicit parent, else the active version.
        const effectiveParent = req.parentVersionId ?? project.activeVersionId ?? null;
        return {
          ok: true as const,
          version: {
            versionId: 'vv-new',
            parentVersionId: effectiveParent,
            timelineId: req.timelineId,
            createdAt: Date.now(),
          },
        };
      }),
    },
    planner: {
      plan: vi.fn(async () => stubPlan() as any),
    },
    modelRouter: {
      route: vi.fn(async (op: any) => ({
        decision: { engine: op.type === 'render' ? 'render' : 'deterministic', reason: 'stub' },
        persisted: false,
      })) as any,
    },
    getSourceDurationMs: async () => 15000,
    getBaseTimelineId: async () => 'vt-base',
    getSourceForEdit: async () => null,
    createEditOperation: async () => {},
    enqueueGenerativeEdit: async () => 'queue-1',
    getJobSystem: async () => ({
      createJob: (async () => ({ jobId: 'job-1', idempotencyKey: 'idem-1' })) as any,
    }),
    generateTimelineId: () => 'vt-generated',
    generateOperationId: () => 'op-fixed',
  };

  delete (overrides as { __project?: VideoProjectRecord }).__project;

  const app = express();
  app.use(express.json());
  app.use(
    '/api/video-editor',
    createVideoEditorConversationRouter({ ...deps, ...overrides }),
  );
  return { app, createVersionCalls };
}

/** Parse a newline-delimited-JSON body into event objects. */
function parseNdjson(text: string): Array<Record<string, any>> {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Conversational editing over NDJSON (task 20.1)', () => {
  it('runs a full turn and streams the NDJSON pipeline events', async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ message: 'make it more cinematic' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');

    const events = parseNdjson(res.text);
    const types = events.map((e) => e.type);
    // The transport shape mirrors the VeeGPT chat stream.
    expect(types).toContain('status');
    expect(types).toContain('version');
    expect(types).toContain('plan');
    expect(types).toContain('routing');
    expect(types).toContain('complete');

    const complete = events.find((e) => e.type === 'complete');
    expect(complete?.outcome).toBe('planned');
    expect(complete?.stateChanged).toBe(true);
    expect(complete?.versionId).toBe('vv-new');
    expect(complete?.progress).toBe(100);
  });

  it('Req 16.1: a named parent version is used as the new version parent', async () => {
    const { app, createVersionCalls } = makeApp();

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ message: 'refine it', parentVersionId: 'vv-explicit' });

    expect(res.status).toBe(200);
    expect(createVersionCalls).toHaveLength(1);
    // The explicit parent is passed straight to the Version manager (Req 16.1).
    expect(createVersionCalls[0].request.parentVersionId).toBe('vv-explicit');

    const events = parseNdjson(res.text);
    const version = events.find((e) => e.type === 'version');
    expect(version?.parentVersionId).toBe('vv-explicit');
  });

  it('Req 16.2: without a named parent, the active version is the parent', async () => {
    const { app, createVersionCalls } = makeApp();

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ message: 'refine it' });

    expect(res.status).toBe(200);
    expect(createVersionCalls).toHaveLength(1);
    // No explicit parent → the router passes null; the manager derives active.
    expect(createVersionCalls[0].request.parentVersionId).toBeNull();

    const events = parseNdjson(res.text);
    const version = events.find((e) => e.type === 'version');
    expect(version?.parentVersionId).toBe('vv-active');
  });

  it('Req 18.4: progress is stage-derived, monotonic, and only 100 at completion', async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ message: 'make it more cinematic' });

    const events = parseNdjson(res.text);
    const progresses = events
      .filter((e) => typeof e.progress === 'number')
      .map((e) => e.progress as number);

    expect(progresses.length).toBeGreaterThan(0);
    // Monotonically non-decreasing (never interpolated backwards).
    for (let i = 1; i < progresses.length; i++) {
      expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1]);
    }
    // 100 appears only on the final complete event, never before.
    const completeIdx = events.findIndex((e) => e.type === 'complete');
    events.forEach((e, idx) => {
      if (typeof e.progress === 'number' && e.progress === 100) {
        expect(idx).toBe(completeIdx);
      }
    });
  });

  it('Req 2.6: a clarification turn creates no version and changes nothing', async () => {
    const { app, createVersionCalls } = makeApp({
      intentRouter: {
        classify: vi.fn(async () => ({
          status: 'clarification' as const,
          reason: 'Could you clarify what to change?',
          maxConfidence: 0.4,
          stateChanged: false as const,
          usage: [],
        })),
      },
    });

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ message: 'hmm' });

    expect(res.status).toBe(200);
    const events = parseNdjson(res.text);
    expect(events.find((e) => e.type === 'clarification')).toBeTruthy();
    const complete = events.find((e) => e.type === 'complete');
    expect(complete?.outcome).toBe('clarification');
    expect(complete?.stateChanged).toBe(false);
    // Nothing was created — no version (Req 2.6).
    expect(createVersionCalls).toHaveLength(0);
  });

  it('Req 16.3: a missing named parent is rejected with no version created', async () => {
    const { app } = makeApp({
      versionManager: {
        createVersion: vi.fn(async () => ({
          ok: false as const,
          error: 'VERSION_MISSING_PARENT',
        })),
      },
    });

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ message: 'refine', parentVersionId: 'ghost' });

    expect(res.status).toBe(200);
    const events = parseNdjson(res.text);
    const error = events.find((e) => e.type === 'error');
    expect(error?.code).toBe('PARENT_VERSION_NOT_FOUND');
    // The turn produced no version event.
    expect(events.find((e) => e.type === 'version')).toBeUndefined();
  });

  it('rejects a non-owner before streaming (Req 19.1, 19.2)', async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', 'intruder')
      .set('x-test-workspace', 'intruder-ws')
      .send({ message: 'refine' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PROJECT_ACCESS_DENIED');
  });

  it('rejects an empty message with a 400 (no stream, no state change)', async () => {
    const { app, createVersionCalls } = makeApp();

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ message: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(createVersionCalls).toHaveLength(0);
  });

  it('routes a generative op onto the generation queue with a job id', async () => {
    const enqueueSpy = vi.fn(async () => 'queue-gen-1');
    const { app } = makeApp({
      planner: {
        plan: vi.fn(async () => ({
          plan: {
            projectGoal: 'Remove the background person',
            target: {},
            brand: null,
            operations: [
              {
                sequenceIndex: 0,
                type: 'generative',
                kind: 'remove_object',
                range: { startMs: 1000, endMs: 5000 },
                preservationConstraints: ['face'],
                status: 'executable',
                params: {},
              },
            ],
          },
          warnings: [],
          reasoning: { projectGoal: 'x', editingStyle: null, usedLLM: false },
          usage: [],
        })) as any,
      },
      modelRouter: {
        route: vi.fn(async () => ({
          decision: {
            engine: 'generative' as const,
            provider: 'gemini',
            model: 'omni-1',
            reason: 'stub',
          },
          persisted: true,
        })) as any,
      },
      getSourceForEdit: async () => ({
        sourceId: 'src-1',
        storageKey: 'k',
        fileName: 'src-1.mp4',
        durationMs: 15000,
      }),
      enqueueGenerativeEdit: enqueueSpy,
      // Estimate/gate are server-authoritative; auto-confirm so the enqueue path runs.
      metering: fakeMetering({ affordable: true }),
      getOutputSecondRateInr: async () => 2,
      awaitConfirmation: async () => 'confirm',
    });

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ message: 'remove the person behind me' });

    expect(res.status).toBe(200);
    expect(enqueueSpy).toHaveBeenCalledTimes(1);

    const events = parseNdjson(res.text);
    const routing = events.find((e) => e.type === 'routing' && e.engine === 'generative');
    expect(routing?.provider).toBe('gemini');
    expect(routing?.jobId).toBe('job-1');
    expect(routing?.queueJobId).toBe('queue-gen-1');
    expect(routing?.status).toBe('queued');
  });

  // ── Credit-estimate confirmation flow (Req 17.6, 17.7, 17.8, 17.9) ────────

  const GEN_SOURCE = {
    sourceId: 'src-1',
    storageKey: 'k',
    fileName: 'src-1.mp4',
    durationMs: 15000,
  };

  it('Req 17.6/17.7: streams a server-computed estimate and enqueues only after confirm', async () => {
    const enqueueSpy = vi.fn(async () => 'queue-gen-1');
    const { app } = makeApp({
      planner: { plan: vi.fn(async () => generativePlan() as any) },
      modelRouter: generativeModelRouter(),
      getSourceForEdit: async () => GEN_SOURCE,
      enqueueGenerativeEdit: enqueueSpy,
      metering: fakeMetering({ affordable: true, balanceCredits: 100 }),
      getOutputSecondRateInr: async () => 2,
      awaitConfirmation: async () => 'confirm',
    });

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ message: 'remove the person behind me' });

    expect(res.status).toBe(200);
    const events = parseNdjson(res.text);

    // The estimate is entirely server-computed (Req 17.6): range 1000..5000 =>
    // 4 output seconds; rate 2 => providerCostInr 8.
    const estimate = events.find((e) => e.type === 'estimate');
    expect(estimate).toBeTruthy();
    expect(estimate?.outputSeconds).toBe(4);
    expect(estimate?.costPerOutputSecondInr).toBe(2);
    expect(estimate?.providerCostInr).toBe(8);
    expect(estimate?.estimatedCredits).toBe(12);
    expect(estimate?.reservationCredits).toBe(20);
    expect(estimate?.balanceCredits).toBe(100);
    expect(estimate?.affordable).toBe(true);
    expect(estimate?.confirmationTimeoutMs).toBe(300000);

    // The estimate precedes the routing/enqueue (confirmation gates execution).
    const estimateIdx = events.findIndex((e) => e.type === 'estimate');
    const routingIdx = events.findIndex((e) => e.type === 'routing' && e.engine === 'generative');
    expect(estimateIdx).toBeLessThan(routingIdx);

    // Confirmed → the generative job is enqueued (Req 17.7).
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(events[routingIdx]?.status).toBe('queued');
  });

  it('Req 17.8: a declined estimate enqueues no job (no provider call, no deduction)', async () => {
    const enqueueSpy = vi.fn(async () => 'queue-gen-1');
    const { app } = makeApp({
      planner: { plan: vi.fn(async () => generativePlan() as any) },
      modelRouter: generativeModelRouter(),
      getSourceForEdit: async () => GEN_SOURCE,
      enqueueGenerativeEdit: enqueueSpy,
      metering: fakeMetering({ affordable: true }),
      getOutputSecondRateInr: async () => 2,
      awaitConfirmation: async () => 'decline',
    });

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ message: 'remove the person behind me' });

    expect(res.status).toBe(200);
    expect(enqueueSpy).not.toHaveBeenCalled();
    const events = parseNdjson(res.text);
    expect(events.find((e) => e.type === 'estimate')).toBeTruthy();
    const routing = events.find((e) => e.type === 'routing' && e.engine === 'generative');
    expect(routing?.status).toBe('declined');
  });

  it('Req 17.8: a timed-out estimate enqueues no job', async () => {
    const enqueueSpy = vi.fn(async () => 'queue-gen-1');
    const { app } = makeApp({
      planner: { plan: vi.fn(async () => generativePlan() as any) },
      modelRouter: generativeModelRouter(),
      getSourceForEdit: async () => GEN_SOURCE,
      enqueueGenerativeEdit: enqueueSpy,
      metering: fakeMetering({ affordable: true }),
      getOutputSecondRateInr: async () => 2,
      awaitConfirmation: async () => 'timeout',
    });

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ message: 'remove the person behind me' });

    expect(res.status).toBe(200);
    expect(enqueueSpy).not.toHaveBeenCalled();
    const routing = parseNdjson(res.text).find(
      (e) => e.type === 'routing' && e.engine === 'generative',
    );
    expect(routing?.status).toBe('confirmation_timeout');
  });

  it('Req 17.9: an unaffordable estimate is blocked with an upgrade path and no enqueue', async () => {
    const enqueueSpy = vi.fn(async () => 'queue-gen-1');
    const awaitSpy = vi.fn(async () => 'confirm' as const);
    const { app } = makeApp({
      planner: { plan: vi.fn(async () => generativePlan() as any) },
      modelRouter: generativeModelRouter(),
      getSourceForEdit: async () => GEN_SOURCE,
      enqueueGenerativeEdit: enqueueSpy,
      metering: fakeMetering({ affordable: false, balanceCredits: 3 }),
      getOutputSecondRateInr: async () => 2,
      awaitConfirmation: awaitSpy,
    });

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ message: 'remove the person behind me' });

    expect(res.status).toBe(200);
    const events = parseNdjson(res.text);

    const estimate = events.find((e) => e.type === 'estimate');
    expect(estimate?.affordable).toBe(false);
    expect(estimate?.upgradePath?.type).toBe('upgrade_or_add_credits');

    const routing = events.find((e) => e.type === 'routing' && e.engine === 'generative');
    expect(routing?.status).toBe('blocked');
    expect(routing?.upgradePath?.actions).toContain('add_credits');

    // Blocked before any confirmation is awaited; nothing enqueued (Req 17.9).
    expect(awaitSpy).not.toHaveBeenCalled();
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('confirm side-channel: POST /converse/confirm resolves the pending estimate and enqueues', async () => {
    const enqueueSpy = vi.fn(async () => 'queue-gen-1');
    const { app } = makeApp({
      planner: { plan: vi.fn(async () => generativePlan() as any) },
      modelRouter: generativeModelRouter(),
      getSourceForEdit: async () => GEN_SOURCE,
      enqueueGenerativeEdit: enqueueSpy,
      metering: fakeMetering({ affordable: true }),
      getOutputSecondRateInr: async () => 2,
      // No awaitConfirmation injected — exercises the real HTTP side-channel.
      confirmationTimeoutMs: 5000,
    });

    // Fire the turn WITHOUT awaiting; it will pause awaiting confirmation. The
    // trailing `.then` forces supertest to dispatch the request now (a stored
    // Test is otherwise lazy and would not send until awaited).
    const conversePromise = request(app)
      .post('/api/video-editor/projects/proj-1/converse')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ message: 'remove the person behind me' })
      .then((r) => r);

    // Give the turn time to reach the estimate and register its pending resolver.
    await new Promise((r) => setTimeout(r, 200));

    const confirmRes = await request(app)
      .post('/api/video-editor/projects/proj-1/converse/confirm')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ decision: 'confirm' });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.success).toBe(true);
    expect(confirmRes.body.data.applied).toBe(true);

    const res = await conversePromise;
    expect(res.status).toBe(200);
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    const routing = parseNdjson(res.text).find(
      (e) => e.type === 'routing' && e.engine === 'generative',
    );
    expect(routing?.status).toBe('queued');
  });

  it('confirm side-channel: reports applied=false when no estimate awaits confirmation', async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse/confirm')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ decision: 'confirm' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.applied).toBe(false);
  });

  it('confirm side-channel: rejects an invalid decision and a non-owner', async () => {
    const { app } = makeApp();

    const bad = await request(app)
      .post('/api/video-editor/projects/proj-1/converse/confirm')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ decision: 'maybe' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const intruder = await request(app)
      .post('/api/video-editor/projects/proj-1/converse/confirm')
      .set('x-test-user', 'intruder')
      .set('x-test-workspace', 'intruder-ws')
      .send({ decision: 'confirm' });
    expect(intruder.status).toBe(403);
    expect(intruder.body.error.code).toBe('PROJECT_ACCESS_DENIED');
  });

  it('stop endpoint reports no active turn when none is running', async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/converse/stop')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stopped).toBe(false);
  });
});
