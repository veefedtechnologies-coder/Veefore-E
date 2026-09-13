/**
 * Property test for the Artifact_Provenance pure core (task 3.2).
 *
 * Framework: vitest + fast-check, >=100 runs.
 *
 * Property under test (design.md):
 *  - Property 49: Artifacts are single-category, provenance-complete, and immutable
 *      Validates: Requirements 20.1, 20.2, 20.3, 20.4
 *
 * *For any* `Video_Artifact`, it is stored under exactly one of the eight
 * categories scoped to its project; creation is rejected (and nothing stored,
 * with an error naming the missing fields) unless all provenance fields are
 * present; and once stored its bytes are never overwritten, replaced, or
 * modified.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ARTIFACT_CATEGORIES,
  REQUIRED_PROVENANCE_FIELDS,
  DETERMINISTIC_ENGINE_ID,
  isArtifactCategory,
  findMissingProvenanceFields,
  withDeterministicEngine,
  validateArtifactCreation,
  buildArtifactCategoryFolder,
  type ArtifactProvenance,
  type ProvenanceField,
  type ArtifactCategory,
} from '../server/features/video-editor/services/artifact-provenance.logic';

const RUNS = 200;

// ---------------------------------------------------------------------------
// Smart generators constrained to the provenance/category input space
// ---------------------------------------------------------------------------

const categoryArb: fc.Arbitrary<ArtifactCategory> = fc.constantFrom(...ARTIFACT_CATEGORIES);

/** A non-empty, non-whitespace string — a determinable provenance string value. */
const determinableString = fc
  .string({ minLength: 1, maxLength: 16 })
  .filter((s) => s.trim().length > 0);

/** A determinable, finite, non-negative cost (0 is valid). */
const determinableCost = fc.double({ min: 0, max: 10_000, noNaN: true });

/** A value that is NOT a determinable string (missing / blank / non-string). */
const undeterminableString = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t\n'),
  fc.integer(),
  fc.boolean(),
);

/** A value that is NOT a determinable cost. */
const undeterminableCost = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.constant(Number.NaN),
  fc.double({ min: -10_000, max: -0.0001, noNaN: true }),
  fc.constant('5'),
  fc.constant(Number.POSITIVE_INFINITY),
);

/** A fully complete, valid provenance record. */
const completeProvenance: fc.Arbitrary<ArtifactProvenance> = fc.record({
  jobId: determinableString,
  inputVersionId: determinableString,
  provider: determinableString,
  model: determinableString,
  prompt: determinableString,
  costCredits: determinableCost,
});

/** A value that is not one of the eight categories. */
const invalidCategory = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.constant(''),
  fc.constant('render'), // near-miss (correct is "renders")
  fc.constant('export'), // near-miss (correct is "exports")
  fc.constant('video'),
  fc.integer(),
  fc.boolean(),
  fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !ARTIFACT_CATEGORIES.includes(s as ArtifactCategory)),
);

// ---------------------------------------------------------------------------
// Property 49 — Validates: Requirements 20.1, 20.2, 20.3, 20.4
// ---------------------------------------------------------------------------

describe('Property 49: Artifacts are single-category, provenance-complete, and immutable', () => {
  it('accepts an artifact with exactly one valid category and complete provenance (Req 20.1, 20.2)', () => {
    fc.assert(
      fc.property(categoryArb, completeProvenance, (category, provenance) => {
        const result = validateArtifactCreation({ category, provenance });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.category).toBe(category);
          // Every provenance field is carried through, trimmed.
          expect(result.provenance.jobId).toBe(provenance.jobId.trim());
          expect(result.provenance.inputVersionId).toBe(provenance.inputVersionId.trim());
          expect(result.provenance.provider).toBe(provenance.provider.trim());
          expect(result.provenance.model).toBe(provenance.model.trim());
          expect(result.provenance.prompt).toBe(provenance.prompt.trim());
          expect(result.provenance.costCredits).toBe(provenance.costCredits);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('rejects a non-single-category artifact naming the "category" field, storing nothing (Req 20.1, 20.3)', () => {
    fc.assert(
      fc.property(invalidCategory, completeProvenance, (category, provenance) => {
        // Guard: generator could theoretically produce a valid category — skip those.
        fc.pre(!isArtifactCategory(category));
        const result = validateArtifactCreation({ category, provenance });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.missingFields).toContain('category');
          expect(result.error).toContain('category');
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('rejects incomplete provenance, naming exactly every missing field (Req 20.2, 20.3)', () => {
    // Choose a non-empty subset of provenance fields to corrupt, then assert the
    // rejection names precisely those fields (and only those).
    const fieldSubset = fc
      .subarray([...REQUIRED_PROVENANCE_FIELDS], { minLength: 1 })
      .map((fields) => [...new Set(fields)] as ProvenanceField[]);

    fc.assert(
      fc.property(
        categoryArb,
        completeProvenance,
        fieldSubset,
        undeterminableString,
        undeterminableCost,
        (category, base, fieldsToBreak, badString, badCost) => {
          const broken: Record<string, unknown> = { ...base };
          for (const field of fieldsToBreak) {
            broken[field] = field === 'costCredits' ? badCost : badString;
          }

          const result = validateArtifactCreation({
            category,
            provenance: broken as Partial<ArtifactProvenance>,
          });

          expect(result.valid).toBe(false);
          if (!result.valid) {
            // Names exactly the broken provenance fields (category is valid here).
            const named = result.missingFields.filter((f) => f !== 'category');
            expect(new Set(named)).toEqual(new Set(fieldsToBreak));
            // Error message names each missing field.
            for (const field of fieldsToBreak) {
              expect(result.error).toContain(field);
            }
          }
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('missing-field detection is order-canonical and complete (Req 20.3)', () => {
    fc.assert(
      fc.property(completeProvenance, (base) => {
        // Empty provenance => every required field missing, in canonical order.
        const allMissing = findMissingProvenanceFields({});
        expect(allMissing).toEqual([...REQUIRED_PROVENANCE_FIELDS]);
        // Complete provenance => nothing missing.
        expect(findMissingProvenanceFields(base)).toEqual([]);
        // null/undefined treated as fully missing.
        expect(findMissingProvenanceFields(null)).toEqual([...REQUIRED_PROVENANCE_FIELDS]);
        expect(findMissingProvenanceFields(undefined)).toEqual([...REQUIRED_PROVENANCE_FIELDS]);
      }),
      { numRuns: RUNS },
    );
  });

  it('deterministic artifacts fill provider/model with the ffmpeg engine id, staying provenance-complete (Req 20.3)', () => {
    // Provenance with the AI-only fields (provider/model) absent, but the
    // deterministic flag set — must be accepted with ffmpeg filled in.
    const detProvenance = fc.record({
      jobId: determinableString,
      inputVersionId: determinableString,
      prompt: determinableString,
      costCredits: determinableCost,
    });

    fc.assert(
      fc.property(categoryArb, detProvenance, (category, provenance) => {
        const result = validateArtifactCreation({
          category,
          provenance,
          deterministic: true,
        });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.provenance.provider).toBe(DETERMINISTIC_ENGINE_ID);
          expect(result.provenance.model).toBe(DETERMINISTIC_ENGINE_ID);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('deterministic fill never overrides an explicitly supplied provider/model (Req 20.3)', () => {
    fc.assert(
      fc.property(completeProvenance, (provenance) => {
        const filled = withDeterministicEngine(provenance);
        // Both supplied => untouched.
        expect(filled.provider).toBe(provenance.provider);
        expect(filled.model).toBe(provenance.model);
        // Other fields never fabricated by the fill helper.
        expect(filled.jobId).toBe(provenance.jobId);
        expect(filled.inputVersionId).toBe(provenance.inputVersionId);
      }),
      { numRuns: RUNS },
    );
  });

  it('deterministic fill does NOT fabricate the non-engine required fields (Req 20.3)', () => {
    // Even with deterministic=true, absent jobId/inputVersionId/prompt/cost must
    // still be reported missing — the engine id only fills provider/model.
    fc.assert(
      fc.property(categoryArb, (category) => {
        const result = validateArtifactCreation({
          category,
          provenance: {},
          deterministic: true,
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.missingFields).toContain('jobId');
          expect(result.missingFields).toContain('inputVersionId');
          expect(result.missingFields).toContain('prompt');
          expect(result.missingFields).toContain('costCredits');
          // provider/model were filled, so NOT reported missing.
          expect(result.missingFields).not.toContain('provider');
          expect(result.missingFields).not.toContain('model');
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('each artifact resolves to exactly one category folder scoped to its project (Req 20.1 — immutable single placement)', () => {
    fc.assert(
      fc.property(determinableString, categoryArb, (projectId, category) => {
        const folder = buildArtifactCategoryFolder(projectId, category);
        // Deterministic, single, project-scoped placement.
        expect(folder).toBe(`video-editor/${projectId}/${category}`);
        // The folder ends with exactly one of the eight categories — the
        // artifact cannot be filed under two categories at once.
        const matches = ARTIFACT_CATEGORIES.filter((c) => folder.endsWith(`/${c}`));
        expect(matches).toEqual([category]);
        // Placement is stable: recomputing yields identical bytes/path (Req 20.4
        // — the layout an immutable artifact is stored under never changes).
        expect(buildArtifactCategoryFolder(projectId, category)).toBe(folder);
      }),
      { numRuns: RUNS },
    );
  });

  it('validation is pure and total — repeated calls yield identical results, never throwing (Req 20.4)', () => {
    fc.assert(
      fc.property(
        fc.oneof(categoryArb, invalidCategory),
        fc.oneof(completeProvenance, fc.constant({}), fc.constant(null)),
        (category, provenance) => {
          const first = validateArtifactCreation({
            category,
            provenance: provenance as Partial<ArtifactProvenance> | null,
          });
          const second = validateArtifactCreation({
            category,
            provenance: provenance as Partial<ArtifactProvenance> | null,
          });
          // Immutability of the decision: same input => structurally identical result.
          expect(second).toEqual(first);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
