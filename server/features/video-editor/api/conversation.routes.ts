/**
 * Conversational multi-turn editing router (task 20.1, Req 16.1, 16.2, 18.4).
 *
 * Wires a single video-editing TURN over the SAME NDJSON-over-HTTP-POST
 * streaming transport VeeGPT chat uses (`server/routes/veegpt-chat.routes.ts`):
 * the response body stays open and the server writes newline-delimited JSON
 * events as the turn progresses. This deliberately reuses the established
 * transport shape — `status` / `chunk` / `complete` / `error` events — plus a
 * per-turn `AbortController` map for Stop, rather than inventing a parallel
 * WebSocket/SSE surface (design §"Conversational editing", §"Request/execution
 * model").
 *
 * A turn runs the pipeline:
 *
 *   Intent_Router → (new Video_Version) → Editing_Planner → Model_Router → editors
 *
 * and creates a NEW immutable version PER REFINEMENT:
 *   - a refinement that names a parent version derives the new version from it
 *     (Req 16.1);
 *   - a refinement that names none derives it from the currently active version
 *     (Req 16.2);
 *   - a named parent that does not exist is rejected with no version created
 *     (Req 16.3, enforced by the Version manager's pure core).
 *
 * Progress is ALWAYS stage-derived (Req 18.4, 23.2, 23.6): each streamed
 * `status` event carries an integer `progress` computed from the count of
 * completed pipeline stages — never a timer-interpolated value. Long-running
 * generative work is enqueued on the `video-generation` queue and the turn
 * reports the job id; it never blocks the request (Req 18.1).
 *
 * Every route is guarded by `requireAuth` then `validateWorkspaceAccess` and a
 * per-project ownership check, identical to the project router; userId and
 * workspaceId are always server-derived, never trusted from the client
 * (Req 19.1, 19.2, 19.5). Pre-stream failures (auth/ownership/validation) use
 * the `{ success, error }` JSON envelope; once the NDJSON stream has started,
 * failures are surfaced as `{"type":"error"}` events (No-Mock, Req 23.5).
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';

import { requireAuth } from '../../../middleware/require-auth';
import { validateWorkspaceAccess } from '../../../middleware/workspace-validation';
import { logger } from '../../../config/logger';
import {
  VideoSourceModel,
  VideoTimelineModel,
  VideoEditOperationModel,
} from '../../../models/VideoEditor';
import { VideoEditorQueueManager } from '../../../queues/videoEditorQueues';
import {
  mongoVideoProjectStore,
  type VideoProjectStore,
  type VideoProjectRecord,
} from './project.routes';
import { fail } from './error-envelope';
import {
  getIntentRouterService,
  type IntentRouterService,
} from '../services/intent-router.service';
import {
  getEditingPlannerService,
  type EditingPlannerService,
} from '../services/editing-planner.service';
import {
  getModelRouterService,
  type ModelRouterService,
} from '../services/model-router.service';
import type { RoutableOperation } from '../services/model-router.logic';
import {
  versionManagerService,
  type VersionManagerService,
} from '../services/version-manager.service';
import {
  getJobSystemService,
  type JobSystemService,
} from '../services/job-system.service';
import type { PlannerAnalysis } from '../services/editing-planner.logic';
import type { ProtectedElement } from '../services/intent-extraction.logic';
import type {
  GenerativeEditJobPayload,
} from '../services/generative-edit-worker';
import {
  getVideoGenerativeMeteringService,
  CONFIRMATION_TIMEOUT_MS,
  type VideoGenerativeMeteringService,
} from '../services/generative-metering.service';
import {
  getProviderCapabilityRegistry,
} from '../services/provider-capability-registry.service';

const COMPONENT = 'videoEditor.ConversationRouter';

/**
 * A user's decision on a presented credit estimate (Req 17.7, 17.8):
 *  - `confirm` — proceed; the generative job is enqueued;
 *  - `decline` — cancel with no provider call and no deduction (Req 17.8);
 *  - `timeout` — the 300 s confirmation window elapsed; cancelled (Req 17.8).
 */
export type ConfirmationDecision = 'confirm' | 'decline' | 'timeout';

// ── Per-project active-turn AbortController map (reuses VeeGPT's Stop model) ──
// One in-flight conversational turn per project, keyed by projectId — mirroring
// VeeGPT chat's per-conversation `activeAbortControllers`. Aborting cancels the
// bounded LLM calls (intent + plan) the turn awaits, and stops the pipeline from
// advancing to later stages within 5 s (Req 18.5). In-memory + single-instance,
// exactly like the chat transport it reuses.
const activeConversationTurns = new Map<string, AbortController>();

// ── Per-project pending generative-confirmation resolvers (Req 17.7, 17.8) ───
// While a turn awaits the user's decision on a presented credit estimate, its
// resolver is registered here keyed by projectId (one in-flight turn per project,
// mirroring `activeConversationTurns`). The `/converse/confirm` side-channel —
// which the client POSTs to, exactly like `/converse/stop` — resolves it. A
// generative provider job is NEVER enqueued until this resolves `confirm`
// (Req 17.7); a `decline`/`timeout`/abort cancels with no enqueue and no
// deduction (Req 17.8). In-memory + single-instance, like the transport it reuses.
const pendingGenerativeConfirmations = new Map<
  string,
  (decision: ConfirmationDecision) => void
>();

/**
 * Await the user's decision on a presented credit estimate, racing the explicit
 * `/converse/confirm` side-channel against the 300 s confirmation window
 * (Req 17.8) and the turn's abort signal (a client disconnect or Stop). A
 * timeout resolves `timeout`; an abort resolves `decline` — both mean the
 * operation is cancelled with no provider call and no deduction (Req 17.8). The
 * resolver is always de-registered on settle so no stale entry can leak.
 */
function awaitGenerativeConfirmation(
  projectId: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<ConfirmationDecision> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onAbort = () => settle('decline');
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      if (pendingGenerativeConfirmations.get(projectId) === register) {
        pendingGenerativeConfirmations.delete(projectId);
      }
    };
    const settle = (decision: ConfirmationDecision) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(decision);
    };
    const register = (decision: ConfirmationDecision) => settle(decision);

    if (signal.aborted) {
      resolve('decline');
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => settle('timeout'), timeoutMs);
    (timer as { unref?: () => void }).unref?.();
    pendingGenerativeConfirmations.set(projectId, register);
  });
}

// ── NDJSON transport helpers (identical shape to veegpt-chat.routes.ts) ──────

/** Set headers for a streaming NDJSON response (mirrors chat `initStreamResponse`). */
function initStreamResponse(res: Response): void {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  (res as unknown as { flushHeaders?: () => void }).flushHeaders?.();
}

/** Write one newline-delimited JSON event to the streaming response. */
function writeEvent(res: Response, event: Record<string, unknown>): void {
  try {
    res.write(JSON.stringify(event) + '\n');
  } catch {
    /* response already closed */
  }
}

// ── Stage-derived progress (Req 18.4, 23.2) ──────────────────────────────────
// Progress is the count of COMPLETED stages over the total, expressed as an
// integer percentage. It is never timer-interpolated and never reports 100 %
// before the final stage has actually completed.
const TURN_STAGES = ['classifying', 'versioning', 'planning', 'routing', 'complete'] as const;
type TurnStage = (typeof TURN_STAGES)[number];

/** Integer percentage derived from the number of stages completed so far. */
function progressForCompletedStages(completed: number): number {
  const total = TURN_STAGES.length;
  const clamped = Math.max(0, Math.min(completed, total));
  return Math.floor((clamped / total) * 100);
}

// ── Envelope helpers (pre-stream JSON errors) ────────────────────────────────
// `fail` is the shared Video Editor envelope helper (task 21.1) imported above;
// once the NDJSON stream has started, mid-stream failures are surfaced as
// `{"type":"error"}` events instead (No-Mock, Req 23.5).

interface RequestContext {
  userId: string;
  workspaceId: string;
}

/** Read the server-derived identity + active workspace (never client-provided, Req 19.5). */
function resolveContext(req: Request): RequestContext | null {
  const userId = (req as Request & { user?: { id?: unknown } }).user?.id;
  const workspaceId = (req as Request & { workspaceId?: unknown }).workspaceId;
  if (!userId || !workspaceId) return null;
  return { userId: String(userId), workspaceId: String(workspaceId) };
}

// ── Default IO helpers (injectable for tests) ────────────────────────────────

/** Default source-duration lookup: newest `VideoSource` for the project (Req 5.4). */
async function defaultGetSourceDurationMs(projectId: string): Promise<number | null> {
  const source = await VideoSourceModel.findOne({ projectId }).sort({ createdAt: -1 }).lean();
  const durationMs = (source as Record<string, unknown> | null)?.durationMs;
  return typeof durationMs === 'number' && durationMs > 0 ? durationMs : null;
}

/**
 * Default base-timeline resolution: the timeline snapshot the new version starts
 * from. A refinement composes on top of its base version's timeline; when the
 * project has no version/timeline yet (the first, root turn), returns null so the
 * caller mints a fresh timeline id.
 */
async function defaultGetBaseTimelineId(
  projectId: string,
  baseVersionId: string | null,
): Promise<string | null> {
  if (baseVersionId) {
    const forVersion = await VideoTimelineModel.findOne({ projectId, versionId: baseVersionId })
      .sort({ createdAt: -1 })
      .lean();
    const tid = (forVersion as Record<string, unknown> | null)?.timelineId;
    if (typeof tid === 'string' && tid.length > 0) return tid;
  }
  const latest = await VideoTimelineModel.findOne({ projectId }).sort({ createdAt: -1 }).lean();
  const tid = (latest as Record<string, unknown> | null)?.timelineId;
  return typeof tid === 'string' && tid.length > 0 ? tid : null;
}

/** Default newest-source lookup for an edit: immutable bytes + probe duration. */
async function defaultGetSourceForEdit(projectId: string): Promise<{
  sourceId: string;
  storageKey: string;
  fileName: string;
  durationMs: number;
} | null> {
  const source = await VideoSourceModel.findOne({ projectId }).sort({ createdAt: -1 }).lean();
  if (!source) return null;
  const s = source as Record<string, unknown>;
  const storageKey = typeof s.storageKey === 'string' ? s.storageKey : '';
  const sourceId = typeof s.sourceId === 'string' ? s.sourceId : '';
  const durationMs = typeof s.durationMs === 'number' ? s.durationMs : 0;
  if (!storageKey || !sourceId || durationMs <= 0) return null;
  const container = typeof s.container === 'string' ? s.container : 'mp4';
  return { sourceId, storageKey, fileName: `${sourceId}.${container}`, durationMs };
}

/** Default persistence of a planned `VideoEditOperation` before routing (Req 6.6). */
async function defaultCreateEditOperation(op: {
  operationId: string;
  projectId: string;
  sequenceIndex: number;
  type: RoutableOperation['type'];
  kind: string;
  startMs: number;
  endMs: number;
  preservationConstraints: string[];
  status: 'executable';
}): Promise<void> {
  await VideoEditOperationModel.create(op);
}

/**
 * Default per-output-second INR rate lookup for the routed provider/model, read
 * from the Provider_Capability_Registry (Req 7.1) — the estimate is NEVER
 * hardcoded. Returns null when the provider/model is unsupported so the caller
 * can surface a zero-cost/blocked estimate rather than fabricate a figure.
 */
async function defaultGetOutputSecondRateInr(
  provider: string,
  model: string,
): Promise<number | null> {
  const lookup = await getProviderCapabilityRegistry().lookup(provider, model);
  if (!lookup.supported) return null;
  const rate = lookup.caps.costPerOutputSecondInr;
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 ? rate : null;
}

/** Default enqueue of a generative edit onto the `video-generation` queue (Req 18.1). */
async function defaultEnqueueGenerativeEdit(input: {
  projectId: string;
  versionId: string;
  operationId: string;
  workspaceId: string;
  userId: string;
  idempotencyKey?: string;
  payload: GenerativeEditJobPayload;
}): Promise<string | null> {
  return VideoEditorQueueManager.enqueue('generation', {
    projectId: input.projectId,
    versionId: input.versionId,
    opId: input.operationId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
  });
}

// ── Router dependencies (injectable for tests) ───────────────────────────────

export interface ConversationRouterDeps {
  store?: VideoProjectStore;
  intentRouter?: Pick<IntentRouterService, 'classify'>;
  versionManager?: Pick<VersionManagerService, 'createVersion'>;
  planner?: Pick<EditingPlannerService, 'plan'>;
  modelRouter?: Pick<ModelRouterService, 'route'>;
  getJobSystem?: () => Promise<Pick<JobSystemService, 'createJob'>>;
  getSourceDurationMs?: (projectId: string) => Promise<number | null>;
  getBaseTimelineId?: (projectId: string, baseVersionId: string | null) => Promise<string | null>;
  getSourceForEdit?: (projectId: string) => Promise<{
    sourceId: string;
    storageKey: string;
    fileName: string;
    durationMs: number;
  } | null>;
  createEditOperation?: (op: {
    operationId: string;
    projectId: string;
    sequenceIndex: number;
    type: RoutableOperation['type'];
    kind: string;
    startMs: number;
    endMs: number;
    preservationConstraints: string[];
    status: 'executable';
  }) => Promise<void>;
  enqueueGenerativeEdit?: (input: {
    projectId: string;
    versionId: string;
    operationId: string;
    workspaceId: string;
    userId: string;
    idempotencyKey?: string;
    payload: GenerativeEditJobPayload;
  }) => Promise<string | null>;
  generateVersionLabel?: () => string;
  generateTimelineId?: () => string;
  generateOperationId?: () => string;
  /** Metering integration for the pre-execution estimate + affordability gate (Req 17.6, 17.7, 17.9). */
  metering?: Pick<VideoGenerativeMeteringService, 'estimate' | 'gate'>;
  /** Per-output-second INR rate lookup for the routed provider/model (Req 7.1). */
  getOutputSecondRateInr?: (provider: string, model: string) => Promise<number | null>;
  /**
   * Await the user's decision on a presented estimate (Req 17.7, 17.8).
   * Injectable so a supertest-driven test can resolve the decision synchronously
   * instead of racing the HTTP side-channel; defaults to the module-level helper
   * that the `/converse/confirm` route drives.
   */
  awaitConfirmation?: (
    projectId: string,
    signal: AbortSignal,
    timeoutMs: number,
  ) => Promise<ConfirmationDecision>;
  /** Confirmation window in ms (defaults to 300 s, Req 17.8). */
  confirmationTimeoutMs?: number;
}

/**
 * Build the conversational-editing router. Dependencies are injectable so a
 * supertest-driven test can drive the full turn (classify → version → plan →
 * route) without a database, LLM, or Redis.
 */
export function createVideoEditorConversationRouter(deps: ConversationRouterDeps = {}): Router {
  const router = Router();
  const store = deps.store ?? mongoVideoProjectStore;
  const getSourceDurationMs = deps.getSourceDurationMs ?? defaultGetSourceDurationMs;
  const getBaseTimelineId = deps.getBaseTimelineId ?? defaultGetBaseTimelineId;
  const getSourceForEdit = deps.getSourceForEdit ?? defaultGetSourceForEdit;
  const createEditOperation = deps.createEditOperation ?? defaultCreateEditOperation;
  const enqueueGenerativeEdit = deps.enqueueGenerativeEdit ?? defaultEnqueueGenerativeEdit;
  const getJobSystem = deps.getJobSystem ?? getJobSystemService;
  const generateTimelineId = deps.generateTimelineId ?? (() => `vt-${randomUUID()}`);
  const generateOperationId = deps.generateOperationId ?? (() => `op-${randomUUID()}`);
  const metering = deps.metering ?? getVideoGenerativeMeteringService();
  const getOutputSecondRateInr = deps.getOutputSecondRateInr ?? defaultGetOutputSecondRateInr;
  const awaitConfirmation = deps.awaitConfirmation ?? awaitGenerativeConfirmation;
  const confirmationTimeoutMs = deps.confirmationTimeoutMs ?? CONFIRMATION_TIMEOUT_MS;

  const resolveIntentRouter = (): Pick<IntentRouterService, 'classify'> =>
    deps.intentRouter ?? getIntentRouterService();
  const resolvePlanner = (): Pick<EditingPlannerService, 'plan'> =>
    deps.planner ?? getEditingPlannerService();
  const resolveModelRouter = (): Pick<ModelRouterService, 'route'> =>
    deps.modelRouter ?? getModelRouterService();
  const resolveVersionManager = (): Pick<VersionManagerService, 'createVersion'> =>
    deps.versionManager ?? versionManagerService;

  router.use(requireAuth, validateWorkspaceAccess());

  /** Resolve a project the requester owns, or send the error and return null. */
  async function resolveOwnedProject(
    req: Request,
    res: Response,
    ctx: RequestContext,
  ): Promise<VideoProjectRecord | null> {
    const project = await store.findById(req.params.id);
    if (!project || project.status === 'deleted') {
      fail(res, 404, 'PROJECT_NOT_FOUND', 'Video project not found');
      return null;
    }
    if (project.workspaceId !== ctx.workspaceId || project.userId !== ctx.userId) {
      logger.warn('Video conversation ownership denied', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: project.projectId,
      });
      fail(res, 403, 'PROJECT_ACCESS_DENIED', 'You do not have access to this video project');
      return null;
    }
    return project;
  }

  // POST /projects/:id/converse — run one conversational editing turn over the
  // NDJSON transport (Req 16.1, 16.2, 18.4). The message is the user's turn text;
  // an optional `parentVersionId` selects the version to refine (Req 16.1).
  router.post('/projects/:id/converse', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    // ── Ownership + input validation BEFORE the stream starts (JSON errors) ──
    const project = await resolveOwnedProject(req, res, ctx);
    if (!project) return; // error already sent

    const body = (req.body ?? {}) as Record<string, unknown>;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return fail(res, 400, 'VALIDATION_ERROR', 'message: a non-empty turn message is required');
    }
    const parentVersionId =
      typeof body.parentVersionId === 'string' && body.parentVersionId.trim().length > 0
        ? body.parentVersionId.trim()
        : null;
    const hasVideo = body.hasVideo === true;

    // ── Begin the NDJSON stream (reuses the VeeGPT transport shape) ──────────
    initStreamResponse(res);

    // Register a per-project AbortController so a Stop request (or client
    // disconnect) cancels the bounded LLM calls and halts stage advancement.
    const abortController = new AbortController();
    activeConversationTurns.set(project.projectId, abortController);
    const isAborted = () => abortController.signal.aborted;
    // A client disconnect aborts the in-flight LLM work (unlike VeeGPT chat, a
    // conversational EDIT turn has no long partial answer worth finishing; the
    // heavy work is enqueued and tracked by its own job id).
    req.on('close', () => {
      if (!res.writableEnded) abortController.abort(new Error('client-disconnect'));
    });

    let completedStages = 0;
    const emitStatus = (stage: TurnStage, statusText: string) => {
      writeEvent(res, {
        type: 'status',
        status: statusText,
        stage,
        progress: progressForCompletedStages(completedStages),
        projectId: project.projectId,
      });
    };
    /** Mark a stage complete and re-emit the derived progress. */
    const completeStage = (stage: TurnStage) => {
      completedStages += 1;
      writeEvent(res, {
        type: 'progress',
        stage,
        progress: progressForCompletedStages(completedStages),
        projectId: project.projectId,
      });
    };
    const emitError = (code: string, errorText: string) => {
      writeEvent(res, { type: 'error', code, error: errorText, projectId: project.projectId });
    };
    const finish = () => {
      if (activeConversationTurns.get(project.projectId) === abortController) {
        activeConversationTurns.delete(project.projectId);
      }
      if (!res.writableEnded) res.end();
    };

    try {
      // ── Stage 1 — Intent_Router (Req 2.1) ─────────────────────────────────
      emitStatus('classifying', 'Understanding your request…');
      const routeResult = await resolveIntentRouter().classify({
        message,
        hasVideo,
        forcedTool: 'video_editor',
        inputAssets: Array.isArray(body.inputAssets)
          ? (body.inputAssets as unknown[]).filter((a): a is string => typeof a === 'string')
          : undefined,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        aiModel: (req.user as { aiModel?: string } | undefined)?.aiModel,
        signal: abortController.signal,
      });

      if (isAborted()) {
        writeEvent(res, { type: 'stopped', projectId: project.projectId });
        return finish();
      }

      // Below-threshold confidence / no usable candidate → clarification, and
      // NOTHING is changed (Req 2.6): no version created, no plan, no routing.
      if (routeResult.status === 'clarification') {
        writeEvent(res, {
          type: 'clarification',
          reason: routeResult.reason,
          maxConfidence: routeResult.maxConfidence,
          stateChanged: false,
          projectId: project.projectId,
        });
        writeEvent(res, {
          type: 'complete',
          outcome: 'clarification',
          stateChanged: false,
          projectId: project.projectId,
        });
        logger.info('Video conversation turn requested clarification', {
          component: COMPONENT,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          projectId: project.projectId,
        });
        return finish();
      }

      if (routeResult.status === 'not_video_edit') {
        // The turn is not a video-editing turn; surface it explicitly and change
        // nothing. The VeeGPT surface handles non-edit turns through chat.
        writeEvent(res, {
          type: 'complete',
          outcome: 'not_video_edit',
          stateChanged: false,
          gateIntents: routeResult.gateIntents,
          projectId: project.projectId,
        });
        return finish();
      }

      const intent = routeResult.intent;
      completeStage('classifying');

      // A source is required to anchor operation ranges and to edit (Req 5.4).
      const sourceDurationMs = await getSourceDurationMs(project.projectId);
      if (sourceDurationMs === null) {
        emitError('NO_ANALYZABLE_SOURCE', 'The project has no analyzed source to edit against');
        return finish();
      }

      // ── Stage 2 — create a NEW immutable version per refinement (Req 16.1/16.2) ─
      emitStatus('versioning', 'Creating a new version…');
      const baseVersionId = parentVersionId ?? project.activeVersionId ?? null;
      const baseTimelineId =
        (await getBaseTimelineId(project.projectId, baseVersionId)) ?? generateTimelineId();

      const versionResult = await resolveVersionManager().createVersion(
        { projectId: project.projectId, workspaceId: ctx.workspaceId, userId: ctx.userId },
        {
          // Explicit parent → derive from it (Req 16.1); null → derive from the
          // active version (Req 16.2). A missing named parent is rejected by the
          // pure core with no version created (Req 16.3).
          parentVersionId,
          timelineId: baseTimelineId,
          label: message.slice(0, 120),
        },
      );

      if (!versionResult.ok) {
        // Missing parent (Req 16.3) or persistence failure — nothing was created.
        const code =
          versionResult.error === 'VERSION_MISSING_PARENT'
            ? 'PARENT_VERSION_NOT_FOUND'
            : versionResult.error;
        emitError(code, `Could not create a new version: ${versionResult.error}`);
        return finish();
      }

      const version = versionResult.version;
      writeEvent(res, {
        type: 'version',
        versionId: version.versionId,
        parentVersionId: version.parentVersionId,
        projectId: project.projectId,
      });
      completeStage('versioning');

      if (isAborted()) {
        writeEvent(res, { type: 'stopped', projectId: project.projectId });
        return finish();
      }

      // ── Stage 3 — Editing_Planner against the new version state (Req 5.1) ──
      emitStatus('planning', 'Planning the edit…');
      const analysis: PlannerAnalysis = { sourceDurationMs };
      const planResult = await resolvePlanner().plan({
        intent,
        analysis,
        platform: intent.targetPlatform ?? project.targetPlatform ?? null,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        aiModel: (req.user as { aiModel?: string } | undefined)?.aiModel,
        signal: abortController.signal,
      });

      if (isAborted()) {
        writeEvent(res, { type: 'stopped', projectId: project.projectId });
        return finish();
      }

      writeEvent(res, {
        type: 'plan',
        versionId: version.versionId,
        projectGoal: planResult.plan.projectGoal,
        operationCount: planResult.plan.operations.length,
        operations: planResult.plan.operations.map((op) => ({
          sequenceIndex: op.sequenceIndex,
          type: op.type,
          kind: op.kind,
          range: op.range,
          status: op.status,
          limitation: op.limitation,
        })),
        warnings: planResult.warnings,
        projectId: project.projectId,
      });
      completeStage('planning');

      // ── Stage 4 — Model_Router → editors, operation by operation (Req 6.x) ─
      emitStatus('routing', 'Routing operations to the right engine…');
      const source = await getSourceForEdit(project.projectId);
      const routedOps: Array<Record<string, unknown>> = [];

      for (const op of planResult.plan.operations) {
        if (isAborted()) {
          writeEvent(res, { type: 'stopped', projectId: project.projectId });
          return finish();
        }
        // Only executable operations are routed; unavailable/error ops are
        // surfaced with their limitation and never executed (Req 5.6).
        if (op.status !== 'executable') {
          const entry = {
            sequenceIndex: op.sequenceIndex,
            kind: op.kind,
            status: op.status,
            limitation: op.limitation ?? null,
          };
          routedOps.push(entry);
          writeEvent(res, { type: 'routing', ...entry, projectId: project.projectId });
          continue;
        }

        const operationId = generateOperationId();
        await createEditOperation({
          operationId,
          projectId: project.projectId,
          sequenceIndex: op.sequenceIndex,
          type: op.type,
          kind: op.kind,
          startMs: op.range.startMs,
          endMs: op.range.endMs,
          preservationConstraints: op.preservationConstraints ?? [],
          status: 'executable',
        });

        const routable: RoutableOperation = {
          type: op.type,
          kind: op.kind,
          changesVisualContent:
            typeof (op.params as { changesVisualContent?: unknown })?.changesVisualContent ===
            'boolean'
              ? ((op.params as { changesVisualContent?: boolean }).changesVisualContent as boolean)
              : undefined,
        };
        const { decision } = await resolveModelRouter().route(routable, {
          operationId,
          projectId: project.projectId,
        });

        if (decision.engine === 'unavailable') {
          const entry = {
            sequenceIndex: op.sequenceIndex,
            operationId,
            kind: op.kind,
            engine: 'unavailable' as const,
            reason: decision.reason,
          };
          routedOps.push(entry);
          writeEvent(res, { type: 'routing', ...entry, projectId: project.projectId });
          continue;
        }

        // Generative ops run ASYNCHRONOUSLY on the `video-generation` queue —
        // but ONLY after a server-computed credit estimate is presented and the
        // user explicitly confirms (Req 17.6, 17.7). Once confirmed, the job is
        // enqueued and its id reported; the heavy work never blocks the request
        // (Req 18.1).
        if (decision.engine === 'generative') {
          // ── Pre-execution estimate + affordability gate (Req 17.6, 17.7, 17.9) ──
          // The output duration of a duration-aligned generative edit equals the
          // affected segment duration (Req 9.12); the per-second rate comes from
          // the routed provider's capability record (Req 7.1) — never hardcoded.
          const affectedSeconds = Math.max(0, (op.range.endMs - op.range.startMs) / 1000);
          const rate = await getOutputSecondRateInr(decision.provider, decision.model);
          const estimate = metering.estimate({
            outputSeconds: affectedSeconds,
            costPerOutputSecondInr: typeof rate === 'number' ? rate : 0,
          });
          // Balance and affordability are read SERVER-side from the ledger; a
          // client-supplied balance is never trusted (Req 17.6).
          const gateOutcome = await metering.gate(ctx.userId, estimate);
          const affordable = gateOutcome.allowed;

          // Stream the server-computed estimate; the client renders and gates on
          // exactly these figures and never recomputes cost (Req 17.6).
          writeEvent(res, {
            type: 'estimate',
            projectId: project.projectId,
            sequenceIndex: op.sequenceIndex,
            operationId,
            kind: op.kind,
            provider: decision.provider,
            model: decision.model,
            feature: estimate.feature,
            outputSeconds: estimate.outputSeconds,
            costPerOutputSecondInr: estimate.costPerOutputSecondInr,
            providerCostInr: estimate.providerCostInr,
            estimatedCredits: estimate.estimatedCredits,
            reservationCredits: estimate.reservationCredits,
            balanceCredits: gateOutcome.balanceCredits,
            affordable,
            reason: affordable ? null : gateOutcome.reason,
            upgradePath: affordable ? null : gateOutcome.upgradePath,
            confirmationTimeoutMs,
          });

          // Unaffordable → BLOCK before any provider call, present the upgrade/
          // add-credit path, and make NO enqueue and NO deduction (Req 17.9).
          if (!affordable) {
            const entry = {
              sequenceIndex: op.sequenceIndex,
              operationId,
              kind: op.kind,
              engine: 'generative' as const,
              provider: decision.provider,
              model: decision.model,
              reason: gateOutcome.reason,
              upgradePath: gateOutcome.upgradePath,
              status: 'blocked',
            };
            routedOps.push(entry);
            writeEvent(res, { type: 'routing', ...entry, projectId: project.projectId });
            logger.info('Generative video edit blocked: insufficient credits', {
              component: COMPONENT,
              userId: ctx.userId,
              workspaceId: ctx.workspaceId,
              projectId: project.projectId,
              operationId,
            });
            continue;
          }

          // Affordable → require explicit confirmation within the 300 s window
          // (Req 17.7, 17.8). NOTHING is enqueued until the user confirms; a
          // decline/timeout/abort cancels with no provider call and no deduction.
          const confirmDecision = await awaitConfirmation(
            project.projectId,
            abortController.signal,
            confirmationTimeoutMs,
          );

          if (confirmDecision !== 'confirm') {
            const entry = {
              sequenceIndex: op.sequenceIndex,
              operationId,
              kind: op.kind,
              engine: 'generative' as const,
              provider: decision.provider,
              model: decision.model,
              status: confirmDecision === 'timeout' ? 'confirmation_timeout' : 'declined',
            };
            routedOps.push(entry);
            writeEvent(res, { type: 'routing', ...entry, projectId: project.projectId });
            logger.info('Generative video edit not confirmed; no job enqueued', {
              component: COMPONENT,
              userId: ctx.userId,
              workspaceId: ctx.workspaceId,
              projectId: project.projectId,
              operationId,
              decision: confirmDecision,
            });
            continue;
          }

          // Confirmed → enqueue the generative job (async model, Req 18.1).
          let jobId: string | undefined;
          let queueJobId: string | null = null;
          if (source) {
            const jobSystem = await getJobSystem();
            const job = await jobSystem.createJob({
              type: 'generation',
              projectId: project.projectId,
              versionId: version.versionId,
              opId: operationId,
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              enqueue: false,
            });
            jobId = job.jobId;
            const payload: GenerativeEditJobPayload = {
              kind: 'generative-edit',
              projectId: project.projectId,
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              inputVersionId: version.parentVersionId ?? version.versionId,
              versionId: version.versionId,
              operationId,
              source: {
                storageKey: source.storageKey,
                fileName: source.fileName,
                durationMs: source.durationMs,
              },
              affectedRegion: { startMs: op.range.startMs, endMs: op.range.endMs },
              provider: { provider: decision.provider, model: decision.model },
              prompt: {
                userRequest: message,
                requiredProtectedElements: (op.preservationConstraints ?? []) as ProtectedElement[],
                operationType: op.kind,
                editingStyle: intent.editingStyle ?? null,
              },
              creditIdempotencyKey: job.idempotencyKey,
            };
            queueJobId = await enqueueGenerativeEdit({
              projectId: project.projectId,
              versionId: version.versionId,
              operationId,
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              idempotencyKey: job.idempotencyKey,
              payload,
            });
          }
          const entry = {
            sequenceIndex: op.sequenceIndex,
            operationId,
            kind: op.kind,
            engine: 'generative' as const,
            provider: decision.provider,
            model: decision.model,
            reason: decision.reason,
            jobId,
            queueJobId,
            status: source ? (queueJobId ? 'queued' : 'queue_unavailable') : 'no_source',
          };
          routedOps.push(entry);
          writeEvent(res, { type: 'routing', ...entry, projectId: project.projectId });
          continue;
        }

        // Deterministic / analysis / render → routed to their own pipelines.
        const entry = {
          sequenceIndex: op.sequenceIndex,
          operationId,
          kind: op.kind,
          engine: decision.engine,
          reason: decision.reason,
          status: 'routed',
        };
        routedOps.push(entry);
        writeEvent(res, { type: 'routing', ...entry, projectId: project.projectId });
      }
      completeStage('routing');

      // ── Complete (Req 18.4: progress reaches 100 only now) ────────────────
      // The 'complete' stage is finished by emitting the terminal event itself;
      // progress reaches 100 solely on that event, never on a prior one.
      completedStages += 1;
      writeEvent(res, {
        type: 'complete',
        outcome: 'planned',
        stateChanged: true,
        projectId: project.projectId,
        versionId: version.versionId,
        parentVersionId: version.parentVersionId,
        operationCount: planResult.plan.operations.length,
        routedOperations: routedOps,
        progress: 100,
      });

      logger.info('Video conversation turn completed', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: project.projectId,
        versionId: version.versionId,
        parentVersionId: version.parentVersionId ?? undefined,
        operationCount: planResult.plan.operations.length,
        routedCount: routedOps.length,
      });
      return finish();
    } catch (err) {
      // A mid-stream failure is surfaced as an error EVENT (the stream has
      // already started), and the full error is logged server-side only
      // (Req 19.8, 23.5). State already persisted (a created version) is
      // immutable and is preserved.
      logger.error('Video conversation turn failed', err as Error, {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: project.projectId,
      });
      emitError('CONVERSATION_TURN_ERROR', 'The conversational edit could not be completed');
      return finish();
    }
  });

  // POST /projects/:id/converse/confirm — relay the user's decision on a
  // presented credit estimate (Req 17.7, 17.8). Mirrors `/converse/stop`: a
  // best-effort side-channel that resolves the turn's pending confirmation so
  // the generative job is enqueued (`confirm`) or cancelled with no provider
  // call and no deduction (`decline`/`timeout`). Auth + ownership are enforced
  // and the identity is server-derived, never client-provided (Req 19.1, 19.5).
  router.post('/projects/:id/converse/confirm', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    const project = await resolveOwnedProject(req, res, ctx);
    if (!project) return; // error already sent

    const body = (req.body ?? {}) as Record<string, unknown>;
    const decision = body.decision;
    if (decision !== 'confirm' && decision !== 'decline' && decision !== 'timeout') {
      return fail(
        res,
        400,
        'VALIDATION_ERROR',
        "decision: must be one of 'confirm', 'decline', or 'timeout'",
      );
    }

    const resolver = pendingGenerativeConfirmations.get(project.projectId);
    if (resolver) {
      resolver(decision as ConfirmationDecision);
      logger.info('Video conversation estimate decision applied', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: project.projectId,
        decision,
      });
      return res.json({
        success: true,
        data: { projectId: project.projectId, decision, applied: true },
      });
    }
    // No estimate is currently awaiting confirmation for this project — the turn
    // may already have resolved (client abort, timeout) or not reached one.
    return res.json({
      success: true,
      data: { projectId: project.projectId, decision, applied: false },
    });
  });

  // POST /projects/:id/converse/stop — abort the project's in-flight turn within
  // 5 s (Req 18.5), reusing VeeGPT's per-conversation Stop model.
  router.post('/projects/:id/converse/stop', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    const project = await resolveOwnedProject(req, res, ctx);
    if (!project) return; // error already sent

    const controller = activeConversationTurns.get(project.projectId);
    if (controller) {
      try {
        controller.abort(new Error('user-stop'));
      } catch {
        /* noop */
      }
      activeConversationTurns.delete(project.projectId);
      logger.info('Video conversation turn stopped', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: project.projectId,
      });
      return res.json({ success: true, data: { projectId: project.projectId, stopped: true } });
    }
    return res.json({ success: true, data: { projectId: project.projectId, stopped: false } });
  });

  return router;
}

/** Default router used when mounting in `server/routes.ts`. */
export const videoEditorConversationRouter = createVideoEditorConversationRouter();
