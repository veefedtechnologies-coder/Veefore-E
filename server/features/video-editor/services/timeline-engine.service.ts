/**
 * Timeline_Engine — persistence service (task 12.3, Req 10.1, 10.2).
 *
 * This is the thin, IO-bearing shell around the pure `timeline-engine.logic.ts`
 * core. It owns exactly two responsibilities and delegates every rule about the
 * timeline model to the pure core:
 *
 *   1. Persist `VideoTimeline` snapshots per version (Req 10.1). Each
 *      `Video_Version` owns one `VideoTimeline` document; as operations are
 *      accepted while composing that version, the document is updated in place so
 *      it always reflects the version's authoritative composed state. A new
 *      version gets a new snapshot document.
 *
 *   2. Expose the updated model state within 100 ms of accepting an operation
 *      (Req 10.2). Acceptance runs entirely through the synchronous pure core and
 *      an in-memory cache, so the updated state is readable the instant the
 *      operation is accepted — well inside the 100 ms budget. Durable persistence
 *      to MongoDB happens after the state is exposed and never gates it.
 *
 * Every validation and mutation is performed by the pure core's copy-on-write
 * helpers (`addElement`/`updateElement`/`removeElement`). On rejection the core
 * returns the model UNCHANGED, so this service persists nothing and leaves the
 * cached state untouched — the "leave the model unchanged on rejection" guarantee
 * (Req 10.3, 10.6) holds structurally here too.
 */

import type { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { logger as defaultLogger } from '../../../config/logger';
import {
  VideoTimelineModel as DefaultVideoTimelineModel,
  type IVideoTimeline,
} from '../../../models/VideoEditor/VideoTimeline';
import {
  addElement,
  updateElement,
  removeElement,
  createTimeline,
  type TimelineModel,
  type TimelineElement,
  type TimelineOpContext,
  type TimelineSequence,
} from './timeline-engine.logic';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Identifies which version's timeline a persistence call operates on (Req 10.1). */
export interface TimelineIdentity {
  projectId: string;
  versionId: string;
  workspaceId: string;
  userId: string;
}

/**
 * A single timeline operation, expressed in terms of the pure-core mutations.
 * The service never mutates the model itself — it dispatches to the core.
 */
export type TimelineOperation =
  | { type: 'addElement'; element: TimelineElement; ctx?: TimelineOpContext }
  | { type: 'updateElement'; index: number; element: TimelineElement; ctx?: TimelineOpContext }
  | { type: 'removeElement'; index: number };

/**
 * Result of accepting an operation. On success it carries the NEW exposed model
 * plus `exposureMs` — the wall-clock time from accept to the state being readable
 * (asserted ≤ 100 ms by Req 10.2) — and whether the durable snapshot persisted.
 * On failure it carries the pure core's rejection reason and the model is
 * unchanged (Req 10.3, 10.6).
 */
export type AcceptOperationResult =
  | {
      ok: true;
      timelineId: string;
      model: TimelineModel;
      /** Time (ms) from accepting the op to the updated state being exposed (Req 10.2). */
      exposureMs: number;
      /** True when the per-version snapshot was durably written; false if persistence failed. */
      persisted: boolean;
    }
  | { ok: false; error: string };

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface TimelineEngineServiceDeps {
  timelineModel?: Model<IVideoTimeline>;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** Monotonic clock in ms; injectable so exposure timing is testable. */
  now?: () => number;
  /** Timeline id generator; injectable for deterministic tests. */
  generateTimelineId?: () => string;
}

/** In-memory view of a version's current timeline plus its persisted snapshot id. */
interface CachedTimeline {
  timelineId: string;
  identity: TimelineIdentity;
  model: TimelineModel;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Persists `VideoTimeline` snapshots per version and exposes the updated model
 * within 100 ms of accepting an operation (Req 10.1, 10.2). All validation and
 * mutation are delegated to the pure `timeline-engine.logic.ts` core.
 */
export class TimelineEngineService {
  private readonly timelineModel: Model<IVideoTimeline>;
  private readonly log: TimelineEngineServiceDeps['logger'];
  private readonly now: () => number;
  private readonly generateTimelineId: () => string;

  /**
   * In-memory cache keyed by `versionId`, holding each version's current model so
   * the updated state is exposed synchronously on accept (Req 10.2), independent
   * of MongoDB round-trip latency.
   */
  private readonly cache = new Map<string, CachedTimeline>();

  constructor(deps: TimelineEngineServiceDeps = {}) {
    this.timelineModel = deps.timelineModel ?? DefaultVideoTimelineModel;
    this.log = deps.logger ?? defaultLogger;
    this.now = deps.now ?? (() => Date.now());
    this.generateTimelineId = deps.generateTimelineId ?? (() => `vt-${uuidv4()}`);
  }

  /**
   * Load a version's current timeline into the cache and return the model. If a
   * `VideoTimeline` snapshot already exists for the version it is hydrated;
   * otherwise a fresh empty timeline (with the given track layout) is created and
   * persisted as the version's initial snapshot (Req 10.1).
   */
  async load(
    identity: TimelineIdentity,
    initialSequences: TimelineSequence[] = [{ tracks: 1 }],
  ): Promise<TimelineModel> {
    const cached = this.cache.get(identity.versionId);
    if (cached) return cached.model;

    const existing = await this.timelineModel
      .findOne({ projectId: identity.projectId, versionId: identity.versionId })
      .lean<IVideoTimeline>()
      .exec();

    if (existing) {
      const model = docToModel(existing);
      this.cache.set(identity.versionId, {
        timelineId: existing.timelineId,
        identity,
        model,
      });
      return model;
    }

    // No snapshot yet — create the version's initial empty timeline snapshot.
    const timelineId = this.generateTimelineId();
    const model = createTimeline(initialSequences);
    await this.persistSnapshot(timelineId, identity, model);
    this.cache.set(identity.versionId, { timelineId, identity, model });
    return model;
  }

  /**
   * Accept an operation against a version's timeline (Req 10.2). The operation is
   * validated and applied by the pure core (copy-on-write); on success the cached
   * model is swapped to the new model — exposing the updated state immediately —
   * and then the per-version snapshot is persisted. On rejection the model is left
   * unchanged and nothing is persisted (Req 10.3, 10.6).
   */
  async acceptOperation(
    identity: TimelineIdentity,
    operation: TimelineOperation,
  ): Promise<AcceptOperationResult> {
    const startedAt = this.now();

    // Ensure the version's current model is loaded into the cache.
    if (!this.cache.has(identity.versionId)) {
      await this.load(identity);
    }
    const entry = this.cache.get(identity.versionId)!;

    // Delegate ALL validation/mutation to the pure core.
    const result = applyOperation(entry.model, operation);
    if (!result.ok) {
      // Rejection: model unchanged, persist nothing (Req 10.3, 10.6).
      return { ok: false, error: result.error };
    }

    // Expose the updated state synchronously by swapping the cached model.
    entry.model = result.model;
    const exposureMs = this.now() - startedAt;

    // Durable snapshot happens AFTER exposure and never gates the 100 ms budget.
    let persisted = false;
    try {
      await this.persistSnapshot(entry.timelineId, identity, result.model);
      persisted = true;
    } catch (error) {
      this.log?.error?.('Failed to persist VideoTimeline snapshot', error, {
        component: 'TimelineEngineService',
        projectId: identity.projectId,
        versionId: identity.versionId,
        timelineId: entry.timelineId,
      });
    }

    return { ok: true, timelineId: entry.timelineId, model: result.model, exposureMs, persisted };
  }

  /**
   * Read the currently exposed model for a version without touching persistence.
   * Returns the cached model when present (the state exposed on the last accepted
   * operation), otherwise `null`.
   */
  getExposedModel(versionId: string): TimelineModel | null {
    return this.cache.get(versionId)?.model ?? null;
  }

  /**
   * Persist (upsert) the version's `VideoTimeline` snapshot (Req 10.1). One
   * document per version, keyed by `(projectId, versionId)`, updated in place as
   * the version is composed. `setOnInsert` fixes the immutable `timelineId` on
   * first write.
   */
  private async persistSnapshot(
    timelineId: string,
    identity: TimelineIdentity,
    model: TimelineModel,
  ): Promise<void> {
    await this.timelineModel
      .updateOne(
        { projectId: identity.projectId, versionId: identity.versionId },
        {
          $set: {
            workspaceId: identity.workspaceId,
            userId: identity.userId,
            sequences: model.sequences.map((s) => ({ tracks: s.tracks })),
            elements: model.elements,
          },
          $setOnInsert: { timelineId },
        },
        { upsert: true },
      )
      .exec();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Dispatch an operation to the matching pure-core mutation (no local mutation). */
function applyOperation(model: TimelineModel, operation: TimelineOperation) {
  switch (operation.type) {
    case 'addElement':
      return addElement(model, operation.element, operation.ctx ?? {});
    case 'updateElement':
      return updateElement(model, operation.index, operation.element, operation.ctx ?? {});
    case 'removeElement':
      return removeElement(model, operation.index);
    default: {
      // Exhaustiveness guard — an unknown op type is rejected without mutation.
      const unknown = operation as { type?: unknown };
      return { ok: false as const, error: `Unknown timeline operation type: ${String(unknown.type)}` };
    }
  }
}

/** Project a persisted `VideoTimeline` document down to the pure-core model shape. */
function docToModel(doc: Pick<IVideoTimeline, 'sequences' | 'elements'>): TimelineModel {
  return {
    sequences: (doc.sequences ?? []).map((s) => ({ tracks: s.tracks })),
    elements: (doc.elements ?? []).map((el) => {
      const element: TimelineElement = {
        kind: el.kind,
        trackIndex: el.trackIndex,
        timelineStartMs: el.timelineStartMs,
        timelineEndMs: el.timelineEndMs,
      };
      if (el.sourceAssetId !== undefined) element.sourceAssetId = el.sourceAssetId;
      if (el.sourceInMs !== undefined) element.sourceInMs = el.sourceInMs;
      if (el.sourceOutMs !== undefined) element.sourceOutMs = el.sourceOutMs;
      if (el.params !== undefined) element.params = el.params;
      return element;
    }),
  };
}

/** Shared singleton for production use (mirrors other feature-service exports). */
export const timelineEngineService = new TimelineEngineService();
