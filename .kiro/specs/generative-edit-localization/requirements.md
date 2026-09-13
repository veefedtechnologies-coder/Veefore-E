# Requirements Document

## Introduction

Today, when a user asks for an edit-type generative operation (object removal, background
replacement, or a relight/restyle generative edit) WITHOUT naming an explicit time range, the
system sends the ENTIRE clip to the Omni generative video model. That is correct but expensive:
Omni processes every frame even when the requested edit only applies to a few seconds of footage.

This feature adds a cheap **localization pre-pass** that runs ONLY in the existing "global" branch
of the edit-type generative path (i.e. when `parseEditRange(message)` returns `mode: 'global'` and
the op is an edit-type generative kind). The pre-pass samples low-resolution frames from the clip,
asks a cheap Gemini vision model where the requested edit visually applies, and produces up to three
clean, clamped, non-overlapping time windows. Those windows are then fed into the EXISTING
segment-scoped `trim → editVideo(Omni) → splice(executeAssembly)` path so Omni only processes the
detected windows.

The feature honors the **No-Mock** rule (Req 23): if the localizer returns nothing, low-confidence,
invalid, or errors, the system silently falls back to the current whole-clip behavior. A time range
is never fabricated.

Scope is deliberately tight. This feature is ONLY the localization pre-pass plus its wiring into the
existing global branch. It does NOT change deterministic operations, does NOT change generate-type
(Veo) flows, and does NOT alter behavior when the user supplies an explicit range (an explicit user
range always wins and the localizer never runs).

## Glossary

- **Localizer**: The new subsystem that turns a global edit request into up to three concrete time
  windows. Composed of the Frame_Sampler, the Vision_Localizer, and the Window_Resolver.
- **Frame_Sampler**: The component that samples low-resolution frames from the source clip using the
  existing FFmpeg runner pattern.
- **Vision_Localizer**: The component that sends sampled frames plus the edit instruction to a cheap
  Gemini vision model and receives candidate timestamp ranges.
- **Window_Resolver**: The PURE, TOTAL, DETERMINISTIC logic module that merges, clamps, sorts, and
  caps candidate ranges into the final windows. Mirrors `highlight-selection.logic.ts`.
- **Localizer_Model_Resolver**: A new function `localizerModelId()` that returns the cheap vision
  model id, env-overridable, mirroring `omniVideoModelId()` / `veoModelId()`.
- **Edit_Type_Generative_Kind**: One of the generative operation kinds `object_removal`,
  `background_replace`, or `generative_edit` (relight/restyle).
- **Global_Edit_Branch**: The existing code path in `chat-video-edit.service.ts` taken when
  `parseEditRange(message)` returns `mode: 'global'` (or has no range) for an
  Edit_Type_Generative_Kind.
- **Segment_Scoped_Path**: The existing pipeline that trims a segment, runs `editVideo(Omni)` on it,
  and splices it back via `executeAssembly`.
- **Localization_Window**: A concrete, clamped time range `{ startMs, endMs }` within the source clip
  where the edit applies.
- **Whole_Clip_Fallback**: Sending the entire current artifact to Omni, i.e. the current global-branch
  behavior, used whenever the Localizer does not yield usable windows.
- **Source_Duration_Ms**: The effective duration of the current artifact in milliseconds.
- **Confidence**: A localizer-reported measure that a candidate range is a genuine detection; below a
  configured threshold the range is discarded.

## Requirements

### Requirement 1: Trigger conditions for the localization pre-pass

**User Story:** As a video editor, I want the system to automatically detect where my edit applies
when I do not specify a time range, so that generative edits are cheaper and faster without me
having to name timestamps.

#### Acceptance Criteria

1. WHEN a chat edit request resolves to an Edit_Type_Generative_Kind AND `parseEditRange(message)`
   returns `mode: 'global'`, THE Localizer SHALL run before any call to `editVideo(Omni)`.
2. IF `parseEditRange(message)` returns `mode: 'segment'` with a range, THEN THE Localizer SHALL NOT
   run AND THE System SHALL use the user-supplied range on the Segment_Scoped_Path.
3. WHERE the resolved operation is a generate-type (Veo) kind, THE Localizer SHALL NOT run.
4. WHERE the resolved operation is a deterministic operation, THE Localizer SHALL NOT run.
5. THE Localizer SHALL run for each Edit_Type_Generative_Kind value `object_removal`,
   `background_replace`, and `generative_edit` under the conditions of criterion 1.

### Requirement 2: Cheap localizer model resolution

**User Story:** As an operator, I want the cheap localizer model id to be configurable via
environment variable, so that I can change the model without a code change.

#### Acceptance Criteria

1. THE Localizer_Model_Resolver SHALL expose a function `localizerModelId()` that returns a model id
   string.
2. WHERE the environment variable `GEMINI_LOCALIZER_MODEL` is set to a non-empty value, THE
   Localizer_Model_Resolver SHALL return that value.
3. WHERE the environment variable `GEMINI_LOCALIZER_MODEL` is unset or empty, THE
   Localizer_Model_Resolver SHALL return `gemini-2.5-flash`.
4. THE Localizer_Model_Resolver SHALL follow the same structure as `omniVideoModelId()` and
   `veoModelId()`.

### Requirement 3: Low-resolution frame sampling

**User Story:** As an operator, I want localization to run on cheap low-resolution sampled frames, so
that the detection step costs far less than a full-clip Omni pass.

#### Acceptance Criteria

1. WHEN the Localizer runs, THE Frame_Sampler SHALL sample frames from the source clip at a sampling
   rate of 1 frame per second by default.
2. WHEN the Frame_Sampler samples frames, THE Frame_Sampler SHALL downscale sampled frames to
   approximately 360p by default.
3. THE Frame_Sampler SHALL obtain frames using the existing FFmpeg runner pattern.
4. WHERE the environment variable for sampling rate is set to a valid positive value, THE
   Frame_Sampler SHALL use that sampling rate instead of the default.
5. WHERE the environment variable for downscale resolution is set to a valid value, THE Frame_Sampler
   SHALL use that resolution instead of the default.

### Requirement 4: Vision-based candidate range detection

**User Story:** As a video editor, I want a cheap vision model to identify the timestamps where my
edit target appears, so that only the relevant windows are sent to the expensive generative model.

#### Acceptance Criteria

1. WHEN the Frame_Sampler produces sampled frames, THE Vision_Localizer SHALL send the sampled frames
   and the edit target instruction to the model returned by `localizerModelId()`.
2. THE Vision_Localizer SHALL request candidate timestamp ranges where the requested edit applies.
3. WHEN the Vision_Localizer receives candidate ranges from the model, THE Vision_Localizer SHALL pass
   those candidate ranges to the Window_Resolver.
4. IF the Vision_Localizer call errors, THEN THE System SHALL use the Whole_Clip_Fallback.

### Requirement 5: Window resolution and budget enforcement

**User Story:** As a video editor, I want detected windows to be clean, in-bounds, and limited in
number, so that the generative edit and splice stay reliable and affordable.

#### Acceptance Criteria

1. THE Window_Resolver SHALL clamp every produced Localization_Window to the interval
   `[0, Source_Duration_Ms]`.
2. THE Window_Resolver SHALL produce at most 3 Localization_Windows by default.
3. WHERE the environment variable for maximum windows is set to a valid positive value, THE
   Window_Resolver SHALL use that value as the maximum number of Localization_Windows.
4. THE Window_Resolver SHALL merge overlapping or adjacent candidate ranges into a single
   Localization_Window.
5. THE Window_Resolver SHALL return Localization_Windows sorted chronologically by `startMs` with no
   two windows overlapping.
6. THE Window_Resolver SHALL enforce a minimum window length so that every produced Localization_Window
   is non-empty and trimmable.
7. WHEN merged candidate ranges together cover approximately the whole clip, THE Window_Resolver SHALL
   promote the result to a Whole_Clip_Fallback signal rather than returning near-whole windows.
8. THE Window_Resolver SHALL be a pure, total, deterministic function that performs no IO, no clock
   access, and no randomness.

### Requirement 6: No-Mock fallback to whole-clip

**User Story:** As a video editor, I want the system to fall back to editing the whole clip when
localization is uncertain, so that my edit is never applied to a wrong, fabricated time range.

#### Acceptance Criteria

1. IF the Vision_Localizer returns no candidate ranges, THEN THE System SHALL use the
   Whole_Clip_Fallback.
2. IF every candidate range is below the configured Confidence threshold, THEN THE System SHALL use
   the Whole_Clip_Fallback.
3. IF the candidate ranges are invalid or cannot be parsed, THEN THE System SHALL use the
   Whole_Clip_Fallback.
4. IF the Window_Resolver produces zero usable Localization_Windows, THEN THE System SHALL use the
   Whole_Clip_Fallback.
5. THE Localizer SHALL NOT fabricate a Localization_Window when detection is empty, low-confidence,
   invalid, or errored.

### Requirement 7: Wiring into the existing segment-scoped path

**User Story:** As a maintainer, I want detected windows to flow through the existing edit pipeline,
so that no rendering, trimming, or splicing logic is duplicated.

#### Acceptance Criteria

1. WHEN the Window_Resolver returns one or more Localization_Windows, THE System SHALL feed those
   windows into the existing Segment_Scoped_Path (`trim → editVideo(Omni) → splice(executeAssembly)`).
2. THE System SHALL splice at most 3 edited windows back into the original timeline by default.
3. WHERE multiple Localization_Windows are produced, THE System SHALL process each window through the
   Segment_Scoped_Path and splice all edited windows back into a single output timeline.
4. THE System SHALL NOT introduce new render, trim, or ingestion logic that duplicates the existing
   FFmpeg runner, generative-video service, edit-range parser, or assembly/splice modules.

### Requirement 8: Engineering constraints (non-functional)

**User Story:** As a maintainer, I want the localization feature to follow the project's coding rules,
so that it integrates cleanly and stays testable.

#### Acceptance Criteria

1. THE Localizer SHALL use ESM static imports only and SHALL NOT use `require()`.
2. WHEN the Localizer emits log output, THE Localizer SHALL use the string-first logger.
3. THE Frame_Sampler SHALL reuse the existing FFmpeg runner rather than spawning FFmpeg through new
   logic.
4. THE Vision_Localizer SHALL reuse the existing generative-video service integration pattern for
   model calls.
5. THE Window_Resolver SHALL reside in a dedicated pure logic module mirroring the structure of
   `highlight-selection.logic.ts`.

## Correctness Properties (for property-based testing of the Window_Resolver)

The Window_Resolver is a pure, total, deterministic function; the following properties MUST hold for
any array of candidate ranges and any finite non-negative `Source_Duration_Ms`:

1. **Clamping**: Every returned window satisfies `0 <= startMs < endMs <= Source_Duration_Ms`.
2. **Minimum window**: Every returned window satisfies `endMs - startMs >= MIN_WINDOW_MS`, or the
   result is the Whole_Clip_Fallback signal.
3. **Max windows cap**: The number of returned windows is always `<= maxWindows` (default 3).
4. **Sorted**: Returned windows are sorted strictly ascending by `startMs`.
5. **Non-overlapping**: For any two consecutive returned windows `a` then `b`, `a.endMs <= b.startMs`.
6. **Merge idempotence**: Feeding the resolver's own output back in yields the same windows
   (no further merging or reduction occurs).
7. **Whole-clip promotion**: When merged windows cover `[0, Source_Duration_Ms]` within the
   whole-clip epsilon, the resolver returns the Whole_Clip_Fallback signal rather than near-whole
   windows.
8. **Never-empty-when-segment**: When the resolver returns segment windows (not the fallback signal),
   there is at least one window and every window is non-empty.
9. **Determinism**: The same inputs always produce identical outputs, with no IO, clock, or
   randomness.
10. **Totality**: Every input (including empty candidates, out-of-order ranges, negative or NaN
    bounds, and ranges exceeding the duration) returns a defined result and never throws.
