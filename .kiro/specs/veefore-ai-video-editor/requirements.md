# Requirements Document

## Introduction

The Veefore AI Video Editor is a production-grade, end-to-end AI video editing capability delivered as a first-class feature inside the existing VeeGPT product. It lets creators describe a desired result in natural language ("turn this into a high-retention Instagram Reel", "remove the person behind me, keep my face and voice") and have Veefore ingest the media, analyze it, plan the edit, route each operation to the correct engine (deterministic FFmpeg processing or generative AI), compose a real timeline, run quality control, render a real video file, and let the user refine the result conversationally across immutable versions.

The system MUST reuse Veefore's existing infrastructure rather than build parallel systems: Firebase/session authentication, workspace and subscription models, the AI credit metering ledger (`AICreditMeteringService` with its estimate → reserve → execute → measure → reconcile lifecycle and idempotency keys), MongoDB/Mongoose persistence, the `StorageService` (S3/R2 + local fallback with signed URLs), BullMQ/Redis queues, the capability-based AI model routing layer, structured logging, and the existing frontend design system and VeeGPT sidebar.

A central architectural principle governs the entire feature: **the Model_Router MUST NOT invoke a generative AI model for an operation that deterministic media processing can perform reliably.** Generative AI is used only where it materially changes visual content that FFmpeg cannot produce. A second principle is the **No-Mock rule**: no fake progress, no placeholder videos, no hardcoded provider success, no client-authoritative credit consumption.

This document specifies the requirements for that system. Provider-specific limits (e.g. Gemini Omni clip length, resolution, region availability) MUST be expressed as capability metadata rather than hardcoded, so providers and models can be upgraded without rewriting the product.

## Glossary

- **Video_Editor**: The complete Veefore AI video editing subsystem, accessed through VeeGPT, comprising ingestion, analysis, planning, routing, editing, timeline composition, quality control, rendering, and export.
- **VeeGPT**: Veefore's existing conversational AI assistant and sidebar surface that hosts the Video_Editor entry point and conversational editing.
- **Intent_Router**: The VeeGPT component that classifies a user message into a structured video editing intent and extracts editing parameters.
- **Editing_Planner**: The component that converts an intent plus video analysis into a structured JSON editing plan of typed operations.
- **Model_Router**: The component that selects, for each planned operation, the correct execution engine (deterministic, generative, analysis, or render) and, for generative/analysis operations, the specific provider/model based on capability metadata and provider health.
- **Deterministic_Editor**: The FFmpeg/media-processing engine that performs non-generative operations (trim, crop, resize, aspect conversion, captions burn-in, audio processing, speed, transitions, encoding).
- **Generative_Editor**: The engine that performs generative visual edits and generation by calling generative AI providers (e.g. Gemini Omni, Veo) through the provider abstraction.
- **Provider_Capability_Registry**: The versioned configuration/adapter metadata store describing each provider/model's capabilities (`VideoModelCapabilities`) used by the Model_Router before selecting a provider.
- **Video_Analysis_Service**: The pipeline that produces a structured `VideoAnalysis` record (scenes, transcript, audio features, visual quality, hooks, important moments, editing scores).
- **Media_Ingestion_Service**: The component that validates, stores, probes, and prepares uploaded/imported media (proxy, thumbnails, waveform, audio extraction).
- **Timeline_Engine**: The component that maintains the real timeline model (sequences, tracks, clips, captions, effects, transitions) that is the source of truth for the final render.
- **Caption_Renderer**: The deterministic component that renders professional captions into video output.
- **Quality_Controller**: The component that validates generative and rendered outputs and drives the repair loop.
- **Render_Engine**: The component that produces final, validated video files (MP4/H.264/AAC and configured export profiles).
- **Credit_Metering_Service**: The existing `AICreditMeteringService` authoritative ledger used to estimate, reserve, execute, measure, and reconcile AI credit consumption with idempotency.
- **Job_System**: The existing BullMQ/Redis queue and worker infrastructure extended with video job queues, states, retries, cancellation, progress, and idempotency keys.
- **Storage_Service**: The existing `StorageService` (S3/R2 with local fallback) providing immutable object storage and signed URLs.
- **Video_Project**: The persisted top-level entity owning sources, versions, timeline, operations, jobs, and artifacts for one editing effort, scoped to a user and workspace.
- **Video_Source**: An immutable persisted record of an original uploaded/imported media asset.
- **Video_Version**: An immutable persisted snapshot of the project state produced by a significant edit, with a reference to its parent version.
- **Video_Edit_Operation**: A single typed operation within an editing plan (deterministic, generative, analysis, or render).
- **Video_Edit_Job**: An asynchronous unit of work executed by the Job_System with state, progress, idempotency key, inputs, and outputs.
- **Video_Artifact**: An immutable stored output (proxy, thumbnail, waveform, analysis, generated segment, render, export) traceable to a job, input version, provider, prompt, and cost.
- **Protected_Element**: A user-specified constraint that MUST be preserved during editing (face, voice, product, logo, text, background, camera movement, colors, original audio).
- **Platform_Preset**: A configuration entry defining aspect ratio, recommended duration, safe areas, caption behavior, pacing, and export profile for a target platform.
- **Signed_URL**: A time-limited access URL to a stored artifact produced by the Storage_Service.

## Requirements

### Requirement 1: VeeGPT Sidebar and Editor Access

**User Story:** As an authenticated Veefore user, I want a first-class Video Editor entry in the VeeGPT sidebar that reuses my existing session, workspace, and subscription, so that I can start editing without a separate app or login.

#### Acceptance Criteria

1. THE Video_Editor SHALL render a navigation item labeled "Video Editor" within the existing VeeGPT sidebar on every VeeGPT surface where the sidebar is displayed.
2. WHEN an authenticated user selects the Video Editor navigation item, THE Video_Editor SHALL open the editor within the existing VeeGPT surface using the current session, authenticated user identity, and active workspace, and SHALL display the editor as interactive within 3 seconds under normal operating conditions.
3. IF a request targeting any Video_Editor route has no valid authenticated session, THEN THE Video_Editor SHALL reject the request with an HTTP 401 status, SHALL NOT open the editor, and SHALL NOT expose any workspace or project data.
4. WHEN the Video_Editor loads, THE Video_Editor SHALL retrieve and apply the active workspace's subscription tier, current credit balance, and brand profile from the existing subscription and workspace services.
5. IF the subscription, credit balance, or brand profile cannot be retrieved from the existing subscription and workspace services when the Video_Editor loads, THEN THE Video_Editor SHALL block edit actions that consume credits and SHALL present an error indication that the workspace context is unavailable, without terminating the VeeGPT session.
6. IF an authenticated user selects the Video Editor navigation item while no active workspace is associated with the session, THEN THE Video_Editor SHALL present an error indication that an active workspace is required and SHALL NOT open the editor.
7. WHEN a user opens VeeGPT with exactly one video already attached to the conversation, THE Video_Editor SHALL use that attached video as an input source without requiring an additional upload.
8. WHERE the viewport width is below the existing responsive navigation breakpoint, THE Video_Editor SHALL keep the Video Editor navigation item reachable and selectable through the existing responsive navigation pattern.

### Requirement 2: Video Editing Intent Routing

**User Story:** As a creator, I want VeeGPT to understand video editing requests I type in natural language, so that the system can act on my intent without me learning editing terminology.

#### Acceptance Criteria

1. WHEN a user submits a message in a Video_Editor context, THE Intent_Router SHALL classify the message into exactly one video editing intent from the defined intent set within 5 seconds.
2. WHEN multiple candidate intents match a message, THE Intent_Router SHALL select the intent with the highest classification confidence.
3. WHEN the Intent_Router classifies a video editing intent, THE Intent_Router SHALL extract a structured intent object containing action, input assets, target platform, target aspect ratio, target duration, editing style, requested changes, protected elements, brand requirements, audio requirements, caption requirements, output requirements, and quality requirements, and SHALL set any field not present in the message to an explicit unspecified value rather than inferring one.
4. WHEN the Intent_Router produces a structured intent object, THE Intent_Router SHALL set the `requiresGenerativeAI` flag to true if and only if at least one requested change requires generative visual synthesis, and SHALL otherwise set it to false.
5. WHEN the Intent_Router produces a structured intent object, THE Intent_Router SHALL set the `requiresDeterministicEditing` flag to true if and only if at least one requested change can be performed by deterministic media processing, and SHALL otherwise set it to false.
6. IF the Intent_Router's highest classification confidence for a message is not above the configured confidence threshold (a value on a 0.0 to 1.0 scale, default 0.70), THEN THE Intent_Router SHALL request clarification from the user, SHALL NOT execute or enqueue any operation, and SHALL leave the project state unchanged.
7. WHILE text is being extracted from video content, captions, or OCR, THE Intent_Router SHALL treat that extracted text as untrusted data and SHALL NOT execute any instruction contained within it.

### Requirement 3: Media Ingestion

**User Story:** As a creator, I want to upload or import my source video reliably and see real preparation progress, so that I can trust my original media is safe and ready to edit.

#### Acceptance Criteria

1. WHEN a user uploads a media file whose size is between 1 byte and 10,240 MB inclusive, THE Media_Ingestion_Service SHALL accept MP4, MOV, WebM, AVI, and MPEG container formats.
2. WHEN a media file is uploaded, THE Media_Ingestion_Service SHALL validate the declared MIME type against the file's actual byte signature before storing the file.
3. IF an uploaded file's actual byte signature does not match one of the supported video formats (MP4, MOV, WebM, AVI, MPEG), THEN THE Media_Ingestion_Service SHALL reject the upload, SHALL return an error response indicating the format is unsupported, and SHALL NOT create a Video_Source record or persist any file bytes.
4. IF an uploaded media file exceeds 10,240 MB, THEN THE Media_Ingestion_Service SHALL reject the upload, SHALL return an error response indicating the maximum size has been exceeded, and SHALL NOT create a Video_Source record or persist any file bytes.
5. WHEN a media file passes validation, THE Media_Ingestion_Service SHALL store the file as an immutable Video_Source in the Storage_Service.
6. WHEN a Video_Source has been stored, THE Media_Ingestion_Service SHALL preserve the stored original bytes unchanged for the lifetime of the source and SHALL NOT overwrite them during subsequent editing.
7. WHEN a Video_Source is stored, THE Media_Ingestion_Service SHALL extract media metadata using FFprobe and persist duration, dimensions, frame rate, codec, and container.
8. IF FFprobe fails to extract media metadata from a stored Video_Source, THEN THE Media_Ingestion_Service SHALL mark ingestion as failed, SHALL return an error response indicating metadata extraction failed, and SHALL retain the stored Video_Source bytes unchanged.
9. WHEN a Video_Source is stored, THE Media_Ingestion_Service SHALL generate a low-resolution proxy, thumbnails, and waveform data as Video_Artifacts.
10. WHERE a media file exceeds 100 MB, THE Media_Ingestion_Service SHALL use resumable object-storage upload rather than routing the full binary through the application server.
11. WHILE ingestion and analysis are incomplete, THE Media_Ingestion_Service SHALL report progress as a monotonically non-decreasing percentage from 0 to 100 derived from the count of completed ingestion stages, SHALL update the reported progress at least once every 5 seconds, and SHALL NOT report progress as 100 percent or complete before all ingestion and analysis stages have finished.

### Requirement 4: Video Analysis Pipeline

**User Story:** As a creator, I want Veefore to understand the content of my video before editing it, so that its editing decisions are informed by what is actually in the footage.

#### Acceptance Criteria

1. WHEN analysis is triggered for a Video_Source, THE Video_Analysis_Service SHALL produce a structured `VideoAnalysis` record containing duration in seconds, frame rate in frames per second (fps), dimensions in pixels (width and height), and aspect ratio expressed as a width-to-height ratio.
2. WHEN analyzing a Video_Source, THE Video_Analysis_Service SHALL detect scenes using a deterministic scene detector before requesting semantic enrichment from an AI model.
3. WHEN a Video_Source contains detectable speech, THE Video_Analysis_Service SHALL produce a transcript in which each segment includes a start time in seconds, an end time in seconds, and text.
4. IF a Video_Source contains no detectable speech, THEN THE Video_Analysis_Service SHALL produce an empty transcript and SHALL mark the transcript stage as completed.
5. WHEN analyzing a Video_Source, THE Video_Analysis_Service SHALL compute audio features including silence segments, speech segments, and loudness measurements in decibels (dB), where a silence segment is defined as loudness remaining below a configurable loudness threshold (default -40 dB) for at least a configurable minimum duration (default 0.5 seconds).
6. WHEN analyzing a Video_Source, THE Video_Analysis_Service SHALL produce editing decision-support scores including hook candidates and important moments, where each hook candidate and important moment includes a start time in seconds, an end time in seconds, and a normalized confidence value in the range 0.0 to 1.0.
7. WHEN all required `VideoAnalysis` fields (duration, frame rate, dimensions, aspect ratio, scene results, transcript, audio features, and decision-support scores) are populated, THE Video_Analysis_Service SHALL mark the `VideoAnalysis` record as completed.
8. WHEN a `VideoAnalysis` record is marked completed, THE Video_Analysis_Service SHALL persist it as a Video_Artifact.
9. WHEN analysis is triggered for a Video_Source that already has a completed `VideoAnalysis` Video_Artifact, THE Video_Analysis_Service SHALL reuse the existing Video_Artifact without performing re-analysis.
10. IF semantic enrichment from the AI model is unavailable, THEN THE Video_Analysis_Service SHALL retain the deterministic scene detection results, SHALL mark the enrichment stage as incomplete, and SHALL NOT mark the `VideoAnalysis` record as completed.
11. IF analysis of a Video_Source fails, THEN THE Video_Analysis_Service SHALL record the failure with an error code, SHALL set the analysis status to failed, SHALL NOT mark the analysis as completed, and SHALL NOT persist a partial `VideoAnalysis` record as a reusable Video_Artifact.

### Requirement 5: Editing Planner

**User Story:** As a creator, I want the system to produce a concrete plan for how it will edit my video, so that the edit is intentional, inspectable, and executed by the right tools.

#### Acceptance Criteria

1. WHEN the Editing_Planner receives a structured intent and a `VideoAnalysis` record, THE Editing_Planner SHALL output a structured JSON editing plan containing a project goal, a target specification, and an ordered list of typed operations, where each operation carries an explicit sequence index establishing execution order.
2. IF the Editing_Planner cannot fulfill the received structured intent, THEN THE Editing_Planner SHALL output a structured JSON editing plan whose operation list is empty or contains only operations marked with an error status, and SHALL NOT return an absent or null plan.
3. WHEN the Editing_Planner produces an operation, THE Editing_Planner SHALL classify that operation as exactly one of the values deterministic, generative, analysis, or render.
4. WHEN the Editing_Planner produces any operation, THE Editing_Planner SHALL specify the affected timeline range for that operation as an explicit start time and end time in milliseconds, where the start time is greater than or equal to 0, the end time is greater than the start time, and both values fall within the source duration reported in the `VideoAnalysis` record.
5. WHEN the structured intent specifies one or more Protected_Elements, THE Editing_Planner SHALL attach, to each operation whose affected timeline range overlaps a Protected_Element, an explicit preservation constraint identifying that Protected_Element.
6. IF the Editing_Planner produces an operation that no available engine can perform, THEN THE Editing_Planner SHALL mark that operation with an unavailable status and SHALL include a limitation indication describing the unmet capability, and SHALL NOT mark that operation as executable.

### Requirement 6: Model and Tool Routing

**User Story:** As a Veefore operator, I want the system to use deterministic processing whenever possible and generative AI only when necessary, so that edits are reliable and costs stay controlled.

#### Acceptance Criteria

1. WHEN the Model_Router evaluates a planned operation whose type is marked in the Provider_Capability_Registry as performable by deterministic media processing, THE Model_Router SHALL route the operation to the Deterministic_Editor and SHALL NOT initiate any call to a generative AI provider.
2. WHEN the Model_Router evaluates a planned operation that changes existing visual content and whose type is not marked as deterministic-performable in the Provider_Capability_Registry, THE Model_Router SHALL route the operation to the Generative_Editor.
3. WHEN the Model_Router selects a generative or analysis provider for an operation, THE Model_Router SHALL query the Provider_Capability_Registry and SHALL restrict the candidate set to providers whose capability metadata records support for the requested operation type.
4. IF two or more candidate providers support the requested operation, THEN THE Model_Router SHALL select the candidate with the highest configured priority rank, and IF two candidates share the same priority rank, THEN THE Model_Router SHALL select the candidate listed first in the Provider_Capability_Registry ordering.
5. IF no available provider's capability metadata supports a requested generative operation, THEN THE Model_Router SHALL apply the configured fallback policy in its defined order, and IF the fallback policy yields no supported provider, THEN THE Model_Router SHALL set the operation to an explicit unavailable state, SHALL present to the user an indication identifying the operation as unavailable and the reason, and SHALL NOT initiate any generative provider call for that operation.
6. WHEN the Model_Router selects a provider for an operation, THE Model_Router SHALL record, in the operation's routing record, the selected provider identifier, the selected model identifier, and the routing reason.
7. WHILE a provider is marked unhealthy by provider health tracking, THE Model_Router SHALL exclude that provider from the candidate set and SHALL NOT route new generative jobs to that provider.
8. WHEN a provider that was excluded transitions back to a healthy state in provider health tracking, THE Model_Router SHALL include that provider in the candidate set for subsequently evaluated operations.

### Requirement 7: Provider Capability Abstraction

**User Story:** As a Veefore operator, I want provider limits stored as versioned capability metadata rather than hardcoded, so that models can be upgraded without rewriting the product.

#### Acceptance Criteria

1. THE Provider_Capability_Registry SHALL store, for each provider and model, a `VideoModelCapabilities` record that includes the set of supported operations, editable input duration bounds expressed as minimum and maximum seconds, output duration bounds expressed as minimum and maximum seconds, the set of supported output resolutions, and the supported input and output modalities.
2. IF a `VideoModelCapabilities` record submitted to the Provider_Capability_Registry omits any required field (supported operations, editable input duration bounds, output duration bounds, output resolutions, or input/output modalities), THEN THE Provider_Capability_Registry SHALL reject the record, SHALL NOT store it, and SHALL surface an error indicating which required field is missing.
3. WHEN any component needs to determine whether a provider can perform an operation, THE component SHALL read capability metadata from the Provider_Capability_Registry and SHALL NOT reference hardcoded provider limits.
4. IF a component queries the Provider_Capability_Registry for a provider or model that has no stored capability record, THEN THE Provider_Capability_Registry SHALL return an explicit unsupported result and SHALL NOT return a default or partial capability.
5. THE Provider_Capability_Registry SHALL assign a version identifier to each `VideoModelCapabilities` record and SHALL retain prior versions so that a model upgrade can add or expand supported operations, duration bounds, output resolutions, or modalities without modifying routing logic source code.
6. THE Generative_Editor SHALL expose a provider-neutral interface offering capability reporting, cost estimation, generation, and editing operations.
7. THE Generative_Editor SHALL classify a provider as "integrated" only when that provider supports at least one of the capability reporting, cost estimation, generation, or editing operations and returns a successful result for a valid request to that operation.
8. THE Generative_Editor SHALL execute all provider API calls server-side and SHALL NOT transmit provider API keys to the browser.

### Requirement 8: Deterministic Editing

**User Story:** As a creator, I want standard edits like trimming, resizing, aspect conversion, and captions to be performed by reliable media processing, so that these operations are fast, exact, and free of generative artifacts.

#### Acceptance Criteria

1. WHEN a deterministic operation is routed to the Deterministic_Editor, THE Deterministic_Editor SHALL perform the operation using FFmpeg-based media processing and SHALL NOT call any generative AI provider.
2. WHERE a request is to change aspect ratio or resolution, THE Model_Router SHALL route the operation to the Deterministic_Editor and SHALL NOT invoke a generative provider.
3. WHEN a deterministic operation completes successfully, THE Deterministic_Editor SHALL produce exactly one Video_Artifact traceable to the originating Video_Edit_Job.
4. WHEN a deterministic operation is performed, THE Deterministic_Editor SHALL read the Video_Source bytes without modification and SHALL leave the immutable Video_Source unchanged.
5. WHEN a silence-removal operation is requested, THE Deterministic_Editor SHALL use the transcript and audio silence-segment analysis to identify silence ranges before cutting, and SHALL only cut ranges classified as silence by that analysis.
6. IF a deterministic operation fails, THEN THE Deterministic_Editor SHALL record an error code identifying the failure cause, SHALL mark the associated Video_Edit_Job as failed, and SHALL NOT produce a Video_Artifact for the failed operation.

### Requirement 9: Generative Editing and Segmentation

**User Story:** As a creator, I want generative edits (like removing a background object) applied only to the affected part of my video and within provider limits, so that the change is targeted, affordable, and preserves the rest of the footage.

#### Acceptance Criteria

1. WHEN a generative visual edit affects a bounded region of a longer video, THE Generative_Editor SHALL extract every range that overlaps the affected region and SHALL exclude every range that does not overlap the affected region, before invoking the provider.
2. WHEN the Generative_Editor extracts affected ranges for a generative edit, THE Generative_Editor SHALL bound each extracted range so that its duration does not exceed the selected provider's editable-input capability recorded in the Provider_Capability_Registry.
3. WHEN the Generative_Editor determines a cut point between segments, THE Generative_Editor SHALL place a cut only at a detected scene boundary from the `VideoAnalysis`.
4. WHEN the Generative_Editor segments a video for generative editing, THE Generative_Editor SHALL NOT place a cut within a range where a subject is continuously tracked by the `VideoAnalysis` and SHALL NOT place a cut within a continuous audio utterance identified by the `VideoAnalysis`.
5. WHEN the Generative_Editor produces output segments for a generative edit, THE Generative_Editor SHALL emit contiguous sub-ranges that collectively cover the affected region with no gaps and no overlaps, and SHALL bound each sub-range so that its duration does not exceed the selected provider's editable-input capability recorded in the Provider_Capability_Registry.
6. IF a requested generative edit range exceeds the selected provider's editable-input capability recorded in the Provider_Capability_Registry, THEN THE Generative_Editor SHALL split the range into supported sub-ranges or route to an alternative pipeline, and SHALL NOT send a request that exceeds that capability.
7. THE Generative_Editor SHALL compile the user's request through a prompt compiler into a provider-safe instruction and SHALL NOT send the user's raw prompt directly to any provider.
8. WHEN a user specifies a Protected_Element, THE Generative_Editor SHALL include an explicit preservation constraint for that Protected_Element in the compiled instruction.
9. IF the selected provider's capability metadata in the Provider_Capability_Registry cannot guarantee preservation of a Protected_Element the user marked as required, THEN THE Generative_Editor SHALL either route to a pipeline whose capability metadata guarantees that Protected_Element or present a warning to the user identifying the unguaranteed Protected_Element.
10. IF the selected provider's capability metadata in the Provider_Capability_Registry cannot guarantee preservation of a Protected_Element the user marked as required, THEN THE Generative_Editor SHALL NOT invoke that provider unless it has routed to a guaranteeing pipeline or presented the warning to the user.
11. WHEN a generatively edited segment passes quality-control validation, THE Generative_Editor SHALL treat that segment as a validated segment.
12. WHEN a validated segment is produced, THE Generative_Editor SHALL insert the validated segment into the timeline in place of the original range so that the inserted segment's duration aligns with the replaced original range.
13. IF extraction of an affected range fails, THEN THE Generative_Editor SHALL abort the generative edit, SHALL retain the original timeline unchanged, and SHALL present an error indication to the user identifying the failed extraction.
14. IF a generatively edited segment fails quality-control validation, THEN THE Generative_Editor SHALL NOT insert that segment into the timeline, SHALL retain the original range unchanged, and SHALL present an error indication to the user identifying the failed validation.

### Requirement 10: Timeline Engine

**User Story:** As a creator, I want the editor to maintain a real timeline of my clips, captions, and audio, so that the final rendered video reflects exactly the composed edit.

#### Acceptance Criteria

1. THE Timeline_Engine SHALL maintain a timeline model comprising sequences, tracks, clips, audio clips, text/caption clips, effects, and transitions, where each element records a track index, a timeline start time, and a timeline end time expressed in milliseconds with a resolution of 1 millisecond.
2. WHEN an operation modifies the composition, THE Timeline_Engine SHALL update the timeline model to reflect the operation and expose the updated model state within 100 milliseconds of accepting the operation.
3. IF an operation would place an element with a negative start time, a start time greater than or equal to its end time, or a track index outside the defined range of existing tracks, THEN THE Timeline_Engine SHALL reject the operation, leave the timeline model unchanged, and return an error indication describing the invalid placement.
4. WHEN a final render is requested, THE Render_Engine SHALL use the current Timeline_Engine timeline model as the sole authoritative source for the render, such that two renders of an unchanged timeline model produce byte-identical output.
5. WHEN a clip references source media, THE Timeline_Engine SHALL store the source in-point and out-point timings in milliseconds, distinct from and independent of the clip's timeline start and end times.
6. IF a clip references source media whose in-point is negative, whose out-point is less than or equal to its in-point, or whose out-point exceeds the source media duration, THEN THE Timeline_Engine SHALL reject the reference, leave the timeline model unchanged, and return an error indication describing the invalid source timing.

### Requirement 11: Professional Captions

**User Story:** As a creator, I want professional, readable captions placed appropriately for the target platform, so that my video communicates clearly without me styling captions manually.

#### Acceptance Criteria

1. WHEN captions are requested and word-level timing is available, THE Caption_Renderer SHALL generate captions using word-level timing.
2. IF captions are requested and word-level timing is not available, THEN THE Caption_Renderer SHALL generate captions using the available segment-level or phrase-level timing rather than failing caption generation.
3. WHEN captions are rendered into a video, THE Caption_Renderer SHALL render them deterministically, such that rendering the same timeline captions, Platform_Preset, and typography inputs produces identical caption output on every run.
4. WHEN captions are placed, THE Caption_Renderer SHALL position each caption so that its complete text bounding box falls entirely within the target Platform_Preset's safe areas.
5. WHEN captions are rendered, THE Caption_Renderer SHALL wrap caption text so that no rendered line exceeds the configured maximum characters-per-line limit.
6. WHEN captions are rendered, THE Caption_Renderer SHALL apply a contrast treatment between caption text and its immediate background that yields a text-to-background contrast ratio of at least 4.5:1.
7. WHERE the workspace defines brand typography, THE Caption_Renderer SHALL apply the workspace brand typography to captions.
8. IF applying the workspace brand typography fails, THEN THE Caption_Renderer SHALL render captions with default typography and SHALL surface an indication that the fallback occurred, rather than failing caption generation.

### Requirement 12: Audio Processing

**User Story:** As a creator, I want clean audio in my edited video, so that dialogue is clear and levels are consistent without altering my voice unless I ask.

#### Acceptance Criteria

1. WHEN an audio enhancement operation is requested, THE Deterministic_Editor SHALL normalize the output audio to the configured integrated loudness target within a tolerance of ±1.0 LU and SHALL produce output audio whose true-peak level does not exceed the configured true-peak ceiling.
2. WHEN the user explicitly requests silence removal, THE Deterministic_Editor SHALL remove only the silence segments identified from the Video_Analysis_Service audio features, SHALL keep every detected speech segment present and uncut in the output audio, and SHALL NOT remove any silence segment when silence removal was not explicitly requested.
3. IF a requested silence-removal range overlaps any detected speech segment, THEN THE Deterministic_Editor SHALL block the silence removal, SHALL leave the source audio unmodified, and SHALL return an error indication reporting the speech conflict so the caller knows the removal did not occur.
4. THE Deterministic_Editor SHALL keep the user's original voice audio byte-for-byte unmodified unless the user explicitly requests a voice change.
5. WHERE audio is generated by an AI provider, THE Video_Artifact for that generated audio SHALL record its provenance metadata including originating job, input version, provider, model, prompt, and cost.

### Requirement 13: Platform Presets and Brand-Aware Editing

**User Story:** As a creator, I want to target a specific platform and apply my brand style, so that outputs match platform requirements and my brand identity automatically.

#### Acceptance Criteria

1. THE Video_Editor SHALL load all Platform_Preset definitions from a single configuration source and SHALL reference that configuration source in every component that consumes preset values, such that changing a preset value in configuration changes the value used by all components without any code change.
2. WHEN a target platform is selected and a Platform_Preset exists for that platform, THE Editing_Planner SHALL apply that Platform_Preset's aspect ratio, recommended duration, safe areas, and export profile to the plan.
3. IF a target platform is selected and no Platform_Preset exists for that platform, THEN THE Editing_Planner SHALL reject the selection with an error indication identifying the unsupported platform and SHALL leave the existing plan unchanged.
4. WHEN a user requests use of their brand style and a workspace brand profile is defined, THE Editing_Planner SHALL apply the workspace brand profile's colors, fonts, and caption style to the plan.
5. IF a user requests use of their brand style and no workspace brand profile is defined, THEN THE Editing_Planner SHALL surface an error indication that no brand profile is available and SHALL leave the existing plan unchanged.
6. WHILE a project targets a Platform_Preset, THE Video_Editor SHALL validate the composition against that Platform_Preset's constraints on every change to the composition and SHALL surface any detected violation within 1 second of the change.
7. IF a composition violates a target Platform_Preset's constraint, THEN THE Video_Editor SHALL block the user from proceeding to render or export, SHALL present a violation indication identifying each violated constraint, and SHALL preserve the current composition without modification until every violation is resolved.

### Requirement 14: Quality Control and Repair Loop

**User Story:** As a creator, I want the system to check generated and rendered output for corruption and fix problems, so that I never receive a broken video presented as successful.

#### Acceptance Criteria

1. WHEN a generative operation produces output, THE Quality_Controller SHALL verify that the output file exists and is non-empty before performing any further validation.
2. WHEN the output file exists, THE Quality_Controller SHALL validate that the container, codec, dimensions, frame rate, and audio stream count match the values requested for the operation, and SHALL validate that the measured duration is within a tolerance of 0.5 seconds of the requested duration.
3. WHEN the Quality_Controller inspects output, THE Quality_Controller SHALL classify the output as a quality failure IF any of the following conditions hold: (a) a fully black frame sequence lasts 0.5 seconds or longer, (b) a frozen (visually unchanging) frame sequence lasts 2.0 seconds or longer, (c) an expected audio stream is absent or is silent for 100 percent of its duration, (d) the measured duration differs from the requested duration by more than 0.5 seconds, or (e) visual artifacts affect 25 percent or more of the frame area in any frame.
4. IF the Quality_Controller detects a quality failure, THEN THE Quality_Controller SHALL trigger one repair strategy selected from the configured set (retry, simplified prompt, deterministic fallback, alternative provider, or user clarification).
5. THE Quality_Controller SHALL enforce a configured maximum number of repair attempts (default 3) per operation and SHALL stop issuing further repair attempts once that maximum is reached.
6. WHEN the maximum repair attempts are reached and the quality failure persists, THE Quality_Controller SHALL apply one final fallback strategy of reverting to the prior valid version.
7. IF output remains a quality failure after the maximum repair attempts and the final fallback, THEN THE Quality_Controller SHALL preserve the prior valid version unchanged, SHALL NOT mark the render as successful, and SHALL return an error indication that quality control failed.

### Requirement 15: Rendering and Render Validation

**User Story:** As a creator, I want a real, playable final video file, so that I can preview and export a result that works on modern browsers and social platforms.

#### Acceptance Criteria

1. WHEN a render is requested, THE Render_Engine SHALL produce a real video file encoded as MP4 with H.264 video and AAC audio, or another configured export profile.
2. WHEN a render completes, THE Render_Engine SHALL validate that the output file exists and that its size is greater than or equal to the minimum byte size defined for the selected export profile.
3. WHEN a render completes, THE Render_Engine SHALL use FFprobe to validate that the output contains a video stream and that its container, codec, and dimensions match the selected export profile.
4. WHEN a render completes, THE Render_Engine SHALL use FFprobe to validate that the output duration is within 0.5 seconds of the timeline expected duration and that its frame rate is within 0.01 fps of the selected export profile's frame rate.
5. WHEN an audio track is expected, THE Render_Engine SHALL validate the presence of an audio stream in the rendered file.
6. WHEN all render validation checks pass, THE Render_Engine SHALL mark the Video_Edit_Job as completed.
7. IF render validation fails any check, THEN THE Render_Engine SHALL mark the Video_Edit_Job as failed, SHALL record an error code identifying the failed check, SHALL retain the immutable input version unchanged, and SHALL NOT expose the output as a successful render.

### Requirement 16: Conversational Multi-Turn Editing and Immutable Versioning

**User Story:** As a creator, I want to refine an edit through conversation and keep every prior version intact, so that I can iterate freely and restore earlier results.

#### Acceptance Criteria

1. WHEN a user issues a refinement request against an existing project and specifies a parent version, THE Video_Editor SHALL create a new Video_Version derived from the specified parent version.
2. WHEN a user issues a refinement request against an existing project without specifying a parent version, THE Video_Editor SHALL create a new Video_Version derived from the currently active version.
3. IF a refinement request specifies a parent version that does not exist, THEN THE Video_Editor SHALL reject the request, SHALL NOT create a new Video_Version, and SHALL return an error indication identifying the missing parent version.
4. WHEN a new Video_Version is created, THE Video_Editor SHALL preserve all prior Video_Versions unchanged.
5. IF an operation other than version creation attempts to modify an existing Video_Version, THEN THE Video_Editor SHALL reject the operation, SHALL leave the Video_Version unchanged, and SHALL return an immutability error indication.
6. WHEN a new Video_Version is created, THE Video_Version SHALL store a reference to its parent version.
7. WHEN a user requests to restore an existing prior version, THE Video_Editor SHALL make the specified version the active version without deleting other versions.
8. IF a user requests to restore a version that does not exist, THEN THE Video_Editor SHALL reject the request, SHALL preserve the current active version, and SHALL return an error indication identifying the missing version.
9. WHEN a user requests between 1 and 5 variants in one request, THE Editing_Planner SHALL create an independent editing plan for each requested variant and THE Render_Engine SHALL render and meter each variant independently.
10. IF a user requests more than 5 variants in one request, THEN THE Video_Editor SHALL reject the request, SHALL NOT create any variant, and SHALL return an error indication that the variant limit was exceeded.
11. THE Video_Editor SHALL persist Video_Project, Video_Source, Video_Version, Video_Edit_Operation, Video_Edit_Job, Video_Artifact, and timeline records in the existing MongoDB store with indexes on user, workspace, project, job, status, and creation time.

### Requirement 17: Credit Metering Integration

**User Story:** As a Veefore operator, I want every expensive AI video operation metered through the existing authoritative ledger, so that costs are recovered, reservations are reconciled, and users are never double-charged or surprised.

#### Acceptance Criteria

1. WHEN an operation requiring a generative provider call or incurring a credit cost is initiated, THE Video_Editor SHALL meter it through the existing Credit_Metering_Service and SHALL NOT create a separate credit accounting system.
2. WHEN a generative operation is initiated, THE Credit_Metering_Service SHALL reserve the estimated credits before the provider call.
3. WHEN a generative operation completes, THE Credit_Metering_Service SHALL reconcile the reservation against the measured actual usage within 30 seconds of the provider response, such that the user's net credit deduction equals the measured actual usage.
4. WHEN a generative operation retries, THE Credit_Metering_Service SHALL use an idempotency key so that the operation is charged at most once regardless of the number of retry attempts.
5. IF a provider call fails without incurring provider cost, THEN THE Credit_Metering_Service SHALL release the full reservation and restore the user's pre-reservation balance with no net deduction.
6. THE Video_Editor SHALL treat the server-side credit balance and cost as authoritative and SHALL NOT accept a client-supplied credit balance or cost.
7. WHEN the estimated cost of a generative operation is known before execution, THE Video_Editor SHALL present the credit estimate to the user and require confirmation before executing the operation.
8. IF the user does not confirm a presented credit estimate within 300 seconds, THEN THE Video_Editor SHALL cancel the operation, SHALL NOT call the provider, and SHALL NOT deduct credits.
9. IF a user's available credits are less than the estimated cost of a requested generative operation, or the user has zero credits even for a zero-cost edit, THEN THE Video_Editor SHALL block the operation, SHALL NOT call the provider, and SHALL present an upgrade or add-credit path without deducting credits.
10. IF insufficient credits are detected after provider communication has begun, THEN THE Video_Editor SHALL abort the provider communication within 5 seconds and SHALL release the reservation with no net deduction.

### Requirement 18: Asynchronous Job System

**User Story:** As a creator, I want long-running video operations to run in the background with real progress and the ability to cancel, so that I am not blocked and I stay informed.

#### Acceptance Criteria

1. WHEN a video operation of type analysis, generative editing, rendering, or export is initiated, THE Job_System SHALL enqueue and execute it asynchronously using the existing BullMQ/Redis queue infrastructure without blocking the initiating request.
2. THE Job_System SHALL represent each Video_Edit_Job with exactly one state at any given time drawn from the set {QUEUED, PREPARING, UPLOADING, ANALYZING, PLANNING, EDITING, RENDERING, QUALITY_CHECK, COMPLETED, FAILED, CANCELLED, RETRYING}, where COMPLETED, FAILED, and CANCELLED are terminal states from which no further state transition occurs.
3. WHEN a Video_Edit_Job is created, THE Job_System SHALL assign it a unique idempotency key, an attempt number starting at 1, a configurable timeout not exceeding 3600 seconds, and references to its input and output Video_Artifacts.
4. WHILE a Video_Edit_Job is executing, THE Job_System SHALL report progress as an integer percentage from 0 to 100 derived solely from the count of actually completed stages, and SHALL NOT report progress for stages that have not completed.
5. WHEN a user cancels a Video_Edit_Job, THE Job_System SHALL within 5 seconds mark the job CANCELLED, stop subsequent stages, cancel the provider operation where the provider supports cancellation, remove temporary files created by the job, and reconcile reserved credits through the Credit_Metering_Service.
6. IF an individual cleanup action fails during cancellation, THEN THE Job_System SHALL still mark the job CANCELLED and SHALL schedule a background retry of the failed cleanup action for up to 3 additional attempts using exponential backoff.
7. WHEN a Video_Edit_Job is retried after a transient failure, THE Job_System SHALL execute the retry idempotently using its idempotency key so that no duplicate side effects, artifacts, or credit charges occur, for up to a configured maximum of 3 attempts.
8. IF a Video_Edit_Job exceeds its configured timeout, THEN THE Job_System SHALL mark the job FAILED, record an error indicating a timeout occurred, and release any reserved credits through the Credit_Metering_Service.
9. IF a Video_Edit_Job reaches its configured maximum of 3 attempts without completing, THEN THE Job_System SHALL mark the job FAILED, record an error indicating retry attempts were exhausted, and release any reserved credits through the Credit_Metering_Service.

### Requirement 19: Security and Isolation

**User Story:** As a Veefore operator, I want strict server-side security, ownership enforcement, and injection defenses, so that user media, credits, and provider access are protected.

#### Acceptance Criteria

1. WHEN a Video_Editor API request references a target Video_Project, THE Video_Editor SHALL verify that the authenticated user is the owner of, or a workspace member with access to, that Video_Project before performing the operation.
2. IF a request targets a Video_Project the user does not own or have workspace access to, THEN THE Video_Editor SHALL reject the request with an HTTP 403 status and SHALL NOT return any Video_Project or artifact data.
3. WHEN artifact access is granted, THE Video_Editor SHALL deliver every artifact through a Signed_URL whose validity does not exceed 3600 seconds and SHALL NOT expose a permanent public storage path for any artifact.
4. IF an artifact is requested through an expired or invalid Signed_URL, THEN THE Video_Editor SHALL reject the request and SHALL NOT return the artifact content.
5. THE Video_Editor SHALL derive userId, workspaceId, credit balance, provider cost, job ownership, and output URLs from server-side state and SHALL NOT trust client-provided values for these fields.
6. WHEN handling an external or provider-supplied media URL, THE Video_Editor SHALL fetch only destinations included in the configured allowlist.
7. IF an external or provider-supplied media URL resolves to a destination outside the configured allowlist or to a private, loopback, link-local, or internal address, THEN THE Video_Editor SHALL reject the fetch and SHALL NOT issue the outbound request.
8. WHEN a user-facing error is returned, THE Video_Editor SHALL exclude provider API keys, secrets, credentials, and internal stack traces from the response, and SHALL log the full error and stack trace only server-side.

### Requirement 20: Storage Layout and Artifact Provenance

**User Story:** As a Veefore operator, I want a clear immutable storage layout with provenance metadata, so that every artifact is traceable and source media is protected.

#### Acceptance Criteria

1. THE Video_Editor SHALL store artifacts in the existing Storage_Service under a deterministic layout that places each artifact under exactly one of the following eight categories by artifact type: original, proxy, audio, thumbnails, analysis, generated, renders, and exports, scoped to its owning Video_Project.
2. WHEN a Video_Artifact is created, THE Video_Editor SHALL record provenance metadata for that artifact including originating job identifier, input version identifier, provider, model, prompt, and cost.
3. IF one or more of the required provenance metadata fields (originating job identifier, input version identifier, provider, model, prompt, cost) cannot be determined when a Video_Artifact is created, THEN THE Video_Editor SHALL reject creation of that artifact, SHALL NOT store it, and SHALL record an error indicating which provenance fields are missing.
4. WHEN a Video_Artifact has been stored, THE Video_Editor SHALL treat it as immutable and SHALL NOT overwrite, replace, or modify the stored artifact's bytes for the lifetime of the artifact.
5. WHEN a job reaches a terminal state of succeeded or failed, THE Video_Editor SHALL remove that job's temporary working files within 60 seconds of the terminal state being recorded.
6. IF a job has not reached a terminal state within its configured timeout (default 3600 seconds, configurable between 60 and 86400 seconds), THEN THE Video_Editor SHALL remove that job's temporary working files within 60 seconds after the timeout elapses.
7. IF removal of a job's temporary working files does not succeed on the first attempt, THEN THE Video_Editor SHALL retry removal up to 3 additional attempts and SHALL record an error indicating the temporary files could not be removed if all attempts fail.
8. IF a Video_Project is deleted, THEN THE Video_Editor SHALL retain the original Video_Source unless a configured product retention policy flag explicitly permits deletion of that Video_Source.

### Requirement 21: API Design

**User Story:** As a developer, I want the Video Editor to expose endpoints following existing Veefore API conventions, so that the feature integrates cleanly with the current backend.

#### Acceptance Criteria

1. THE Video_Editor SHALL expose endpoints to create, read, update, and delete a Video_Project, following the existing Veefore API request/response and routing conventions.
2. WHEN a create, read, update, or delete request targets a Video_Project, THE Video_Editor SHALL scope the operation to the requesting user's active workspace and SHALL return only Video_Projects owned by that user and workspace.
3. IF a Video_Project referenced by a request does not exist or is not owned by the requesting user's active workspace, THEN THE Video_Editor SHALL reject the request using the existing Veefore error-handling and status-code conventions without modifying any stored data.
4. THE Video_Editor SHALL expose endpoints to add an asset, trigger analysis, retrieve analysis, create a plan, submit edits, and request a render for a Video_Project, following the existing Veefore API conventions.
5. THE Video_Editor SHALL expose endpoints to read Video_Edit_Job status, cancel a Video_Edit_Job, list Video_Versions, restore a Video_Version, and export a Video_Project, following the existing Veefore API conventions.
6. WHEN a request to an endpoint that accepts input omits a required field or supplies a value that fails the endpoint's defined validation rules, THE Video_Editor SHALL reject the request using the existing Veefore error-handling and status-code conventions, indicate which validation constraint failed, and SHALL NOT create or mutate any Video_Editor record.
7. IF an endpoint returns an error, THEN THE Video_Editor SHALL use the existing Veefore error-handling and status-code conventions.

### Requirement 22: Observability and Admin Analytics

**User Story:** As a Veefore operator, I want structured logs and admin analytics for video operations, so that I can monitor cost, reliability, and usage.

#### Acceptance Criteria

1. WHEN a video lifecycle event from the defined event set (project creation, source ingestion, analysis start, analysis completion, plan creation, edit job submission, job start, job completion, job failure, render completion, and export completion) occurs, THE Video_Editor SHALL emit a structured log event using the existing logging infrastructure that includes event type, event timestamp, user identifier, workspace identifier, project identifier, and job identifier where a job is involved.
2. WHEN an AI provider call completes, THE Video_Editor SHALL emit a structured log event recording latency in milliseconds, provider, model, output duration in seconds, estimated cost in credits, actual cost in credits, and retry count.
3. IF an AI provider call fails, THEN THE Video_Editor SHALL emit a structured log event recording latency in milliseconds, provider, model, retry count, and a failure reason indicating the cause of the failure.
4. THE Video_Editor SHALL exclude provider API keys, secrets, authentication tokens, and signed or private media URLs from all emitted log events.
5. WHERE the existing admin analytics supports AI usage, THE Video_Editor SHALL extend it with video edit counts, generation counts, provider spend in credits, success rate (percentage of jobs that completed successfully out of all terminated jobs), retry rate (percentage of jobs that required at least one retry out of all jobs), and quality-control failure rate (percentage of jobs that failed quality control out of all jobs that reached quality control).
6. IF emitting a structured log event fails, THEN THE Video_Editor SHALL continue the in-progress video operation without aborting it.

### Requirement 23: No-Mock Production Integrity

**User Story:** As a Veefore operator, I want the feature to contain no mocked or fake behavior in production paths, so that every user-visible action reflects a real backend operation.

#### Acceptance Criteria

1. WHEN a user-visible action is invoked in a production path, THE Video_Editor SHALL execute a backend operation and SHALL return only data that originated from that executed operation, and SHALL NOT return responses served by mock, stub, simulated, or hardcoded handlers.
2. WHEN the Video_Editor reports rendering or job progress, THE Video_Editor SHALL derive the reported progress value from the actual completion state of the executing backend operation, and SHALL NOT advance progress using timer-based or otherwise untethered interpolation that is not bound to actual operation state.
3. WHEN the Video_Editor returns a provider output for a request, THE Video_Editor SHALL return only output that was produced by the provider for that specific request, and SHALL NOT return placeholder or hardcoded outputs represented as successful results.
4. IF a capability cannot yet be implemented for a request, THEN THE Video_Editor SHALL route the request to a real supported fallback operation or expose an explicit unavailable state, and SHALL NOT return a success response for an operation that did not execute.
5. IF a backend operation fails, THEN THE Video_Editor SHALL report a failure state to the caller with an error indication describing the failure, and SHALL preserve the pre-operation state of any affected data without partial or fabricated results.
6. WHILE the actual completion state of an executing backend operation is unknown, THE Video_Editor SHALL report progress as indeterminate and SHALL NOT report a specific completion percentage or a completed state.

### Requirement 24: End-to-End Acceptance Scenarios

**User Story:** As a Veefore stakeholder, I want the defined acceptance scenarios to work end-to-end with real services, so that the feature is verifiably complete.

#### Acceptance Criteria

1. WHEN a user uploads a 30-second video and requests a 15-second version, THE Video_Editor SHALL perform the edit with the Deterministic_Editor, SHALL NOT call a generative provider, and SHALL NOT charge generative credits. (Acceptance Test A)
2. WHEN the edit in Acceptance Test A completes, THE Render_Engine SHALL produce an MP4 file with H.264 video and AAC audio that decodes and plays from the first frame to the last frame without a decode error and whose duration is 15 seconds within a tolerance of 0.5 seconds. (Acceptance Test A)
3. WHEN a user uploads a clip within the selected provider's editable-input capability recorded in the Provider_Capability_Registry and requests removal of a background object while keeping everything else unchanged, THE Video_Editor SHALL route to the Generative_Editor, reserve the estimated credits before the provider call, call the provider server-side, and reconcile credits against measured actual usage after the provider response. (Acceptance Test B)
4. WHEN the generative edit in Acceptance Test B completes, THE Video_Editor SHALL store the actual provider output as a Video_Artifact, THE Timeline_Engine SHALL insert it into the timeline, THE Quality_Controller SHALL run quality control on it, and THE Render_Engine SHALL produce a final render. (Acceptance Test B)
5. WHEN a user issues a refinement request followed by an opposing refinement request, THE Video_Editor SHALL create exactly one new Video_Version for each request using the current version state, SHALL keep the original Video_Source byte-for-byte unchanged, and SHALL render frames pixel-identical to the prior version for ranges unaffected by each refinement. (Acceptance Test C)
6. WHEN a user uploads a 60-second video and requests a generative change only where a background person appears, THE Video_Editor SHALL analyze the full video with the Video_Analysis_Service, identify the relevant ranges, segment according to the provider capability recorded in the Provider_Capability_Registry, generatively edit only the affected ranges, stitch the final output, and render frames pixel-identical to the source for ranges where the background person does not appear. (Acceptance Test D)
7. IF a user whose reserved estimate exceeds their available credit balance attempts a generative edit, THEN THE Video_Editor SHALL NOT call the provider, SHALL NOT present a success result, SHALL present an actionable message containing a selectable upgrade or add-credit action, and SHALL NOT deduct credits. (Acceptance Test E)
