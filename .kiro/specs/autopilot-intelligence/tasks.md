# Tasks — Auto Pilot Intelligence Overhaul

- [x] 1. Model: per-media intent/keyword + vision cache shape
  - Added `userIntent?`, `userKeyword?` to `MediaPoolItemModel` (+ interface + schema).
  - _Requirements: 3.1_

- [x] 2. VisionGroundingService (analyze-once + cache)
  - New service with injected `analyze` + `store` ports; timeout + degrade.
  - Persists `{ description, analyzedAt }` via `setVisionAnalysis`.
  - Unit tests: cache hit, miss+persist, failure→undefined, timeout, grounding fold.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3. ContentMatcher (deterministic vision-aware pick)
  - New pure service scoring theme↔description overlap; format filter; no
    double-assign; fallback to oldest when no descriptions.
  - Unit tests: best-match, fallback, format filter, dedupe, none-eligible.
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 4. AutomationDecisionService: grounding + user-keyword override
  - `decide(..., { grounding })`; description + intent + user keyword in prompt;
    override `triggerKeyword` with normalized `userKeyword` when present.
  - Unit tests: override (comment-to-dm, dm-only), prompt grounding, safe default.
  - _Requirements: 3.3, 3.4, 4.1, 4.2, 4.3_

- [x] 5. gateActStage wiring
  - Resolve media FIRST; build `MediaGrounding` (vision + intent/keyword); use
    `ContentMatcher` in `ensureSlotMedia`; pass grounding into caption + decide.
  - _Requirements: 1.x, 2.1, 2.2, 2.3, 4.1, 5.1_

- [x] 6. Caption drafting grounded (R2)
  - `draftCaptionFallback(..., grounding)` includes description; instructs the
    model to write about what's shown; theme-only fallback preserved.
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 7. Upload path carries intent/keyword
  - `MediaPoolService.addUpload`/`MediaUploadInput` + `media.controller.uploadMedia`
    accept `userIntent`/`userKeyword`; serializer exposes them; client
    `uploadMedia(meta)` + `MediaUploadCard` per-upload intent/keyword inputs +
    per-tile keyword badge.
  - _Requirements: 3.2_

- [x] 8. Reasoned planning
  - THINK now grounds the strategy in the mission's available media inventory
    (cached vision descriptions + user intent, gathered in the loop's THINK step)
    and is instructed to (a) choose themes matching available media, (b) bias
    cadence toward audience best-post-times in the analytics, and (c) prefer the
    formats/themes the LEARN insights show performed best. The MEASURE→LEARN→THINK
    feedback loop (LEARN writes `bestFormat`/`bestTheme`; THINK consumes
    `strategyMemory`+`progress`) is preserved and now explicitly leveraged.
  - Unit tests: inventory appears in the THINK prompt; empty-inventory note.
  - _Requirements: 6.1, 6.2_
