/**
 * Video Editor services — public surface.
 *
 * Services live here and are exported as they are implemented across the
 * foundation → intelligence → deterministic → generative → autonomous phases:
 *   Intent_Router, Media_Ingestion_Service, Video_Analysis_Service,
 *   Editing_Planner, Model_Router, Deterministic_Editor, Generative_Editor,
 *   Timeline_Engine, Caption_Renderer, Quality_Controller, Render_Engine,
 *   Provider_Capability_Registry, Job_System.
 *
 * Each service adds its export here when built so no orphaned code exists.
 */

// Storage layout & artifact provenance — pure core (task 3.1, Req 20.1–20.3).
export * from './artifact-provenance.logic';

// Artifact_Repository — IO shell persisting immutable artifacts over
// StorageService (task 3.3, Req 20.1, 20.4).
export * from './artifact-repository.service';

// Intent_Router — pure intent-extraction core (task 6.2, Req 2.2–2.7).
export * from './intent-extraction.logic';

// Intent_Router — structured-extraction service: pure capability gate + LLM
// structured extraction via AIServiceManager (token usage via collectAIUsage),
// classify within 5 s, return VideoIntent (task 6.4, Req 2.1).
export * from './intent-router.service';

// Provider_Capability_Registry — pure core (task 2.1).
export * from './provider-capability-registry.logic';

// Provider_Capability_Registry — DB-backed service + seed data (task 2.3, Req 7.1, 7.3, 7.5, 6.3).
export * from './provider-capability-registry.service';
export * from './provider-capability-seed';

// Job_System — pure job state machine & progress core (task 4.1, Req 18.2, 18.4, 23.2, 23.6).
export * from './job-state.logic';

// Job_System — IO orchestration shell over the pure core, BullMQ queues, the
// VideoEditJob model, and the credit ledger: idempotency key + attempt + timeout
// + artifact refs on creation, 5 s cancellation (abort/stop/cleanup/reconcile),
// timeout/attempts-exhausted → FAILED + credit release, idempotent retries ≤3
// (task 4.4, Req 18.3, 18.5, 18.6, 18.7, 18.8, 18.9).
export * from './job-system.service';

// Editing_Planner — pure planning core (task 9.1, Req 5.1–5.6, 13.2–13.5, 16.9–16.10).
export * from './editing-planner.logic';

// Editing_Planner — LLM-bearing service: goal/style reasoning via AIServiceManager,
// structural planning delegated entirely to the pure core (task 9.3, Req 5.1, 21.4).
export * from './editing-planner.service';

// Timeline_Engine — pure timeline model & deterministic render-command core (task 12.1, Req 10.1–10.6).
export * from './timeline-engine.logic';

// Timeline_Engine — persistence service: per-version VideoTimeline snapshots,
// updated state exposed within 100 ms (task 12.3, Req 10.1, 10.2).
export * from './timeline-engine.service';

// Model_Router — pure routing core (task 10.1, Req 6.1–6.8, 8.1, 8.2).
export * from './model-router.logic';

// Model_Router — DB-backed service with provider health tracking + audit
// (task 10.3, Req 6.6, 6.7, 6.8).
export * from './model-router.service';

// Deterministic_Editor — FFmpeg core operations (trim/cut/crop/resize/aspect/
// fps/speed/fades/encode); reads source bytes unmodified, produces exactly one
// traceable artifact on success, marks the job failed with an error code on
// failure, and NEVER calls a provider (task 11.1, Req 8.1–8.4, 8.6).
export * from './deterministic-editor.service';

// Deterministic_Editor — pure audio-processing core: silence-removal planning
// (removes only analysis-classified silence, keeps every speech segment uncut,
// removes nothing unless explicitly requested, blocks a requested range that
// overlaps speech), loudness-normalization targeting + tolerance predicate, and
// the byte-identical voice-preservation decision (task 11.2, Req 8.5, 12.1–12.4).
export * from './silence-removal.logic';

// Media_Ingestion_Service — pure ingestion validation core (task 7.1, Req 3.1–3.4).
export * from './media-ingestion-validation.logic';

// Media_Ingestion_Service — IO shell: validate/accept, store immutably, probe +
// prepare proxy/thumbnails/waveform, stage-derived progress (task 7.3,
// Req 3.5–3.11, 20.4).
export * from './media-ingestion.service';

// Video_Analysis_Service — pure audio/analysis well-formedness core (task 8.1, Req 4.3, 4.5, 4.6).
export * from './audio-analysis.logic';

// Video_Analysis_Service — IO shell: deterministic scene detection before AI
// enrichment, transcript/audio features/decision-support scores, completion-gated
// persistence + idempotent reuse, enrichment-unavailable partials, and failure
// with no reusable partial (task 8.3, Req 4.1–4.11).
export * from './video-analysis.service';

// Quality_Controller / Render_Engine — pure QC classification, render-validation,
// and bounded-repair core (task 14.1, Req 14.1–14.3, 14.5–14.7, 15.2–15.5).
export * from './quality-controller.logic';

// Render_Engine — FFmpeg + FFprobe rendering service: renders the authoritative
// timeline to a real file, validates it via the pure render-validation predicate,
// marks the job COMPLETED with one immutable artifact on success or FAILED (input
// retained, no exposed output) on any failed check (task 14.4, Req 15.1, 15.6, 15.7).
export * from './render-engine.service';

// Quality_Controller — FFmpeg/FFprobe-backed service + bounded repair loop:
// measures real outputs, inspects them through the pure core, drives ≤3 repair
// strategies then reverts to the prior valid version, never marking a corrupted
// output as successful; plus the render/QC pipeline coordinators the video-render
// and video-qc workers run (task 14.5, Req 14.4–14.7, 18.1).
export * from './quality-controller.service';

// Caption_Renderer — pure caption layout core (task 13.1, Req 11.1, 11.2, 11.4, 11.5, 11.6).
export * from './caption-layout.logic';

// Caption_Renderer — deterministic FFmpeg burn-in service: same captions+preset+
// typography → identical output; brand typography with default fallback +
// indication on failure (task 13.3, Req 11.3, 11.7, 11.8).
export * from './caption-renderer.service';

// Credit metering — pure reserve→measure→reconcile core (task 16.1, Req 17.2–17.6, 17.9, 17.10).
export * from './credit-reconciliation.logic';

// Credit metering — runMetered integration + pre-execution gating/confirmation
// shell wrapping every generative provider call (task 16.3, Req 17.1–17.10).
export * from './generative-metering.service';

// Observability — structured lifecycle + provider-call log events over the
// existing pino logger: the fixed lifecycle event set with event type/timestamp/
// user/workspace/project/job ids, provider-call completion (latency/provider/
// model/output-seconds/estimated+actual credits/retry-count) and failure
// (latency/provider/model/retry-count/reason), all redacted of secrets and
// non-aborting on a log fault (task 22.1, Req 22.1–22.4, 22.6).
export * from './video-editor-events';

// Observability — video-specific admin AI-usage analytics: edit/generation
// counts, provider spend in credits, and success/retry/QC-failure rates over the
// existing AIUsageEvent + AICreditTransaction collections plus the video-specific
// VideoEditJob/VideoEditOperation aggregation (task 22.2, Req 22.5).
export * from './video-analytics.service';

// Generative_Editor — pure segmentation core (task 17.1, Req 9.1–9.6).
export * from './segmentation.logic';

// Generative_Editor — pure prompt-compiler & protected-element handling core
// (task 17.3, Req 9.7–9.10).
export * from './prompt-compiler.logic';

// Generative_Editor — orchestration service wiring extract → segment → meter →
// QC-validate → insert; validated segments replace their range duration-aligned,
// extraction/QC failures preserve the timeline (task 17.6, Req 9.11–9.14).
export * from './generative-editor.service';

// Generative_Editor — async `video-generation` queue/worker processor: routes a
// generative edit through the Generative_Editor asynchronously, reconstructing
// the request and driving the Video_Edit_Job state machine (task 17.8, Req 18.1).
export * from './generative-edit-worker';

// SSRF guard — pure allow/deny core for external/provider media fetches (task 18.1, Req 19.6, 19.7).
export * from './ssrf-guard.logic';

// Guarded_Media_Fetch — IO wiring over the SSRF guard: DNS resolve → evaluate →
// fetch only when allowed, re-pinned to a verified IP. The single outbound path
// for every external/provider media URL (task 18.3, Req 19.6, 19.7).
export * from './guarded-media-fetch.service';

// Version manager — pure immutable-version-history core: parent resolution,
// append-only creation with lineage, restore, and immutability enforcement
// (task 19.1, Req 16.1–16.8).
export * from './version-manager.logic';

// Version manager — IO shell persisting immutable VideoVersion records and moving
// the project's active-version pointer on creation/restore (task 19.1, Req 16.1–16.8).
export * from './version-manager.service';

// Variant orchestrator — independent per-variant plan/render/meter: fans out
// 1–5 variants (>5 rejected, nothing created) and independently plans, versions,
// renders, and meters each in isolation (task 19.3, Req 16.9, 16.10).
export * from './variant-orchestrator.service';

// Generative_Editor — VideoAIProvider interface + Gemini Omni / Veo adapters,
// all calls server-side via AIServiceManager/Gemini SDK; "integrated" only after
// a real successful call (task 17.5, Req 7.6, 7.7, 7.8).
export * from './providers';

// ── Ambiguity disambiguation ────────────────────────────────────────────────
// A few members are exported by more than one `export *` module above, which
// makes the star re-export ambiguous. An explicit named re-export takes
// precedence over the star exports and pins each name to its canonical owner,
// without changing any underlying module and without dropping other exports:
//   - ProtectedElement → intent-extraction.logic (also in provider-capability-registry.logic)
//   - OperationType    → editing-planner.logic    (also in model-router.logic)
//   - rangesOverlap    → editing-planner.logic    (also in segmentation.logic)
export type { ProtectedElement } from './intent-extraction.logic';
export type { OperationType } from './editing-planner.logic';
export { rangesOverlap } from './editing-planner.logic';
