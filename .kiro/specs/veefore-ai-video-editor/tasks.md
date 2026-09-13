# Implementation Plan: Veefore AI Video Editor

## Overview

This plan converts the design into incremental, test-driven coding tasks in **TypeScript** (the language the design and repository already use — Express/Mongoose backend, React frontend, `vitest` + `fast-check` test stack). It follows the design's six implementation phases:

1. **Foundation** — feature module, config single-source, credit feature, Mongoose models, capability registry, storage/provenance, job-system skeleton, API + auth guards.
2. **Intelligence** — Intent_Router, Media_Ingestion_Service, Video_Analysis_Service, Editing_Planner.
3. **Deterministic editing** — Model_Router (deterministic-first), Deterministic_Editor, Timeline_Engine, Caption_Renderer, Render_Engine + Quality_Controller (Acceptance Test A becomes runnable).
4. **Generative editing** — credit metering via `runMetered`, segmentation, prompt compiler, provider adapters, Generative_Editor, SSRF guard.
5. **Autonomous editing** — immutable versioning, variants, conversational multi-turn editing, job progress/cancel.
6. **Production hardening** — security/no-mock integrity, observability + admin analytics, frontend surface, end-to-end acceptance suites (Req 24).

Every pure core is a `*.logic.ts` module (matching the `veegpt-*.logic.ts` convention) exercised by `fast-check` property tests at **≥100 runs** with a traceability tag. Each component is wired into the app as it is built — no orphaned code.

Conventions grounded in the existing codebase:
- Metering: `aiCreditMeteringService.runMetered(...)` (`server/features/subscription/services/AICreditMeteringService.ts`); credit feature union + `CREDIT_MODEL` in `server/config/plan-config.ts`; usage feature `video.generation` in `server/services/aiUsageTracker.ts`.
- Storage: `StorageService`/`getStorageService()` and `VideoStorageService` (FFprobe + fluent-ffmpeg thumbnails).
- Queues: BullMQ `getSharedRedisConnection()` + lazy `getWorker()` pattern (`server/queues/aiQueue.ts`, `researchQueue.ts`).
- Routing precedent: `server/services/ai-model-routing.ts`; model-call audit `recordModelCall` (`server/services/ai-call-log.ts`).
- Intent: extend `server/routes/veegpt-intent.logic.ts`; chat transport `useChatStream` NDJSON.
- Frontend: `client/src/components/layout/sidebar.tsx` (`sidebarGroups`, `getActiveViewFromLocation`), `client/src/AuthenticatedApp.tsx` (`<ProtectedRoute>`).
- Logging: pino `logger` (`server/config/logger.ts`); models use `mongoose.models.X || mongoose.model(...)` under `server/models/VideoEditor/`, re-exported from `server/models/index.ts`; routes mounted `app.use('/api/video-editor', router)` in `server/routes.ts`.
- Tests live in `tests/*.logic.test.ts` (property/unit) and `tests/*.integration.test.ts`.

## Tasks

- [x] 1. Foundation: feature module, config, credit feature, and data models
  - [x] 1.1 Scaffold feature module and single-source configuration
    - Create `server/features/video-editor/{services,api}/` and `client/src/features/video-editor/` module skeletons (mirroring `server/features/storage/` and `client/src/features/video-generator/`)
    - Create `server/features/video-editor/config/video-editor.config.ts` as the single source for Platform_Preset definitions (aspect ratio, recommended duration, safe areas, caption behavior, pacing, export profiles), brand-aware defaults, loudness/true-peak targets, silence thresholds (-40 dB / 0.5 s), confidence threshold (0.70), QC thresholds, and job/timeout limits — referenced by every consumer
    - _Requirements: 13.1_
  - [x] 1.2 Register the video credit feature
    - Add `videoGenerativeEdit` to the `AICreditFeature` union and `CREDIT_MODEL` (dynamic mode, floor/ceiling tuned for video) in `server/config/plan-config.ts`; confirm/ensure `video.generation` `AIFeature` exists in `server/services/aiUsageTracker.ts`
    - _Requirements: 17.1_
  - [x] 1.3 Create Mongoose models under `server/models/VideoEditor/`
    - Implement `VideoProject`, `VideoSource`, `VideoVersion`, `VideoTimeline`, `VideoEditOperation`, `VideoEditJob`, `VideoArtifact` using the `mongoose.models.X || mongoose.model(...)` idiom with `{ timestamps: true }` and indexes on `userId`, `workspaceId`, `projectId`, `jobId`, `status`, `createdAt`; re-export from `server/models/index.ts`
    - _Requirements: 16.11_
  - [x] 1.4 Write example test for preset single-source resolution
    - Assert every consumer reads a changed preset value from `video-editor.config.ts` with no code change
    - **Property 33: Preset values resolve from a single source everywhere**
    - **Validates: Requirements 13.1**

- [x] 2. Provider Capability Registry
  - [x] 2.1 Implement `provider-capability-registry.logic.ts` (pure core)
    - `register` (rejects records missing any required field, naming the field), `lookup` (explicit `{supported:false}` for unknown), `candidatesFor(operationType)`, `isDeterministicPerformable(kind)`, append-only versioning
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 6.3_
  - [x] 2.2 Write property tests for the capability registry
    - **Property 18: Capability records missing any required field are rejected** — **Validates: Requirements 7.2**
    - **Property 19: Unknown provider/model yields an explicit unsupported result** — **Validates: Requirements 7.4**
    - **Property 20: Capability versioning is append-only** — **Validates: Requirements 7.5**
  - [x] 2.3 Implement DB-backed registry service and seed capability data
    - Persist `VideoModelCapabilities` records (version history, append-only) in MongoDB; seed Gemini Omni / Veo records and the deterministic-performable operation-kind set (trim, cut, concat, crop, resize, aspect, fps, audio, captions, speed, fades, encode)
    - _Requirements: 7.1, 7.3, 7.5, 6.3_

- [x] 3. Storage layout and artifact provenance
  - [x] 3.1 Implement `artifact-provenance.logic.ts` (pure core)
    - Validate single-category (one of eight) and complete provenance (jobId, inputVersionId, provider, model, prompt, cost); reject with named missing fields; deterministic engine identifier (`ffmpeg`) fills provider/model for deterministic artifacts
    - _Requirements: 20.1, 20.2, 20.3_
  - [x] 3.2 Write property test for artifact provenance/immutability
    - **Property 49: Artifacts are single-category, provenance-complete, and immutable**
    - **Validates: Requirements 20.1, 20.2, 20.3, 20.4**
  - [x] 3.3 Implement artifact repository over `StorageService`
    - Write artifacts to `video-editor/{projectId}/{category}/` via `StorageService.uploadFile({ folder })`; treat stored bytes as immutable (never overwrite); persist `VideoArtifact` metadata with provenance
    - _Requirements: 20.1, 20.4_

- [x] 4. Job system foundation (BullMQ)
  - [x] 4.1 Implement `job-state.logic.ts` (pure core)
    - Single-valued state machine over `{QUEUED,PREPARING,UPLOADING,ANALYZING,PLANNING,EDITING,RENDERING,QUALITY_CHECK,COMPLETED,FAILED,CANCELLED,RETRYING}` with COMPLETED/FAILED/CANCELLED absorbing; stage-derived monotonic integer progress 0–100; indeterminate when completion state unknown
    - _Requirements: 18.2, 18.4, 23.2, 23.6_
  - [x] 4.2 Write property tests for job state and progress
    - **Property 43: Job state is single-valued with terminal absorbing states** — **Validates: Requirements 18.2**
    - **Property 8: Progress is stage-derived, monotonic, and never prematurely complete** — **Validates: Requirements 3.11, 18.4, 23.2, 23.6**
  - [x] 4.3 Add five queues and lazy workers under `server/queues/`
    - `video-analysis`, `video-generation` (`attempts:1`), `video-render`, `video-qc`, `video-cleanup` (≤3 backoff retries), following the `getSharedRedisConnection()`/`null`-when-absent/lazy `getWorker()` pattern; deterministic job ids `ve-{type}-{projectId}-{versionId}-{opId}`
    - _Requirements: 18.1, 18.6, 18.7_
  - [x] 4.4 Implement `Job_System` service
    - Assign idempotency key, attempt (from 1), configurable timeout ≤3600 s, input/output artifact refs; cancellation within 5 s (mark CANCELLED, stop stages, abort provider via `AbortSignal`, remove temp files, reconcile credits); timeout/attempts-exhausted → FAILED + release credits; idempotent retries ≤3
    - _Requirements: 18.3, 18.5, 18.6, 18.7, 18.8, 18.9_

- [x] 5. API foundation, ownership guards, and route registration
  - [x] 5.1 Implement Video_Project CRUD routers mounted at `/api/video-editor`
    - Guard every route with `requireAuth` then `validateWorkspaceAccess` + per-project ownership; scope reads/CRUD to the requester's active workspace; use `{ success, data | error:{code,message} }` envelope; non-owner → 403 with no data; missing/unknown project → convention error with no mutation
    - _Requirements: 21.1, 21.2, 21.3, 19.1, 19.2_
  - [x] 5.2 Write property/example tests for isolation and input validation
    - **Property 45: Non-owners are denied with no data leakage** — **Validates: Requirements 19.1, 19.2, 21.2, 21.3**
    - **Property 51: Invalid endpoint input is rejected without mutating state** — **Validates: Requirements 21.6**
  - [x] 5.3 Register routes and implement signed-URL artifact endpoint
    - Mount router in `server/routes.ts`; add `GET /api/video-editor/artifacts/:artifactId/signed-url` returning a `StorageService.getSignedUrl` link ≤3600 s (never a permanent public path); reject expired/invalid links
    - _Requirements: 19.3, 19.4, 21.1_
  - [x] 5.4 Write property test for signed-URL delivery
    - **Property 46: Artifacts are served only via short-lived signed URLs**
    - **Validates: Requirements 19.3**

- [x] 6. Intent_Router
  - [x] 6.1 Extend the VeeGPT capability gate for video editing
    - Add `video_edit` to the `Capability` union and `FORCED_TOOL_CAPABILITY['video_editor']='video_edit'` in `server/routes/veegpt-intent.logic.ts`; hybrid gate uses attached-video signal + keyword signals (never keyword-alone)
    - _Requirements: 2.1_
  - [x] 6.2 Implement `intent-extraction.logic.ts` (pure core)
    - Produce `VideoIntent` with explicit `null` unspecified sentinels; set `requiresGenerativeAI`/`requiresDeterministicEditing` as exact biconditionals; select max-confidence candidate; below-threshold (0.70) → clarification with no state change; treat extracted media/OCR/caption text as inert data
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [x] 6.3 Write property tests for intent extraction
    - **Property 1: Intent generative/deterministic flags are exact biconditionals** — **Validates: Requirements 2.4, 2.5**
    - **Property 2: Unspecified intent fields carry the explicit unspecified sentinel** — **Validates: Requirements 2.3**
    - **Property 3: Highest-confidence intent is selected** — **Validates: Requirements 2.2**
    - **Property 4: Below-threshold confidence changes nothing** — **Validates: Requirements 2.6**
    - **Property 5: Extracted media text is never executed as instruction** — **Validates: Requirements 2.7**
  - [x] 6.4 Implement `intent-router.service.ts` structured extraction
    - Wire the pure gate + LLM structured extraction via `AIServiceManager` (token usage captured by `collectAIUsage`); classify within 5 s; return `VideoIntent`
    - _Requirements: 2.1_

- [x] 7. Media_Ingestion_Service
  - [x] 7.1 Implement `media-ingestion-validation.logic.ts` (pure core)
    - Accept iff actual byte-signature is MP4/MOV/WebM/AVI/MPEG and size ∈ [1 B, 10,240 MB]; signature validation precedes any persistence decision; boundary cases (1 B, 10,240 MB, +1)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 7.2 Write property test for ingestion validation
    - **Property 6: Ingestion accepts exactly the supported, in-range media and persists nothing otherwise**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
  - [x] 7.3 Implement `media-ingestion.service.ts`
    - `validateAndAccept` (reject before storing; no `Video_Source`/bytes on rejection), store original immutably via `StorageService`, `probeAndPrepare` reusing `VideoStorageService` FFprobe + thumbnails and adding proxy + waveform as artifacts; resumable/object-storage upload for >100 MB; stage-derived monotonic progress (never 100 % early); FFprobe failure → ingestion failed, bytes retained
    - _Requirements: 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 20.4_
  - [x] 7.4 Write integration test for source immutability and probe failure
    - Assert original bytes/metadata unchanged across subsequent operations, and FFprobe failure marks ingestion failed while retaining bytes
    - **Property 7: Source bytes are immutable for the source lifetime**
    - **Validates: Requirements 3.6, 3.8, 8.4, 24.5**

- [x] 8. Video_Analysis_Service
  - [x] 8.1 Implement `audio-analysis.logic.ts` (pure core)
    - Silence classification (below configured threshold continuously ≥ min duration); analysis well-formedness helpers (transcript/hook/moment segments with `startMs<endMs`, in-bounds, confidence ∈ [0,1])
    - _Requirements: 4.3, 4.5, 4.6_
  - [x] 8.2 Write property tests for analysis logic
    - **Property 11: Silence classification matches its definition** — **Validates: Requirements 4.5**
    - **Property 10: Analysis scores and transcript segments are well-formed and in-bounds** — **Validates: Requirements 4.3, 4.6**
  - [x] 8.3 Implement `video-analysis.service.ts`
    - Deterministic scene detection (FFmpeg) before AI semantic enrichment; transcript (empty + completed when no speech), audio features, decision-support scores; mark completed only when all fields populated; persist completed analysis as artifact and reuse it; enrichment-unavailable keeps deterministic results uncompleted; failure records error code with no reusable partial
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.7, 4.8, 4.9, 4.10, 4.11_
  - [x] 8.4 Write unit tests for analysis ordering, completion, and reuse
    - **Property 9: Deterministic scene detection precedes AI enrichment** — **Validates: Requirements 4.2**
    - **Property 12: Completion implies fully-populated analysis; failure yields no reusable partial** — **Validates: Requirements 4.7, 4.10, 4.11**
    - **Property 13: Completed analysis is reused idempotently** — **Validates: Requirements 4.9**
  - [x] 8.5 Wire analysis into the `video-analysis` queue/worker and analyze/analysis endpoints
    - `POST /api/video-editor/projects/:id/analyze`, `GET .../analysis`; enqueue async, stage-derived progress
    - _Requirements: 18.1, 21.4_

- [x] 9. Editing_Planner
  - [x] 9.1 Implement `editing-planner.logic.ts` (pure core)
    - Non-null `EditingPlan` with ordered sequence indices; each op exactly one type; every range `startMs≥0`, `endMs>startMs`, within source duration; attach preservation constraints where range overlaps a Protected_Element; unavailable ops carry limitation and are not executable; unfulfillable intent → empty/error-only plan; apply Platform_Preset (reject unknown platform, leave plan unchanged) and brand profile (reject when absent); variant fan-out 1–5, reject >5
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 13.2, 13.3, 13.4, 13.5, 16.9, 16.10_
  - [x] 9.2 Write property tests for the planner
    - **Property 14: Every editing plan is well-formed and never null** — **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
    - **Property 34: Unsupported platform or missing brand leaves the plan unchanged; violations block render/export** — **Validates: Requirements 13.3, 13.5, 13.7**
    - **Property 39: Variant requests are bounded and independent** — **Validates: Requirements 16.9, 16.10**
  - [x] 9.3 Implement `editing-planner.service.ts` and plan endpoint
    - Thin service calling the LLM for goal/style reasoning; `POST /api/video-editor/projects/:id/plan`
    - _Requirements: 5.1, 21.4_

- [x] 10. Model_Router
  - [x] 10.1 Implement `model-router.logic.ts` (pure core)
    - Deterministic-performable kinds → `deterministic` with no provider candidate considered; otherwise select from registry candidates supporting the op type, exclude unhealthy, pick highest `priorityRank` then registry order; no candidate after fallback → `unavailable` with reason; record provider/model/reason; recovered provider re-included for later ops
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 8.1, 8.2_
  - [x] 10.2 Write property tests for routing
    - **Property 15: Deterministic-performable operations never call a generative provider** — **Validates: Requirements 6.1, 6.2, 8.1, 8.2, 24.1**
    - **Property 16: Generative provider selection is capability-, health-, and priority-correct** — **Validates: Requirements 6.3, 6.4, 6.5, 6.7, 6.8**
    - **Property 17: Every non-deterministic routing decision records provider, model, and reason** — **Validates: Requirements 6.6**
  - [x] 10.3 Implement `model-router.service.ts` with health tracking and audit
    - Provider health view + `recordModelCall` (reusing `ai-call-log.ts`) writes selected provider/model/reason into the operation's routing record
    - _Requirements: 6.6, 6.7, 6.8_

- [x] 11. Deterministic_Editor
  - [x] 11.1 Implement `deterministic-editor.service.ts` core FFmpeg operations
    - trim/cut/crop/resize/aspect/fps/speed/fades/encode via fluent-ffmpeg; read source bytes unmodified; produce exactly one traceable `Video_Artifact` on success; failure records error code, marks job failed, no artifact; never calls a provider
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_
  - [x] 11.2 Implement audio processing and `silence-removal.logic.ts` (pure core)
    - Loudness normalization to configured target ±1.0 LU with true-peak ceiling; silence removal using analysis silence segments only, keeping every speech segment uncut, removing nothing unless explicitly requested; block + error when a requested silence range overlaps speech; keep original voice byte-identical unless a voice change is requested
    - _Requirements: 8.5, 12.1, 12.2, 12.3, 12.4_
  - [x] 11.3 Write property tests for audio processing
    - **Property 31: Silence removal removes only silence and never touches speech** — **Validates: Requirements 12.2, 12.3, 8.5**
    - **Property 32: Original voice is byte-identical unless a voice change is requested** — **Validates: Requirements 12.4**
  - [x] 11.4 Write integration tests for deterministic artifacts and loudness
    - **Property 21: A successful deterministic operation yields exactly one traceable artifact; a failed one yields none** — **Validates: Requirements 8.3, 8.6**
    - **Property 30: Loudness normalization stays within tolerance and ceiling** — **Validates: Requirements 12.1**
  - [x] 11.5 Wire deterministic operations into the edits endpoint and timeline update
    - `POST /api/video-editor/projects/:id/edits` routes deterministic ops through Model_Router → Deterministic_Editor → Timeline_Engine update
    - _Requirements: 8.1, 21.4_

- [x] 12. Timeline_Engine
  - [x] 12.1 Implement `timeline-engine.logic.ts` (pure core)
    - Maintain sequences/tracks/clips/audio/caption/effects/transitions at 1 ms resolution; reject invalid placements (negative start, `start≥end`, out-of-range track) and invalid source timings (negative in, `out≤in`, out>source duration) without mutating the model; store source in/out independent of timeline start/end; deterministic FFmpeg command generation from the model with fixed encoder settings
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  - [x] 12.2 Write property tests for the timeline engine
    - **Property 26: Invalid timeline placements and source timings are rejected without mutating the model** — **Validates: Requirements 10.3, 10.6**
    - **Property 27: Clip source in/out points are independent of timeline placement** — **Validates: Requirements 10.5**
    - **Property 28: Rendering an unchanged timeline is deterministic** — **Validates: Requirements 10.4, 11.3, 15.1**
  - [x] 12.3 Implement `timeline-engine.service.ts` persistence
    - Persist `VideoTimeline` snapshots per version; expose updated state within 100 ms of accepting an operation
    - _Requirements: 10.1, 10.2_

- [x] 13. Caption_Renderer
  - [x] 13.1 Implement `caption-layout.logic.ts` (pure core)
    - Word-level timing when available, else segment/phrase-level (never fails); position within preset safe areas; wrap to max characters-per-line; ≥4.5:1 contrast treatment
    - _Requirements: 11.1, 11.2, 11.4, 11.5, 11.6_
  - [x] 13.2 Write property test for caption layout
    - **Property 29: Rendered captions respect safe areas, line length, and contrast**
    - **Validates: Requirements 11.4, 11.5, 11.6**
  - [x] 13.3 Implement `caption-renderer.service.ts` (FFmpeg, deterministic)
    - Deterministic burn-in (same captions+preset+typography → identical output); apply workspace brand typography with default fallback + indication on failure
    - _Requirements: 11.3, 11.7, 11.8_

- [x] 14. Render_Engine and Quality_Controller
  - [x] 14.1 Implement `quality-controller.logic.ts` (pure core)
    - Existence/non-empty check first; classify quality failure iff black ≥0.5 s, frozen ≥2.0 s, audio absent/100 %-silent, duration off >0.5 s, or artifacts ≥25 % frame area; validate container/codec/dims/fps/audio-stream-count vs requested; pure render-validation predicate (size ≥ profile min, stream/codec/dims match, duration ±0.5 s, fps ±0.01, audio when expected); bounded repair-attempt counter (max 3) + revert fallback
    - _Requirements: 14.1, 14.2, 14.3, 14.5, 14.6, 14.7, 15.2, 15.3, 15.4, 15.5_
  - [x] 14.2 Write property tests for QC classification and repair bounding
    - **Property 35: QC classifies quality failures exactly per definition and checks existence first** — **Validates: Requirements 14.1, 14.2, 14.3**
    - **Property 36: Repair attempts are bounded and terminal failure preserves the prior valid version** — **Validates: Requirements 14.5, 14.6, 14.7**
  - [x] 14.3 Write property test for render-validation soundness
    - **Property 37: Render validation is sound — success implies a valid file, failure never exposes success**
    - **Validates: Requirements 15.2, 15.3, 15.4, 15.5, 15.6, 15.7**
  - [x] 14.4 Implement `render-engine.service.ts` (FFmpeg + FFprobe)
    - Render timeline to MP4/H.264/AAC (or configured profile); run the render-validation predicate; all pass → job COMPLETED; any fail → job FAILED with error code, input version retained, output not exposed as success; `POST /api/video-editor/projects/:id/render`
    - _Requirements: 15.1, 15.6, 15.7, 21.4_
  - [x] 14.5 Implement `quality-controller.service.ts` + repair loop and wire QC/render queues
    - Drive repair strategies (retry / simplified prompt / deterministic fallback / alternative provider / user clarification) ≤3 then revert; run render + QC through `video-render`/`video-qc` workers; never mark corrupted output as success
    - _Requirements: 14.4, 14.5, 14.6, 14.7, 18.1_

- [x] 15. Checkpoint — deterministic pipeline
  - Ensure all tests pass, ask the user if questions arise. (Acceptance Test A path — deterministic edit → render → QC — is now runnable end-to-end.)

- [x] 16. Credit metering integration
  - [x] 16.1 Implement `credit-reconciliation.logic.ts` (pure core)
    - Pure model of reserve→measure→reconcile mirroring `computeCreditCharge`/`adjustReservation`: net deduction equals measured usage; full release on failure/abort with zero net; at-most-once under an idempotency key across retries; server-side balance/cost authoritative; insufficient-credit gating
    - _Requirements: 17.2, 17.3, 17.4, 17.5, 17.6, 17.9, 17.10_
  - [x] 16.2 Write property tests for credit reconciliation
    - **Property 40: Credit accounting conserves credits and never overcharges** — **Validates: Requirements 17.2, 17.3, 17.4, 17.5, 17.10**
    - **Property 41: Insufficient credits block the provider call with no deduction** — **Validates: Requirements 17.9, 24.7**
    - **Property 42: Server-side credit balance and cost are authoritative** — **Validates: Requirements 17.6, 19.5**
    - **Property 44: Retries are idempotent — no duplicate artifacts or charges** — **Validates: Requirements 18.7**
  - [x] 16.3 Integrate `runMetered` and pre-execution gating
    - Wrap each generative provider call in `aiCreditMeteringService.runMetered('videoGenerativeEdit','video.generation',ctx,op,measuredSeconds*costPerSecondInr,signal)`; pre-execution present estimate + require confirmation (300 s timeout → cancel, no call, no deduction); block on insufficient credits with upgrade/add-credit path; abort mid-flight within 5 s releasing reservation
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 17.10_

- [x] 17. Generative_Editor and segmentation
  - [x] 17.1 Implement `segmentation.logic.ts` (pure core)
    - Extract every range overlapping the affected region, exclude non-overlapping; bound each sub-range ≤ `caps.editableInputSeconds.max`; cuts only on detected scene boundaries; never cut inside a continuously tracked subject or continuous utterance; emitted sub-ranges contiguous, gap-free, overlap-free covering the region; over-capability → split/reroute, never oversized
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [x] 17.2 Write property test for segmentation
    - **Property 22: Segmentation partitions the affected region with no gaps or overlaps within capability bounds**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6**
  - [x] 17.3 Implement `prompt-compiler.logic.ts` and protected-element handling (pure core)
    - Compile user request into a provider-safe instruction (never the raw prompt); include explicit preservation constraints for each required Protected_Element; when metadata cannot guarantee a required element, reroute to a guaranteeing pipeline or warn, and do not invoke the provider otherwise
    - _Requirements: 9.7, 9.8, 9.9, 9.10_
  - [x] 17.4 Write property tests for prompt compilation and protected elements
    - **Property 23: The provider never receives the raw user prompt and always receives required preservation constraints** — **Validates: Requirements 9.7, 9.8**
    - **Property 24: Unguaranteeable protected elements block the provider unless rerouted or warned** — **Validates: Requirements 9.9, 9.10**
  - [x] 17.5 Implement `VideoAIProvider` interface and Gemini Omni / Veo adapters
    - Provider-neutral interface (capability reporting, cost estimation, generate, edit); all calls server-side via `AIServiceManager`/Gemini SDK — keys never sent to browser; classify a provider "integrated" only on a real successful call
    - _Requirements: 7.6, 7.7, 7.8_
  - [x] 17.6 Implement `generative-editor.service.ts` orchestration
    - Extract → segment → meter (via task 16.3) → QC-validate each segment → insert validated segment in place of original range (duration-aligned); extraction failure aborts and preserves timeline; QC failure keeps original range and surfaces error; store real provider output as artifact
    - _Requirements: 9.11, 9.12, 9.13, 9.14_
  - [x] 17.7 Write property test for segment insertion and preservation
    - **Property 25: Validated segments replace their range length-aligned; failures preserve the timeline**
    - **Validates: Requirements 9.12, 9.13, 9.14**
  - [x] 17.8 Wire generative editing into the `video-generation` queue/worker
    - Route generative edits from the edits endpoint through Model_Router → Generative_Editor asynchronously
    - _Requirements: 18.1_

- [x] 18. SSRF guard for external/provider media URLs
  - [x] 18.1 Implement `ssrf-guard.logic.ts` (pure core)
    - Allow an outbound fetch iff the destination is on the configured allowlist and does not resolve to private/loopback/link-local/internal addresses; otherwise reject with no request
    - _Requirements: 19.6, 19.7_
  - [x] 18.2 Write property test for the SSRF guard
    - **Property 47: SSRF guard blocks non-allowlisted and internal destinations**
    - **Validates: Requirements 19.6, 19.7**
  - [x] 18.3 Wire the SSRF guard into every external/provider media fetch path
    - _Requirements: 19.6, 19.7_

- [x] 19. Immutable versioning and variants
  - [x] 19.1 Implement version manager
    - Create new `Video_Version` derived from specified parent or active version; missing parent → reject, no version created; preserve all prior versions unchanged; record parent lineage; reject any non-creation modification of an existing version with an immutability error; restore an existing version as active without deleting others; missing restore target → reject, keep current active
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8_
  - [x] 19.2 Write tests for versioning immutability and lineage
    - **Property 38: Version creation preserves history and records lineage; versions are immutable**
    - **Validates: Requirements 16.4, 16.5, 16.6**
  - [x] 19.3 Implement independent per-variant plan/render/meter (1–5)
    - Fan out 1–5 variants to independent plans; render and meter each independently
    - _Requirements: 16.9_
  - [x] 19.4 Implement version endpoints
    - `GET .../versions`, `POST .../versions/:versionId/restore`
    - _Requirements: 21.5_

- [x] 20. Conversational multi-turn editing and job progress
  - [x] 20.1 Wire conversational editing over the NDJSON transport
    - A video-editing turn: Intent_Router → Editing_Planner → Model_Router → editors, creating a new version per refinement; reuse the VeeGPT NDJSON streaming shape and `AbortController` map for Stop
    - _Requirements: 16.1, 16.2, 18.4_
  - [x] 20.2 Implement job status/cancel endpoints and stage-derived progress stream
    - `GET /api/video-editor/jobs/:jobId`, `POST /api/video-editor/jobs/:jobId/cancel`; progress derived solely from completed stages; indeterminate when unknown
    - _Requirements: 18.4, 18.5, 23.2, 23.6_

- [x] 21. Security hardening and no-mock integrity
  - [x] 21.1 Implement error envelope, secret redaction, input validation, and failure-state preservation
    - Typed errors with `statusCode`; `{ success:false, error:{code,message} }` responses; exclude keys/secrets/tokens/signed URLs from user-facing errors (log full detail server-side via `logger`); zod-style route validation rejecting invalid input without mutation; failed operations return a failure state, preserve pre-operation state, never fabricate success; unimplemented capabilities surface explicit unavailable
    - _Requirements: 19.8, 21.6, 21.7, 23.4, 23.5_
  - [x] 21.2 Write property tests for redaction, input validation, and no-mock integrity
    - **Property 48: Secrets never appear in user-facing errors or logs** — **Validates: Requirements 19.8, 22.4**
    - **Property 51: Invalid endpoint input is rejected without mutating state** — **Validates: Requirements 21.6**
    - **Property 52: A failed backend operation preserves pre-operation state and never fabricates success** — **Validates: Requirements 23.4, 23.5**
  - [x] 21.3 Implement source retention on project deletion and temp-file cleanup
    - Retain original `Video_Source` on project delete unless the retention-policy flag permits deletion; remove per-job temp files within 60 s of terminal/timeout with ≤3 retries
    - _Requirements: 20.5, 20.6, 20.7, 20.8_
  - [x] 21.4 Write test for source retention on deletion
    - **Property 50: Source media survives project deletion unless retention policy permits removal**
    - **Validates: Requirements 20.8**

- [x] 22. Observability and admin analytics
  - [x] 22.1 Emit structured lifecycle and provider-call log events
    - Lifecycle events (project creation, source ingestion, analysis start/complete, plan creation, edit submission, job start/complete/failure, render completion, export completion) with event type/timestamp/user/workspace/project/job ids; provider-call completion logs latency/provider/model/output-seconds/estimated-cost/actual-cost/retry-count; failures log latency/provider/model/retry-count/reason; log-emit failures never abort the operation
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.6_
  - [x] 22.2 Extend admin AI-usage analytics for video
    - Record video edit/generation counts, provider spend in credits, success rate, retry rate, and QC-failure rate via the existing `AIUsageEvent` collection plus a video-specific aggregation
    - _Requirements: 22.5_
  - [x] 22.3 Write integration tests for logging and analytics aggregation
    - Verify lifecycle/provider events are emitted and admin aggregation computes the rates
    - _Requirements: 22.1, 22.2, 22.5_

- [x] 23. Frontend surface
  - [x] 23.1 Add the Video Editor sidebar item and active-view mapping
    - Add `{ icon: Video, label: 'Video Editor', key: 'video-editor', url: '/video-editor' }` to `sidebarGroups` and `'/video-editor'` to `getActiveViewFromLocation` in `client/src/components/layout/sidebar.tsx`; keep it reachable under the responsive breakpoint
    - _Requirements: 1.1, 1.8_
  - [x] 23.2 Add the route and `VideoEditorPage` shell
    - Add a wouter `<Route path="/video-editor">` wrapping `<ProtectedRoute>` + `<Suspense fallback={<VideoEditorSkeleton/>}>` in `client/src/AuthenticatedApp.tsx`; interactive within 3 s
    - _Requirements: 1.2_
  - [x] 23.3 Load workspace context and enforce gating in the editor
    - Load subscription tier + credit balance + brand profile from existing services; block credit-consuming actions with an error indication when context is unavailable; no active workspace → error and editor not opened; reuse a single attached video as source without re-upload
    - _Requirements: 1.4, 1.5, 1.6, 1.7_
  - [x] 23.4 Build conversational edit box, job/progress, and version panels
    - Reuse `useChatStream` NDJSON and signed-URL previews; progress always stage-derived/indeterminate (never timer-interpolated)
    - _Requirements: 23.2, 23.6_
  - [x] 23.5 Build the credit-estimate confirmation UI
    - Present the server-computed estimate and require confirmation before executing a generative operation
    - _Requirements: 17.7_

- [x] 24. End-to-end acceptance test suites (Req 24)
  - [x] 24.1 Write Acceptance Test A — deterministic 30 s → 15 s
    - Assert no generative provider call, no generative credits, MP4/H.264/AAC decodes fully, duration 15 s ± 0.5 s
    - _Requirements: 24.1, 24.2_
  - [x] 24.2 Write Acceptance Test B — in-cap generative object removal
    - Assert generative routing, reserve→call→reconcile, real artifact stored, timeline insertion, QC run, final render
    - _Requirements: 24.3, 24.4_
  - [x] 24.3 Write Acceptance Test C — refinement + opposing refinement
    - Assert one new version each, source byte-unchanged, unaffected ranges pixel-identical (frame-hash comparison)
    - _Requirements: 24.5_
  - [x] 24.4 Write Acceptance Test D — 60 s segmented generative edit
    - Assert full analysis, correct range identification, per-capability segmentation, edit confined to affected ranges, unaffected ranges pixel-identical
    - _Requirements: 24.6_
  - [x] 24.5 Write Acceptance Test E — insufficient credits
    - Assert no provider call, no success result, actionable upgrade/add-credit action, no deduction
    - _Requirements: 24.7_

- [x] 25. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks (property, unit, integration, and E2E acceptance) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Property-based tests use `fast-check` + `vitest` at **≥100 runs** (`fc.assert(fc.property(...), { numRuns: 100 })`), live in `tests/*.logic.test.ts`, and each carries a `// Feature: veefore-ai-video-editor, Property {n}: {text}` traceability tag.
- Each task references specific requirements/sub-requirements (and, for test tasks, the design correctness property it validates) for traceability.
- Every component is wired into the app as it is built (routes mounted, queues registered, sidebar/route added) so there is no orphaned code.
- Checkpoints (tasks 15 and 25) provide incremental validation; after task 15 the deterministic pipeline (Acceptance Test A) is runnable end-to-end.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "2.1", "3.1", "4.1", "6.2", "7.1", "8.1", "9.1", "10.1", "12.1", "13.1", "14.1", "16.1", "17.1", "18.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.2", "6.3", "7.2", "8.2", "9.2", "10.2", "12.2", "13.2", "14.2", "16.2", "17.2", "17.4", "18.2"] },
    { "id": 3, "tasks": ["2.3", "3.3", "4.3", "6.1", "6.4", "7.3", "10.3", "12.3", "13.3", "14.3", "16.3", "17.3", "17.5", "18.3"] },
    { "id": 4, "tasks": ["4.4", "5.1", "8.3", "9.3", "11.1", "14.4", "17.6"] },
    { "id": 5, "tasks": ["5.3", "8.5", "11.2", "14.5", "17.8", "19.1"] },
    { "id": 6, "tasks": ["5.2", "5.4", "7.4", "8.4", "11.3", "11.4", "11.5", "17.7", "19.2", "19.3", "19.4", "20.1", "20.2"] },
    { "id": 7, "tasks": ["21.1", "21.3", "22.1", "22.2", "23.1", "23.2", "23.3", "23.4", "23.5"] },
    { "id": 8, "tasks": ["21.2", "21.4", "22.3", "24.1", "24.2", "24.3", "24.4", "24.5"] }
  ]
}
```
