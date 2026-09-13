# Implementation Plan: Generative Edit Localization

## Overview

Add a cheap localization pre-pass to the ONE existing global branch of the edit-type generative path
in `chat-video-edit.service.ts`. The plan builds bottom-up: first the env-overridable model resolver,
then the PURE `Window_Resolver` logic module (validated by property tests), then the
`EditLocalizationService` IO shell (Frame_Sampler + Vision_Localizer, validated by unit tests with
injected fakes), and finally the wiring into the global branch (validated by wiring tests). Every step
reuses existing primitives (FFmpeg runner, `GenerativeVideoClient`, `editor.execute`,
`editVideo`, `executeAssembly`) and honors the No-Mock fallback.

Scoped verification only: after touching a file, run `tsc --noEmit` grep-filtered to that file, and run
only the new/related vitest files. Never run the full build or full test suite.

TypeScript is the implementation language (matches the existing services and design code samples).

## Tasks

- [x] 1. Add the cheap localizer model resolver and document its env var
  - [x] 1.1 Add `localizerModelId()` resolver to `generative-video.service.ts`
    - In `server/features/video-editor/services/generative-video.service.ts`, add an exported
      function `localizerModelId(): string` placed directly alongside `veoModelId()` /
      `omniVideoModelId()`, returning `process.env.GEMINI_LOCALIZER_MODEL || 'gemini-2.5-flash'`.
    - Follow the exact same structure and JSDoc discipline as the two existing resolvers so the same
      Google key powers image + video + localization.
    - Verify with `tsc --noEmit` grep-filtered to `generative-video.service.ts` only.
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 1.2 Write unit test for `localizerModelId()`
    - Cover: env unset/empty → `gemini-2.5-flash`; env set to non-empty → returned verbatim.
    - Save/restore `process.env.GEMINI_LOCALIZER_MODEL` around each case.
    - _Requirements: 2.2, 2.3_

- [x] 2. Create the PURE Window_Resolver logic module
  - [x] 2.1 Implement `localization-window.logic.ts`
    - Create `server/features/video-editor/services/localization-window.logic.ts` mirroring the
      structure and JSDoc discipline of `highlight-selection.logic.ts` and the clamp / `MIN_WINDOW_MS` /
      whole-clip-epsilon idioms of `edit-range.logic.ts`.
    - Export types `CandidateRange`, `LocalizationWindow`, `WindowResolverOptions`, `WindowResolution`
      and constants `DEFAULT_MAX_WINDOWS = 3`, `MIN_WINDOW_MS = 500`, `MERGE_GAP_MS = 250`,
      `WHOLE_CLIP_EPS_MS = 300`, `DEFAULT_MIN_CONFIDENCE = 0.3`.
    - Export `resolveLocalizationWindows(candidates, sourceDurationMs, options?)` implementing the
      7-step deterministic algorithm exactly: (1) non-finite/≤0 duration → `whole-clip`;
      (2) sanitize (finite bounds, order, confidence floor, clamp to `[0, dur]`, expand sub-min
      survivors); (3) empty after sanitize → `whole-clip`; (4) sort + merge overlapping/adjacent
      (`gap <= mergeGapMs`); (5) whole-clip promotion within `wholeClipEpsMs`; (6) cap to `maxWindows`
      keeping longest then re-sort chronologically; (7) final min-length filter → `whole-clip` if none.
    - PURE/TOTAL: no IO, no clock, no randomness, never throws; ESM static imports only; string-first
      logger only if any logging is added (prefer none).
    - Verify with `tsc --noEmit` grep-filtered to `localization-window.logic.ts` only.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3, 6.4, 6.5, 8.1, 8.5_

- [x] 3. Property tests for the Window_Resolver (all 10 correctness properties)
  - [x] 3.1 Write property test — Property 1: Clamping
    - **Property 1: Clamping** — every returned window `w` satisfies `0 <= w.startMs < w.endMs <= sourceDurationMs`.
    - Min 100 iterations; tag `Feature: generative-edit-localization, Property 1: Clamping`.
    - Create `tests/localization-window.logic.test.ts` if absent.
    - **Validates: Requirements 5.1**

  - [x] 3.2 Write property test — Property 2: Minimum window
    - **Property 2: Minimum window** — every returned segment window satisfies
      `endMs - startMs >= minWindowMs`, or the result is the whole-clip signal.
    - Min 100 iterations; tag `Feature: generative-edit-localization, Property 2: Minimum window`.
    - **Validates: Requirements 5.6**

  - [x] 3.3 Write property test — Property 3: Max windows cap
    - **Property 3: Max windows cap** — for any `maxWindows >= 1`, when `kind === 'windows'` the count
      is `<= maxWindows` (default 3).
    - Min 100 iterations; tag `Feature: generative-edit-localization, Property 3: Max windows cap`.
    - **Validates: Requirements 5.2, 5.3, 7.2**

  - [x] 3.4 Write property test — Property 4: Sorted ascending
    - **Property 4: Sorted ascending** — for consecutive windows `a` then `b`, `a.startMs < b.startMs`.
    - Min 100 iterations; tag `Feature: generative-edit-localization, Property 4: Sorted ascending`.
    - **Validates: Requirements 5.5**

  - [x] 3.5 Write property test — Property 5: Non-overlapping
    - **Property 5: Non-overlapping** — for consecutive windows `a` then `b`, `a.endMs <= b.startMs`.
    - Min 100 iterations; tag `Feature: generative-edit-localization, Property 5: Non-overlapping`.
    - **Validates: Requirements 5.4, 5.5**

  - [x] 3.6 Write property test — Property 6: Merge idempotence
    - **Property 6: Merge idempotence** — feeding the resolver's own returned windows back in as
      candidates yields the same windows.
    - Min 100 iterations; tag `Feature: generative-edit-localization, Property 6: Merge idempotence`.
    - **Validates: Requirements 5.4**

  - [x] 3.7 Write property test — Property 7: Whole-clip promotion
    - **Property 7: Whole-clip promotion** — candidate sets whose merged windows cover
      `[0, sourceDurationMs]` within `wholeClipEpsMs` yield the whole-clip signal.
    - Min 100 iterations; tag `Feature: generative-edit-localization, Property 7: Whole-clip promotion`.
    - **Validates: Requirements 5.7**

  - [x] 3.8 Write property test — Property 8: Never-empty-when-segment
    - **Property 8: Never-empty-when-segment** — when `kind === 'windows'` there is `>= 1` window and
      every window is non-empty; when no valid window can be produced the result is `whole-clip`.
    - Min 100 iterations; tag `Feature: generative-edit-localization, Property 8: Never-empty-when-segment`.
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [x] 3.9 Write property test — Property 9: No fabrication (No-Mock)
    - **Property 9: No fabrication** — every returned window's bounds trace to a clamp/merge of the
      supplied candidates; empty input always yields `whole-clip`, never a window.
    - Min 100 iterations; tag `Feature: generative-edit-localization, Property 9: No fabrication`.
    - **Validates: Requirements 6.5**

  - [x] 3.10 Write property test — Property 10: Determinism and totality
    - **Property 10: Determinism and totality** — for any input (empty, out-of-order, negative, NaN,
      over-duration) the resolver returns a defined result, never throws, and identical inputs produce
      identical outputs.
    - Min 100 iterations; tag `Feature: generative-edit-localization, Property 10: Determinism and totality`.
    - Run the property test file with `vitest run tests/localization-window.logic.test.ts` only.
    - **Validates: Requirements 5.8**

- [x] 4. Checkpoint — pure core verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create the EditLocalizationService IO shell
  - [x] 5.1 Scaffold `edit-localization.service.ts` types, deps, and config resolution
    - Create `server/features/video-editor/services/edit-localization.service.ts` with ESM static
      imports only and the string-first logger.
    - Define `FrameSampleRunner`, `LocalizationConfig`, `EditLocalizationDeps` (logger, storage,
      clientFactory, frameRunner, ffmpegPath, tempDir, config — all injectable/defaulted mirroring
      `GenerativeVideoDeps` / `RenderEngineServiceDeps`), and `LocalizeInput`.
    - Implement env-with-default config resolution: `LOCALIZER_SAMPLE_FPS` (1, invalid/≤0→default),
      `LOCALIZER_FRAME_HEIGHT` (360, invalid→default), `LOCALIZER_MAX_WINDOWS` (3, invalid/<1→default),
      `LOCALIZER_MIN_CONFIDENCE` (0.3), model via `localizerModelId()`.
    - Verify with `tsc --noEmit` grep-filtered to `edit-localization.service.ts` only.
    - _Requirements: 2.1, 3.4, 3.5, 5.3, 6.2, 8.1, 8.2_

  - [x] 5.2 Implement Frame_Sampler
    - Add the private Frame_Sampler that downloads source bytes via `storage.downloadFile(sourceStorageKey)`
      (same as `editVideo`), writes a temp input, and runs the injected `frameRunner` with the exact
      deterministic arg vector: `-i <inputPath> -vf fps=<sampleFps>,scale=-2:<frameHeight> -q:v 4 -f image2 <workDir>/frame-%04d.jpg`.
    - Default runner reuses the same `spawn(ffmpegPath, args, …)` promise shape as
      `RenderEngineService.createDefaultRunner` (resolve on exit 0, reject with stderr tail) — no new
      FFmpeg abstraction.
    - Read produced JPEGs into base64. On ANY error or zero frames → log string-first warn, stream note,
      return `{ kind: 'whole-clip' }`. Wrap in try/finally with temp-dir cleanup (mirror `editVideo`).
    - Verify with `tsc --noEmit` grep-filtered to `edit-localization.service.ts` only.
    - _Requirements: 3.1, 3.2, 3.3, 7.4, 8.3_

  - [x] 5.3 Implement Vision_Localizer + `localize` orchestration + `getEditLocalizationService`
    - Add the private Vision_Localizer: build the JSON-only vision prompt (frame count, fps,
      per-frame timestamp mapping, instruction, duration, exact `{ "ranges": [...] }` schema), call
      `clientFactory(apiKey).models.generateContent({ model: localizerModelId(), contents: [...] })`
      with one `inlineData` JPEG part per frame plus the text prompt (reusing the `GenerativeVideoClient`
      structural interface).
    - Copy the balanced-brace `extractFirstJsonObject` idiom locally (pure helper); parse into
      `CandidateRange[]`. On throw / empty response / missing-`ranges` / malformed → `{ kind: 'whole-clip' }`.
    - Implement `EditLocalizationService.localize(input)`: compose Frame_Sampler → Vision_Localizer →
      `resolveLocalizationWindows(candidates, sourceDurationMs, { maxWindows, minConfidence })`, return
      its result directly. NEVER throws; every failure resolves to `{ kind: 'whole-clip' }` with an
      honest streamed note.
    - Add `getEditLocalizationService()` shared singleton (mirror `getGenerativeVideoService`).
    - Verify with `tsc --noEmit` grep-filtered to `edit-localization.service.ts` only.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 6.4, 6.5, 8.4_

  - [x] 5.4 Write unit tests for EditLocalizationService with injected fakes
    - Use fake `frameRunner` (writes N stub JPEGs or throws), fake `clientFactory` returning
      canned JSON / empty / throwing `generateContent`, and fake `storage.downloadFile`. No network,
      no FFmpeg.
    - Cover the failure→whole-clip mapping table: source download fails, FFmpeg sampling fails, zero
      frames, `generateContent` throws, empty/text-only response, malformed/missing-`ranges`,
      `{ "ranges": [] }`, all-below-confidence, and a valid ranges → `kind: 'windows'` happy path.
    - Assert the Frame_Sampler arg vector is constructed exactly as specified (fps, scale, image2).
    - _Requirements: 3.1, 3.2, 4.1, 4.4, 6.1, 6.2, 6.3, 6.4_

- [x] 6. Checkpoint — localization service verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Wire the localizer into the chat-video-edit global branch
  - [x] 7.1 Add `editLocalizer` dep and `runLocalizedWindows` helper, replace the global branch body
    - In `server/features/video-editor/services/chat-video-edit.service.ts`, add
      `editLocalizer?: Pick<EditLocalizationService, 'localize'>` to `ChatVideoEditDeps`, defaulted to
      `getEditLocalizationService()`.
    - In the `if (scope.mode === 'global' || !scope.range)` block (~L1303), call
      `editLocalizer.localize({ … sourceStorageKey, sourceFileName, instruction, sourceDurationMs, onProgress })`.
      On `kind: 'whole-clip'` run the CURRENT whole-clip `generativeVideo.editVideo` byte-for-byte
      unchanged. On `kind: 'windows'` call the new `runLocalizedWindows(resolution.windows, ctx)`.
      Leave the `else` explicit-segment block, `isGenerateKind`, deterministic ops, and captions
      untouched.
    - Implement private `runLocalizedWindows`: walk windows with a `cursor` from 0, emitting
      head/gap trim pieces (`editor.execute({ kind: 'trim' })`), edited window pieces
      (`trim → generativeVideo.editVideo(Omni)`), and a final tail piece; per-window No-Mock check
      (any `editVideo` `outcome !== 'rendered'` → abandon splice, fall back to single whole-clip
      `editVideo` with honest note); single-piece short-circuit; otherwise
      `editor.executeAssembly({ sources: pieces, targetWidth, targetHeight, fps })`; set
      `appliedLabelOverride` to `AI edit (localized: <k> window(s))` using `formatTimestamp`.
    - Reuse existing primitives ONLY — no new render/trim/ingestion/splice logic.
    - Verify with `tsc --noEmit` grep-filtered to `chat-video-edit.service.ts` only.
    - _Requirements: 1.1, 1.5, 6.5, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2_

  - [x] 7.2 Write wiring tests for the global branch
    - With a fake `editLocalizer.localize` returning `kind: 'windows'`: assert the segment-scoped path
      is taken (trim + editVideo per window) and `executeAssembly` (splice) is invoked.
    - With a fake returning `kind: 'whole-clip'`: assert the current whole-clip `editVideo` behavior is
      unchanged (no trim/assembly).
    - Assert an explicit range (`parseEditRange` → `mode: 'segment'`) still bypasses the localizer
      entirely (localizer `localize` never called).
    - Add to `tests/` following the existing `video-editor-chat-*.test.ts` convention; run only the new
      wiring test file with vitest.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 7.3_

- [x] 8. Document the localization env vars in `.env.example`
  - [x] 8.1 Add the env var doc block to `.env.example`
    - Add a documented block covering all 5 env vars with their defaults: `GEMINI_LOCALIZER_MODEL`
      (`gemini-2.5-flash`), `LOCALIZER_SAMPLE_FPS` (`1`), `LOCALIZER_FRAME_HEIGHT` (`360`),
      `LOCALIZER_MAX_WINDOWS` (`3`), `LOCALIZER_MIN_CONFIDENCE` (`0.3`).
    - The two pre-existing generative model vars already have `.env` values — only document the new
      localizer vars here; do not modify `.env` secrets.
    - _Requirements: 2.2, 2.3, 3.4, 3.5, 5.3, 6.2_

- [x] 9. Final checkpoint — ensure all new/related tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP, but the property
  tests validate the pure resolver's 10 correctness guarantees and are strongly recommended.
- Each task references specific granular requirements for traceability.
- Verification is scoped: `tsc --noEmit` is grep-filtered to only the touched file, and only the
  new/related vitest files are run — never the full build or full suite.
- Property tests run a minimum of 100 iterations each and are tagged
  `Feature: generative-edit-localization, Property <n>: <text>`.
- The feature reuses existing primitives only (FFmpeg runner, `GenerativeVideoClient`,
  `editor.execute`, `generativeVideo.editVideo`, `editor.executeAssembly`) and never fabricates a
  window (No-Mock, Req 6).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "8.1"] },
    { "id": 1, "tasks": ["1.2", "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "5.1"] },
    { "id": 2, "tasks": ["5.2"] },
    { "id": 3, "tasks": ["5.3"] },
    { "id": 4, "tasks": ["5.4", "7.1"] },
    { "id": 5, "tasks": ["7.2"] }
  ]
}
```
