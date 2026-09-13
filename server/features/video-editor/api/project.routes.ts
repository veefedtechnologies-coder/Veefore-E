/**
 * Video_Project CRUD router — mounted at `/api/video-editor` (task 5.1).
 *
 * Exposes create / read / update / delete for a `Video_Project`, following the
 * existing Veefore API conventions (Req 21.1). Every route is guarded by
 * `requireAuth` then `validateWorkspaceAccess` (workspace membership) and, for
 * project-referencing requests, a per-project ownership check:
 *
 *   - The operation is scoped to the requester's active workspace and returns
 *     only projects owned by that user + workspace (Req 21.2).
 *   - A request that targets a project the requester does not own / cannot
 *     access is rejected with HTTP 403 and NO project or artifact data
 *     (Req 19.1, 19.2).
 *   - A project that does not exist (or was deleted) yields the conventional
 *     not-found error and mutates nothing (Req 21.3).
 *   - Invalid input is rejected with a 400 naming the failed constraint and
 *     mutates nothing (Req 21.6) — validated in task 5.2.
 *
 * Responses use the newer `{ success, data | error: { code, message } }`
 * envelope used by the subscription/workspace/analytics modules. userId and
 * workspaceId are always derived from server-side state, never the client
 * (Req 19.5).
 *
 * The router is a factory so the persistence layer can be injected in tests
 * (mirroring `server/features/analytics/api/routes.ts`). The default store is
 * backed by the `VideoProject` Mongoose model.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { z, ZodError } from 'zod';

import { requireAuth } from '../../../middleware/require-auth';
import { validateWorkspaceAccess } from '../../../middleware/workspace-validation';
import { logger } from '../../../config/logger';
import {
  PLATFORM_PRESETS,
  INGESTION_LIMITS,
  getExportProfile,
  getExportProfileForPreset,
} from '../config/video-editor.config';
import {
  VideoProjectModel,
  VideoSourceModel,
  VideoTimelineModel,
  VideoEditJobModel,
  VideoEditOperationModel,
  type VideoProjectStatus,
} from '../../../models/VideoEditor';
import { VideoEditorQueueManager } from '../../../queues/videoEditorQueues';
import { getStorageService } from '../../storage/services/storage.service';
import {
  getModelRouterService,
  type ModelRouterService,
} from '../services/model-router.service';
import type { RoutableOperation } from '../services/model-router.logic';
import type {
  GenerativeEditJobPayload,
  GenerativeEditJobSegmentation,
} from '../services/generative-edit-worker';
import type { ProtectedElement } from '../services/intent-extraction.logic';
import {
  getVideoAnalysisService,
  videoAnalysisJobId,
  type VideoAnalysisService,
} from '../services/video-analysis.service';
import {
  getMediaIngestionService,
  MediaIngestionRejectedError,
  type MediaIngestionService,
} from '../services/media-ingestion.service';
import {
  renderEngineService,
  type RenderEngineService,
} from '../services/render-engine.service';
import {
  deterministicEditorService,
  DeterministicEditError,
  type DeterministicEditorService,
  type DeterministicOperation,
} from '../services/deterministic-editor.service';
import {
  timelineEngineService,
  type TimelineEngineService,
  type TimelineIdentity,
  type TimelineOperation,
} from '../services/timeline-engine.service';
import {
  TERMINAL_STATES,
  PIPELINE_STAGES,
  computeJobProgress,
  isJobState,
  isTerminalState,
  type JobState,
  type ProgressReport,
} from '../services/job-state.logic';
import {
  getJobSystemService,
  type JobSystemService,
} from '../services/job-system.service';
import type { TimelineModel, TimelineElement } from '../services/timeline-engine.logic';
import {
  isVideoIntentAction,
  normalizeVideoIntent,
  type VideoIntentCandidate,
} from '../services/intent-extraction.logic';
import type {
  PlannerAnalysis,
  ProtectedElementRegion,
  BrandProfile,
} from '../services/editing-planner.logic';
import { getEditingPlannerService, type EditingPlannerService } from '../services/editing-planner.service';
import {
  versionManagerService,
  type VersionManagerService,
  VERSION_ERROR_PROJECT_NOT_FOUND,
  VERSION_ERROR_PERSISTENCE,
} from '../services/version-manager.service';
import {
  VERSION_ERROR_MISSING_PARENT,
  VERSION_ERROR_MISSING_RESTORE_TARGET,
  VERSION_ERROR_IMMUTABLE,
} from '../services/version-manager.logic';
import { ok, fail, sendError, zodIssueMessage } from './error-envelope';
import { emitLifecycleEvent } from '../services/video-editor-events';

const COMPONENT = 'videoEditor.ProjectRouter';

/**
 * In-memory multipart upload for `POST /projects/:id/sources`. Mirrors the
 * `attachmentMemoryUpload` used by the VeeGPT chat `/attachments/upload` route
 * (memory storage so the bytes are handed straight to the Media_Ingestion_Service
 * for signature validation before any persistence — No-Mock, Req 3.2). The size
 * ceiling is the single-source ingestion resumable threshold: anything larger
 * must go through the resumable object-storage path, never through the app
 * server (Req 3.10). The ACTUAL byte signature (not the declared MIME) decides
 * acceptance, so no MIME `fileFilter` is imposed here — validation is delegated
 * to `validateAndAccept` (Req 3.2).
 */
const sourceMemoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: INGESTION_LIMITS.resumableThresholdBytes },
});

/**
 * Structural detection of a {@link MediaIngestionRejectedError} that survives
 * multiple module copies in the build/test graph (mirrors `isZodError`). A
 * rejected upload is surfaced as a 400 `SOURCE_INGESTION_REJECTED` with the
 * human-readable reason, never its raw 4xx status.
 */
function isMediaIngestionRejected(err: unknown): err is MediaIngestionRejectedError {
  return (
    err instanceof Error &&
    (err.name === 'MediaIngestionRejectedError' ||
      typeof (err as { reason?: unknown }).reason === 'string')
  );
}

// ── Records & store abstraction ─────────────────────────────────────────────

/**
 * The subset of a `Video_Project` returned to callers and used by the router.
 * Never includes storage-internal or cross-tenant fields.
 */
export interface VideoProjectRecord {
  projectId: string;
  userId: string;
  workspaceId: string;
  name: string;
  activeVersionId?: string;
  targetPlatform?: string;
  retentionPolicyAllowsSourceDeletion: boolean;
  status: VideoProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  projectId: string;
  userId: string;
  workspaceId: string;
  name: string;
  targetPlatform?: string;
}

export interface UpdateProjectPatch {
  name?: string;
  targetPlatform?: string;
  activeVersionId?: string;
}

/**
 * Persistence port for Video_Project CRUD. Injectable so isolation/validation
 * property tests (task 5.2) can drive an in-memory store without a database.
 */
export interface VideoProjectStore {
  create(input: CreateProjectInput): Promise<VideoProjectRecord>;
  /** Look up by projectId regardless of owner (ownership is enforced by the router). */
  findById(projectId: string): Promise<VideoProjectRecord | null>;
  /** Active (non-deleted) projects owned by this user + workspace, newest first. */
  listByOwner(workspaceId: string, userId: string): Promise<VideoProjectRecord[]>;
  update(projectId: string, patch: UpdateProjectPatch): Promise<VideoProjectRecord | null>;
  /** Soft-delete: mark status='deleted'. Source bytes are retained (Req 20.8). */
  softDelete(projectId: string): Promise<VideoProjectRecord | null>;
}

// ── Default Mongoose-backed store ───────────────────────────────────────────

function toRecord(doc: Record<string, unknown>): VideoProjectRecord {
  return {
    projectId: String(doc.projectId),
    userId: String(doc.userId),
    workspaceId: String(doc.workspaceId),
    name: String(doc.name),
    activeVersionId: doc.activeVersionId ? String(doc.activeVersionId) : undefined,
    targetPlatform: doc.targetPlatform ? String(doc.targetPlatform) : undefined,
    retentionPolicyAllowsSourceDeletion: Boolean(doc.retentionPolicyAllowsSourceDeletion),
    status: (doc.status as VideoProjectStatus) ?? 'active',
    createdAt: (doc.createdAt as Date) ?? new Date(),
    updatedAt: (doc.updatedAt as Date) ?? new Date(),
  };
}

/** Default store persisting to the `VideoProject` collection. */
export const mongoVideoProjectStore: VideoProjectStore = {
  async create(input) {
    const created = await VideoProjectModel.create({
      projectId: input.projectId,
      userId: input.userId,
      workspaceId: input.workspaceId,
      name: input.name,
      targetPlatform: input.targetPlatform,
      status: 'active',
    });
    return toRecord(created.toObject() as unknown as Record<string, unknown>);
  },

  async findById(projectId) {
    const doc = await VideoProjectModel.findOne({ projectId }).lean();
    return doc ? toRecord(doc as Record<string, unknown>) : null;
  },

  async listByOwner(workspaceId, userId) {
    const docs = await VideoProjectModel.find({ workspaceId, userId, status: 'active' })
      .sort({ createdAt: -1 })
      .lean();
    return (docs as Record<string, unknown>[]).map(toRecord);
  },

  async update(projectId, patch) {
    const $set: Record<string, unknown> = {};
    if (patch.name !== undefined) $set.name = patch.name;
    if (patch.targetPlatform !== undefined) $set.targetPlatform = patch.targetPlatform;
    if (patch.activeVersionId !== undefined) $set.activeVersionId = patch.activeVersionId;

    const doc = await VideoProjectModel.findOneAndUpdate(
      { projectId, status: 'active' },
      { $set },
      { new: true }
    ).lean();
    return doc ? toRecord(doc as Record<string, unknown>) : null;
  },

  async softDelete(projectId) {
    const doc = await VideoProjectModel.findOneAndUpdate(
      { projectId, status: 'active' },
      { $set: { status: 'deleted' } },
      { new: true }
    ).lean();
    return doc ? toRecord(doc as Record<string, unknown>) : null;
  },
};

// ── Validation schemas (Req 21.6) ───────────────────────────────────────────

const knownPlatforms = Object.keys(PLATFORM_PRESETS);

const targetPlatformSchema = z
  .string()
  .refine((p) => knownPlatforms.includes(p), {
    message: `targetPlatform must be one of: ${knownPlatforms.join(', ')}`,
  });

const createProjectBody = z.object({
  name: z.string().trim().min(1, 'name is required').max(200, 'name must be at most 200 characters'),
  targetPlatform: targetPlatformSchema.optional(),
});

const updateProjectBody = z
  .object({
    name: z.string().trim().min(1, 'name must not be empty').max(200, 'name must be at most 200 characters').optional(),
    targetPlatform: targetPlatformSchema.optional(),
    activeVersionId: z.string().trim().min(1, 'activeVersionId must not be empty').optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'at least one updatable field (name, targetPlatform, activeVersionId) is required',
  });

// Edits endpoint (task 17.8) — a single planned operation to route + (for a
// generative op) execute asynchronously on the `video-generation` queue.
const timeRangeSchema = z
  .object({
    startMs: z.number().finite().min(0, 'range.startMs must be >= 0'),
    endMs: z.number().finite(),
  })
  .refine((r) => r.endMs > r.startMs, { message: 'range.endMs must be greater than range.startMs' });

const editOperationSchema = z.object({
  type: z.enum(['deterministic', 'generative', 'analysis', 'render']),
  kind: z.string().trim().min(1, 'operation.kind is required'),
  range: timeRangeSchema,
  prompt: z.string().trim().min(1).optional(),
  protectedElements: z.array(z.string().trim().min(1)).optional(),
  editingStyle: z.string().trim().min(1).optional(),
  outputResolution: z.string().trim().min(1).optional(),
  changesVisualContent: z.boolean().optional(),
  // Typed parameters for a deterministic operation (crop/resize/aspect/fps/
  // speed/fades/encode/…). Passed through to the Deterministic_Editor's pure
  // command builder, which validates them and surfaces a typed 422 on any
  // malformed value (task 11.5). trim/cut derive their range from `range`.
  params: z.record(z.unknown()).optional(),
});

const editsBody = z.object({
  operation: editOperationSchema,
  versionId: z.string().trim().min(1).optional(),
  inputVersionId: z.string().trim().min(1).optional(),
  sceneBoundariesMs: z.array(z.number().finite()).optional(),
  trackedSubjects: z.array(timeRangeSchema).optional(),
  utterances: z.array(timeRangeSchema).optional(),
  candidateRanges: z.array(timeRangeSchema).optional(),
  isZeroCostEdit: z.boolean().optional(),
  timelineTrackIndex: z.number().int().min(0).optional(),
});

// Version endpoints (task 19.4, Req 16.1–16.3, 21.5). Creating a version derives
// from an explicit `parentVersionId` (Req 16.1) or, when omitted/null, the active
// version (Req 16.2). `timelineId` names the timeline snapshot the new version
// composes; `label` is an optional human-facing name.
const createVersionBody = z.object({
  timelineId: z.string().trim().min(1, 'timelineId is required'),
  parentVersionId: z.string().trim().min(1, 'parentVersionId must not be empty').nullish(),
  label: z.string().trim().min(1, 'label must not be empty').max(200, 'label must be at most 200 characters').optional(),
});

// ── Envelope helpers ────────────────────────────────────────────────────────
// `ok` / `fail` (and `sendError` / `zodIssueMessage`) are the shared Video
// Editor envelope helpers (task 21.1) imported above — the response shape and
// secret redaction are single-sourced across every router.

interface RequestContext {
  userId: string;
  workspaceId: string;
}

/**
 * Read the server-derived identity + active workspace that the auth and
 * workspace middleware attached. Never trusts client-provided values (Req 19.5).
 */
function resolveContext(req: Request): RequestContext | null {
  const userId = (req as Request & { user?: { id?: unknown } }).user?.id;
  const workspaceId = (req as Request & { workspaceId?: unknown }).workspaceId;
  if (!userId || !workspaceId) return null;
  return { userId: String(userId), workspaceId: String(workspaceId) };
}

// ── Router factory ──────────────────────────────────────────────────────────

export interface VideoEditorRouterDeps {
  store?: VideoProjectStore;
  /** Injectable id generator for deterministic tests. */
  generateProjectId?: () => string;
  /**
   * Delete the original `Video_Source`(s) for a project when — and ONLY when —
   * the project's retention policy permits it (Req 20.8). Removes the immutable
   * source bytes from storage and the `VideoSource` records, returning the count
   * of records removed. Injectable for tests; the default reads the
   * `VideoSource` collection and `StorageService`. Never called when the
   * retention-policy flag disallows deletion, so the source is retained.
   */
  deleteProjectSources?: (projectId: string) => Promise<number>;
  /**
   * Editing_Planner service (LLM goal/style reasoning + pure planner core) used
   * by `POST /projects/:id/plan`. Injectable for tests; defaults to the shared
   * process-wide instance.
   */
  planner?: Pick<EditingPlannerService, 'plan'>;
  /**
   * Resolve the plannable source duration (ms) for a project — the anchor for
   * every operation range (Req 5.4). Injectable for tests; the default reads the
   * newest `VideoSource` for the project. Returns `null` when none is analyzable.
   */
  getSourceDurationMs?: (projectId: string) => Promise<number | null>;
  /**
   * Render_Engine used by `POST /projects/:id/render` (task 14.4). Injectable for
   * tests; defaults to the shared process-wide instance.
   */
  renderEngine?: Pick<RenderEngineService, 'render'>;
  /**
   * Accessor for the Job_System used to create the render `Video_Edit_Job`.
   * Injectable for tests; defaults to the shared model-backed instance.
   */
  getJobSystem?: () => Promise<Pick<JobSystemService, 'createJob' | 'transitionTo' | 'cancelJob'>>;
  /**
   * Resolve a version's authoritative timeline model (Req 10.4). Injectable for
   * tests; the default reads the `VideoTimeline` snapshot for the version.
   * Returns `null` when no timeline exists for the version.
   */
  getTimelineForVersion?: (projectId: string, versionId: string) => Promise<TimelineModel | null>;
  /**
   * Video_Analysis_Service used by `GET .../analysis` and the analyze endpoint's
   * reuse short-circuit (task 8.5). Injectable for tests; defaults to the shared
   * instance. Only the completed-analysis read is needed here — the heavy work
   * runs asynchronously on the `video-analysis` worker.
   */
  analysisService?: Pick<VideoAnalysisService, 'getCompletedAnalysis'>;
  /**
   * Enqueue an asynchronous analysis job on the `video-analysis` queue (Req 18.1).
   * Returns the BullMQ job id, or `null` when the queue is unavailable. Injectable
   * for tests; the default uses the shared `VideoEditorQueueManager`.
   */
  enqueueAnalysis?: (input: {
    projectId: string;
    sourceId: string;
    workspaceId: string;
    userId: string;
  }) => Promise<string | null>;
  /**
   * Resolve the newest `Video_Source` id for a project — the default analysis
   * target when the request omits an explicit `sourceId`. Injectable for tests;
   * the default reads the newest `VideoSource`. Returns `null` when none exists.
   */
  getLatestSourceId?: (projectId: string) => Promise<string | null>;
  /**
   * Media_Ingestion_Service used by `POST /projects/:id/sources` to validate +
   * store an uploaded/linked source immutably and then probe it so
   * duration/dimensions/fps/codec are populated (task 7.3, Req 3.2–3.11). This
   * is what lets the `/converse` gate find an analyzable source
   * (`durationMs > 0`). Injectable for tests; defaults to the shared instance
   * via `getMediaIngestionService()`.
   */
  mediaIngestion?: Pick<
    MediaIngestionService,
    'validateAndAccept' | 'probeAndPrepare' | 'ingestFromRemoteUrl'
  >;
  /**
   * Read raw bytes for a `storageKey` the user already uploaded elsewhere (e.g.
   * a VeeGPT chat attachment) so it can be ingested without a re-upload. The
   * bytes then flow through the same validate-then-store path as a direct
   * upload. Injectable for tests; the default reads via `StorageService.downloadFile`
   * (the same service the chat `/attachments/upload` route writes to).
   */
  downloadStorageBytes?: (
    storageKey: string,
  ) => Promise<{ buffer: Buffer; contentType?: string }>;
  /**
   * Whether a source id exists within a project (ownership-scoped input check,
   * Req 21.6). Injectable for tests; the default reads the `VideoSource`.
   */
  sourceExistsInProject?: (projectId: string, sourceId: string) => Promise<boolean>;
  /**
   * Read an analysis job's stage-derived state/progress (Req 18.4). Injectable
   * for tests; the default reads the `VideoEditJob`. Returns `null` when no
   * analysis job exists for the source.
   */
  getAnalysisJobStatus?: (
    jobId: string,
  ) => Promise<{ state: string; progress: number; errorCode?: string } | null>;
  /**
   * Model_Router used by `POST /projects/:id/edits` to select the execution
   * engine (deterministic vs generative) and, for generative ops, the provider
   * (task 17.8, Req 6.x). Injectable for tests; defaults to the shared instance.
   */
  modelRouter?: Pick<ModelRouterService, 'route'>;
  /**
   * Deterministic_Editor used by `POST /projects/:id/edits` to EXECUTE a
   * deterministic-routed operation synchronously via FFmpeg — never calling a
   * provider (task 11.5, Req 8.1). Injectable for tests; defaults to the shared
   * instance.
   */
  deterministicEditor?: Pick<DeterministicEditorService, 'execute'>;
  /**
   * Timeline_Engine used to record a completed deterministic edit's produced
   * artifact on the target version's timeline (task 11.5, Req 10.1, 10.2).
   * Injectable for tests; defaults to the shared instance.
   */
  timelineEngine?: Pick<TimelineEngineService, 'acceptOperation'>;
  /**
   * Create the `Video_Edit_Job` a synchronous deterministic edit is traceable to
   * (Req 8.3). Injectable for tests; the default creates a `VideoEditJob` in the
   * EDITING state with a deterministic id. Returns the created job id.
   */
  createDeterministicEditJob?: (input: {
    projectId: string;
    versionId: string;
    operationId: string;
    workspaceId: string;
    userId: string;
  }) => Promise<{ jobId: string }>;
  /**
   * Mark a deterministic edit job COMPLETED with its single output artifact
   * (Req 8.3). Injectable for tests; the default updates the `VideoEditJob`.
   */
  completeDeterministicEditJob?: (jobId: string, artifactId: string) => Promise<void>;
  /**
   * Persist a planned `VideoEditOperation` before routing so the Model_Router can
   * write its routing record onto it (Req 6.6). Injectable for tests; the default
   * creates a `VideoEditOperation` document.
   */
  createEditOperation?: (op: {
    operationId: string;
    projectId: string;
    jobId?: string;
    sequenceIndex: number;
    type: RoutableOperation['type'];
    kind: string;
    startMs: number;
    endMs: number;
    preservationConstraints: string[];
    status: 'executable';
  }) => Promise<void>;
  /**
   * Resolve the newest analyzable `Video_Source` for an edit — the immutable
   * bytes the generative edit reads. Injectable for tests; the default reads the
   * newest `VideoSource`. Returns `null` when the project has no source.
   */
  getSourceForEdit?: (projectId: string) => Promise<{
    sourceId: string;
    storageKey: string;
    fileName: string;
    durationMs: number;
  } | null>;
  /** Injectable operation-id generator for deterministic tests. */
  generateOperationId?: () => string;
  /**
   * Enqueue a generative edit onto the `video-generation` queue asynchronously
   * (task 17.8, Req 18.1). Returns the BullMQ job id, or `null` when the queue is
   * unavailable. Injectable for tests; the default uses `VideoEditorQueueManager`.
   */
  enqueueGenerativeEdit?: (input: {
    projectId: string;
    versionId: string;
    operationId: string;
    workspaceId: string;
    userId: string;
    idempotencyKey?: string;
    payload: GenerativeEditJobPayload;
  }) => Promise<string | null>;
  /**
   * Version_Manager used by the version endpoints (task 19.4, Req 16.1–16.8,
   * 21.5) to list, create (refinement), and restore immutable `Video_Version`s.
   * Every rule (parent resolution, history preservation, lineage, immutability,
   * restore) lives in the service + its pure core; this router is a thin
   * transport that enforces ownership then delegates. Injectable for tests;
   * defaults to the shared instance.
   */
  versionManager?: Pick<
    VersionManagerService,
    'listVersions' | 'createVersion' | 'restoreVersion'
  >;
  /**
   * Read a `Video_Edit_Job`'s ownership + stage-derived status fields for the
   * job status/cancel/stream endpoints (task 20.2, Req 18.4, 18.5). Injectable
   * for tests; the default reads the `VideoEditJob` collection. Returns `null`
   * when no such job exists. Ownership is enforced by the router from the
   * record's server-side `workspaceId`/`userId` (Req 19.1, 19.2, 19.5).
   */
  getJobStatus?: (jobId: string) => Promise<JobStatusRecord | null>;
  /**
   * Poll interval (ms) between successive reads of the job's stage-derived
   * status on the progress stream (task 20.2). Injectable for tests; defaults to
   * `VIDEO_EDITOR_STREAM_POLL_MS`.
   */
  streamPollIntervalMs?: number;
  /**
   * Safety bound on the number of events a single progress stream emits before
   * it closes, guaranteeing the loop always terminates. Injectable for tests;
   * defaults to `VIDEO_EDITOR_STREAM_MAX_EVENTS`.
   */
  streamMaxEvents?: number;
  /** Injectable delay used between progress-stream polls (defaults to setTimeout). */
  sleep?: (ms: number) => Promise<void>;
}

/** Project a persisted `VideoTimeline` document down to the pure-core model shape. */
function timelineDocToModel(doc: Record<string, unknown>): TimelineModel {
  const sequences = Array.isArray(doc.sequences)
    ? (doc.sequences as { tracks?: unknown }[]).map((s) => ({
        tracks: typeof s.tracks === 'number' ? s.tracks : 1,
      }))
    : [{ tracks: 1 }];
  const elements = Array.isArray(doc.elements)
    ? (doc.elements as Record<string, unknown>[]).map((el) => {
        const element: TimelineElement = {
          kind: el.kind as TimelineElement['kind'],
          trackIndex: Number(el.trackIndex),
          timelineStartMs: Number(el.timelineStartMs),
          timelineEndMs: Number(el.timelineEndMs),
        };
        if (el.sourceAssetId !== undefined) element.sourceAssetId = String(el.sourceAssetId);
        if (typeof el.sourceInMs === 'number') element.sourceInMs = el.sourceInMs;
        if (typeof el.sourceOutMs === 'number') element.sourceOutMs = el.sourceOutMs;
        if (el.params !== undefined) element.params = el.params as Record<string, unknown>;
        return element;
      })
    : [];
  return { sequences, elements };
}

/** Default timeline lookup: the `VideoTimeline` snapshot for a version. */
async function defaultGetTimelineForVersion(
  projectId: string,
  versionId: string,
): Promise<TimelineModel | null> {
  const doc = await VideoTimelineModel.findOne({ projectId, versionId }).lean();
  return doc ? timelineDocToModel(doc as Record<string, unknown>) : null;
}

/** Default source-duration lookup: newest `VideoSource` for the project. */
async function defaultGetSourceDurationMs(projectId: string): Promise<number | null> {
  const source = await VideoSourceModel.findOne({ projectId }).sort({ createdAt: -1 }).lean();
  const durationMs = (source as Record<string, unknown> | null)?.durationMs;
  return typeof durationMs === 'number' && durationMs > 0 ? durationMs : null;
}

/** Default newest-source lookup for a project (the default analysis target). */
async function defaultGetLatestSourceId(projectId: string): Promise<string | null> {
  const source = await VideoSourceModel.findOne({ projectId }).sort({ createdAt: -1 }).lean();
  const sourceId = (source as Record<string, unknown> | null)?.sourceId;
  return typeof sourceId === 'string' && sourceId.length > 0 ? sourceId : null;
}

/** Default check that a source id belongs to a project (Req 21.6). */
async function defaultSourceExistsInProject(projectId: string, sourceId: string): Promise<boolean> {
  const source = await VideoSourceModel.findOne({ projectId, sourceId }).lean();
  return !!source;
}

/** Default analysis-job status read from the `VideoEditJob` collection (Req 18.4). */
async function defaultGetAnalysisJobStatus(
  jobId: string,
): Promise<{ state: string; progress: number; errorCode?: string } | null> {
  const doc = await VideoEditJobModel.findOne({ jobId }).lean();
  if (!doc) return null;
  const d = doc as Record<string, unknown>;
  return {
    state: typeof d.state === 'string' ? d.state : 'QUEUED',
    progress: typeof d.progress === 'number' ? d.progress : 0,
    errorCode: typeof d.errorCode === 'string' ? d.errorCode : undefined,
  };
}

/** Default enqueue of an analysis job onto the `video-analysis` queue (Req 18.1). */
async function defaultEnqueueAnalysis(input: {
  projectId: string;
  sourceId: string;
  workspaceId: string;
  userId: string;
}): Promise<string | null> {
  return VideoEditorQueueManager.enqueue('analysis', {
    projectId: input.projectId,
    // The deterministic job id encodes the source in the version segment; the
    // worker also reads it from `payload.sourceId` (see video-analysis.worker).
    versionId: input.sourceId,
    opId: 'analyze',
    workspaceId: input.workspaceId,
    userId: input.userId,
    payload: { sourceId: input.sourceId },
  });
}

/** Default persistence of a planned `VideoEditOperation` before routing (Req 6.6). */
async function defaultCreateEditOperation(op: {
  operationId: string;
  projectId: string;
  jobId?: string;
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
 * Default `Video_Edit_Job` creation for a synchronous deterministic edit
 * (Req 8.3). The id is deterministic (mirrors the queue-job id convention) so a
 * retried identical request re-uses the same job. The job starts in the EDITING
 * state because the deterministic FFmpeg work runs inline; the Deterministic_Editor
 * marks it FAILED on failure and the router marks it COMPLETED on success.
 */
async function defaultCreateDeterministicEditJob(input: {
  projectId: string;
  versionId: string;
  operationId: string;
  workspaceId: string;
  userId: string;
}): Promise<{ jobId: string }> {
  const jobId = `ve-deterministic-${input.projectId}-${input.versionId}-${input.operationId}`;
  await VideoEditJobModel.create({
    jobId,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    idempotencyKey: `det-${input.operationId}`,
    state: 'EDITING',
    attempt: 1,
    progress: 0,
    completedStages: [],
    inputArtifactIds: [],
    outputArtifactIds: [],
  });
  return { jobId };
}

/**
 * Default completion of a deterministic edit job: mark COMPLETED with 100 %
 * progress and record its single output artifact (Req 8.3). Terminal states are
 * never overwritten (a job already FAILED/CANCELLED stays as-is).
 */
async function defaultCompleteDeterministicEditJob(
  jobId: string,
  artifactId: string,
): Promise<void> {
  await VideoEditJobModel.updateOne(
    { jobId, state: { $nin: [...TERMINAL_STATES] } },
    { $set: { state: 'COMPLETED', progress: 100 }, $addToSet: { outputArtifactIds: artifactId } },
  ).exec();
}

/** The deterministic operation kinds the Deterministic_Editor can perform. */
const DETERMINISTIC_OPERATION_KINDS = new Set<string>([
  'trim',
  'cut',
  'crop',
  'resize',
  'aspect',
  'fps',
  'speed',
  'fades',
  'encode',
  'audio_normalize',
  'silence_removal',
]);

/**
 * Map an edits-endpoint operation to a typed {@link DeterministicOperation}.
 * `trim`/`cut` derive their range from the request's `operation.range`; every
 * other kind forwards the request's `params` verbatim to the Deterministic_Editor's
 * pure command builder, which performs the exhaustive per-kind validation and
 * throws a typed error (surfaced as 422). An unknown kind is rejected up-front
 * so the router never fabricates work no engine can perform (No-Mock, Req 23).
 */
function buildDeterministicOperation(
  kind: string,
  range: { startMs: number; endMs: number },
  params: Record<string, unknown> | undefined,
): { ok: true; operation: DeterministicOperation } | { ok: false; message: string } {
  if (!DETERMINISTIC_OPERATION_KINDS.has(kind)) {
    return {
      ok: false,
      message: `operation.kind: '${kind}' is not a deterministic operation the editor can perform`,
    };
  }
  if (kind === 'trim' || kind === 'cut') {
    return {
      ok: true,
      operation: { kind, params: { startMs: range.startMs, endMs: range.endMs } },
    };
  }
  // Params for the remaining kinds are validated by the pure command builder.
  return {
    ok: true,
    operation: { kind, params: params ?? {} } as DeterministicOperation,
  };
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

/**
 * The outcome of the source-retention decision applied on project deletion
 * (Req 20.8). When the project's retention-policy flag does NOT permit source
 * deletion, `deleted` is false and the original Video_Source bytes + records are
 * retained untouched. When the flag permits deletion, the immutable source bytes
 * are removed from storage and the `VideoSource` records are deleted.
 */
export interface SourceRetentionOutcome {
  /** Whether the original source(s) were deleted (true) or retained (false). */
  deleted: boolean;
  /** Number of `VideoSource` records removed (0 when retained). */
  sourcesDeleted: number;
}

/**
 * Default source-deletion applied when a project's retention policy explicitly
 * permits it (Req 20.8). Reads every `VideoSource` for the project, removes its
 * immutable bytes from `StorageService`, then deletes the `VideoSource` records.
 * A best-effort per-key storage removal never aborts the record cleanup: a
 * missing/undeletable object is logged, not thrown, so a partially-cleaned
 * project still converges to "no source records". Called ONLY when deletion is
 * permitted — otherwise the source is retained (Req 20.8).
 */
async function defaultDeleteProjectSources(projectId: string): Promise<number> {
  const sources = await VideoSourceModel.find({ projectId }).lean();
  if (sources.length === 0) return 0;

  const storage = getStorageService();
  for (const source of sources as Record<string, unknown>[]) {
    const storageKey = typeof source.storageKey === 'string' ? source.storageKey : '';
    if (!storageKey) continue;
    try {
      await storage.deleteFile(storageKey);
    } catch (error) {
      // Storage removal is best-effort: a missing or undeletable object must not
      // block deleting the record. Log for reconciliation (Req 20.8).
      logger.warn('Failed to delete source bytes on permitted project deletion', {
        component: COMPONENT,
        projectId,
        storageKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result = await VideoSourceModel.deleteMany({ projectId });
  return typeof result.deletedCount === 'number' ? result.deletedCount : sources.length;
}

/** Map a `Video_Edit_Job` state to the analysis status surfaced to callers. */
function analysisStatusForJobState(state: string): 'processing' | 'completed' | 'failed' | 'cancelled' {
  if (state === 'COMPLETED') return 'completed';
  if (state === 'FAILED') return 'failed';
  if (state === 'CANCELLED') return 'cancelled';
  return 'processing';
}

// ── Job status / cancel / progress-stream support (task 20.2) ────────────────

/**
 * The subset of a `Video_Edit_Job` the status/cancel/stream endpoints read. Kept
 * as a plain shape (not the Mongoose document) so tests can drive an in-memory
 * store. `workspaceId`/`userId` are the server-side ownership fields the router
 * enforces access against (Req 19.1, 19.2, 19.5); progress is NEVER read from
 * this record — it is always re-derived from `completedStages` + `state` so it
 * is provably stage-derived (Req 18.4, 23.2, 23.6).
 */
export interface JobStatusRecord {
  jobId: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  state: JobState;
  attempt: number;
  timeoutSec: number;
  completedStages: string[];
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  errorCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Default poll interval (ms) between progress-stream reads of a job's stage state. */
const VIDEO_EDITOR_STREAM_POLL_MS = 1000;
/** Default safety bound on progress-stream events so the loop always terminates. */
const VIDEO_EDITOR_STREAM_MAX_EVENTS = 3600;

/** Default job-status read from the `VideoEditJob` collection (Req 18.4, 18.5). */
async function defaultGetJobStatus(jobId: string): Promise<JobStatusRecord | null> {
  const doc = await VideoEditJobModel.findOne({ jobId }).lean();
  if (!doc) return null;
  const d = doc as Record<string, unknown>;
  return {
    jobId: String(d.jobId),
    projectId: String(d.projectId),
    workspaceId: String(d.workspaceId),
    userId: String(d.userId),
    state: (isJobState(d.state) ? d.state : 'QUEUED') as JobState,
    attempt: typeof d.attempt === 'number' ? d.attempt : 1,
    timeoutSec: typeof d.timeoutSec === 'number' ? d.timeoutSec : 3600,
    completedStages: Array.isArray(d.completedStages) ? d.completedStages.map(String) : [],
    inputArtifactIds: Array.isArray(d.inputArtifactIds) ? d.inputArtifactIds.map(String) : [],
    outputArtifactIds: Array.isArray(d.outputArtifactIds) ? d.outputArtifactIds.map(String) : [],
    errorCode: typeof d.errorCode === 'string' ? d.errorCode : undefined,
    createdAt: (d.createdAt as Date) ?? new Date(),
    updatedAt: (d.updatedAt as Date) ?? new Date(),
  };
}

/**
 * Derive a job's progress SOLELY from the count of actually-completed stages and
 * its current state, via the pure `computeJobProgress` core (Req 18.4, 23.2).
 * The result is either a determinate integer percent in [0,100] or an explicit
 * INDETERMINATE report when the completion state is unknown (Req 23.6) — the
 * router never fabricates a percentage or reads a stored one.
 */
function deriveJobProgress(record: JobStatusRecord): ProgressReport {
  return computeJobProgress({
    state: record.state,
    completedStages: record.completedStages.length,
    totalStages: PIPELINE_STAGES.length,
  });
}

/**
 * Serialize a job's stage-derived status for the `{ success, data }` envelope.
 * `progress` is `null` (with `determinate: false`) whenever the completion state
 * is indeterminate, so a caller never sees a fabricated percentage (Req 23.6).
 */
function serializeJobStatus(record: JobStatusRecord): Record<string, unknown> {
  const report = deriveJobProgress(record);
  return {
    jobId: record.jobId,
    projectId: record.projectId,
    state: record.state,
    terminal: isTerminalState(record.state),
    determinate: report.determinate,
    progress: report.determinate ? report.percent : null,
    completedStages: record.completedStages,
    totalStages: PIPELINE_STAGES.length,
    attempt: record.attempt,
    timeoutSec: record.timeoutSec,
    inputArtifactIds: record.inputArtifactIds,
    outputArtifactIds: record.outputArtifactIds,
    errorCode: record.errorCode,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Set headers for a streaming NDJSON response (mirrors the conversation router). */
function initJobStreamResponse(res: Response): void {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  (res as unknown as { flushHeaders?: () => void }).flushHeaders?.();
}

/** Write one newline-delimited JSON event to a streaming response. */
function writeJobStreamEvent(res: Response, event: Record<string, unknown>): void {
  try {
    res.write(JSON.stringify(event) + '\n');
  } catch {
    /* response already closed */
  }
}

/** Whether a job record belongs to the requester's active workspace + user (Req 19.1, 19.5). */
function jobOwnedBy(record: JobStatusRecord, ctx: RequestContext): boolean {
  return record.workspaceId === ctx.workspaceId && record.userId === ctx.userId;
}

/**
 * Build the Video_Project CRUD router. Dependencies are injectable for testing;
 * the defaults use the Mongoose-backed store and `crypto.randomUUID`.
 */
export function createVideoEditorProjectRouter(deps: VideoEditorRouterDeps = {}): Router {
  const router = Router();
  const store = deps.store ?? mongoVideoProjectStore;
  const generateProjectId = deps.generateProjectId ?? (() => `vp-${randomUUID()}`);
  const deleteProjectSources = deps.deleteProjectSources ?? defaultDeleteProjectSources;
  const getSourceDurationMs = deps.getSourceDurationMs ?? defaultGetSourceDurationMs;
  const renderEngine = deps.renderEngine ?? renderEngineService;
  const getJobSystem = deps.getJobSystem ?? getJobSystemService;
  const getTimelineForVersion = deps.getTimelineForVersion ?? defaultGetTimelineForVersion;
  const enqueueAnalysis = deps.enqueueAnalysis ?? defaultEnqueueAnalysis;
  const getLatestSourceId = deps.getLatestSourceId ?? defaultGetLatestSourceId;
  const sourceExistsInProject = deps.sourceExistsInProject ?? defaultSourceExistsInProject;
  const getAnalysisJobStatus = deps.getAnalysisJobStatus ?? defaultGetAnalysisJobStatus;
  const createEditOperation = deps.createEditOperation ?? defaultCreateEditOperation;
  const getSourceForEdit = deps.getSourceForEdit ?? defaultGetSourceForEdit;
  const deterministicEditor = deps.deterministicEditor ?? deterministicEditorService;
  const timelineEngine = deps.timelineEngine ?? timelineEngineService;
  const createDeterministicEditJob =
    deps.createDeterministicEditJob ?? defaultCreateDeterministicEditJob;
  const completeDeterministicEditJob =
    deps.completeDeterministicEditJob ?? defaultCompleteDeterministicEditJob;
  const generateOperationId = deps.generateOperationId ?? (() => `op-${randomUUID()}`);
  const enqueueGenerativeEdit = deps.enqueueGenerativeEdit ?? defaultEnqueueGenerativeEdit;
  const getJobStatus = deps.getJobStatus ?? defaultGetJobStatus;
  const streamPollIntervalMs = deps.streamPollIntervalMs ?? VIDEO_EDITOR_STREAM_POLL_MS;
  const streamMaxEvents = deps.streamMaxEvents ?? VIDEO_EDITOR_STREAM_MAX_EVENTS;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const downloadStorageBytes =
    deps.downloadStorageBytes ??
    (async (storageKey: string) => {
      const file = await getStorageService().downloadFile(storageKey);
      return { buffer: file.buffer, contentType: file.contentType };
    });
  // Resolved lazily inside handlers so the heavy analysis service is not
  // constructed at module load.
  const resolveAnalysisService = (): Pick<VideoAnalysisService, 'getCompletedAnalysis'> =>
    deps.analysisService ?? getVideoAnalysisService();
  const resolveMediaIngestion = (): Pick<
    MediaIngestionService,
    'validateAndAccept' | 'probeAndPrepare' | 'ingestFromRemoteUrl'
  > => deps.mediaIngestion ?? getMediaIngestionService();
  const resolveModelRouter = (): Pick<ModelRouterService, 'route'> =>
    deps.modelRouter ?? getModelRouterService();
  const resolveVersionManager = (): Pick<
    VersionManagerService,
    'listVersions' | 'createVersion' | 'restoreVersion'
  > => deps.versionManager ?? versionManagerService;

  // requireAuth → validateWorkspaceAccess is applied to every route so that no
  // unauthenticated or cross-workspace request ever reaches a handler.
  router.use(requireAuth, validateWorkspaceAccess());

  /**
   * Resolve a project the requester owns within their active workspace, or send
   * the appropriate error and return null:
   *   - unknown/deleted project → 404 (no mutation, Req 21.3)
   *   - project outside the active workspace or owned by another user → 403
   *     with no data (Req 19.1, 19.2)
   */
  async function resolveOwnedProject(
    req: Request,
    res: Response,
    ctx: RequestContext
  ): Promise<VideoProjectRecord | null> {
    const projectId = req.params.id;
    const project = await store.findById(projectId);

    if (!project || project.status === 'deleted') {
      fail(res, 404, 'PROJECT_NOT_FOUND', 'Video project not found');
      return null;
    }

    if (project.workspaceId !== ctx.workspaceId || project.userId !== ctx.userId) {
      // No project or artifact data is returned to a non-owner (Req 19.2).
      logger.warn('Video project ownership denied', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId,
      });
      fail(res, 403, 'PROJECT_ACCESS_DENIED', 'You do not have access to this video project');
      return null;
    }

    return project;
  }

  // POST /projects — create a Video_Project (Req 21.1, 21.2).
  router.post('/projects', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    const parsed = createProjectBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return fail(res, 400, 'VALIDATION_ERROR', firstIssue(parsed.error));
    }

    try {
      const project = await store.create({
        projectId: generateProjectId(),
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        name: parsed.data.name,
        targetPlatform: parsed.data.targetPlatform,
      });
      logger.info('Video project created', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: project.projectId,
      });
      // Structured lifecycle event: project created (Req 22.1).
      emitLifecycleEvent('project_created', {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: project.projectId,
        details: { targetPlatform: project.targetPlatform },
      });
      return ok(res, project, 201);
    } catch (err) {
      return handleServerError(res, err, ctx, 'create');
    }
  });

  // GET /projects — list the requester's active-workspace projects (Req 21.2).
  router.get('/projects', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    try {
      const projects = await store.listByOwner(ctx.workspaceId, ctx.userId);
      return ok(res, projects);
    } catch (err) {
      return handleServerError(res, err, ctx, 'list');
    }
  });

  // GET /projects/:id — read a single owned project (Req 21.1, 19.1, 19.2).
  router.get('/projects/:id', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    try {
      const project = await resolveOwnedProject(req, res, ctx);
      if (!project) return; // error already sent
      return ok(res, project);
    } catch (err) {
      return handleServerError(res, err, ctx, 'read');
    }
  });

  // PATCH /projects/:id — update an owned project (Req 21.1, 21.6).
  router.patch('/projects/:id', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    const parsed = updateProjectBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return fail(res, 400, 'VALIDATION_ERROR', firstIssue(parsed.error));
    }

    try {
      // Ownership is checked before any mutation (Req 21.3).
      const project = await resolveOwnedProject(req, res, ctx);
      if (!project) return;

      const updated = await store.update(project.projectId, parsed.data);
      if (!updated) {
        return fail(res, 404, 'PROJECT_NOT_FOUND', 'Video project not found');
      }
      return ok(res, updated);
    } catch (err) {
      return handleServerError(res, err, ctx, 'update');
    }
  });

  // DELETE /projects/:id — soft-delete an owned project (Req 21.1), applying the
  // source-retention policy (Req 20.8): the original Video_Source is RETAINED
  // unless the project's `retentionPolicyAllowsSourceDeletion` flag explicitly
  // permits deletion, in which case the source bytes + records are removed.
  router.delete('/projects/:id', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    try {
      const project = await resolveOwnedProject(req, res, ctx);
      if (!project) return;

      const deleted = await store.softDelete(project.projectId);
      if (!deleted) {
        return fail(res, 404, 'PROJECT_NOT_FOUND', 'Video project not found');
      }

      // Source retention (Req 20.8). By default the immutable original source is
      // retained across project deletion; only a project whose retention policy
      // explicitly permits it has its source bytes + records removed.
      let source: SourceRetentionOutcome = { deleted: false, sourcesDeleted: 0 };
      if (project.retentionPolicyAllowsSourceDeletion) {
        const sourcesDeleted = await deleteProjectSources(project.projectId);
        source = { deleted: true, sourcesDeleted };
        logger.info('Deleted project sources per retention policy', {
          component: COMPONENT,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          projectId: project.projectId,
          sourcesDeleted,
        });
      } else {
        logger.info('Retained project sources on deletion (retention policy)', {
          component: COMPONENT,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          projectId: project.projectId,
        });
      }

      return ok(res, { projectId: deleted.projectId, status: deleted.status, source });
    } catch (err) {
      return handleServerError(res, err, ctx, 'delete');
    }
  });

  // POST /projects/:id/plan — create an editing plan for an owned project
  // (Req 5.1, 21.4). A THIN transport layer: it validates input, derives the
  // PlannerAnalysis from the project's source, and delegates all planning to the
  // Editing_Planner service (LLM goal/style) + the pure planner core. It mutates
  // NO stored data — plan creation is a pure read-and-compute.
  router.post('/projects/:id/plan', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    try {
      // Ownership is checked before any planning work (Req 19.1, 19.2, 21.3).
      const project = await resolveOwnedProject(req, res, ctx);
      if (!project) return; // error already sent

      // ── Input validation (Req 21.6) — reject without mutating any state ─────
      const body = (req.body ?? {}) as Record<string, unknown>;
      const rawIntent = body.intent;
      if (!rawIntent || typeof rawIntent !== 'object') {
        return fail(res, 400, 'VALIDATION_ERROR', 'intent: a structured intent object is required');
      }
      const intentAction = (rawIntent as Record<string, unknown>).action;
      if (!isVideoIntentAction(intentAction)) {
        return fail(
          res,
          400,
          'VALIDATION_ERROR',
          'intent.action: must be a recognized video-editing action',
        );
      }

      const variantCount = parseVariantCount(body.variantCount);
      if (variantCount === 'invalid') {
        return fail(res, 400, 'VALIDATION_ERROR', 'variantCount: must be an integer >= 1');
      }

      // Normalize the caller-supplied intent through the pure core so every field
      // carries the correct sentinel and the biconditional flags are recomputed —
      // never trusted from the wire.
      const candidate = {
        ...(rawIntent as Record<string, unknown>),
        action: intentAction,
        confidence:
          typeof (rawIntent as any).confidence === 'number' &&
          Number.isFinite((rawIntent as any).confidence)
            ? (rawIntent as any).confidence
            : 1,
      } as VideoIntentCandidate;
      const intent = normalizeVideoIntent(candidate);

      // ── Derive analysis from the project's source (Req 5.4) ─────────────────
      const sourceDurationMs = await getSourceDurationMs(project.projectId);
      if (sourceDurationMs === null) {
        return fail(
          res,
          400,
          'NO_ANALYZABLE_SOURCE',
          'The project has no analyzed source to plan against',
        );
      }
      const analysis: PlannerAnalysis = {
        sourceDurationMs,
        sceneBoundariesMs: parseNumberArray(body.sceneBoundariesMs),
        protectedRegions: parseProtectedRegions(body.protectedRegions),
      };

      // ── Optional plan-shaping inputs (validated, defaults applied) ──────────
      const brandProfile = parseBrandProfile(body.brandProfile);
      const applyBrand = body.applyBrand === true;
      const platform =
        typeof body.platform === 'string' && body.platform.trim().length > 0
          ? body.platform.trim()
          : undefined;

      // ── Delegate to the service (LLM goal/style) + pure planner core ────────
      const planner = deps.planner ?? getEditingPlannerService();
      const result = await planner.plan({
        intent,
        analysis,
        platform,
        applyBrand,
        brandProfile,
        variantCount: variantCount === 'none' ? undefined : variantCount,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        aiModel: (req.user as { aiModel?: string } | undefined)?.aiModel,
      });

      // Plan-creation lifecycle log (Req 22.1) — no secrets/URLs included.
      logger.info('Video editing plan created', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: project.projectId,
        operationCount: result.plan.operations.length,
        variantCount: result.variants?.length ?? 1,
        usedLLM: result.reasoning.usedLLM,
      });

      return ok(res, {
        projectId: project.projectId,
        plan: result.plan,
        variants: result.variants,
        reasoning: result.reasoning,
        warnings: result.warnings,
      });
    } catch (err) {
      return handleServerError(res, err, ctx, 'plan');
    }
  });

  /**
   * Resolve the `Video_Source` id an analyze/analysis request targets: an
   * explicit `sourceId` (validated to belong to the project, Req 21.6) or the
   * project's newest source. Sends the appropriate error and returns null when
   * no target can be resolved.
   */
  async function resolveAnalysisTargetSourceId(
    res: Response,
    projectId: string,
    requestedSourceId: unknown,
  ): Promise<string | null> {
    if (typeof requestedSourceId === 'string' && requestedSourceId.trim().length > 0) {
      const sourceId = requestedSourceId.trim();
      const belongs = await sourceExistsInProject(projectId, sourceId);
      if (!belongs) {
        fail(res, 404, 'SOURCE_NOT_FOUND', 'The requested source does not exist in this project');
        return null;
      }
      return sourceId;
    }
    const latest = await getLatestSourceId(projectId);
    if (!latest) {
      fail(res, 404, 'NO_SOURCE', 'The project has no source media to analyze');
      return null;
    }
    return latest;
  }

  // POST /projects/:id/analyze — trigger analysis for an owned project's source
  // (Req 21.4). Enqueues the analysis asynchronously on the `video-analysis`
  // queue so the request never blocks (Req 18.1); a source with a completed
  // analysis is reused without re-enqueuing (Req 4.9). Progress is stage-derived
  // and read back via `GET .../analysis`.
  router.post('/projects/:id/analyze', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    try {
      // Ownership is checked before any work (Req 19.1, 19.2, 21.3).
      const project = await resolveOwnedProject(req, res, ctx);
      if (!project) return; // error already sent

      const body = (req.body ?? {}) as Record<string, unknown>;
      const sourceId = await resolveAnalysisTargetSourceId(res, project.projectId, body.sourceId);
      if (!sourceId) return; // error already sent

      const jobId = videoAnalysisJobId(project.projectId, sourceId);

      // Reuse a completed analysis without re-enqueuing (Req 4.9).
      const existing = await resolveAnalysisService().getCompletedAnalysis(sourceId);
      if (existing) {
        return ok(res, {
          projectId: project.projectId,
          sourceId,
          jobId,
          status: 'completed',
          artifactId: existing.artifactId,
          reused: true,
        });
      }

      // Enqueue asynchronously (Req 18.1). No-Mock: if the queue is unavailable
      // we return an explicit error rather than fabricating progress (Req 23.1).
      const queueJobId = await enqueueAnalysis({
        projectId: project.projectId,
        sourceId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
      });
      if (!queueJobId) {
        return fail(
          res,
          503,
          'ANALYSIS_QUEUE_UNAVAILABLE',
          'The analysis queue is not available right now; please retry shortly',
        );
      }

      // Analysis-start lifecycle log (Req 22.1) — no secrets/URLs included.
      logger.info('Video analysis enqueued', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: project.projectId,
        sourceId,
        jobId,
      });

      return ok(
        res,
        {
          projectId: project.projectId,
          sourceId,
          jobId,
          queueJobId,
          status: 'queued',
          state: 'QUEUED',
          progress: 0,
        },
        202,
      );
    } catch (err) {
      return handleServerError(res, err, ctx, 'analyze');
    }
  });

  // GET /projects/:id/analysis — retrieve analysis for an owned project's source
  // (Req 21.4). Returns the completed `VideoAnalysis` record when ready (Req 4.9),
  // otherwise the job's stage-derived state/progress (Req 18.4), or a 404 when no
  // analysis has been started.
  router.get('/projects/:id/analysis', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    try {
      // Ownership is checked before returning any data (Req 19.1, 19.2, 21.3).
      const project = await resolveOwnedProject(req, res, ctx);
      if (!project) return; // error already sent

      const sourceId = await resolveAnalysisTargetSourceId(res, project.projectId, req.query.sourceId);
      if (!sourceId) return; // error already sent

      const jobId = videoAnalysisJobId(project.projectId, sourceId);

      // Completed analysis → return the persisted record (Req 4.9).
      const existing = await resolveAnalysisService().getCompletedAnalysis(sourceId);
      if (existing) {
        return ok(res, {
          projectId: project.projectId,
          sourceId,
          jobId,
          status: 'completed',
          progress: 100,
          artifactId: existing.artifactId,
          analysis: existing.analysis,
        });
      }

      // Otherwise report the job's stage-derived progress (Req 18.4).
      const status = await getAnalysisJobStatus(jobId);
      if (!status) {
        return fail(res, 404, 'ANALYSIS_NOT_FOUND', 'No analysis has been started for this source');
      }

      return ok(res, {
        projectId: project.projectId,
        sourceId,
        jobId,
        status: analysisStatusForJobState(status.state),
        state: status.state,
        progress: status.progress,
        errorCode: status.errorCode,
      });
    } catch (err) {
      return handleServerError(res, err, ctx, 'analysis');
    }
  });

  /**
   * Route-level multipart middleware for the source-ingestion endpoint. Runs
   * `multer.single('file')` and maps any multer error (e.g. the size ceiling
   * from `INGESTION_LIMITS.resumableThresholdBytes`) onto the shared envelope as
   * a 400 `SOURCE_INGESTION_REJECTED` rather than letting it bubble to a 500. A
   * non-multipart (JSON) request passes straight through so the storageKey /
   * sourceUrl hand-off path is reachable.
   */
  const acceptSourceUpload = (req: Request, res: Response, next: NextFunction): void => {
    sourceMemoryUpload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : 'Upload could not be accepted';
        fail(res, 400, 'SOURCE_INGESTION_REJECTED', message);
        return;
      }
      next();
    });
  };

  // POST /projects/:id/sources — ingest a source video for an owned project so
  // it becomes editable (task 7.3, Req 3.2–3.11). This is the missing HTTP path
  // that lets a `Video_Source` with `durationMs > 0` be created, which the
  // `/converse` gate requires. Three input modes, all validated by the ACTUAL
  // byte signature before anything is stored (No-Mock, Req 3.2):
  //   - a multipart `file` upload (field name `file`);
  //   - a JSON `{ storageKey }` the user already uploaded (e.g. a chat
  //     attachment) — fetched from storage and ingested without a re-upload;
  //   - a JSON `{ sourceUrl }` — fetched through the SSRF-guarded remote path.
  // After acceptance the source is probed + prepared so duration/dimensions/
  // fps/codec are populated (Req 3.7). Analysis is then enqueued best-effort.
  router.post(
    '/projects/:id/sources',
    acceptSourceUpload,
    async (req: Request, res: Response) => {
      const ctx = resolveContext(req);
      if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

      try {
        // Ownership is checked before any ingestion work (Req 19.1, 19.2, 21.3).
        const project = await resolveOwnedProject(req, res, ctx);
        if (!project) return; // error already sent

        const file = (req as Request & {
          file?: { buffer: Buffer; originalname: string; mimetype: string };
        }).file;
        const body = (req.body ?? {}) as Record<string, unknown>;
        const storageKey =
          typeof body.storageKey === 'string' && body.storageKey.trim().length > 0
            ? body.storageKey.trim()
            : null;
        const sourceUrl =
          typeof body.sourceUrl === 'string' && body.sourceUrl.trim().length > 0
            ? body.sourceUrl.trim()
            : null;
        const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : undefined;
        const declaredMimeType =
          typeof body.mimeType === 'string' && body.mimeType.trim().length > 0
            ? body.mimeType.trim()
            : undefined;

        const mediaIngestion = resolveMediaIngestion();

        logger.info('Video source ingestion started', {
          component: COMPONENT,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          projectId: project.projectId,
          mode: file ? 'upload' : sourceUrl ? 'remote_url' : storageKey ? 'storage_key' : 'none',
        });

        // ── 1. Validate + accept (store original immutably), by input mode ────
        let sourceId: string;
        try {
          if (file && file.buffer && file.buffer.length > 0) {
            const accept = await mediaIngestion.validateAndAccept({
              projectId: project.projectId,
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              buffer: file.buffer,
              originalName: fileName || file.originalname,
              declaredMimeType: declaredMimeType ?? file.mimetype ?? null,
            });
            sourceId = accept.source.sourceId;
          } else if (sourceUrl) {
            const accept = await mediaIngestion.ingestFromRemoteUrl({
              projectId: project.projectId,
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              url: sourceUrl,
              originalName: fileName,
              declaredMimeType: declaredMimeType ?? null,
            });
            sourceId = accept.source.sourceId;
          } else if (storageKey) {
            const bytes = await downloadStorageBytes(storageKey);
            const accept = await mediaIngestion.validateAndAccept({
              projectId: project.projectId,
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              buffer: bytes.buffer,
              originalName: fileName || storageKey.split('/').pop() || 'source',
              declaredMimeType: declaredMimeType ?? bytes.contentType ?? null,
            });
            sourceId = accept.source.sourceId;
          } else {
            // Neither a file, a storageKey, nor a sourceUrl was provided.
            return fail(
              res,
              400,
              'SOURCE_UPLOAD_REQUIRED',
              'Attach a video file, or provide a storageKey or sourceUrl to ingest',
            );
          }
        } catch (err) {
          // A rejected upload (unsupported actual format / out-of-range size /
          // empty file) surfaces as a 400 with the human-readable reason. When
          // this is thrown NOTHING was stored (Req 3.3, 3.4).
          if (isMediaIngestionRejected(err)) {
            return fail(res, 400, 'SOURCE_INGESTION_REJECTED', err.message);
          }
          throw err;
        }

        // ── 2. Probe + prepare so duration/dimensions/fps/codec populate ──────
        //    (this is exactly what the `/converse` gate needs). A probe failure
        //    (e.g. ffprobe unavailable, unprobeable bytes) surfaces as a 503 and
        //    is NEVER fabricated as success (No-Mock, Req 23.1). The stored bytes
        //    are retained unchanged (Req 3.8).
        let prepared;
        try {
          prepared = await mediaIngestion.probeAndPrepare(sourceId);
        } catch (err) {
          logger.warn('Video source probe/prepare failed', {
            component: COMPONENT,
            userId: ctx.userId,
            workspaceId: ctx.workspaceId,
            projectId: project.projectId,
            sourceId,
            error: err instanceof Error ? err.message : String(err),
          });
          return fail(
            res,
            503,
            'SOURCE_PROBE_FAILED',
            'The source was stored but could not be probed for metadata; please retry shortly',
          );
        }

        const source = prepared.source;

        // ── 3. Best-effort: enqueue analysis so the editor can plan against it ─
        //    (Req 18.1). If the queue is unavailable the source is still editable
        //    for deterministic ops, so we still return 201 and note it wasn't
        //    queued — analysis can be retried via `POST .../analyze`.
        let analysisQueued = false;
        try {
          const queueJobId = await enqueueAnalysis({
            projectId: project.projectId,
            sourceId,
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
          });
          analysisQueued = !!queueJobId;
        } catch (err) {
          logger.warn('Video source analysis enqueue failed (source still editable)', {
            component: COMPONENT,
            userId: ctx.userId,
            workspaceId: ctx.workspaceId,
            projectId: project.projectId,
            sourceId,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        logger.info('Video source ingestion completed', {
          component: COMPONENT,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          projectId: project.projectId,
          sourceId,
          durationMs: source.durationMs,
          analysisQueued,
        });

        return ok(
          res,
          {
            projectId: project.projectId,
            sourceId,
            storageKey: source.storageKey,
            container: source.container,
            durationMs: source.durationMs,
            width: source.width,
            height: source.height,
            fps: source.fps,
            status: 'ready',
            analysisQueued,
          },
          201,
        );
      } catch (err) {
        return handleServerError(res, err, ctx, 'sources.ingest');
      }
    },
  );

  // POST /projects/:id/render — render an owned project's version timeline to a
  // validated file (Req 15.1, 15.6, 15.7, 21.4). A THIN transport layer: it
  // validates input and ownership, resolves the version's authoritative timeline
  // and export profile, creates a render `Video_Edit_Job`, and delegates the
  // render + FFprobe validation + job settlement entirely to the Render_Engine.
  // The Render_Engine marks the job COMPLETED on full success or FAILED (input
  // retained, no exposed output) on any failed check — this handler never
  // fabricates a success.
  router.post('/projects/:id/render', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    try {
      // Ownership is checked before any render work (Req 19.1, 19.2, 21.3).
      const project = await resolveOwnedProject(req, res, ctx);
      if (!project) return; // error already sent

      const body = (req.body ?? {}) as Record<string, unknown>;

      // ── Resolve the version to render (Req 15.7 retains this input version) ──
      const versionId =
        typeof body.versionId === 'string' && body.versionId.trim().length > 0
          ? body.versionId.trim()
          : project.activeVersionId;
      if (!versionId) {
        return fail(
          res,
          400,
          'VALIDATION_ERROR',
          'versionId: a version to render is required (no active version on the project)',
        );
      }

      // ── Resolve the authoritative timeline for that version (Req 10.4) ──────
      const timeline = await getTimelineForVersion(project.projectId, versionId);
      if (!timeline) {
        return fail(res, 404, 'TIMELINE_NOT_FOUND', 'No timeline found for the requested version');
      }

      // ── Resolve the export profile from the single-source config (Req 13.1) ─
      const profileResolution = resolveExportProfileId(body, project.targetPlatform);
      if (!profileResolution.ok) {
        return fail(res, 400, 'VALIDATION_ERROR', profileResolution.message);
      }
      const exportProfileId = profileResolution.exportProfileId;

      const audioExpected =
        typeof body.audioExpected === 'boolean' ? body.audioExpected : undefined;

      // ── Create the render job (not enqueued: the Render_Engine runs it and
      //    settles the job state here; async worker execution is task 14.5) ────
      const jobSystem = await getJobSystem();
      const job = await jobSystem.createJob({
        type: 'render',
        projectId: project.projectId,
        versionId,
        opId: `render-${randomUUID()}`,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        enqueue: false,
      });
      // Enter the RENDERING pipeline stage before the render begins (Req 18.2).
      await jobSystem.transitionTo(job.jobId, 'RENDERING');

      const result = await renderEngine.render({
        projectId: project.projectId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        jobId: job.jobId,
        inputVersionId: versionId,
        timeline,
        exportProfileId,
        audioExpected,
      });

      // Render lifecycle log (Req 22.1) — no secrets/URLs included.
      logger.info('Video render finished', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: project.projectId,
        versionId,
        jobId: job.jobId,
        jobState: result.jobState,
        exportProfileId,
      });

      if (!result.ok) {
        // Validation/render failure → job FAILED, input retained (Req 15.7).
        return fail(
          res,
          422,
          result.errorCode,
          `Render validation failed: ${result.failedChecks.join(', ') || 'render could not be produced'}`,
        );
      }

      // Success → job COMPLETED with exactly one immutable render artifact
      // (Req 15.6). The bytes are served only via the short-lived signed-URL
      // endpoint (Req 19.3) — never a permanent public path here.
      return ok(
        res,
        {
          projectId: project.projectId,
          versionId,
          jobId: job.jobId,
          jobState: result.jobState,
          artifactId: result.artifact.artifactId,
          exportProfileId,
          validation: {
            valid: result.outcome.validation.valid,
            expectedDurationMs: result.outcome.expectedDurationMs,
            durationMs: result.outcome.probe.durationMs,
            width: result.outcome.probe.width,
            height: result.outcome.probe.height,
            fps: result.outcome.probe.fps,
          },
        },
        201,
      );
    } catch (err) {
      return handleServerError(res, err, ctx, 'render');
    }
  });

  // POST /projects/:id/edits — submit a single planned edit operation for an
  // owned project (task 17.8, Req 6.x, 18.1). A THIN transport layer: it
  // validates input + ownership, persists the operation, and routes it through
  // the Model_Router. A GENERATIVE decision is executed ASYNCHRONOUSLY — a
  // `Video_Edit_Job` is created and enqueued on the `video-generation` queue and
  // the request returns immediately with the job id (never blocking, Req 18.1);
  // the `videoGenerationWorker` runs the Generative_Editor and settles the job.
  // A deterministic/analysis/render decision returns the routing decision (those
  // engines are executed by their own pipelines). An `unavailable` decision is
  // surfaced explicitly with its reason and no provider call (Req 6.5) — this
  // handler never fabricates a success (No-Mock, Req 23).
  router.post('/projects/:id/edits', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    try {
      // Ownership is checked before any work (Req 19.1, 19.2, 21.3).
      const project = await resolveOwnedProject(req, res, ctx);
      if (!project) return; // error already sent

      // ── Input validation (Req 21.6) — reject without mutating any state ─────
      const parsed = editsBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return fail(res, 400, 'VALIDATION_ERROR', firstIssue(parsed.error));
      }
      const { operation } = parsed.data;

      // ── Resolve the immutable source the edit reads (Req 3.6, 8.4) ──────────
      const source = await getSourceForEdit(project.projectId);
      if (!source) {
        return fail(res, 404, 'NO_SOURCE', 'The project has no analyzable source media to edit');
      }

      // ── The affected range must fall within the source duration (Req 5.4) ───
      if (operation.range.endMs > source.durationMs) {
        return fail(
          res,
          400,
          'VALIDATION_ERROR',
          `operation.range.endMs (${operation.range.endMs}) exceeds the source duration (${source.durationMs}ms)`,
        );
      }

      // ── Resolve the version this edit targets (input == target here; new-
      //    version creation is the versioning task's responsibility) ──────────
      const versionId =
        operation.type === 'generative'
          ? parsed.data.versionId ?? project.activeVersionId
          : parsed.data.versionId ?? project.activeVersionId;
      if (!versionId) {
        return fail(
          res,
          400,
          'VALIDATION_ERROR',
          'versionId: a version to edit is required (no active version on the project)',
        );
      }
      const inputVersionId = parsed.data.inputVersionId ?? versionId;

      // ── Persist the planned operation, then route it (Req 6.6) ──────────────
      const operationId = generateOperationId();
      await createEditOperation({
        operationId,
        projectId: project.projectId,
        sequenceIndex: 0,
        type: operation.type,
        kind: operation.kind,
        startMs: operation.range.startMs,
        endMs: operation.range.endMs,
        preservationConstraints: operation.protectedElements ?? [],
        status: 'executable',
      });

      // Structured lifecycle event: edit (job) submission (Req 22.1). Only ids
      // and the non-sensitive operation type/kind are carried — never the raw
      // user prompt, media, or a credential (Req 22.4).
      emitLifecycleEvent('edit_submitted', {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: project.projectId,
        versionId,
        details: { operationId, operationType: operation.type, kind: operation.kind },
      });

      const routable: RoutableOperation = {
        type: operation.type,
        kind: operation.kind,
        changesVisualContent: operation.changesVisualContent,
      };
      const { decision } = await resolveModelRouter().route(routable, {
        operationId,
        projectId: project.projectId,
      });

      // ── An operation no engine can perform is surfaced explicitly (Req 6.5) ─
      if (decision.engine === 'unavailable') {
        return fail(res, 422, 'EDIT_UNAVAILABLE', decision.reason);
      }

      // ── Deterministic: EXECUTE inline via the Deterministic_Editor (FFmpeg,
      //    no provider call — Req 8.1) then record the produced artifact on the
      //    version timeline via the Timeline_Engine (task 11.5, Req 8.1, 21.4,
      //    10.1, 10.2). A successful op yields exactly one traceable artifact
      //    (Req 8.3); a failure marks the job FAILED with an error code and
      //    produces no artifact (Req 8.6) — surfaced here as an explicit 422. ──
      if (decision.engine === 'deterministic') {
        const built = buildDeterministicOperation(
          operation.kind,
          operation.range,
          operation.params,
        );
        if (!built.ok) {
          return fail(res, 400, 'VALIDATION_ERROR', built.message);
        }

        const { jobId } = await createDeterministicEditJob({
          projectId: project.projectId,
          versionId,
          operationId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
        });

        let result;
        try {
          result = await deterministicEditor.execute({
            projectId: project.projectId,
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            jobId,
            inputVersionId,
            sourceStorageKey: source.storageKey,
            sourceFileName: source.fileName,
            operation: built.operation,
          });
        } catch (err) {
          // The Deterministic_Editor already marked the job FAILED with its error
          // code (Req 8.6). Surface a typed 422 for a known editing failure; any
          // other error falls through to the generic 500 handler (Req 19.8).
          if (err instanceof DeterministicEditError) {
            logger.warn('Deterministic video edit failed', {
              component: COMPONENT,
              userId: ctx.userId,
              workspaceId: ctx.workspaceId,
              projectId: project.projectId,
              operationId,
              jobId,
              kind: operation.kind,
              errorCode: err.code,
            });
            return fail(res, 422, err.code, err.message);
          }
          throw err;
        }

        // Success: mark the job COMPLETED with its single output artifact (Req 8.3).
        await completeDeterministicEditJob(jobId, result.artifact.artifactId);

        // Record the produced artifact on the version timeline (Req 10.1, 10.2).
        // The clip occupies the operation's affected range and reads the new
        // artifact from its own start; the Timeline_Engine validates the
        // placement and leaves the model unchanged on rejection (Req 10.3).
        const identity: TimelineIdentity = {
          projectId: project.projectId,
          versionId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
        };
        const timelineOp: TimelineOperation = {
          type: 'addElement',
          element: {
            kind: 'clip',
            trackIndex: parsed.data.timelineTrackIndex ?? 0,
            timelineStartMs: operation.range.startMs,
            timelineEndMs: operation.range.endMs,
            sourceAssetId: result.artifact.artifactId,
            sourceInMs: 0,
            sourceOutMs: operation.range.endMs - operation.range.startMs,
            params: { operationKind: operation.kind },
          },
        };
        const timelineResult = await timelineEngine.acceptOperation(identity, timelineOp);
        if (!timelineResult.ok) {
          logger.warn('Deterministic edit timeline update rejected', {
            component: COMPONENT,
            userId: ctx.userId,
            workspaceId: ctx.workspaceId,
            projectId: project.projectId,
            operationId,
            jobId,
            reason: timelineResult.error,
          });
          return fail(res, 422, 'EDIT_TIMELINE_REJECTED', timelineResult.error);
        }

        logger.info('Deterministic video edit applied', {
          component: COMPONENT,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          projectId: project.projectId,
          operationId,
          jobId,
          kind: operation.kind,
          artifactId: result.artifact.artifactId,
        });

        return ok(
          res,
          {
            projectId: project.projectId,
            operationId,
            versionId,
            jobId,
            engine: 'deterministic',
            status: 'completed',
            artifactId: result.artifact.artifactId,
            reason: decision.reason,
            timeline: {
              timelineId: timelineResult.timelineId,
              elementCount: timelineResult.model.elements.length,
              exposureMs: timelineResult.exposureMs,
              persisted: timelineResult.persisted,
            },
          },
          201,
        );
      }

      // ── Analysis / render engines: return the routing decision (executed by
      //    their own pipelines, not this handler) ───────────────────────────────
      if (decision.engine !== 'generative') {
        return ok(res, {
          projectId: project.projectId,
          operationId,
          versionId,
          engine: decision.engine,
          status: 'routed',
          reason: decision.reason,
        });
      }

      // ── Generative: a prompt is required to compile a provider-safe
      //    instruction (Req 9.7); reject without enqueuing otherwise ───────────
      if (!operation.prompt) {
        return fail(
          res,
          400,
          'VALIDATION_ERROR',
          'operation.prompt: a prompt is required for a generative edit',
        );
      }

      // ── Create the job (QUEUED, not yet enqueued) then enqueue it
      //    asynchronously on the `video-generation` queue (Req 18.1) ───────────
      const jobSystem = await getJobSystem();
      const job = await jobSystem.createJob({
        type: 'generation',
        projectId: project.projectId,
        versionId,
        opId: operationId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        enqueue: false,
      });

      const segmentation: GenerativeEditJobSegmentation = {
        sceneBoundariesMs: parsed.data.sceneBoundariesMs,
        trackedSubjects: parsed.data.trackedSubjects,
        utterances: parsed.data.utterances,
        candidateRanges: parsed.data.candidateRanges,
      };
      const payload: GenerativeEditJobPayload = {
        kind: 'generative-edit',
        projectId: project.projectId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        inputVersionId,
        versionId,
        operationId,
        source: {
          storageKey: source.storageKey,
          fileName: source.fileName,
          durationMs: source.durationMs,
        },
        affectedRegion: { startMs: operation.range.startMs, endMs: operation.range.endMs },
        provider: { provider: decision.provider, model: decision.model },
        prompt: {
          userRequest: operation.prompt,
          requiredProtectedElements: (operation.protectedElements ?? []) as ProtectedElement[],
          operationType: operation.kind,
          editingStyle: operation.editingStyle ?? null,
        },
        segmentation,
        outputResolution: operation.outputResolution,
        timelineTrackIndex: parsed.data.timelineTrackIndex,
        creditIdempotencyKey: job.idempotencyKey,
        isZeroCostEdit: parsed.data.isZeroCostEdit,
      };

      const queueJobId = await enqueueGenerativeEdit({
        projectId: project.projectId,
        versionId,
        operationId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        idempotencyKey: job.idempotencyKey,
        payload,
      });

      // No-Mock: when the queue is unavailable we return an explicit error
      // rather than leaving a job that never runs (Req 23.1). The job record
      // remains QUEUED and idempotent retry re-enqueues the same id (Req 18.7).
      if (!queueJobId) {
        return fail(
          res,
          503,
          'GENERATION_QUEUE_UNAVAILABLE',
          'The generation queue is not available right now; please retry shortly',
        );
      }

      // Edit-enqueued lifecycle log (Req 22.1) — no secrets/URLs included.
      logger.info('Generative video edit enqueued', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: project.projectId,
        operationId,
        jobId: job.jobId,
        provider: decision.provider,
        model: decision.model,
      });

      return ok(
        res,
        {
          projectId: project.projectId,
          operationId,
          versionId,
          jobId: job.jobId,
          queueJobId,
          engine: 'generative',
          provider: decision.provider,
          model: decision.model,
          reason: decision.reason,
          status: 'queued',
          state: 'QUEUED',
          progress: 0,
        },
        202,
      );
    } catch (err) {
      return handleServerError(res, err, ctx, 'edits');
    }
  });

  // GET /projects/:id/versions — list every `Video_Version` for an owned project
  // in creation order plus the active-version pointer (Req 21.5). A THIN
  // transport layer: it enforces ownership then delegates to the Version_Manager,
  // which hydrates the immutable history scoped to the requester's project +
  // workspace. Reads only — mutates nothing.
  router.get('/projects/:id/versions', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    try {
      // Ownership is checked before returning any data (Req 19.1, 19.2, 21.3).
      const project = await resolveOwnedProject(req, res, ctx);
      if (!project) return; // error already sent

      const result = await resolveVersionManager().listVersions({
        projectId: project.projectId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
      });
      if (!result.ok) return failVersion(res, result.error);

      return ok(res, {
        projectId: project.projectId,
        versions: result.versions,
        activeVersionId: result.activeVersionId,
      });
    } catch (err) {
      return handleServerError(res, err, ctx, 'versions.list');
    }
  });

  // POST /projects/:id/versions — create a new immutable `Video_Version`
  // (refinement) for an owned project (Req 16.1, 16.2, 16.3, 16.4, 16.6). A THIN
  // transport layer: it validates input + ownership, then delegates to the
  // Version_Manager. The new version derives from an explicit `parentVersionId`
  // (Req 16.1) or, when omitted/null, the project's active version (Req 16.2); a
  // missing named parent is rejected with NO version created (Req 16.3). On
  // success the new version is appended (prior versions untouched, Req 16.4),
  // records its parent lineage (Req 16.6), and becomes the active version.
  router.post('/projects/:id/versions', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    // ── Input validation (Req 21.6) — reject without mutating any state ───────
    const parsed = createVersionBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return fail(res, 400, 'VALIDATION_ERROR', firstIssue(parsed.error));
    }

    try {
      // Ownership is checked before any mutation (Req 19.1, 19.2, 21.3).
      const project = await resolveOwnedProject(req, res, ctx);
      if (!project) return; // error already sent

      const result = await resolveVersionManager().createVersion(
        {
          projectId: project.projectId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
        },
        {
          timelineId: parsed.data.timelineId,
          parentVersionId: parsed.data.parentVersionId ?? null,
          ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
        },
      );
      if (!result.ok) return failVersion(res, result.error);

      // Version-creation lifecycle log (Req 22.1) — no secrets/URLs included.
      logger.info('Video version created', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: project.projectId,
        versionId: result.version.versionId,
        parentVersionId: result.version.parentVersionId,
      });

      return ok(
        res,
        {
          projectId: project.projectId,
          version: result.version,
          activeVersionId: result.version.versionId,
        },
        201,
      );
    } catch (err) {
      return handleServerError(res, err, ctx, 'versions.create');
    }
  });

  // POST /projects/:id/versions/:versionId/restore — make an existing prior
  // version the active version WITHOUT deleting any other version (Req 16.7, 21.5).
  // A THIN transport layer: it enforces ownership then delegates to the
  // Version_Manager. A missing restore target is rejected and the current active
  // version is preserved (Req 16.8).
  router.post(
    '/projects/:id/versions/:versionId/restore',
    async (req: Request, res: Response) => {
      const ctx = resolveContext(req);
      if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

      const versionId = typeof req.params.versionId === 'string' ? req.params.versionId.trim() : '';
      if (!versionId) {
        return fail(res, 400, 'VALIDATION_ERROR', 'versionId: a version to restore is required');
      }

      try {
        // Ownership is checked before any mutation (Req 19.1, 19.2, 21.3).
        const project = await resolveOwnedProject(req, res, ctx);
        if (!project) return; // error already sent

        const result = await resolveVersionManager().restoreVersion(
          {
            projectId: project.projectId,
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
          },
          versionId,
        );
        if (!result.ok) return failVersion(res, result.error);

        // Restore lifecycle log (Req 22.1) — no secrets/URLs included.
        logger.info('Video version restored as active', {
          component: COMPONENT,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          projectId: project.projectId,
          versionId: result.activeVersionId,
        });

        return ok(res, {
          projectId: project.projectId,
          activeVersionId: result.activeVersionId,
        });
      } catch (err) {
        return handleServerError(res, err, ctx, 'versions.restore');
      }
    },
  );

  // GET /jobs/:jobId — read a `Video_Edit_Job`'s stage-derived status/progress
  // (Req 18.4, 23.2, 23.6, 21.4). Ownership is enforced from the job's server-
  // side workspaceId/userId (Req 19.1, 19.2, 19.5): a non-owner receives 403 and
  // NO job data, an unknown job 404. Progress is ALWAYS re-derived from the count
  // of completed stages — never read from a stored value or interpolated — and is
  // reported as indeterminate (`progress: null`) when the completion state is
  // unknown (Req 23.6).
  router.get('/jobs/:jobId', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    const jobId = typeof req.params.jobId === 'string' ? req.params.jobId.trim() : '';
    if (!jobId) return fail(res, 400, 'VALIDATION_ERROR', 'jobId: a job id is required');

    try {
      const record = await getJobStatus(jobId);
      if (!record) return fail(res, 404, 'JOB_NOT_FOUND', 'Video edit job not found');
      if (!jobOwnedBy(record, ctx)) {
        logger.warn('Video edit job ownership denied', {
          component: COMPONENT,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          jobId,
        });
        return fail(res, 403, 'JOB_ACCESS_DENIED', 'You do not have access to this video edit job');
      }
      return ok(res, serializeJobStatus(record));
    } catch (err) {
      return handleServerError(res, err, ctx, 'jobs.status');
    }
  });

  // GET /jobs/:jobId/stream — stage-derived progress stream over the SAME NDJSON
  // transport the conversational editor uses (Req 18.4, 23.2, 23.6). Auth,
  // ownership, and existence are validated with the `{ success, error }` JSON
  // envelope BEFORE the stream opens; once streaming, each event carries the
  // stage-derived progress (never a timer-interpolated value), and the stream
  // ends when the job reaches a terminal state, the client disconnects, or the
  // safety bound is reached.
  router.get('/jobs/:jobId/stream', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    const jobId = typeof req.params.jobId === 'string' ? req.params.jobId.trim() : '';
    if (!jobId) return fail(res, 400, 'VALIDATION_ERROR', 'jobId: a job id is required');

    let record: JobStatusRecord | null;
    try {
      record = await getJobStatus(jobId);
    } catch (err) {
      return handleServerError(res, err, ctx, 'jobs.stream');
    }
    if (!record) return fail(res, 404, 'JOB_NOT_FOUND', 'Video edit job not found');
    if (!jobOwnedBy(record, ctx)) {
      logger.warn('Video edit job stream ownership denied', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        jobId,
      });
      return fail(res, 403, 'JOB_ACCESS_DENIED', 'You do not have access to this video edit job');
    }

    initJobStreamResponse(res);
    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
    });

    try {
      let current: JobStatusRecord | null = record;
      for (let emitted = 0; emitted < streamMaxEvents; emitted += 1) {
        if (clientClosed) break;
        if (!current) {
          writeJobStreamEvent(res, { type: 'error', code: 'JOB_NOT_FOUND', jobId });
          break;
        }

        const report = deriveJobProgress(current);
        const terminal = isTerminalState(current.state);
        writeJobStreamEvent(res, {
          type: terminal ? 'complete' : 'progress',
          jobId,
          projectId: current.projectId,
          state: current.state,
          terminal,
          determinate: report.determinate,
          progress: report.determinate ? report.percent : null,
          completedStages: current.completedStages,
          totalStages: PIPELINE_STAGES.length,
          errorCode: current.errorCode,
        });

        // A terminal job emits its final event, then the stream closes (Req 18.4).
        if (terminal) break;

        await sleep(streamPollIntervalMs);
        if (clientClosed) break;
        current = await getJobStatus(jobId);
      }
    } catch (err) {
      // The stream has already started, so a mid-stream failure is surfaced as an
      // error EVENT and the full error is logged server-side only (Req 19.8, 23.5).
      logger.error('Video edit job stream failed', err as Error, {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        jobId,
      });
      writeJobStreamEvent(res, { type: 'error', code: 'JOB_STREAM_ERROR', jobId });
    } finally {
      if (!res.writableEnded) res.end();
    }
    return;
  });

  // POST /jobs/:jobId/cancel — cancel a `Video_Edit_Job` within the 5 s deadline
  // (Req 18.5, 18.6). Ownership is enforced from the job's server-side
  // workspaceId/userId BEFORE any cancellation (Req 19.1, 19.2, 19.5); the whole
  // cancel workflow (abort in-flight stages/provider, mark CANCELLED, remove temp
  // files or schedule a background cleanup retry, reconcile reserved credits) is
  // delegated to `JobSystemService.cancelJob`, which is designed to complete well
  // within 5 s. Cancelling an already-terminal job is a no-op that reports the
  // existing state.
  router.post('/jobs/:jobId/cancel', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    const jobId = typeof req.params.jobId === 'string' ? req.params.jobId.trim() : '';
    if (!jobId) return fail(res, 400, 'VALIDATION_ERROR', 'jobId: a job id is required');

    try {
      // Ownership is verified before any cancellation side effect (Req 19.1, 19.2).
      const record = await getJobStatus(jobId);
      if (!record) return fail(res, 404, 'JOB_NOT_FOUND', 'Video edit job not found');
      if (!jobOwnedBy(record, ctx)) {
        logger.warn('Video edit job cancel ownership denied', {
          component: COMPONENT,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          jobId,
        });
        return fail(res, 403, 'JOB_ACCESS_DENIED', 'You do not have access to this video edit job');
      }

      const jobSystem = await getJobSystem();
      const result = await jobSystem.cancelJob(jobId);

      logger.info('Video edit job cancel requested', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        jobId,
        cancelled: result.cancelled,
        state: result.state,
      });

      return ok(res, {
        jobId: result.jobId,
        projectId: record.projectId,
        state: result.state,
        cancelled: result.cancelled,
        tempFilesRemoved: result.tempFilesRemoved,
        cleanupRetryScheduled: result.cleanupRetryScheduled,
        creditsReleased: result.creditsReleased,
      });
    } catch (err) {
      return handleServerError(res, err, ctx, 'jobs.cancel');
    }
  });

  return router;
}

/**
 * Resolve the export profile id for a render request in priority order:
 * an explicit valid `exportProfileId`, then a known `platform` preset's profile,
 * then the project's `targetPlatform` preset's profile. Returns a validation
 * error when none resolves (Req 13.1, 15.1).
 */
function resolveExportProfileId(
  body: Record<string, unknown>,
  projectTargetPlatform?: string,
): { ok: true; exportProfileId: string } | { ok: false; message: string } {
  const explicit = body.exportProfileId;
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    const profile = getExportProfile(explicit.trim());
    if (!profile) {
      return { ok: false, message: `exportProfileId: unknown export profile "${explicit}"` };
    }
    return { ok: true, exportProfileId: profile.id };
  }

  const platform = body.platform;
  if (typeof platform === 'string' && platform.trim().length > 0) {
    const profile = getExportProfileForPreset(platform.trim());
    if (!profile) {
      return { ok: false, message: `platform: unknown platform preset "${platform}"` };
    }
    return { ok: true, exportProfileId: profile.id };
  }

  if (projectTargetPlatform) {
    const profile = getExportProfileForPreset(projectTargetPlatform);
    if (profile) return { ok: true, exportProfileId: profile.id };
  }

  return {
    ok: false,
    message: 'exportProfileId: an export profile or a known platform is required',
  };
}

// ── Plan-input parsing helpers (pure, defensive) ─────────────────────────────

/** Parse an array of finite numbers, dropping invalid entries; undefined otherwise. */
function parseNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return out.length > 0 ? out : undefined;
}

/** Parse protected-element regions from the request body; undefined when absent/invalid. */
function parseProtectedRegions(value: unknown): ProtectedElementRegion[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ProtectedElementRegion[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.element !== 'string') continue;
    const region: ProtectedElementRegion = {
      element: e.element as ProtectedElementRegion['element'],
    };
    const range = e.range as Record<string, unknown> | undefined;
    if (
      range &&
      typeof range.startMs === 'number' &&
      Number.isFinite(range.startMs) &&
      typeof range.endMs === 'number' &&
      Number.isFinite(range.endMs)
    ) {
      region.range = { startMs: range.startMs, endMs: range.endMs };
    }
    out.push(region);
  }
  return out.length > 0 ? out : undefined;
}

/** Parse a brand profile object; null when absent (never fabricated). */
function parseBrandProfile(value: unknown): BrandProfile | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  return {
    primaryColorHex: typeof v.primaryColorHex === 'string' ? v.primaryColorHex : null,
    secondaryColorHex: typeof v.secondaryColorHex === 'string' ? v.secondaryColorHex : null,
    fontFamily: typeof v.fontFamily === 'string' ? v.fontFamily : null,
    captionStyle: typeof v.captionStyle === 'string' ? v.captionStyle : null,
  };
}

/**
 * Parse a variant count: `'none'` when absent, the integer when valid (>= 1),
 * `'invalid'` for a malformed value (so the route can 400).
 */
function parseVariantCount(value: unknown): number | 'none' | 'invalid' {
  if (value === undefined || value === null) return 'none';
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return 'invalid';
  return value;
}

/** First Zod issue rendered as a `field: message` string for the error body. */
function firstIssue(error: ZodError): string {
  return zodIssueMessage(error);
}

/**
 * Map a Version_Manager error code to the conventional HTTP status + message
 * envelope (Req 21.5, 21.7). Never leaks internal detail beyond the stable code.
 */
function failVersion(res: Response, code: string): Response {
  switch (code) {
    case VERSION_ERROR_PROJECT_NOT_FOUND:
      return fail(res, 404, 'PROJECT_NOT_FOUND', 'Video project not found');
    case VERSION_ERROR_MISSING_PARENT:
      // Named parent does not exist → reject, no version created (Req 16.3).
      return fail(res, 400, code, 'The specified parent version does not exist');
    case VERSION_ERROR_MISSING_RESTORE_TARGET:
      // Restore target does not exist → active preserved (Req 16.8).
      return fail(res, 404, code, 'The specified version does not exist');
    case VERSION_ERROR_IMMUTABLE:
      // Duplicate id / attempt to modify an existing immutable version (Req 16.5).
      return fail(res, 409, code, 'The version already exists and cannot be modified');
    case VERSION_ERROR_PERSISTENCE:
      return fail(res, 500, 'VIDEO_PROJECT_ERROR', 'The version request could not be completed');
    default:
      return fail(res, 400, 'VERSION_ERROR', 'The version request could not be completed');
  }
}

/**
 * Log the full error server-side and return a generic 500 that never leaks
 * secrets, credentials, or stack traces (Req 19.8).
 */
function handleServerError(res: Response, err: unknown, ctx: RequestContext, op: string): Response {
  // Delegate to the shared handler: ZodError → 400, typed errors → their own
  // status/code, everything else → a generic 500 with full detail logged
  // server-side only (Req 19.8, 21.7, 23.5).
  return sendError(res, err, {
    component: COMPONENT,
    op,
    context: { userId: ctx.userId, workspaceId: ctx.workspaceId },
    fallbackCode: 'VIDEO_PROJECT_ERROR',
    fallbackMessage: 'The video project request could not be completed',
  });
}

/** Default router used when mounting in `server/routes.ts` (task 5.3). */
export const videoEditorProjectRouter = createVideoEditorProjectRouter();
