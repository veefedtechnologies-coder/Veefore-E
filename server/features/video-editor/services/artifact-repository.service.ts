/**
 * Artifact_Repository — the IO shell over the pure `artifact-provenance.logic`
 * core that actually persists Video_Artifacts (task 3.3, Req 20.1, 20.4).
 *
 * Responsibilities (and non-responsibilities):
 *   - Validate every artifact against the single-category (Req 20.1) and
 *     provenance-complete (Req 20.2, 20.3) invariants BEFORE any bytes or
 *     metadata are written, using `validateArtifactCreation` from the pure core.
 *     On failure nothing is stored and the error names every missing field.
 *   - Write bytes to the deterministic, project-scoped layout
 *     `video-editor/{projectId}/{category}/` via `StorageService.uploadFile({ folder })`
 *     (folder built by `buildArtifactCategoryFolder`). `uploadFile` mints a fresh
 *     UUID filename per call, so a write never lands on an existing object key.
 *   - Treat stored bytes as IMMUTABLE (Req 20.4): the repository exposes create
 *     and read operations only — there is no update/overwrite path, and the
 *     `storageKey` of a persisted `VideoArtifact` is never rewritten.
 *   - Persist the `VideoArtifact` metadata document (with validated provenance).
 *
 * The category/provenance decision logic lives entirely in the pure core so it
 * is property-tested without a database or storage backend (task 3.2). This
 * module is the thin, side-effecting adapter around it.
 */

import { randomUUID } from 'crypto';

import { logger } from '../../../config/logger';
import {
  VideoArtifactModel,
  type IVideoArtifact,
} from '../../../models/VideoEditor/VideoArtifact';
import { getStorageService } from '../../storage/services/storage.service';
import type { IStorageService } from '../../storage/services/storage.service';
import {
  buildArtifactCategoryFolder,
  validateArtifactCreation,
  type ArtifactCategory,
  type ArtifactProvenance,
} from './artifact-provenance.logic';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when an artifact fails the single-category / provenance-complete
 * invariants (Req 20.3). `missingFields` names every offending field (the
 * `category` pseudo-field and/or each missing provenance field) so callers can
 * surface exactly what could not be determined. No bytes or metadata are stored
 * when this is thrown.
 */
export class ArtifactValidationError extends Error {
  readonly code = 'ARTIFACT_PROVENANCE_INCOMPLETE';
  readonly statusCode = 400;
  readonly missingFields: string[];

  constructor(message: string, missingFields: string[]) {
    super(message);
    this.name = 'ArtifactValidationError';
    this.missingFields = missingFields;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Thrown when a caller attempts to mutate the bytes of an artifact that already
 * exists in storage (Req 20.4). Artifact bytes are immutable for the lifetime of
 * the artifact; a "new" output is always a brand-new artifact, never an
 * overwrite of an existing one.
 */
export class ArtifactImmutableError extends Error {
  readonly code = 'ARTIFACT_IMMUTABLE';
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ArtifactImmutableError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

/** A candidate artifact to persist: raw bytes + intended category + provenance. */
export interface CreateArtifactInput {
  /** Owning Video_Project (scopes the storage folder, Req 20.1). */
  projectId: string;
  /** Owning workspace (persisted for isolation/queries). */
  workspaceId: string;
  /** Owning user (persisted for isolation/queries). */
  userId: string;
  /** Intended storage category — must be exactly one of the eight (Req 20.1). */
  category: ArtifactCategory | string;
  /** The artifact bytes. */
  buffer: Buffer;
  /** Original filename (used to derive the stored file extension). */
  originalName: string;
  /** MIME type of the bytes. */
  mimeType: string;
  /** Provenance for the artifact — all fields required (Req 20.2, 20.3). */
  provenance: Partial<ArtifactProvenance>;
  /**
   * When true, `provider`/`model` default to the deterministic engine
   * identifier (`ffmpeg`) if not supplied, keeping a deterministic artifact
   * provenance-complete (Req 20.3).
   */
  deterministic?: boolean;
}

/** Result of a successful artifact creation. */
export interface CreateArtifactResult {
  /** The persisted, immutable `VideoArtifact` metadata document. */
  artifact: IVideoArtifact;
  /** The stable storage key holding the immutable bytes (Req 20.4). */
  storageKey: string;
  /** The storage URL for the stored object. */
  url: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Persists Video_Artifacts over the existing `StorageService`, enforcing the
 * single-category, provenance-complete (Req 20.1–20.3) and immutable (Req 20.4)
 * invariants. Reuses the pure `artifact-provenance.logic` core for all decision
 * logic; this class only performs IO.
 */
export class ArtifactRepository {
  private readonly storage: IStorageService;

  constructor(storage: IStorageService = getStorageService()) {
    this.storage = storage;
  }

  /**
   * Validate, store, and record a new immutable Video_Artifact.
   *
   * Order matters (Req 20.3): provenance/category are validated by the pure core
   * FIRST. If validation fails we throw `ArtifactValidationError` and NOTHING is
   * written — no bytes, no metadata. Only on a valid artifact do we upload bytes
   * to `video-editor/{projectId}/{category}/` and persist the metadata document.
   *
   * Bytes are never overwritten (Req 20.4): `uploadFile` mints a fresh UUID
   * filename, so each create yields a distinct storage key.
   */
  async createArtifact(input: CreateArtifactInput): Promise<CreateArtifactResult> {
    // 1. Validate single-category + provenance-complete via the pure core
    //    (Req 20.1, 20.2, 20.3). Store nothing on failure.
    const validation = validateArtifactCreation({
      category: input.category,
      provenance: input.provenance,
      deterministic: input.deterministic,
    });

    if (!validation.valid) {
      logger.warn(
        '[VideoEditor][ArtifactRepository] Rejected artifact creation: incomplete provenance',
        {
          projectId: input.projectId,
          category: input.category,
          missingFields: validation.missingFields,
        },
      );
      throw new ArtifactValidationError(validation.error, validation.missingFields);
    }

    const category: ArtifactCategory = validation.category;
    const provenance: ArtifactProvenance = validation.provenance;

    // 2. Write bytes to the deterministic, project-scoped category folder
    //    (Req 20.1). uploadFile generates a unique UUID filename, so this write
    //    can never collide with or overwrite an existing object (Req 20.4).
    const folder = buildArtifactCategoryFolder(input.projectId, category);
    const uploaded = await this.storage.uploadFile({
      buffer: input.buffer,
      originalName: input.originalName,
      mimetype: input.mimeType,
      folder,
    });

    // 3. Persist the immutable metadata document with validated provenance
    //    (Req 20.2). storageKey is set once and never rewritten (Req 20.4).
    try {
      const doc = await VideoArtifactModel.create({
        artifactId: randomUUID(),
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        category,
        storageKey: uploaded.key,
        mimeType: input.mimeType,
        sizeBytes: uploaded.size,
        provenance,
      });

      logger.info(
        '[VideoEditor][ArtifactRepository] Stored immutable artifact',
        {
          artifactId: doc.artifactId,
          projectId: input.projectId,
          category,
          storageKey: uploaded.key,
          jobId: provenance.jobId,
        },
      );

      return { artifact: doc, storageKey: uploaded.key, url: uploaded.url };
    } catch (error) {
      // Metadata persistence failed after bytes were written. The bytes remain
      // immutable in storage; surface the error so the caller (job/cleanup) can
      // reconcile. We deliberately do NOT attempt to overwrite/mutate anything.
      logger.error(
        '[VideoEditor][ArtifactRepository] Failed to persist artifact metadata after upload',
        error,
        { projectId: input.projectId, category, storageKey: uploaded.key },
      );
      throw error;
    }
  }

  /** Look up an artifact by its stable `artifactId`. */
  async getArtifact(artifactId: string): Promise<IVideoArtifact | null> {
    return VideoArtifactModel.findOne({ artifactId }).exec();
  }

  /** List all artifacts for a project, newest first. */
  async listByProject(projectId: string): Promise<IVideoArtifact[]> {
    return VideoArtifactModel.find({ projectId }).sort({ createdAt: -1 }).exec();
  }

  /** List a project's artifacts filtered to a single category, newest first. */
  async listByCategory(
    projectId: string,
    category: ArtifactCategory,
  ): Promise<IVideoArtifact[]> {
    return VideoArtifactModel.find({ projectId, category }).sort({ createdAt: -1 }).exec();
  }

  /**
   * Guard rail for Req 20.4: there is intentionally no method to overwrite an
   * artifact's bytes. Any attempt to do so is a programming error and is
   * rejected. A changed output is always a NEW artifact via `createArtifact`.
   */
  rejectOverwrite(artifactId: string): never {
    throw new ArtifactImmutableError(
      `Artifact ${artifactId} is immutable and cannot be overwritten; create a new artifact instead.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor (mirrors the storage feature's factory convention)
// ---------------------------------------------------------------------------

let artifactRepositoryInstance: ArtifactRepository | null = null;

/** Get or lazily create the shared `ArtifactRepository` instance. */
export function getArtifactRepository(): ArtifactRepository {
  if (!artifactRepositoryInstance) {
    artifactRepositoryInstance = new ArtifactRepository();
  }
  return artifactRepositoryInstance;
}
