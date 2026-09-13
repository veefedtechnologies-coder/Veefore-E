/**
 * Provider_Capability_Registry — pure (DB-free) core.
 *
 * The authoritative, versioned answer to "can provider P / model M perform
 * operation O, and within what bounds?" for the Veefore AI Video Editor. Provider
 * limits (editable clip length, output duration, resolutions, modalities) live
 * here as capability METADATA, never as hardcoded values in routing logic
 * (Req 7.3). This module is intentionally pure and side-effect-free so it can be
 * property-tested without a database or provider SDKs, matching the
 * `veegpt-*.logic.ts` convention; the DB-backed registry service (task 2.3)
 * wraps this core and persists the same records with version history.
 *
 * Design guarantees implemented here:
 *  - `register` rejects a record missing/invalid on ANY required field and names
 *    the offending field, storing nothing (Req 7.2).
 *  - `lookup` returns an explicit `{ supported: false }` for an unknown
 *    provider/model — never a default or partial capability (Req 7.4).
 *  - `candidatesFor(operationType)` returns only providers whose CURRENT
 *    capability metadata supports the operation, in registry order (Req 6.3, 6.4).
 *  - `isDeterministicPerformable(kind)` gates the deterministic-first rule so the
 *    Model_Router routes such kinds to the Deterministic_Editor (Req 6.1).
 *  - Versioning is APPEND-ONLY: a stored version is never mutated; a new version
 *    for an existing provider/model is appended and becomes current, while prior
 *    versions are retained (Req 7.5).
 *
 * State is modeled as an immutable `RegistryState` threaded through pure
 * functions. A thin `ProviderCapabilityRegistryCore` class wraps that state for
 * ergonomic call sites; it holds only the immutable state value and never
 * mutates a stored record.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A user-specified element that must be preserved during editing (face, voice,
 * product, logo, text, background, camera movement, colors, original audio).
 * Modeled as a string to match the `preservationConstraints: string[]` shape on
 * the `VideoEditOperation` model.
 */
export type ProtectedElement = string;

/** Inclusive numeric bounds (seconds) with `min <= max` and `min >= 0`. */
export interface DurationBounds {
  /** Minimum bound in seconds (>= 0). */
  min: number;
  /** Maximum bound in seconds (>= min). */
  max: number;
}

/**
 * `VideoModelCapabilities` — the per-provider/model capability record
 * (Req 7.1, master §2/§34). Every field listed as required by Req 7.2 must be
 * present and well-formed for the record to be accepted.
 */
export interface VideoModelCapabilities {
  /** Provider identifier (e.g. 'gemini'). Required. */
  provider: string;
  /** Model identifier (e.g. 'omni-1'). Required. */
  model: string;
  /** Version id; prior versions are retained append-only (Req 7.5). Required. */
  version: string;
  /** Operation types this provider/model supports. Required, non-empty. */
  supportedOperations: string[];
  /** Editable input duration bounds in seconds (Req 7.1). Required. */
  editableInputSeconds: DurationBounds;
  /** Output duration bounds in seconds (Req 7.1). Required. */
  outputSeconds: DurationBounds;
  /** Supported output resolutions (e.g. '1080x1920'). Required, non-empty. */
  outputResolutions: string[];
  /** Supported input modalities (e.g. 'video','image','text'). Required, non-empty. */
  inputModalities: string[];
  /** Supported output modalities (e.g. 'video'). Required, non-empty. */
  outputModalities: string[];
  /** Routing tie-break priority; higher wins (Req 6.4). */
  priorityRank: number;
  /** INR cost per output second, fuels `additionalProviderCostInr` metering. */
  costPerOutputSecondInr: number;
  /** Protected elements this provider/model can guarantee to preserve. */
  guaranteesPreservation: ProtectedElement[];
}

/**
 * Result of a capability lookup. `{ supported: false }` is the ONLY negative
 * result — the registry never returns a default or partial capability (Req 7.4).
 */
export type CapabilityLookup =
  | { supported: true; caps: VideoModelCapabilities }
  | { supported: false };

/** The set of required-field validation error codes surfaced by `register`. */
export type RegisterErrorCode = 'MISSING_FIELD' | 'DUPLICATE_VERSION';

/** A structured registration error naming the offending field (Req 7.2). */
export interface RegisterError {
  code: RegisterErrorCode;
  /** The required field that was missing/invalid, when `code` is MISSING_FIELD. */
  field?: string;
  /** Human-readable reason. */
  message: string;
}

/** Outcome of `register`: either a new immutable state, or a rejection. */
export type RegisterResult =
  | { ok: true; state: RegistryState }
  | { ok: false; error: RegisterError };

/**
 * Immutable registry state. Records are stored in registration (insertion)
 * order, which both preserves append-only versioning and defines the
 * registry-order tie-break used by the Model_Router (Req 6.4). Never mutated in
 * place — every operation returns a new `RegistryState`.
 */
export interface RegistryState {
  /** All registered records in insertion order (append-only). */
  readonly records: readonly VideoModelCapabilities[];
  /** Operation kinds performable by deterministic media processing (Req 6.1). */
  readonly deterministicPerformableKinds: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Operation kinds a deterministic (FFmpeg) pipeline can perform reliably, so the
 * Model_Router must NEVER route them to a generative provider (Req 6.1, 8.2,
 * master §4). Compared case-insensitively. The DB-backed service (task 2.3) seeds
 * the same set; callers may override it when constructing the registry.
 */
export const DETERMINISTIC_PERFORMABLE_KINDS: readonly string[] = [
  'trim',
  'cut',
  'concat',
  'crop',
  'resize',
  'aspect',
  'aspect_conversion',
  'fps',
  'fps_conversion',
  'audio',
  'audio_process',
  'captions',
  'caption',
  'speed',
  'fades',
  'fade',
  'transition',
  'encode',
  'encoding',
];

/** Required scalar (string) fields, checked for non-empty presence. */
const REQUIRED_STRING_FIELDS: readonly (keyof VideoModelCapabilities)[] = [
  'provider',
  'model',
  'version',
];

/** Required non-empty string-array fields (Req 7.1, 7.2). */
const REQUIRED_ARRAY_FIELDS: readonly (keyof VideoModelCapabilities)[] = [
  'supportedOperations',
  'outputResolutions',
  'inputModalities',
  'outputModalities',
];

/** Required duration-bound fields (Req 7.1, 7.2). */
const REQUIRED_BOUND_FIELDS: readonly (keyof VideoModelCapabilities)[] = [
  'editableInputSeconds',
  'outputSeconds',
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isNonEmptyStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => isNonEmptyString(x));
}

function isValidBounds(v: unknown): v is DurationBounds {
  if (!v || typeof v !== 'object') return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.min === 'number' &&
    Number.isFinite(b.min) &&
    b.min >= 0 &&
    typeof b.max === 'number' &&
    Number.isFinite(b.max) &&
    b.max >= b.min
  );
}

/**
 * Return the name of the first required field that is missing or invalid, or
 * `null` when the record is complete. Field order is deterministic so the same
 * record always reports the same offending field (Req 7.2).
 */
export function findMissingRequiredField(
  rec: Partial<VideoModelCapabilities> | null | undefined,
): string | null {
  if (!rec || typeof rec !== 'object') return 'record';

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!isNonEmptyString(rec[field])) return field;
  }
  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!isNonEmptyStringArray(rec[field])) return field;
  }
  for (const field of REQUIRED_BOUND_FIELDS) {
    if (!isValidBounds(rec[field])) return field;
  }
  return null;
}

// ---------------------------------------------------------------------------
// State keying helpers
// ---------------------------------------------------------------------------

/** Stable composite key for a provider/model pair (NUL-separated, collision-free). */
function providerModelKey(provider: string, model: string): string {
  return `${provider}\u0000${model}`;
}

/** Normalize an operation kind for case-insensitive comparison. */
function normalizeKind(kind: string): string {
  return kind.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Pure state operations
// ---------------------------------------------------------------------------

/**
 * Create an empty, immutable registry state. `deterministicKinds` defaults to
 * {@link DETERMINISTIC_PERFORMABLE_KINDS}; pass a custom set to override the
 * deterministic-first gate without changing routing code (Req 7.3).
 */
export function createRegistryState(
  deterministicKinds: readonly string[] = DETERMINISTIC_PERFORMABLE_KINDS,
): RegistryState {
  return {
    records: [],
    deterministicPerformableKinds: new Set(deterministicKinds.map(normalizeKind)),
  };
}

/**
 * Register a `VideoModelCapabilities` record.
 *
 * Rejects (storing nothing) when:
 *  - any required field is missing/invalid — error names the field (Req 7.2);
 *  - the exact (provider, model, version) already exists — versions are
 *    append-only and never mutated (Req 7.5).
 *
 * On success returns a NEW state with the record appended in insertion order.
 */
export function register(state: RegistryState, rec: VideoModelCapabilities): RegisterResult {
  const missing = findMissingRequiredField(rec);
  if (missing) {
    return {
      ok: false,
      error: {
        code: 'MISSING_FIELD',
        field: missing,
        message: `VideoModelCapabilities record is missing or has an invalid required field: '${missing}'`,
      },
    };
  }

  const duplicate = state.records.some(
    (r) => r.provider === rec.provider && r.model === rec.model && r.version === rec.version,
  );
  if (duplicate) {
    return {
      ok: false,
      error: {
        code: 'DUPLICATE_VERSION',
        message: `Version '${rec.version}' already exists for ${rec.provider}/${rec.model}; capability versions are append-only and immutable`,
      },
    };
  }

  return {
    ok: true,
    state: {
      records: [...state.records, freezeRecord(rec)],
      deterministicPerformableKinds: state.deterministicPerformableKinds,
    },
  };
}

/**
 * Look up the CURRENT (latest-registered) capability for a provider/model.
 * Returns `{ supported: false }` for an unknown provider/model — never a default
 * or partial capability (Req 7.4).
 */
export function lookup(state: RegistryState, provider: string, model: string): CapabilityLookup {
  const key = providerModelKey(provider, model);
  // Latest-registered wins: scan from the end (append-only insertion order).
  for (let i = state.records.length - 1; i >= 0; i--) {
    const r = state.records[i];
    if (providerModelKey(r.provider, r.model) === key) {
      return { supported: true, caps: r };
    }
  }
  return { supported: false };
}

/**
 * All versions ever registered for a provider/model, oldest-first. Used to prove
 * append-only version history (Req 7.5); empty for an unknown provider/model.
 */
export function versionsOf(
  state: RegistryState,
  provider: string,
  model: string,
): VideoModelCapabilities[] {
  const key = providerModelKey(provider, model);
  return state.records.filter((r) => providerModelKey(r.provider, r.model) === key);
}

/**
 * Candidate providers whose CURRENT capability supports `operationType`, in
 * registry (insertion) order so the Model_Router's tie-break by "listed first"
 * is well-defined (Req 6.3, 6.4). Only the latest version per provider/model is
 * considered, so a superseding version's dropped operation is not offered.
 */
export function candidatesFor(state: RegistryState, operationType: string): VideoModelCapabilities[] {
  const seen = new Set<string>();
  const currentByKeyInOrder: VideoModelCapabilities[] = [];

  // Walk records in insertion order, keeping the LATEST record per provider/model
  // while preserving the position of that provider/model's FIRST appearance so
  // registry ordering (tie-break) is stable across version upgrades.
  const firstIndex = new Map<string, number>();
  const latest = new Map<string, VideoModelCapabilities>();
  state.records.forEach((r, idx) => {
    const key = providerModelKey(r.provider, r.model);
    if (!firstIndex.has(key)) firstIndex.set(key, idx);
    latest.set(key, r);
  });

  for (const [key, idx] of [...firstIndex.entries()].sort((a, b) => a[1] - b[1])) {
    if (seen.has(key)) continue;
    seen.add(key);
    void idx;
    const current = latest.get(key)!;
    currentByKeyInOrder.push(current);
  }

  return currentByKeyInOrder.filter((r) => r.supportedOperations.includes(operationType));
}

/**
 * Whether an operation kind is performable by deterministic media processing and
 * therefore MUST NOT be routed to a generative provider (Req 6.1). Comparison is
 * case-insensitive.
 */
export function isDeterministicPerformable(state: RegistryState, operationKind: string): boolean {
  if (!isNonEmptyString(operationKind)) return false;
  return state.deterministicPerformableKinds.has(normalizeKind(operationKind));
}

/** Deep-freeze a capability record so a stored version can never be mutated. */
function freezeRecord(rec: VideoModelCapabilities): VideoModelCapabilities {
  Object.freeze(rec.editableInputSeconds);
  Object.freeze(rec.outputSeconds);
  Object.freeze(rec.supportedOperations);
  Object.freeze(rec.outputResolutions);
  Object.freeze(rec.inputModalities);
  Object.freeze(rec.outputModalities);
  Object.freeze(rec.guaranteesPreservation);
  return Object.freeze({ ...rec });
}

// ---------------------------------------------------------------------------
// Ergonomic immutable class wrapper
// ---------------------------------------------------------------------------

/**
 * Thin, immutable-state wrapper over the pure functions above. Holds only a
 * `RegistryState` value and never mutates a stored record; `register` returns a
 * NEW core instance on success (append-only, Req 7.5). The DB-backed registry
 * service (task 2.3) uses these same semantics over MongoDB with version history.
 */
export class ProviderCapabilityRegistryCore {
  private constructor(private readonly state: RegistryState) {}

  /** Create an empty registry core with the default (or a custom) deterministic set. */
  static create(
    deterministicKinds: readonly string[] = DETERMINISTIC_PERFORMABLE_KINDS,
  ): ProviderCapabilityRegistryCore {
    return new ProviderCapabilityRegistryCore(createRegistryState(deterministicKinds));
  }

  /** Wrap an existing immutable state (e.g. rehydrated from persistence). */
  static fromState(state: RegistryState): ProviderCapabilityRegistryCore {
    return new ProviderCapabilityRegistryCore(state);
  }

  /** The underlying immutable state (for persistence/inspection). */
  getState(): RegistryState {
    return this.state;
  }

  /**
   * Register a record. On success returns `{ ok: true, registry }` with a NEW
   * core; on rejection returns `{ ok: false, error }` naming the offending field
   * and leaves this instance unchanged (Req 7.2, 7.5).
   */
  register(
    rec: VideoModelCapabilities,
  ): { ok: true; registry: ProviderCapabilityRegistryCore } | { ok: false; error: RegisterError } {
    const result = register(this.state, rec);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, registry: new ProviderCapabilityRegistryCore(result.state) };
  }

  /** See {@link lookup}. */
  lookup(provider: string, model: string): CapabilityLookup {
    return lookup(this.state, provider, model);
  }

  /** See {@link versionsOf}. */
  versionsOf(provider: string, model: string): VideoModelCapabilities[] {
    return versionsOf(this.state, provider, model);
  }

  /** See {@link candidatesFor}. */
  candidatesFor(operationType: string): VideoModelCapabilities[] {
    return candidatesFor(this.state, operationType);
  }

  /** See {@link isDeterministicPerformable}. */
  isDeterministicPerformable(operationKind: string): boolean {
    return isDeterministicPerformable(this.state, operationKind);
  }
}
