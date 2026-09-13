# Spec Prompt — Facebook Page Engagement Automation (comment → reply / comment → DM)

> Paste this into a new spec session (requirements → design → tasks → implement).
> It captures a completed code trace of why Facebook Page auto-replies do not fire
> today, and exactly what must be built to make them work — mirroring the existing
> Instagram automation path.

## Goal

Make Auto Pilot's drafted `facebook`-platform engagement-automation rules actually
fire on a connected Facebook Page — auto-replying to comments and sending DMs —
mirroring the existing Instagram automation path, without regressing Instagram.

## Background / current state (verified in the codebase)

- Auto Pilot already **drafts, gates, and activates** engagement-automation rules
  with `platform: 'facebook'`:
  - `server/features/autopilot/services/AutomationDecisionService.ts` (draftRule,
    `normalizePlatform`)
  - `server/features/autopilot/workers/gateActStage.ts` (decision → draft → gate →
    activate, plus PASS 2b activation on approval)
  - `server/features/autopilot/workers/autopilotAutomationWorker.ts` (toggles rule
    active/inactive via `automationRuleRepository.toggleActive`)
  The rules persist and toggle active correctly, but they **never trigger**.

- Facebook Page **publishing already works** via `FacebookProvider.publish`
  (`server/features/facebook/providers/FacebookProvider.ts`) and the Auto Pilot
  publish worker (`server/features/autopilot/workers/autopilotPublishWorker.ts`).

- The Instagram automation path to **mirror**:
  Meta webhook → `server/meta-compliant-webhook.ts` (`handleEvent`) /
  `server/routes/webhooks.ts` → `AutomationSystem.processComment`
  (`server/automation-system.ts`) → `server/services/TriggerEngine.ts`
  (`evaluateAndTrigger`) → public reply / DM send.
  Rules live in `AutomationRuleModel` (`server/models/Automation.ts`) accessed via
  `automationRuleRepository` (`server/repositories/AutomationRepository.ts`).
  Comment jobs are processed by `server/workers/automationWorker.ts`.

## The three confirmed gaps this spec must close

### 1. No Facebook webhook ingestion
All receivers reject non-Instagram events:
- `server/meta-compliant-webhook.ts` `handleEvent` (~line 117):
  `if (payload.object !== 'instagram') { ...; return }`
- `server/routes/webhooks.ts` POST `/instagram` (~line 109): gated on
  `object === 'instagram'`
- `server/features/instagram/webhooks/webhook-router.ts`: typed `object: 'instagram'`,
  resolves accounts with `platform === 'instagram'`

Facebook Page events arrive as:
- `object: "page"`, `entry[].changes[].field === "feed"`, with
  `value.item === "comment"` and `value.verb === "add"` for new comments
- a `messaging` array (Messenger Send API shape) for DMs

**Build** a receiver/branch that: verifies the signature (App Secret), acks 200 fast,
parses the `page` shape, ignores the page's own comments, dedupes by comment id,
resolves the page via `socialAccountRepository.findByAccountId(pageId)` (platform
`facebook`), and enqueues an automation job on the existing queue path.

### 2. No webhook subscription for the page
Nothing calls `POST /{pageId}/subscribed_apps`. **Add** a
`subscribed_fields=feed,messages` subscription during Facebook connect in
`server/features/facebook/oauth/FacebookOAuthService.ts`, plus a backfill job for
pages that are already connected.

### 3. Trigger + execution are Instagram-only
- `server/automation-system.ts` `processComment` (~line 351) filters accounts to
  `platform: 'instagram'`.
- DM send uses Instagram messaging endpoints/semantics.

**Make the path platform-aware**: resolve the Facebook Page account, run the **same**
`TriggerEngine` keyword/rule matching, and route sends through Facebook endpoints —
public reply via `POST /{comment-id}/comments`, DM via the Messenger Send API
`POST /{pageId}/messages` with the correct `messaging_type`/tag (and
`recipient.comment_id` for private replies where applicable).

## Requirements to cover

- Reuse the existing rule schema, `TriggerEngine`, anti-spam, idempotency (dedupe by
  comment id), and credit-charging paths — **do not fork the engine**; add platform
  routing only.
- Keyword matching (`contains` / `any`), negative keywords, and the three automation
  types (`comment_only`, `dm_only`, `comment_dm`) must behave identically to Instagram.
- Respect required Meta permissions/scopes (`pages_manage_engagement`,
  `pages_messaging`, `pages_read_engagement`) and handle token-expiry /
  `REQUIRES_RECONNECT` gracefully.
- Signature verification for the page webhook (App Secret), fast 200 ack, async
  processing via the existing queue.
- Full unit tests for: `object: "page"` parsing, account resolution, platform routing
  in `AutomationSystem`, and Facebook reply/DM senders (mock the Graph API).
  Note: true end-to-end firing can only be verified against a live Page with a
  configured Meta webhook subscription.

## Constraints

- Follow existing repo conventions (repositories, `GovernedHttpClient` for Graph
  calls, injected ports for testability).
- Do **not** regress the Instagram automation path.
- Keep everything behind the existing `platform` field so Auto Pilot's already-drafted
  Facebook rules light up with no further changes to the Auto Pilot code.

## Deliverables

Produce `requirements.md` → `design.md` → `tasks.md`, then implement. Suggested
sequencing (highest leverage first):
1. Page subscription (`subscribed_apps`) + backfill.
2. `object: "page"` webhook receiver → enqueue automation job.
3. Platform-aware `AutomationSystem` + Facebook reply/DM senders via `FacebookProvider`.
