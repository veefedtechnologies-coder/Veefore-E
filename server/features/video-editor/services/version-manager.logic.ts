/**
 * Version manager — pure core (task 19.1, Req 16.1–16.8).
 *
 * Models a project's immutable version history as an append-only structure plus
 * a pointer to the currently active version. Every rule about parent resolution,
 * history preservation, lineage, immutability, and restore lives here as a pure
 * function so it can be exhaustively property-tested (Property 38, task 19.2)
 * without a database. The IO shell (`version-manager.service.ts`) persists the
 * decisions this core produces.
 *
 * Immutability is enforced STRUCTURALLY: no function in this module ever mutates
 * an existing `VersionRecord`. `createVersion` appends a brand-new record and
 * leaves every prior record byte-identical (Req 16.4); `restoreVersion` only
 * moves the active pointer and never touches the records (Req 16.7); and
 * `rejectVersionModification` exists solely to represent "an operation other than
 * version creation tried to modify a version" and always refuses (Req 16.5).
 */

// ---------------------------------------------------------------------------
// Error codes (Req 16.3, 16.5, 16.8)
// ---------------------------------------------------------------------------

/** A refinement named a parent version that does not exist (Req 16.3). */
export const VERSION_ERROR_MISSING_PARENT = 'VERSION_MISSING_PARENT';
/** A restore named a version that does not exist (Req 16.8). */
export const VERSION_ERROR_MISSING_RESTORE_TARGET = 'VERSION_MISSING_RESTORE_TARGET';
/** A non-creation operation attempted to modify an existing version (Req 16.5). */
export const VERSION_ERROR_IMMUTABLE = 'VERSION_IMMUTABLE';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * An immutable snapshot of a project's edit state. Once created, no field is
 * ever changed by any function in this module (Req 16.4, 16.5, 16.6).
 */
export interface VersionRecord {
  versionId: string;
  /** Lineage: the version this one was derived from, or null for the root (Req 16.6). */
  parentVersionId: string | null;
  /** The timeline snapshot this version composes. */
  timelineId: string;
  /** Monotonic creation instant (epoch ms); fixes history ordering. */
  createdAt: number;
  label?: string;
}

/**
 * The full version history for one project plus the active-version pointer. The
 * `versions` list is append-only; `activeVersionId` is the only mutable pointer.
 */
export interface VersionStore {
  versions: readonly VersionRecord[];
  activeVersionId: string | null;
}

/** Input for creating a new version. `requestedParentId` null ⇒ derive from active (Req 16.2). */
export interface CreateVersionInput {
  versionId: string;
  /** Explicit parent (Req 16.1) or null to derive from the active version (Req 16.2). */
  requestedParentId: string | null;
  timelineId: string;
  createdAt: number;
  label?: string;
}

export type Ok<T> = { ok: true } & T;
export type Err = { ok: false; error: string };
export type Result<T> = Ok<T> | Err;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** An empty history — no versions, no active pointer. */
export function emptyStore(): VersionStore {
  return { versions: [], activeVersionId: null };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** True iff a version with `versionId` exists in the history. */
export function hasVersion(store: VersionStore, versionId: string): boolean {
  return store.versions.some((v) => v.versionId === versionId);
}

/** The version with `versionId`, or null when absent. */
export function getVersion(store: VersionStore, versionId: string): VersionRecord | null {
  return store.versions.find((v) => v.versionId === versionId) ?? null;
}

/**
 * Resolve the parent a new version should derive from:
 *   - an explicit `requestedParentId` MUST exist, else missing-parent error (Req 16.1, 16.3);
 *   - a null `requestedParentId` derives from the active version (Req 16.2), which
 *     may itself be null when this is the project's first (root) version.
 */
export function resolveParent(
  store: VersionStore,
  requestedParentId: string | null,
): Result<{ parentVersionId: string | null }> {
  if (requestedParentId !== null) {
    if (!hasVersion(store, requestedParentId)) {
      return { ok: false, error: VERSION_ERROR_MISSING_PARENT };
    }
    return { ok: true, parentVersionId: requestedParentId };
  }
  // No explicit parent: derive from the currently active version (null ⇒ root).
  return { ok: true, parentVersionId: store.activeVersionId };
}

// ---------------------------------------------------------------------------
// Mutations (copy-on-write; existing records never touched)
// ---------------------------------------------------------------------------

/**
 * Create a new version derived from the specified parent, or from the active
 * version when no parent is specified (Req 16.1, 16.2). On a missing specified
 * parent the store is returned UNCHANGED and no version is created (Req 16.3).
 *
 * On success the new record is APPENDED (all prior versions preserved unchanged,
 * Req 16.4), its `parentVersionId` records lineage (Req 16.6), and it becomes the
 * active version. The returned store is a fresh object; the input is not mutated.
 */
export function createVersion(store: VersionStore, input: CreateVersionInput): Result<{ store: VersionStore; version: VersionRecord }> {
  const resolved = resolveParent(store, input.requestedParentId);
  if (!resolved.ok) {
    return resolved;
  }

  // Guard against a duplicate id silently overwriting history.
  if (hasVersion(store, input.versionId)) {
    return { ok: false, error: VERSION_ERROR_IMMUTABLE };
  }

  const version: VersionRecord = {
    versionId: input.versionId,
    parentVersionId: resolved.parentVersionId,
    timelineId: input.timelineId,
    createdAt: input.createdAt,
    ...(input.label !== undefined ? { label: input.label } : {}),
  };

  const next: VersionStore = {
    versions: [...store.versions, version],
    activeVersionId: version.versionId,
  };
  return { ok: true, store: next, version };
}

/**
 * Restore an existing version as the active version WITHOUT deleting any other
 * version (Req 16.7). If the target does not exist the store is returned
 * unchanged, preserving the current active version (Req 16.8).
 */
export function restoreVersion(store: VersionStore, versionId: string): Result<{ store: VersionStore }> {
  if (!hasVersion(store, versionId)) {
    return { ok: false, error: VERSION_ERROR_MISSING_RESTORE_TARGET };
  }
  if (store.activeVersionId === versionId) {
    // Already active — no-op, but still a success with history intact.
    return { ok: true, store };
  }
  const next: VersionStore = {
    versions: store.versions, // history untouched — nothing deleted (Req 16.7)
    activeVersionId: versionId,
  };
  return { ok: true, store: next };
}

/**
 * Represents any operation OTHER than version creation attempting to modify an
 * existing version. Such an operation is always refused with an immutability
 * error and the store is left unchanged (Req 16.5). This makes the immutability
 * rule explicit and testable rather than implicit in the absence of a mutator.
 */
export function rejectVersionModification(store: VersionStore, versionId: string): Result<{ store: VersionStore }> {
  // Whether or not the version exists, a modification of an existing version is
  // rejected; the store is never changed.
  void versionId;
  void store;
  return { ok: false, error: VERSION_ERROR_IMMUTABLE };
}
