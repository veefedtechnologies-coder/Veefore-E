# Requirements — Auto Pilot Intelligence Overhaul

## Introduction

Auto Pilot makes real LLM calls but starves them of the two inputs that matter:
what the media actually contains, and what the user intends for each item. The
result is generic captions, arbitrary "AI arrange" ordering, and automations
whose trigger keyword/CTA is unrelated to the media. This feature makes the AI
**grounded** (it sees each media item) and **intent-aware** (it honors per-item
user instructions), so captions, hashtags, media ordering, and engagement
automations reflect the real content and the user's goal.

Vision (`AIServiceManager.analyzeMedia`) and a `visionAnalysis` cache field on
`MediaPoolItem` already exist but are unused by the loop. This feature wires them
in and builds the intent + matching layers on top.

## Requirements

### Requirement 1 — Vision grounding of media
**User story:** As a creator, I want Auto Pilot to actually look at my photo/video
so captions and automations describe what's really in it.

#### Acceptance Criteria
1. WHEN a media pool item has no cached `visionAnalysis`, THE system SHALL call
   `AIServiceManager.analyzeMedia` and persist the returned description via
   `setVisionAnalysis`, so it is analyzed at most once.
2. WHEN an item already has `visionAnalysis`, THE system SHALL reuse it and NOT
   re-analyze (idempotent, no duplicate spend).
3. WHEN vision analysis is unavailable (throws/times out/returns empty), THE
   system SHALL degrade gracefully to the existing text-only path without failing
   the loop.
4. THE vision call SHALL be attributed via `withAIFeature('autopilot.vision', …)`
   and be bounded so a slow/large media never hangs the loop tick.

### Requirement 2 — Vision-grounded captions & hashtags
**User story:** As a creator, I want captions that reference what's actually shown.

#### Acceptance Criteria
1. WHEN drafting a caption for a slot with assigned media, THE system SHALL
   include that media's vision description in the caption prompt.
2. WHEN a vision description is present, THE generated hashtags SHALL be derived
   with that description in context (not theme text alone).
3. WHEN no vision description is available, THE system SHALL fall back to the
   current theme-grounded caption + derived hashtags (no regression).

### Requirement 3 — Per-media user intent & keyword
**User story:** As a creator, I want to tell Auto Pilot what a specific item is for
(e.g. "comment PLAN → DM the guide"), and have it honored.

#### Acceptance Criteria
1. THE `MediaPoolItem` SHALL store an optional `userIntent` (free text) and
   `userKeyword` (trigger keyword) per item.
2. WHEN uploading media, THE upload API SHALL accept optional `userIntent` and
   `userKeyword` and persist them on the item.
3. WHEN an item carries a `userKeyword`, THE automation decision SHALL use that
   exact keyword as the trigger (overriding any AI-derived keyword).
4. WHEN an item carries a `userIntent`, THE automation decision and caption SHALL
   be conditioned on that intent.
5. WHEN neither is set, THE system SHALL fall back to AI-derived behavior (no
   regression).

### Requirement 4 — Vision-grounded automation decisions
**User story:** As a creator, I want auto-replies whose keyword/CTA match the media.

#### Acceptance Criteria
1. WHEN deciding whether a post needs an engagement automation, THE decision
   SHALL receive the media's vision description and the item's user intent/keyword.
2. WHEN a user keyword is present, THE drafted rule's trigger keyword SHALL equal
   it (case/space-normalized) rather than an AI guess.
3. THE existing safe-default behavior (no automation on LLM failure / no genuine
   CTA) SHALL be preserved.

### Requirement 5 — Real "AI arrange" (content ↔ slot matching)
**User story:** As a creator, when I pick "Let AI arrange", the order should reflect
the media content, not upload order.

#### Acceptance Criteria
1. WHEN multiple available pool items fit a slot's format, THE system SHALL pick
   the item whose vision description best matches the slot's theme (deterministic
   scoring), instead of the first-found item.
2. WHEN no vision descriptions exist, THE system SHALL fall back to the current
   first-match behavior (no regression).
3. THE matching SHALL never assign the same item to two slots in one tick.

### Requirement 6 — Reasoned planning (future extension)
**User story:** As a creator, I want the plan's formats/themes/timing chosen from my
real analytics and media, and to improve over time.

#### Acceptance Criteria
1. THE THINK/PLAN stages SHOULD derive formats/themes/timing from the account's
   analytics + the vision media inventory + the goal (documented for a follow-up;
   not required for the initial grounding implementation).
2. MEASURE→LEARN SHOULD bias future choices toward what moves the goal metric.

## Non-functional
- Reuse existing services (`AIServiceManager`, `MediaPoolService`,
  `AutomationDecisionService`, `GateService`, loop stages); inject ports for tests.
- Bounded + degradable: no loop hang/crash on vision/analytics failure.
- Mission-scoped; no Instagram/Facebook regressions.
