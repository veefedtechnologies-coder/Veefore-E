# Design — Auto Pilot Intelligence Overhaul

## Overview

Add a thin **vision-grounding + intent** layer that feeds real signal (what the
media shows, what the user wants) into the existing loop stages, plus a
deterministic **content matcher** so "AI arrange" is meaningful. No stage is
re-implemented; each existing service gains grounded inputs.

```
upload ──► MediaPoolItem { visionAnalysis?, userIntent?, userKeyword? }
                    │
GATE/ACT tick ──►  VisionGroundingService.ensure(item)  (analyze once, cache)
                    │  vision description + user intent/keyword
                    ├─► draftCaptionFallback(..., grounding)      (R2)
                    ├─► automationDecisionService.decide(..., grounding)  (R4)
                    └─► ContentMatcher.pickForSlot(theme, pool)   (R5)
```

## Components

### 1. MediaPoolItem model (R3.1)
Add two optional fields:
- `userIntent?: string` — free-text purpose for the item.
- `userKeyword?: string` — explicit automation trigger keyword.
Keep `visionAnalysis?: Record<string, unknown>` (already present); we store
`{ description: string, analyzedAt: string }`.

### 2. VisionGroundingService (R1) — new
`server/features/autopilot/services/VisionGroundingService.ts`
- `ensureDescription(item): Promise<string | undefined>`:
  - if `item.visionAnalysis?.description` present → return it (R1.2);
  - else call injected `analyzeMedia(mediaUrl, mediaType)` under
    `withAIFeature('autopilot.vision', …)` with a timeout (R1.4);
  - on success persist via `mediaPoolRepository.setVisionAnalysis(id,
    { description, analyzedAt })` and return it;
  - on any failure return `undefined` (R1.3).
- Ports injected: `{ analyze(mediaUrl, mediaType): Promise<string|undefined> }`
  (default → `aiServiceManager.analyzeMedia`) and a `store.setVisionAnalysis`
  (default → `mediaPoolRepository`). Fully unit-testable.
- Exposes a `MediaGrounding` type: `{ description?, userIntent?, userKeyword? }`.

### 3. gateActStage wiring (R2, R4)
- In PASS 1, after `ensureSlotMedia` resolves the item, build a `MediaGrounding`
  from the pool item (vision description via VisionGroundingService + item's
  `userIntent`/`userKeyword`).
- Pass grounding into `draftCaptionFallback(mission, format, theme, grounding)`
  and into `automationDecisionService.decide(mission, slot, caption, { grounding })`.
- Keep everything best-effort; missing grounding → current behavior.

### 4. AutomationDecisionService (R3.3, R4)
- `decide(..., options)` gains `options.grounding?: { description?, userIntent?,
  userKeyword? }`. The prompt includes the media description + user intent; the
  builder instructs the model to use the user's intent when present.
- After parsing, if `grounding.userKeyword` is set, **override** the decision's
  `triggerKeyword` with the normalized user keyword (R4.2), and if the user's
  intent clearly implies automation, bias `needsAutomation` true only when a
  valid type/fields exist (safe default preserved, R4.3).
- `draftRule` already maps `triggerKeyword` → rule keywords, so the override flows
  through unchanged.

### 5. ContentMatcher (R5) — new, deterministic
`server/features/autopilot/services/ContentMatcher.ts`
- `pickForSlot(theme, format, pool, opts): poolItem | null`:
  - filter pool by accepted media types for the format + availability + not
    already claimed this tick;
  - score each candidate by keyword overlap between the slot `theme` (+ niche)
    and the candidate's cached `visionAnalysis.description` (tokenize, stopword
    filter, Jaccard-ish overlap); tie-break by oldest `createdAt` (stable);
  - if no candidate has a description, return the first eligible (R5.2 fallback).
- Pure/deterministic → unit-testable. Used by `ensureSlotMedia` to choose the
  best available pool item instead of `pool.find(first)`.

### 6. Upload path (R3.2)
- `MediaPoolService.addUpload` + `GeneratedMediaInput`/`MediaUploadInput` gain
  optional `userIntent`/`userKeyword`, persisted on create.
- `media.controller.ts#uploadMedia` reads `userIntent`/`userKeyword` from the
  multipart body and forwards them.
- Client `autopilotApi.uploadMedia(missionId, file, meta?)` sends them;
  `MediaUploadCard` adds a per-tile intent/keyword editor (lightweight popover)
  and a PATCH is out of scope — intent is set at upload time (v1).

## Error handling / bounds
- Vision call raced against a timeout (default 20s); abort on timeout; degrade.
- All new reads/writes are best-effort with try/catch; the loop never throws.
- Content matcher is synchronous and cheap (string scoring), no I/O.

## Testing
- `VisionGroundingService`: cache hit (no analyze), cache miss (analyze+persist),
  failure/timeout → undefined, persist shape.
- `AutomationDecisionService`: user-keyword override; grounding in prompt;
  safe-default preserved on failure.
- `ContentMatcher`: best-match by description, fallback when no descriptions,
  no double-assignment, format filtering.
- Existing suites (gateActStage indirectly, media controller) stay green.

## Out of scope (documented follow-up — R6)
Reasoned THINK/PLAN from analytics + MEASURE/LEARN feedback loop. Left as tasks.
