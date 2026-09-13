/**
 * Version manager — IO service shell (task 19.1, Req 16.1–16.8).
 *
 * The thin, DB-bearing shell around the pure `version-manager.logic` core. It
 * owns exactly the side effects the pure core cannot:
 *
 *   1. Hydrate a project's `VersionStore` from persisted `VideoVersion` records
 *      plus the project's `activeVersionId` pointer, scoped to the requester's
 *      project/workspace for isolation.
 *
 *   2. Persist the decisions the pure core produces — appending a new immutable
 *      `VideoVersion` document on creation (never overwriting an existing one,
 *      Req 16.4/16.5) and moving the project's `activeVersionId` pointer on
 *      creation (Req 16.1, 16.2) and restore (Req 16.7).
 *
 * Every rule about parent resolution, history preservation, lineage, restore,
 * and immutability is delegated to the pure core; on rejection the core returns
 * an error and this shell writes nothing, so "no version created" (Req 16.3) and
 * "current active preserved" (Req 16.8) hold structurally.
 */

import type { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { logger as defaultLogger } from '../../../config/logger';
import {
  VideoVersionModel as DefaultVideoVersionModel,
  type IVideoVersion,
} from '../../../models/VideoEditor/VideoVersion';
import {
  VideoProjectModel as DefaultVideoProjectModel,
  type IVideoProject,
} from '../../../models/VideoEditor/VideoProject';
import {
  createVersion as createVersionPure,
  restoreVersion as restoreVersionPure,
  rejectVersionModification,
  type VersionRecord,
  type VersionStore,
  VERSION_ERROR_IMMUTABLE,
} from './version-manager.logic';

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/** The referenced project does not exist (or is not visible to the requester). */
export const VERSION_ERROR_PROJECT_NOT_FOUND = 'VERSION_PROJECT_NOT_FOUND';
/** A persistence step failed while creating/restoring a version. */
export const VERSION_ERROR_PERSISTENCE = 'VERSION_PERSISTENCE_FAILED';

// Re-export the pure immutability error so callers have one import site.
export { VERSION_ERROR_IMMUTABLE } from './version-manager.logic';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Scopes every call to a single project owned within a workspace (Req 19 isolation). */
export interface VersionIdentity {
  projectId: string;
  workspaceId: string;
  userId: string;
}

export interface CreateVersionRequest {
  /** Explicit parent version (Req 16.1); omit/null ⇒ derive from active (Req 16.2). */
  parentVersionId?: string | null;
  /** The timeline snapshot the new version composes. */
  timelineId: string;
  label?: string;
}

export type VersionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface VersionManagerServiceDeps {
  versionModel?: Model<IVideoVersion>;
  projectModel?: Model<IVideoProject>;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  now?: () => number;
  generateVersionId?: () => string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class VersionManagerService {
  private readonly versionModel: Model<IVideoVersion>;
  private readonly projectModel: Model<IVideoProject>;
  private readonly log: VersionManagerServiceDeps['logger'];
  private readonly now: () => number;
  private readonly generateVersionId: () => string;

  constructor(deps: VersionManagerServiceDeps = {}) {
    this.versionModel = deps.versionModel ?? DefaultVideoVersionModel;
    this.projectModel = deps.projectModel ?? DefaultVideoProjectModel;
    this.log = deps.logger ?? defaultLogger;
    this.now = deps.now ?? (() => Date.now());
    this.generateVersionId = deps.generateVersionId ?? (() => `vv-${uuidv4()}`);
  }

  /**
   * Create a new immutable version derived from the specified parent, or from the
   * project's active version when no parent is given (Req 16.1, 16.2). A missing
   * specified parent is rejected with no version created (Req 16.3). On success
   * the new version is appended (prior versions untouched, Req 16.4), records its
   * parent lineage (Req 16.6), and becomes the active version.
   */
  async createVersion(
    identity: VersionIdentity,
    request: CreateVersionRequest,
  ): Promise<VersionResult<{ version: VersionRecord }>> {
    const loaded = await this.loadStore(identity);
    if (!loaded.ok) return loaded;

    const decision = createVersionPure(loaded.store, {
      versionId: this.generateVersionId(),
      requestedParentId: request.parentVersionId ?? null,
      timelineId: request.timelineId,
      createdAt: this.now(),
      ...(request.label !== undefined ? { label: request.label } : {}),
    });

    if (!decision.ok) {
      // Missing parent / duplicate id — persist nothing (Req 16.3).
      return { ok: false, error: decision.error };
    }

    const { version } = decision;
    try {
      // Append the new immutable version document (never overwrites an existing one).
      await this.versionModel.create({
        versionId: version.versionId,
        projectId: identity.projectId,
        parentVersionId: version.parentVersionId,
        workspaceId: identity.workspaceId,
        userId: identity.userId,
        timelineId: version.timelineId,
        ...(version.label !== undefined ? { label: version.label } : {}),
      });

      // Move the active pointer to the newly created version.
      await this.projectModel
        .updateOne(
          { projectId: identity.projectId, workspaceId: identity.workspaceId },
          { $set: { activeVersionId: version.versionId } },
        )
        .exec();
    } catch (error) {
      this.log?.error?.('Failed to persist new VideoVersion', error, {
        component: 'VersionManagerService',
        projectId: identity.projectId,
        versionId: version.versionId,
      });
      return { ok: false, error: VERSION_ERROR_PERSISTENCE };
    }

    this.log?.info?.('Created VideoVersion', {
      component: 'VersionManagerService',
      projectId: identity.projectId,
      versionId: version.versionId,
      parentVersionId: version.parentVersionId,
    });
    return { ok: true, version };
  }

  /**
   * Restore an existing version as the active version without deleting any other
   * version (Req 16.7). A missing restore target is rejected and the current
   * active version is preserved (Req 16.8).
   */
  async restoreVersion(
    identity: VersionIdentity,
    versionId: string,
  ): Promise<VersionResult<{ activeVersionId: string }>> {
    const loaded = await this.loadStore(identity);
    if (!loaded.ok) return loaded;

    const decision = restoreVersionPure(loaded.store, versionId);
    if (!decision.ok) {
      // Missing target — active pointer untouched (Req 16.8).
      return { ok: false, error: decision.error };
    }

    try {
      await this.projectModel
        .updateOne(
          { projectId: identity.projectId, workspaceId: identity.workspaceId },
          { $set: { activeVersionId: versionId } },
        )
        .exec();
    } catch (error) {
      this.log?.error?.('Failed to restore VideoVersion', error, {
        component: 'VersionManagerService',
        projectId: identity.projectId,
        versionId,
      });
      return { ok: false, error: VERSION_ERROR_PERSISTENCE };
    }

    this.log?.info?.('Restored VideoVersion as active', {
      component: 'VersionManagerService',
      projectId: identity.projectId,
      versionId,
    });
    return { ok: true, activeVersionId: versionId };
  }

  /** List every version for the project in creation order (oldest first). */
  async listVersions(identity: VersionIdentity): Promise<VersionResult<{ versions: VersionRecord[]; activeVersionId: string | null }>> {
    const loaded = await this.loadStore(identity);
    if (!loaded.ok) return loaded;
    return {
      ok: true,
      versions: [...loaded.store.versions],
      activeVersionId: loaded.store.activeVersionId,
    };
  }

  /**
   * Reject any non-creation attempt to modify an existing version with an
   * immutability error, leaving the version unchanged (Req 16.5). Exposed so
   * routes/services that receive an "edit this version in place" request have a
   * single enforcement point rather than silently mutating.
   */
  rejectModification(versionId: string): { ok: false; error: string } {
    // Delegates to the pure core; the store is never touched.
    const result = rejectVersionModification({ versions: [], activeVersionId: null }, versionId);
    this.log?.warn?.('Rejected attempt to modify an immutable VideoVersion', {
      component: 'VersionManagerService',
      versionId,
      error: VERSION_ERROR_IMMUTABLE,
    });
    return result as { ok: false; error: string };
  }

  /**
   * Hydrate the project's version history + active pointer from persistence,
   * scoped to the requester's project/workspace. A missing project yields an
   * explicit error so a version is never created against a non-existent project.
   */
  private async loadStore(
    identity: VersionIdentity,
  ): Promise<VersionResult<{ store: VersionStore }>> {
    const project = await this.projectModel
      .findOne({ projectId: identity.projectId, workspaceId: identity.workspaceId })
      .lean<IVideoProject>()
      .exec();

    if (!project) {
      return { ok: false, error: VERSION_ERROR_PROJECT_NOT_FOUND };
    }

    const docs = await this.versionModel
      .find({ projectId: identity.projectId, workspaceId: identity.workspaceId })
      .sort({ createdAt: 1 })
      .lean<IVideoVersion[]>()
      .exec();

    const versions: VersionRecord[] = docs.map((doc) => ({
      versionId: doc.versionId,
      parentVersionId: doc.parentVersionId ?? null,
      timelineId: doc.timelineId,
      createdAt: doc.createdAt instanceof Date ? doc.createdAt.getTime() : Number(doc.createdAt ?? 0),
      ...(doc.label !== undefined ? { label: doc.label } : {}),
    }));

    const store: VersionStore = {
      versions,
      activeVersionId: project.activeVersionId ?? null,
    };
    return { ok: true, store };
  }
}

/** Shared singleton for production use (mirrors other feature-service exports). */
export const versionManagerService = new VersionManagerService();
