/**
 * Provider_Capability_Registry — DB-backed service (task 2.3).
 *
 * Persists `VideoModelCapabilities` records with append-only version history in
 * MongoDB and exposes the same query surface as the pure core
 * (`register`/`lookup`/`candidatesFor`/`isDeterministicPerformable`/`versionsOf`).
 *
 * All validation and versioning is delegated to the pure core
 * (`provider-capability-registry.logic.ts`): the service never re-implements the
 * required-field checks, duplicate-version guard, latest-version-wins lookup, or
 * registry-order tie-break. The service's only added responsibilities are:
 *   - hydrating an immutable `RegistryState` from persisted documents,
 *   - persisting a validated record as a new immutable document (Req 7.5),
 *   - seeding the initial Gemini Omni / Veo records + deterministic-performable
 *     operation-kind set (task 2.3).
 *
 * A stored version is never mutated or overwritten (append-only, Req 7.5); the
 * DB enforces this with a unique (provider, model, version) index, matching the
 * pure core's DUPLICATE_VERSION guard.
 */

import { logger } from '../../../config/logger';
import {
  VideoModelCapabilitiesModel,
  type IVideoModelCapabilities,
} from '../../../models/VideoEditor';
import {
  ProviderCapabilityRegistryCore,
  type VideoModelCapabilities,
  type CapabilityLookup,
  type RegisterError,
} from './provider-capability-registry.logic';
import {
  SEED_VIDEO_MODEL_CAPABILITIES,
  SEED_DETERMINISTIC_PERFORMABLE_KINDS,
} from './provider-capability-seed';

/** Outcome of a DB-backed registration. */
export type ServiceRegisterResult =
  | { ok: true; record: VideoModelCapabilities }
  | { ok: false; error: RegisterError };

/** Convert a persisted document into the pure-core capability record shape. */
function docToRecord(doc: IVideoModelCapabilities): VideoModelCapabilities {
  return {
    provider: doc.provider,
    model: doc.model,
    version: doc.version,
    supportedOperations: [...doc.supportedOperations],
    editableInputSeconds: { min: doc.editableInputSeconds.min, max: doc.editableInputSeconds.max },
    outputSeconds: { min: doc.outputSeconds.min, max: doc.outputSeconds.max },
    outputResolutions: [...doc.outputResolutions],
    inputModalities: [...doc.inputModalities],
    outputModalities: [...doc.outputModalities],
    priorityRank: doc.priorityRank,
    costPerOutputSecondInr: doc.costPerOutputSecondInr,
    guaranteesPreservation: [...(doc.guaranteesPreservation ?? [])],
  };
}

/**
 * DB-backed Provider_Capability_Registry. Reuses {@link ProviderCapabilityRegistryCore}
 * for all validation/versioning and caches the hydrated immutable state.
 */
export class ProviderCapabilityRegistryService {
  private core: ProviderCapabilityRegistryCore;
  private loaded = false;

  constructor(
    private readonly deterministicKinds: readonly string[] = SEED_DETERMINISTIC_PERFORMABLE_KINDS,
  ) {
    this.core = ProviderCapabilityRegistryCore.create(deterministicKinds);
  }

  /**
   * Hydrate the in-memory registry from persisted documents, oldest-first, so
   * append-only insertion order (and thus registry-order tie-break) matches the
   * persisted history (Req 7.5, 6.4). Idempotent per instance unless `force`.
   */
  async load(force = false): Promise<void> {
    if (this.loaded && !force) return;

    const docs = await VideoModelCapabilitiesModel.find({})
      .sort({ createdAt: 1, _id: 1 })
      .lean<IVideoModelCapabilities[]>()
      .exec();

    let core = ProviderCapabilityRegistryCore.create(this.deterministicKinds);
    for (const doc of docs) {
      const result = core.register(docToRecord(doc));
      if (result.ok) {
        core = result.registry;
      } else {
        // Should not occur given the DB's unique (provider, model, version)
        // index, but never let a bad row abort hydration of the rest.
        logger.warn('[video-editor] skipped invalid persisted capability record', {
          provider: doc.provider,
          model: doc.model,
          version: doc.version,
          error: result.error,
        });
      }
    }

    this.core = core;
    this.loaded = true;
  }

  /**
   * Register a new capability record. Validation and the append-only
   * duplicate-version check run through the pure core FIRST; only a validated,
   * non-duplicate record is persisted (Req 7.2, 7.5). On success the in-memory
   * state is advanced to include the new record.
   */
  async register(rec: VideoModelCapabilities): Promise<ServiceRegisterResult> {
    await this.load();

    // Pure-core validation + append-only versioning (single source of truth).
    const result = this.core.register(rec);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    try {
      await VideoModelCapabilitiesModel.create({
        provider: rec.provider,
        model: rec.model,
        version: rec.version,
        supportedOperations: rec.supportedOperations,
        editableInputSeconds: rec.editableInputSeconds,
        outputSeconds: rec.outputSeconds,
        outputResolutions: rec.outputResolutions,
        inputModalities: rec.inputModalities,
        outputModalities: rec.outputModalities,
        priorityRank: rec.priorityRank,
        costPerOutputSecondInr: rec.costPerOutputSecondInr,
        guaranteesPreservation: rec.guaranteesPreservation,
      });
    } catch (err: unknown) {
      // Unique-index violation => a concurrent writer already stored this exact
      // version. Surface the same append-only rejection the pure core would.
      if (isDuplicateKeyError(err)) {
        return {
          ok: false,
          error: {
            code: 'DUPLICATE_VERSION',
            message: `Version '${rec.version}' already exists for ${rec.provider}/${rec.model}; capability versions are append-only and immutable`,
          },
        };
      }
      throw err;
    }

    // Advance the cached immutable state only after a successful persist.
    this.core = result.registry;
    return { ok: true, record: rec };
  }

  /** Latest-registered capability for a provider/model, or explicit unsupported (Req 7.4). */
  async lookup(provider: string, model: string): Promise<CapabilityLookup> {
    await this.load();
    return this.core.lookup(provider, model);
  }

  /** All persisted versions for a provider/model, oldest-first (Req 7.5). */
  async versionsOf(provider: string, model: string): Promise<VideoModelCapabilities[]> {
    await this.load();
    return this.core.versionsOf(provider, model);
  }

  /** Candidate providers whose current capability supports `operationType`, in registry order (Req 6.3, 6.4). */
  async candidatesFor(operationType: string): Promise<VideoModelCapabilities[]> {
    await this.load();
    return this.core.candidatesFor(operationType);
  }

  /** Whether an operation kind is deterministic-performable (Req 6.1). Pure, no DB read needed. */
  isDeterministicPerformable(operationKind: string): boolean {
    return this.core.isDeterministicPerformable(operationKind);
  }

  /**
   * Seed the initial Gemini Omni / Veo capability records (task 2.3). Idempotent:
   * a seed record already present (same provider/model/version) is skipped, so
   * re-running seeding never duplicates or mutates existing history (Req 7.5).
   * Returns the number of records newly inserted.
   */
  async seed(records: readonly VideoModelCapabilities[] = SEED_VIDEO_MODEL_CAPABILITIES): Promise<number> {
    await this.load();

    let inserted = 0;
    for (const rec of records) {
      const existing = this.core.versionsOf(rec.provider, rec.model).some(
        (v) => v.version === rec.version,
      );
      if (existing) continue;

      const result = await this.register(rec);
      if (result.ok) {
        inserted += 1;
      } else if (result.error.code !== 'DUPLICATE_VERSION') {
        logger.error('[video-editor] failed to seed capability record', {
          provider: rec.provider,
          model: rec.model,
          version: rec.version,
          error: result.error,
        });
      }
    }

    if (inserted > 0) {
      logger.info('[video-editor] seeded provider capability records', { inserted });
    }
    return inserted;
  }
}

/** Detect a MongoDB duplicate-key (E11000) error across driver/mongoose shapes. */
function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: number; name?: string; message?: string };
  return e.code === 11000 || (e.name === 'MongoServerError' && /E11000/.test(e.message ?? ''));
}

/** Lazily-instantiated shared registry service instance. */
let sharedRegistry: ProviderCapabilityRegistryService | null = null;

/**
 * Get the process-wide Provider_Capability_Registry service. The registry is
 * hydrated lazily on first query; call `seed()` during startup to persist the
 * initial provider records.
 */
export function getProviderCapabilityRegistry(): ProviderCapabilityRegistryService {
  if (!sharedRegistry) {
    sharedRegistry = new ProviderCapabilityRegistryService();
  }
  return sharedRegistry;
}
