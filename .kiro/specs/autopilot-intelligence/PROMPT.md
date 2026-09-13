# Spec Prompt — Auto Pilot Intelligence Overhaul (vision-grounded, goal-driven)

> Paste this into a new spec session (requirements → design → tasks → implement).
> It captures a completed code trace of *why Auto Pilot currently feels random /
> "not really AI"*, and what to build so the AI genuinely reasons over the user's
> media, intent, and analytics to drive the mission goal.

## Problem statement (verified in the codebase)

Auto Pilot makes real LLM calls, but they are **starved of the two inputs that
matter** — what the media actually contains, and what the user intends for each
piece. As a result the output feels random or templated. Concretely:

1. **Captions are blind.** `server/features/autopilot/workers/gateActStage.ts`
   → `draftCaptionFallback()` prompts the LLM with only the slot *theme text* +
   niche + brand voice. It never looks at the actual image/video. So captions are
   generic, not grounded in the media.
   - The vision capability already exists and is **unused** by the loop:
     `AIServiceManager.analyzeMedia(mediaUrl, mediaType)` downloads the media and
     returns a factual description (Gemini for image+video, OpenAI vision for
     images). `MediaPoolItemModel` has a `visionAnalysis` field and
     `MediaPoolRepository.setVisionAnalysis()` — currently never written.

2. **"Let AI arrange" is effectively a no-op.** `ContentSourceResolver.ts` picks
   media with `pool.find(...)` — the *first* format-matching available item.
   There is no AI/analytics ranking of which media suits which theme, slot, or
   post time. The `MediaUploadCard` "Let AI arrange" toggle does not change the
   actual ordering the loop uses.

3. **Automations reason over the wrong input.** `AutomationDecisionService.decide()`
   is a real LLM call, but it reasons over the *ungrounded* caption and has **no
   per-media user intent/keyword**. So the trigger keyword/CTA it invents is not
   tied to what the media shows or to anything the user asked for → "random
   automation."

4. **Planning is templated, not reasoned.** THINK/PLAN
   (`server/features/autopilot/services/stages/StrategyService.ts` /
   `PlannerService.ts`) fill a cadence-based calendar rather than choosing
   formats/themes/timing from the account's real analytics + the actual media
   inventory.

Net: the AI is real but shallow. This spec makes it grounded and goal-driven.

## Goal

Make Auto Pilot genuinely intelligent: it should (a) *see* each media item,
(b) honor the user's per-item intent, (c) match/order content by content +
analytics + goal, and (d) derive captions, hashtags, and automations from what
the media actually is — so every action visibly serves the mission goal.

## What to build

### 1. Vision grounding (foundational)
- On upload (and lazily in the loop if missing), run `AIServiceManager.analyzeMedia`
  on each Media_Pool item and cache the description via `setVisionAnalysis`
  (dedupe: never re-analyze an item that already has it).
- Feed the vision description into: caption drafting, hashtag generation, AND the
  automation decision — replacing the theme-only prompt in
  `draftCaptionFallback()` and the caption-only input to `decide()`.
- Best-effort + bounded (respect the loop's per-tick time budget); degrade to the
  current text-only path if vision is unavailable. Attribute spend via
  `withAIFeature('autopilot.vision', …)`.

### 2. Real "AI arrange" (content ↔ slot matching + ordering)
- Replace `ContentSourceResolver`'s first-match `pool.find` with an AI/heuristic
  ranker that assigns each media item to the best theme + slot + post time, using:
  the vision descriptions, the mission Strategy (THINK), and the best-post-time /
  performance analytics already computed (`AnalyticsService` / bestTime engine).
- The `MediaUploadCard` "Let AI arrange" vs "I'll arrange" toggle must actually
  drive this: AI mode → ranker decides order; manual mode → user order is honored.

### 3. Per-media user intent + keyword
- Let the user attach, per uploaded item: an optional note/intent and an optional
  automation keyword (e.g. "this reel → comment `PLAN` → DM the meal-prep guide").
- Persist it on the Media_Pool item; the automation decision must **honor an
  explicit user keyword/intent** instead of guessing, and only fall back to
  AI-derived keywords when the user left it blank.
- UI: extend `MediaUploadCard` with a lightweight per-tile intent/keyword field.

### 4. Reasoned planning (THINK/PLAN)
- THINK derives a concrete strategy (which formats, themes, cadence, and timing)
  from the account's real analytics + the vision inventory + the goal metric, and
  PLAN produces slots from that strategy — not a fixed cadence template.
- MEASURE→LEARN closes the loop: use per-post performance to bias future
  format/theme/timing choices toward what actually moves the goal metric.

## Constraints & guardrails

- Reuse existing services — do NOT re-implement: `AIServiceManager` (text/json/
  vision), `AnalyticsService`/bestTime, `MediaPoolService`/`MediaPoolRepository`,
  `AutomationDecisionService`, `GateService`, `ActPublishService`, the Operating
  Loop stages, and `withAIFeature` credit attribution.
- Everything stays behind injected ports for unit-testability (mock the LLM/vision).
- Respect per-tick time/credit budgets; vision + ranking must be bounded and
  degrade gracefully so the loop never hangs or crashes.
- Preserve current behavior when media/vision/analytics are missing (safe fallback).
- Keep it mission-scoped (media and analytics already scoped per mission/account).
- Do not regress Instagram; keep Facebook publishing working.

## Acceptance (what "genuinely works" means)

- A caption references what is actually in its media (verified against the vision
  description), not just the theme word.
- "Let AI arrange" produces a content order that reflects media content + best
  post times, and differs from raw upload order when that's better.
- An automation's trigger keyword/CTA matches either the user's stated keyword or
  the actual media content — never an unrelated guess.
- The plan's format/theme/timing choices trace back to the account's analytics and
  the goal, and shift over time based on MEASURE/LEARN.
- Full unit tests with mocked LLM/vision/analytics for: vision caching, grounded
  caption, grounded automation keyword (incl. user-keyword override), the AI
  ranker/ordering, and analytics-driven planning.

## Key files (context)

- `server/services/AIServiceManager.ts` — `analyzeMedia` (vision), generateText/JSON.
- `server/features/autopilot/workers/gateActStage.ts` — `draftCaptionFallback`,
  `ensureSlotMedia`, automation decision wiring.
- `server/features/autopilot/services/AutomationDecisionService.ts` — `decide`,
  `draftRule` (add user-keyword override).
- `server/features/autopilot/services/ContentSourceResolver.ts` — first-match →
  AI ranker.
- `server/features/autopilot/services/stages/StrategyService.ts`,
  `PlannerService.ts`, `MeasureService.ts`, `LearnService.ts` — reasoned planning.
- `server/features/autopilot/db/models/MediaPoolItemModel.ts` +
  `db/repositories/MediaPoolRepository.ts` — `visionAnalysis`, add intent/keyword.
- `client/src/features/autopilot/components/MediaUploadCard.tsx` — per-tile
  intent/keyword + working arrange toggle.

Deliver as requirements → design → tasks, then implement (vision grounding first —
it's the foundation the other three build on).
