/**
 * Timeline_Engine — pure (DB-free, IO-free) core for the Video_Editor timeline
 * model and its deterministic render-command generation (Req 10.1–10.6).
 *
 * The timeline model is the SOLE authoritative source for the final render. This
 * module owns every rule that governs it, expressed as pure functions so they can
 * be property-tested without MongoDB, FFmpeg, or a running worker:
 *
 *   1. Model shape & 1 ms resolution (Req 10.1). A timeline holds sequences and
 *      an ordered set of elements (clips, audio clips, caption clips, effects,
 *      transitions). Every element records a track index and a timeline
 *      start/end in whole milliseconds — timings are integers, so the model's
 *      resolution is exactly 1 ms.
 *
 *   2. Placement validation (Req 10.3). An element with a negative start, a
 *      start greater than or equal to its end, or a track index outside the
 *      defined range of existing tracks is rejected; the operation returns an
 *      error and leaves the model UNCHANGED (Property 26).
 *
 *   3. Source-timing independence & validation (Req 10.5, 10.6). A clip's source
 *      in/out points are stored independent of its timeline start/end
 *      (Property 27). A source reference whose in-point is negative, whose
 *      out-point is less than or equal to its in-point, or whose out-point
 *      exceeds the known source-media duration is rejected, leaving the model
 *      UNCHANGED (Property 26).
 *
 *   4. Deterministic render command (Req 10.4). `buildRenderCommand` derives an
 *      FFmpeg argument vector purely from the model plus an export profile, with
 *      fixed encoder settings and a stable element ordering, so two renders of
 *      an unchanged model produce byte-identical output (Property 28).
 *
 * Every mutating helper is COPY-ON-WRITE: it returns a brand-new model and never
 * mutates its input, which is what makes "leave the model unchanged on rejection"
 * hold structurally rather than by convention.
 */

// ---------------------------------------------------------------------------
// Model types (Req 10.1)
// ---------------------------------------------------------------------------

/**
 * The five — and only five — timeline element kinds (Req 10.1). Kept in sync
 * with `TimelineElementKind` on the `VideoTimeline` Mongoose model so the pure
 * core and the persisted schema cannot drift.
 */
export const TIMELINE_ELEMENT_KINDS = [
  'clip',
  'audioClip',
  'captionClip',
  'effect',
  'transition',
] as const;

/** One of the five timeline element kinds (Req 10.1). */
export type TimelineElementKind = (typeof TIMELINE_ELEMENT_KINDS)[number];

/**
 * The kinds that carry visible/audible media rendered from a source asset.
 * Only these participate in render-command input generation; effects and
 * transitions modify other elements rather than contributing their own input.
 */
export const SOURCED_ELEMENT_KINDS = ['clip', 'audioClip'] as const;

/**
 * A single timeline element. `timelineStartMs`/`timelineEndMs` place it on the
 * timeline; `sourceInMs`/`sourceOutMs` select the region of the source asset and
 * are stored INDEPENDENTLY of the timeline placement (Req 10.5). All timings are
 * whole milliseconds — the model's resolution is 1 ms (Req 10.1).
 */
export interface TimelineElement {
  kind: TimelineElementKind;
  /** Zero-based track index; must fall within the model's defined track range. */
  trackIndex: number;
  /** Timeline start in whole ms; ≥ 0 and < timelineEndMs (Req 10.3). */
  timelineStartMs: number;
  /** Timeline end in whole ms; > timelineStartMs (Req 10.3). */
  timelineEndMs: number;
  /** Source asset the element renders from (clips/audio clips). */
  sourceAssetId?: string;
  /** Source in-point in whole ms; ≥ 0, independent of timeline (Req 10.5, 10.6). */
  sourceInMs?: number;
  /** Source out-point in whole ms; > sourceInMs and ≤ source duration (Req 10.6). */
  sourceOutMs?: number;
  /** Opaque, element-specific parameters (deterministically serialized). */
  params?: Record<string, unknown>;
}

/** A sequence groups a fixed number of tracks (Req 10.1). */
export interface TimelineSequence {
  /** Number of tracks the sequence defines; a positive integer. */
  tracks: number;
}

/**
 * The authoritative timeline model: its sequences (which define how many tracks
 * exist) and its ordered elements. This — and only this — is what the render
 * consumes (Req 10.4).
 */
export interface TimelineModel {
  sequences: TimelineSequence[];
  elements: TimelineElement[];
}

/** Context supplied to mutating operations for source-timing validation. */
export interface TimelineOpContext {
  /**
   * Known duration (whole ms) of each source asset, keyed by asset id. When a
   * referenced asset's duration is present here, an out-point exceeding it is
   * rejected (Req 10.6); when it is absent, the duration-exceeds check is skipped
   * (it cannot be evaluated) but the in/out relationship is still enforced.
   */
  sourceDurationsMs?: Record<string, number>;
}

/**
 * Result of a mutating timeline operation. On success it carries a NEW model;
 * on failure it carries an error describing the rejection and the caller keeps
 * the prior model unchanged (Req 10.3, 10.6).
 */
export type TimelineOpResult =
  | { ok: true; model: TimelineModel }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Basic helpers
// ---------------------------------------------------------------------------

/** A whole, finite, non-negative millisecond value (the 1 ms resolution, Req 10.1). */
function isNonNegativeMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** A whole, finite (possibly negative) millisecond value. */
function isIntegerMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** Type guard: is `value` exactly one of the five element kinds (Req 10.1)? */
export function isTimelineElementKind(value: unknown): value is TimelineElementKind {
  return typeof value === 'string' && (TIMELINE_ELEMENT_KINDS as readonly string[]).includes(value);
}

/** Does this element kind render from its own source asset input? */
export function isSourcedKind(kind: TimelineElementKind): boolean {
  return (SOURCED_ELEMENT_KINDS as readonly string[]).includes(kind);
}

/**
 * The total number of tracks the model defines — the sum of each sequence's
 * track count. A valid track index is an integer in `[0, trackCount)` (Req 10.3).
 */
export function trackCount(model: TimelineModel): number {
  return (model.sequences ?? []).reduce(
    (total, seq) => total + (Number.isInteger(seq?.tracks) && seq.tracks > 0 ? seq.tracks : 0),
    0,
  );
}

/** Create an empty timeline with the given track layout. */
export function createTimeline(sequences: TimelineSequence[] = [{ tracks: 1 }]): TimelineModel {
  return { sequences: sequences.map((s) => ({ tracks: s.tracks })), elements: [] };
}

/** Whether the element references source media (and thus needs source-timing checks). */
function referencesSource(element: TimelineElement): boolean {
  return (
    element.sourceAssetId !== undefined ||
    element.sourceInMs !== undefined ||
    element.sourceOutMs !== undefined
  );
}

// ---------------------------------------------------------------------------
// Validation (Req 10.3, 10.6)
// ---------------------------------------------------------------------------

/**
 * Validate an element's timeline PLACEMENT against the model (Req 10.3). Returns
 * a human-readable error describing the first invalid placement, or `null` when
 * the placement is valid. Rejects: an unknown kind, a non-integer/negative start,
 * a start ≥ end, and a track index outside `[0, trackCount)`.
 *
 * Pure and total: never throws, never performs IO.
 */
export function validatePlacement(element: TimelineElement, model: TimelineModel): string | null {
  if (!isTimelineElementKind(element?.kind)) {
    return `Invalid placement: unknown element kind ${String(element?.kind)}`;
  }
  if (!isIntegerMs(element.timelineStartMs) || element.timelineStartMs < 0) {
    return `Invalid placement: timelineStartMs must be a whole millisecond ≥ 0 (got ${String(element.timelineStartMs)})`;
  }
  if (!isIntegerMs(element.timelineEndMs)) {
    return `Invalid placement: timelineEndMs must be a whole millisecond (got ${String(element.timelineEndMs)})`;
  }
  if (element.timelineEndMs <= element.timelineStartMs) {
    return `Invalid placement: timelineEndMs (${element.timelineEndMs}) must be greater than timelineStartMs (${element.timelineStartMs})`;
  }

  const tracks = trackCount(model);
  if (!Number.isInteger(element.trackIndex) || element.trackIndex < 0 || element.trackIndex >= tracks) {
    return `Invalid placement: trackIndex ${String(element.trackIndex)} is outside the defined track range [0, ${tracks})`;
  }

  return null;
}

/**
 * Validate an element's SOURCE timing (Req 10.6). Returns a human-readable error
 * describing the invalid source timing, or `null` when valid (including when the
 * element references no source at all). Rejects: a non-integer/negative in-point,
 * an out-point ≤ the in-point, and — when the source duration is known — an
 * out-point exceeding the source-media duration.
 *
 * Source in/out are validated entirely independently of the timeline placement
 * (Req 10.5): nothing here reads `timelineStartMs`/`timelineEndMs`.
 *
 * Pure and total.
 */
export function validateSourceTiming(
  element: TimelineElement,
  sourceDurationMs?: number,
): string | null {
  if (!referencesSource(element)) return null;

  const { sourceInMs, sourceOutMs } = element;

  if (!isNonNegativeMs(sourceInMs)) {
    return `Invalid source timing: sourceInMs must be a whole millisecond ≥ 0 (got ${String(sourceInMs)})`;
  }
  if (!isIntegerMs(sourceOutMs)) {
    return `Invalid source timing: sourceOutMs must be a whole millisecond (got ${String(sourceOutMs)})`;
  }
  if (sourceOutMs <= sourceInMs) {
    return `Invalid source timing: sourceOutMs (${sourceOutMs}) must be greater than sourceInMs (${sourceInMs})`;
  }
  if (isNonNegativeMs(sourceDurationMs) && sourceOutMs > sourceDurationMs) {
    return `Invalid source timing: sourceOutMs (${sourceOutMs}) exceeds source duration (${sourceDurationMs})`;
  }

  return null;
}

/**
 * Validate an element fully (placement + source timing) against the model and
 * op context. Returns the first error found, or `null` when the element is a
 * valid addition. Used by every mutating operation so acceptance and rejection
 * are decided in exactly one place (Req 10.3, 10.6).
 */
export function validateElement(
  element: TimelineElement,
  model: TimelineModel,
  ctx: TimelineOpContext = {},
): string | null {
  const placementError = validatePlacement(element, model);
  if (placementError) return placementError;

  const durationMs =
    element.sourceAssetId !== undefined ? ctx.sourceDurationsMs?.[element.sourceAssetId] : undefined;
  return validateSourceTiming(element, durationMs);
}

// ---------------------------------------------------------------------------
// Copy-on-write mutations (Req 10.3, 10.6 — never mutate on rejection)
// ---------------------------------------------------------------------------

/** Shallow-copy an element into a fresh object (defensive, copy-on-write). */
function cloneElement(element: TimelineElement): TimelineElement {
  const copy: TimelineElement = {
    kind: element.kind,
    trackIndex: element.trackIndex,
    timelineStartMs: element.timelineStartMs,
    timelineEndMs: element.timelineEndMs,
  };
  if (element.sourceAssetId !== undefined) copy.sourceAssetId = element.sourceAssetId;
  if (element.sourceInMs !== undefined) copy.sourceInMs = element.sourceInMs;
  if (element.sourceOutMs !== undefined) copy.sourceOutMs = element.sourceOutMs;
  if (element.params !== undefined) copy.params = { ...element.params };
  return copy;
}

/** Copy the whole model (fresh sequences + elements arrays), leaving inputs untouched. */
function cloneModel(model: TimelineModel): TimelineModel {
  return {
    sequences: model.sequences.map((s) => ({ tracks: s.tracks })),
    elements: model.elements.map(cloneElement),
  };
}

/**
 * Add an element to the timeline (Req 10.1). Validates placement and source
 * timing first; on any violation the model is returned UNCHANGED via an error
 * result (Req 10.3, 10.6, Property 26). On success a NEW model with the appended
 * element is returned — the input model is never mutated.
 */
export function addElement(
  model: TimelineModel,
  element: TimelineElement,
  ctx: TimelineOpContext = {},
): TimelineOpResult {
  const error = validateElement(element, model, ctx);
  if (error) return { ok: false, error };

  const next = cloneModel(model);
  next.elements.push(cloneElement(element));
  return { ok: true, model: next };
}

/**
 * Replace the element at `index` with `element` (Req 10.1). The replacement is
 * validated exactly like an addition; on any violation — or an out-of-range
 * index — the model is returned UNCHANGED via an error result (Req 10.3, 10.6).
 * On success a NEW model is returned.
 */
export function updateElement(
  model: TimelineModel,
  index: number,
  element: TimelineElement,
  ctx: TimelineOpContext = {},
): TimelineOpResult {
  if (!Number.isInteger(index) || index < 0 || index >= model.elements.length) {
    return { ok: false, error: `Invalid update: element index ${String(index)} is out of range [0, ${model.elements.length})` };
  }
  const error = validateElement(element, model, ctx);
  if (error) return { ok: false, error };

  const next = cloneModel(model);
  next.elements[index] = cloneElement(element);
  return { ok: true, model: next };
}

/**
 * Remove the element at `index` (Req 10.1). An out-of-range index leaves the
 * model UNCHANGED via an error result. On success a NEW model is returned.
 */
export function removeElement(model: TimelineModel, index: number): TimelineOpResult {
  if (!Number.isInteger(index) || index < 0 || index >= model.elements.length) {
    return { ok: false, error: `Invalid remove: element index ${String(index)} is out of range [0, ${model.elements.length})` };
  }
  const next = cloneModel(model);
  next.elements.splice(index, 1);
  return { ok: true, model: next };
}

// ---------------------------------------------------------------------------
// Deterministic render-command generation (Req 10.4)
// ---------------------------------------------------------------------------

/** Minimal fixed-encoder export profile shape the command generator consumes. */
export interface RenderEncoderProfile {
  container: 'mp4' | 'webm' | 'mov';
  videoCodec: 'h264' | 'h265' | 'vp9';
  audioCodec: 'aac' | 'opus';
  width: number;
  height: number;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
}

/** A deterministic FFmpeg invocation derived purely from the timeline model. */
export interface RenderCommand {
  /** FFmpeg argument vector (excludes the `ffmpeg` binary itself). */
  args: string[];
  /** The stable-sorted order of the sourced elements consumed as inputs. */
  inputOrder: TimelineElement[];
}

/** Map a container/codec choice to the concrete FFmpeg encoder name (fixed settings). */
const VIDEO_ENCODER: Record<RenderEncoderProfile['videoCodec'], string> = {
  h264: 'libx264',
  h265: 'libx265',
  vp9: 'libvpx-vp9',
};

const AUDIO_ENCODER: Record<RenderEncoderProfile['audioCodec'], string> = {
  aac: 'aac',
  opus: 'libopus',
};

/**
 * Format whole milliseconds as a fixed-precision seconds timestamp (3 dp) so the
 * generated command is byte-stable for a given model (Req 10.4). E.g. 1500 →
 * "1.500".
 */
function msToTimestamp(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/**
 * A total ordering over sourced elements that depends ONLY on the model's data,
 * giving a stable input order regardless of insertion order — a prerequisite for
 * byte-identical output from an unchanged model (Req 10.4, Property 28). Ordered
 * by track, then timeline start, then timeline end, then kind, then source
 * asset, then source in/out.
 */
function compareElements(a: TimelineElement, b: TimelineElement): number {
  if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
  if (a.timelineStartMs !== b.timelineStartMs) return a.timelineStartMs - b.timelineStartMs;
  if (a.timelineEndMs !== b.timelineEndMs) return a.timelineEndMs - b.timelineEndMs;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  const aid = a.sourceAssetId ?? '';
  const bid = b.sourceAssetId ?? '';
  if (aid !== bid) return aid < bid ? -1 : 1;
  if ((a.sourceInMs ?? 0) !== (b.sourceInMs ?? 0)) return (a.sourceInMs ?? 0) - (b.sourceInMs ?? 0);
  return (a.sourceOutMs ?? 0) - (b.sourceOutMs ?? 0);
}

/**
 * Build a deterministic FFmpeg command vector from the timeline model and a fixed
 * export profile (Req 10.4). Because the sourced elements are consumed in a stable
 * data-derived order and every encoder setting is fixed by the profile, two calls
 * for an UNCHANGED model produce an identical argument vector — the pure basis for
 * byte-identical renders (Property 28).
 *
 * Each sourced element (clip / audio clip) contributes one seeked input
 * (`-ss <in> -t <duration> -i <asset>`). Video is scaled to the profile's exact
 * dimensions and fps and encoded with the fixed video encoder/bitrate; audio is
 * encoded with the fixed audio encoder/bitrate. MP4 output is finalized with
 * `+faststart`. The command is a pure function of its inputs — it performs no IO.
 */
export function buildRenderCommand(
  model: TimelineModel,
  profile: RenderEncoderProfile,
  outputPath = 'output.' + profile.container,
): RenderCommand {
  const inputOrder = model.elements
    .filter((el) => isSourcedKind(el.kind) && el.sourceAssetId !== undefined)
    .slice()
    .sort(compareElements);

  const args: string[] = ['-y', '-hide_banner', '-nostdin'];

  for (const el of inputOrder) {
    const inMs = el.sourceInMs ?? 0;
    const outMs = el.sourceOutMs ?? el.timelineEndMs - el.timelineStartMs + inMs;
    const durationMs = Math.max(0, outMs - inMs);
    args.push('-ss', msToTimestamp(inMs));
    args.push('-t', msToTimestamp(durationMs));
    args.push('-i', el.sourceAssetId as string);
  }

  // Fixed encoder settings from the profile (never hardcoded per-call).
  args.push(
    '-vf', `scale=${profile.width}:${profile.height}`,
    '-r', String(profile.fps),
    '-c:v', VIDEO_ENCODER[profile.videoCodec],
    '-b:v', `${profile.videoBitrateKbps}k`,
    '-pix_fmt', 'yuv420p',
    '-c:a', AUDIO_ENCODER[profile.audioCodec],
    '-b:a', `${profile.audioBitrateKbps}k`,
  );

  if (profile.container === 'mp4') {
    args.push('-movflags', '+faststart');
  }

  args.push(outputPath);

  return { args, inputOrder };
}

/**
 * Convenience: the render command as a single shell-style string. Deterministic
 * for a given model + profile, mirroring `buildRenderCommand` (Req 10.4).
 */
export function renderCommandToString(command: RenderCommand): string {
  return ['ffmpeg', ...command.args].join(' ');
}
