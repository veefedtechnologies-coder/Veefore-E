/**
 * Artifact provenance — pure (DB-free, IO-free) core for the Video_Editor
 * storage layer (Req 20.1, 20.2, 20.3).
 *
 * A `Video_Artifact` is an immutable stored output (original, proxy, audio,
 * thumbnails, analysis, generated, renders, export). Before any bytes or
 * metadata are persisted, an artifact MUST satisfy two invariants, both decided
 * entirely by the pure functions in this module so they can be property-tested
 * without a database or storage backend:
 *
 *   1. Single-category — the artifact belongs to EXACTLY ONE of the eight
 *      categories (Req 20.1). Anything else is rejected.
 *   2. Provenance-complete — every required provenance field
 *      ({ jobId, inputVersionId, provider, model, prompt, costCredits }) is
 *      determinable (Req 20.2). If any cannot be determined the artifact is
 *      rejected, is NOT stored, and the error names every missing field
 *      (Req 20.3).
 *
 * Deterministic artifacts (FFmpeg-produced trims, crops, renders, …) have no AI
 * provider or model. So the provenance stays complete, the deterministic engine
 * identifier (`ffmpeg`) fills `provider`/`model` (Req 20.3), keeping every
 * artifact — generative or deterministic — uniformly traceable.
 *
 * Immutability of stored bytes (Req 20.4) is a storage-layer concern enforced by
 * the artifact repository (task 3.3); this module governs what is allowed to be
 * created in the first place.
 */

// ---------------------------------------------------------------------------
// Categories (Req 20.1)
// ---------------------------------------------------------------------------

/**
 * The eight — and only eight — artifact categories. Every artifact is filed
 * under EXACTLY ONE of these, scoped to its owning Video_Project (Req 20.1).
 */
export const ARTIFACT_CATEGORIES = [
  'original',
  'proxy',
  'audio',
  'thumbnails',
  'analysis',
  'generated',
  'renders',
  'exports',
] as const;

/** One of the eight storage categories (Req 20.1). */
export type ArtifactCategory = (typeof ARTIFACT_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Provenance (Req 20.2, 20.3)
// ---------------------------------------------------------------------------

/**
 * The deterministic engine identifier used for `provider`/`model` on artifacts
 * produced by FFmpeg-based deterministic processing (Req 20.3). Using a stable
 * sentinel — rather than leaving the fields empty — keeps deterministic
 * artifacts provenance-complete and uniformly traceable alongside generative
 * ones.
 */
export const DETERMINISTIC_ENGINE_ID = 'ffmpeg';

/**
 * Complete provenance recorded for every Video_Artifact at creation
 * (Req 20.2). Mirrors the `provenance` sub-document on `IVideoArtifact`.
 */
export interface ArtifactProvenance {
  /** Originating Video_Edit_Job identifier. */
  jobId: string;
  /** Input Video_Version the artifact was derived from. */
  inputVersionId: string;
  /** Provider identifier (AI provider, or `ffmpeg` for deterministic). */
  provider: string;
  /** Model identifier (AI model, or `ffmpeg` for deterministic). */
  model: string;
  /** Compiled/provider-safe prompt, or the deterministic operation description. */
  prompt: string;
  /** Credit cost of producing the artifact (0 is valid, e.g. deterministic). */
  costCredits: number;
}

/**
 * The required provenance fields, in a stable order. Used to compute — and name
 * — every missing field on rejection (Req 20.3).
 */
export const REQUIRED_PROVENANCE_FIELDS = [
  'jobId',
  'inputVersionId',
  'provider',
  'model',
  'prompt',
  'costCredits',
] as const;

/** A required provenance field name (Req 20.3). */
export type ProvenanceField = (typeof REQUIRED_PROVENANCE_FIELDS)[number];

// ---------------------------------------------------------------------------
// Category validation (Req 20.1)
// ---------------------------------------------------------------------------

/** Type guard: is `value` exactly one of the eight artifact categories (Req 20.1)? */
export function isArtifactCategory(value: unknown): value is ArtifactCategory {
  return (
    typeof value === 'string' &&
    (ARTIFACT_CATEGORIES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Provenance validation (Req 20.2, 20.3)
// ---------------------------------------------------------------------------

/**
 * A determinable string field is a non-empty, non-whitespace string. Anything
 * missing, non-string, or blank "cannot be determined" (Req 20.3).
 */
function isDeterminableString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * A determinable cost is a finite, non-negative number. `0` is a valid,
 * determinable cost (deterministic operations cost no credits) and MUST NOT be
 * treated as missing; only undefined/null/NaN/negative/non-number is missing.
 */
function isDeterminableCost(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Return the required provenance fields that cannot be determined from the given
 * (possibly partial) provenance, in the canonical `REQUIRED_PROVENANCE_FIELDS`
 * order. An empty array means the provenance is complete (Req 20.2, 20.3).
 */
export function findMissingProvenanceFields(
  provenance: Partial<ArtifactProvenance> | null | undefined,
): ProvenanceField[] {
  const p = provenance ?? {};
  const missing: ProvenanceField[] = [];

  for (const field of REQUIRED_PROVENANCE_FIELDS) {
    const value = (p as Record<string, unknown>)[field];
    const ok = field === 'costCredits' ? isDeterminableCost(value) : isDeterminableString(value);
    if (!ok) missing.push(field);
  }

  return missing;
}

/**
 * Fill `provider`/`model` with the deterministic engine identifier (`ffmpeg`)
 * for a deterministic artifact when they are not otherwise determinable, leaving
 * every other field untouched (Req 20.3). This keeps deterministic artifacts
 * provenance-complete without inventing an AI provider/model.
 *
 * The remaining required fields (jobId, inputVersionId, prompt, costCredits) are
 * still supplied by the caller and are validated normally — this helper does not
 * fabricate them.
 */
export function withDeterministicEngine(
  provenance: Partial<ArtifactProvenance>,
): Partial<ArtifactProvenance> {
  return {
    ...provenance,
    provider: isDeterminableString(provenance.provider) ? provenance.provider : DETERMINISTIC_ENGINE_ID,
    model: isDeterminableString(provenance.model) ? provenance.model : DETERMINISTIC_ENGINE_ID,
  };
}

// ---------------------------------------------------------------------------
// Combined artifact-creation validation (Req 20.1, 20.2, 20.3)
// ---------------------------------------------------------------------------

/** The candidate artifact presented for creation, before any persistence. */
export interface ArtifactCreationInput {
  /** Intended storage category (must be exactly one of eight, Req 20.1). */
  category: unknown;
  /** Provenance for the artifact (must be complete, Req 20.2). */
  provenance: Partial<ArtifactProvenance> | null | undefined;
  /**
   * When true, `provider`/`model` default to the deterministic engine
   * identifier (`ffmpeg`) if not supplied, so a deterministic artifact stays
   * provenance-complete (Req 20.3).
   */
  deterministic?: boolean;
}

/**
 * Result of validating an artifact for creation. On failure the artifact is NOT
 * to be stored and `missingFields` names every offending field — the `category`
 * pseudo-field when the category is not one of the eight, plus each missing
 * provenance field (Req 20.3).
 */
export type ArtifactValidationResult =
  | { valid: true; category: ArtifactCategory; provenance: ArtifactProvenance }
  | { valid: false; missingFields: string[]; error: string };

/**
 * Validate a candidate artifact against the single-category (Req 20.1) and
 * provenance-complete (Req 20.2) invariants. On any failure the result is
 * `{ valid: false }` with `missingFields` naming every offending field so the
 * caller can reject creation, store nothing, and record which fields are missing
 * (Req 20.3).
 *
 * Pure and total: it never throws and never performs IO.
 */
export function validateArtifactCreation(input: ArtifactCreationInput): ArtifactValidationResult {
  const missingFields: string[] = [];

  // 1. Single-category (Req 20.1).
  const categoryOk = isArtifactCategory(input.category);
  if (!categoryOk) missingFields.push('category');

  // 2. Provenance-complete (Req 20.2, 20.3), applying the deterministic
  //    engine identifier default first when requested.
  const provenance = input.deterministic
    ? withDeterministicEngine(input.provenance ?? {})
    : input.provenance ?? {};
  const missingProvenance = findMissingProvenanceFields(provenance);
  missingFields.push(...missingProvenance);

  if (missingFields.length > 0) {
    return {
      valid: false,
      missingFields,
      error: `Artifact rejected: cannot determine required field(s): ${missingFields.join(', ')}`,
    };
  }

  // Safe: category is a valid ArtifactCategory and every provenance field is
  // determinable at this point.
  return {
    valid: true,
    category: input.category as ArtifactCategory,
    provenance: {
      jobId: (provenance.jobId as string).trim(),
      inputVersionId: (provenance.inputVersionId as string).trim(),
      provider: (provenance.provider as string).trim(),
      model: (provenance.model as string).trim(),
      prompt: (provenance.prompt as string).trim(),
      costCredits: provenance.costCredits as number,
    },
  };
}

// ---------------------------------------------------------------------------
// Storage-layout helper (Req 20.1)
// ---------------------------------------------------------------------------

/**
 * Build the deterministic storage folder for an artifact category, scoped to its
 * owning project: `video-editor/{projectId}/{category}` (Req 20.1). Because the
 * category is one of exactly eight, each artifact lives under exactly one folder.
 */
export function buildArtifactCategoryFolder(projectId: string, category: ArtifactCategory): string {
  return `video-editor/${projectId}/${category}`;
}
