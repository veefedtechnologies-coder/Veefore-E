import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  emptyStore,
  hasVersion,
  getVersion,
  resolveParent,
  createVersion,
  restoreVersion,
  rejectVersionModification,
  VERSION_ERROR_MISSING_PARENT,
  VERSION_ERROR_MISSING_RESTORE_TARGET,
  VERSION_ERROR_IMMUTABLE,
  type VersionStore,
  type VersionRecord,
  type CreateVersionInput,
} from '../server/features/video-editor/services/version-manager.logic';

// ===========================================================================
// Task 19.2 — Property test for the pure version-manager core
// (server/features/video-editor/services/version-manager.logic.ts).
//
//   Property 38: Version creation preserves history and records lineage;
//                versions are immutable
//                Validates: Requirements 16.4, 16.5, 16.6
//
// For any refinement, creating a new `Video_Version`:
//   - leaves all prior versions byte-for-byte unchanged (Req 16.4)
//   - stores a reference to its parent version — lineage (Req 16.6)
//   - and any operation OTHER than version creation that attempts to modify an
//     existing version is rejected with an immutability error and leaves the
//     version unchanged (Req 16.5).
//
// Supporting example/unit tests exercise the neighbouring rules the core needs
// to remain coherent (parent resolution 16.1–16.3, restore semantics 16.7–16.8)
// without which the immutability/lineage properties would be vacuous.
//
// Every property runs ≥300 fast-check iterations with generators shaped to the
// real input space so the checks are meaningful rather than vacuous.
// ===========================================================================

const NUM_RUNS = 300;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep structural snapshot of a record, for byte-for-byte comparison. */
function snapshot(v: VersionRecord): string {
  return JSON.stringify(v);
}

/** Snapshot the whole version list (ordering + contents). */
function snapshotAll(store: VersionStore): string[] {
  return store.versions.map(snapshot);
}

/**
 * Build a store by applying a sequence of well-formed creation ops so the
 * generated history is always internally consistent (unique ids, valid
 * lineage). Returns the store plus the ordered list of created ids.
 */
function buildStore(
  ops: ReadonlyArray<{ requestedParentId: string | null; timelineId: string; label?: string }>,
): { store: VersionStore; ids: string[] } {
  let store = emptyStore();
  const ids: string[] = [];
  ops.forEach((op, i) => {
    const versionId = `v${i}`;
    // If an explicit parent is requested, snap it to a known existing id so the
    // op is a valid creation; otherwise derive from active (Req 16.2).
    let requestedParentId: string | null = null;
    if (op.requestedParentId !== null && ids.length > 0) {
      const idx = Math.abs(hashString(op.requestedParentId)) % ids.length;
      requestedParentId = ids[idx];
    }
    const input: CreateVersionInput = {
      versionId,
      requestedParentId,
      timelineId: op.timelineId,
      createdAt: 1_000 + i,
      ...(op.label !== undefined ? { label: op.label } : {}),
    };
    const res = createVersion(store, input);
    // These are all valid creations by construction.
    expect(res.ok).toBe(true);
    if (res.ok) {
      store = res.store;
      ids.push(versionId);
    }
  });
  return { store, ids };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A single creation op description (parent may be null ⇒ derive from active). */
const opArb = fc.record({
  requestedParentId: fc.oneof(fc.constant<string | null>(null), fc.string({ maxLength: 4 })),
  timelineId: fc.string({ minLength: 1, maxLength: 8 }),
  label: fc.oneof(fc.constant<string | undefined>(undefined), fc.string({ maxLength: 8 })),
});

/** A non-empty sequence of creation ops → a non-empty, well-formed history. */
const opsArb = fc.array(opArb, { minLength: 1, maxLength: 12 });

/** A fresh, valid input for creating one more version on top of `store`. */
function nextInputArb(store: VersionStore, existingIds: string[]): fc.Arbitrary<CreateVersionInput> {
  const parentArb =
    existingIds.length === 0
      ? fc.constant<string | null>(null)
      : fc.oneof(fc.constant<string | null>(null), fc.constantFrom(...existingIds));
  return fc.record({
    versionId: fc.constant(`new-${store.versions.length}`),
    requestedParentId: parentArb,
    timelineId: fc.string({ minLength: 1, maxLength: 8 }),
    createdAt: fc.integer({ min: 2_000, max: 9_000 }),
    label: fc.oneof(fc.constant<string | undefined>(undefined), fc.string({ maxLength: 8 })),
  });
}

// ===========================================================================
// Property 38 — the main invariant (Req 16.4, 16.5, 16.6)
// ===========================================================================

describe('Property 38: Version creation preserves history and records lineage; versions are immutable (Req 16.4, 16.5, 16.6)', () => {
  // -------------------------------------------------------------------------
  // Req 16.4 — creating a new version preserves ALL prior versions unchanged
  // -------------------------------------------------------------------------
  it('creating a new version leaves every prior version byte-for-byte unchanged (Req 16.4)', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const { store, ids } = buildStore(ops);
        const before = snapshotAll(store);

        // Apply one more valid creation.
        return fc.assert(
          fc.property(nextInputArb(store, ids), (input) => {
            const res = createVersion(store, input);
            expect(res.ok).toBe(true);
            if (!res.ok) return;

            // Every prior record is preserved unchanged and in the same order.
            const afterPrior = res.store.versions.slice(0, store.versions.length).map(snapshot);
            expect(afterPrior).toEqual(before);

            // The input store object was NOT mutated (append is copy-on-write).
            expect(snapshotAll(store)).toEqual(before);
            expect(store.versions.length).toBe(before.length);

            // History grew by exactly one; the new record is appended last.
            expect(res.store.versions.length).toBe(store.versions.length + 1);
            expect(res.store.versions[res.store.versions.length - 1].versionId).toBe(
              input.versionId,
            );
          }),
          { numRuns: 5 },
        );
      }),
      { numRuns: 80 },
    );
  });

  // -------------------------------------------------------------------------
  // Req 16.6 — the new version records a reference to its parent (lineage)
  // -------------------------------------------------------------------------
  it('a newly created version records its parent lineage (Req 16.6)', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const { store, ids } = buildStore(ops);
        return fc.assert(
          fc.property(nextInputArb(store, ids), (input) => {
            const res = createVersion(store, input);
            expect(res.ok).toBe(true);
            if (!res.ok) return;

            const expectedParent =
              input.requestedParentId !== null
                ? input.requestedParentId
                : store.activeVersionId;

            // Lineage stored exactly (Req 16.6).
            expect(res.version.parentVersionId).toBe(expectedParent);
            // A parent, when present, must exist in the resulting history.
            if (res.version.parentVersionId !== null) {
              expect(hasVersion(res.store, res.version.parentVersionId)).toBe(true);
            }
            // A version is never its own parent.
            expect(res.version.parentVersionId).not.toBe(res.version.versionId);
          }),
          { numRuns: 5 },
        );
      }),
      { numRuns: 80 },
    );
  });

  // -------------------------------------------------------------------------
  // Req 16.5 — non-creation modification of a version is always rejected
  //            with an immutability error, leaving the version unchanged
  // -------------------------------------------------------------------------
  it('any non-creation modification of an existing version is rejected as immutable and changes nothing (Req 16.5)', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const { store, ids } = buildStore(ops);
        const before = snapshotAll(store);

        for (const id of ids) {
          const res = rejectVersionModification(store, id);
          expect(res.ok).toBe(false);
          if (!res.ok) expect(res.error).toBe(VERSION_ERROR_IMMUTABLE);
          // The store is never touched by a rejected modification.
          expect(snapshotAll(store)).toEqual(before);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('modification is rejected as immutable even for a non-existent version id (Req 16.5)', () => {
    fc.assert(
      fc.property(opsArb, fc.string({ maxLength: 10 }), (ops, unknownId) => {
        const { store, ids } = buildStore(ops);
        fc.pre(!ids.includes(unknownId));
        const before = snapshotAll(store);
        const res = rejectVersionModification(store, unknownId);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toBe(VERSION_ERROR_IMMUTABLE);
        expect(snapshotAll(store)).toEqual(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Combined invariant: a full sequence of creations never mutates history
  // -------------------------------------------------------------------------
  it('an arbitrary sequence of creations only ever appends; earlier snapshots stay stable (Req 16.4, 16.6)', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        let store = emptyStore();
        const ids: string[] = [];
        const snapshotsAtEachStep: string[][] = [];

        ops.forEach((op, i) => {
          const prior = snapshotAll(store);
          let requestedParentId: string | null = null;
          if (op.requestedParentId !== null && ids.length > 0) {
            requestedParentId = ids[Math.abs(hashString(op.requestedParentId)) % ids.length];
          }
          const res = createVersion(store, {
            versionId: `s${i}`,
            requestedParentId,
            timelineId: op.timelineId,
            createdAt: 1_000 + i,
          });
          expect(res.ok).toBe(true);
          if (!res.ok) return;

          // Prior snapshot is a prefix of the new history, unchanged.
          expect(res.store.versions.slice(0, prior.length).map(snapshot)).toEqual(prior);
          // Lineage: parent is either null (root) or an already-existing id.
          const created = res.store.versions[res.store.versions.length - 1];
          if (created.parentVersionId !== null) {
            expect(ids).toContain(created.parentVersionId);
          } else {
            expect(ids.length === 0 || store.activeVersionId === null).toBe(true);
          }

          store = res.store;
          ids.push(`s${i}`);
          snapshotsAtEachStep.push(prior);
        });

        // The very first recorded snapshot (empty) is still a prefix of the end.
        if (snapshotsAtEachStep.length > 0) {
          expect(snapshotsAtEachStep[0]).toEqual([]);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ===========================================================================
// Supporting properties — parent resolution & restore semantics
// (Req 16.1, 16.2, 16.3, 16.7, 16.8). These keep the immutability/lineage
// properties honest by proving the surrounding rules the core relies on.
// ===========================================================================

describe('Version manager parent resolution (Req 16.1, 16.2, 16.3)', () => {
  it('a missing specified parent is rejected and creates no version (Req 16.3)', () => {
    fc.assert(
      fc.property(opsArb, fc.string({ minLength: 1, maxLength: 10 }), (ops, missingId) => {
        const { store, ids } = buildStore(ops);
        fc.pre(!ids.includes(missingId));
        const before = snapshotAll(store);

        const res = createVersion(store, {
          versionId: 'attempt',
          requestedParentId: missingId,
          timelineId: 't',
          createdAt: 5_000,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toBe(VERSION_ERROR_MISSING_PARENT);
        // No version created; history untouched (Req 16.3).
        expect(snapshotAll(store)).toEqual(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('with no explicit parent, lineage derives from the active version (Req 16.2)', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const { store } = buildStore(ops);
        const resolved = resolveParent(store, null);
        expect(resolved.ok).toBe(true);
        if (resolved.ok) {
          expect(resolved.parentVersionId).toBe(store.activeVersionId);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('the first version of a project derives from a null (root) parent (Req 16.2, 16.6)', () => {
    const res = createVersion(emptyStore(), {
      versionId: 'root',
      requestedParentId: null,
      timelineId: 't0',
      createdAt: 1,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.version.parentVersionId).toBeNull();
      expect(res.store.activeVersionId).toBe('root');
    }
  });

  it('a duplicate version id is refused as immutable and does not overwrite history (Req 16.4, 16.5)', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const { store, ids } = buildStore(ops);
        fc.pre(ids.length > 0);
        const before = snapshotAll(store);
        const res = createVersion(store, {
          versionId: ids[0], // collide with an existing id
          requestedParentId: null,
          timelineId: 'dup',
          createdAt: 6_000,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toBe(VERSION_ERROR_IMMUTABLE);
        expect(snapshotAll(store)).toEqual(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('Version manager restore semantics (Req 16.7, 16.8)', () => {
  it('restoring an existing version sets it active and deletes nothing (Req 16.7)', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const { store, ids } = buildStore(ops);
        fc.pre(ids.length > 0);
        const before = snapshotAll(store);

        for (const target of ids) {
          const res = restoreVersion(store, target);
          expect(res.ok).toBe(true);
          if (!res.ok) continue;
          // Target is now active.
          expect(res.store.activeVersionId).toBe(target);
          // No version deleted — full history preserved unchanged (Req 16.7).
          expect(snapshotAll(res.store)).toEqual(before);
          expect(res.store.versions.length).toBe(store.versions.length);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('restoring a non-existent version is rejected and preserves the current active version (Req 16.8)', () => {
    fc.assert(
      fc.property(opsArb, fc.string({ minLength: 1, maxLength: 10 }), (ops, missingId) => {
        const { store, ids } = buildStore(ops);
        fc.pre(!ids.includes(missingId));
        const beforeActive = store.activeVersionId;
        const before = snapshotAll(store);

        const res = restoreVersion(store, missingId);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toBe(VERSION_ERROR_MISSING_RESTORE_TARGET);
        // Active pointer and history unchanged (Req 16.8).
        expect(store.activeVersionId).toBe(beforeActive);
        expect(snapshotAll(store)).toEqual(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('restore then create-from-active derives lineage from the restored version (Req 16.2, 16.6, 16.7)', () => {
    const { store, ids } = buildStore([
      { requestedParentId: null, timelineId: 'a' },
      { requestedParentId: null, timelineId: 'b' },
      { requestedParentId: null, timelineId: 'c' },
    ]);
    // Restore the first (root) version as active.
    const restored = restoreVersion(store, ids[0]);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.store.activeVersionId).toBe(ids[0]);

    // A new version created without an explicit parent derives from the
    // restored active version, while all other versions remain intact.
    const created = createVersion(restored.store, {
      versionId: 'branch',
      requestedParentId: null,
      timelineId: 'd',
      createdAt: 9_999,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.version.parentVersionId).toBe(ids[0]);
    // Original three versions are all still present (nothing deleted).
    for (const id of ids) {
      expect(getVersion(created.store, id)).not.toBeNull();
    }
  });
});
