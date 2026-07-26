# Requirements Document

## Introduction

VeeGPT Auto Pilot turns the currently non-functional "Auto Pilot" sidebar button into a real, goal-driven autonomous social media growth agent for Veefore. The user sets an outcome (for example, "reach 10,000 followers"), a niche, a brand voice, and guardrails; Auto Pilot then decomposes that outcome into a rolling content and growth strategy and runs a continuous operating loop: SENSE (analytics + web research) → THINK → PLAN → GATE (approval) → ACT (create, schedule, publish, and draft engagement automation) → MEASURE → LEARN. Progress against the goal is narrated back to the user inside the VeeGPT chat, and a dedicated Auto Pilot view provides mission setup plus a mission-control status dashboard.

Auto Pilot is built by orchestrating existing Veefore infrastructure rather than reinventing it: the VeeGPT tool-calling engine and streaming chat UI, the self-owned web research/trend engine, the analytics and growth-recommendation services, the rule-based engagement automation stack (`AutomationRule`, `TriggerEngine`, `automationWorker`, `AntiSpamService`, `AuditTrailService`, `VariableProcessor`), the content-generation services (AI image, AI video, caption/hashtag generation, media vision analysis), the Instagram publishing and scheduling services, the BullMQ/Redis/MongoDB job infrastructure, the credit/usage tracking (`withAIFeature`), and the notification channels (mobile FCM, server notification queue, in-app inbox, email).

A signature capability is the **just-in-time content brief flow**: instead of forcing the user to upload media upfront, Auto Pilot monitors the account, and when a future content slot needs user-created media, it sends a content brief ahead of time with step-by-step creation instructions. It uses smart lead-time calculation to work backward from the publish time so no scheduled slot is ever missed, escalating reminders and falling back to AI-generated backup content or rescheduling if the user does not deliver. A second signature capability is **human-like automation reasoning**: for each finalized post, Auto Pilot uses LLM reasoning (not regex) to decide whether the post needs engagement automation and, if so, which type (comment-only, DM-only, or comment→DM), deriving the trigger keyword from the caption/CTA it authored.

### Scope for v1

- **Platform:** Instagram first (most mature publishing path). The design must allow additional platforms to be added later without re-architecting.
- **Primary content source:** the user media pool fed by the just-in-time content brief flow. Fully AI-generated content is a supported fallback/backup source.
- **Engagement automation:** Auto Pilot *drafts* automation rules; human approval before going live is the safe default, always required in Copilot mode.
- **Operating modes:** Copilot (propose-and-approve) and Autopilot (execute-within-guardrails), selectable per mission.

### Out of Scope for v1

- Platforms other than Instagram for autonomous execution (the design must remain extensible to them).
- Browser web-push notifications for the "app closed" state, because the web service worker (`client/public/sw.js`) is deliberately disabled and self-destructs. Web notifications for Auto Pilot rely on the in-app inbox and email; mobile uses FCM.
- Re-implementing the engagement automation engine, publishing services, research engine, analytics services, credit tracking, or notification transports — these are reused as dependencies.

## Glossary

- **Auto_Pilot**: The autonomous growth agent feature specified by this document, orchestrating existing Veefore services to pursue a user-defined goal.
- **Mission**: A single goal-driven engagement bound to one workspace and one connected Instagram account, containing the goal, niche, brand voice, guardrails, operating mode, budget, and current state.
- **Goal**: The user-defined target outcome of a Mission, expressed as a measurable objective (for example, follower count) with an optional target date.
- **Operating_Mode**: The per-Mission execution setting, either `Copilot` (Auto_Pilot proposes and the user approves each item) or `Autopilot` (Auto_Pilot executes autonomously within guardrails and escalates edge cases).
- **Operating_Loop**: The continuous cycle Auto_Pilot runs for an active Mission: SENSE → THINK → PLAN → GATE → ACT → MEASURE → LEARN.
- **Strategy**: The decomposition of a Goal into a rolling plan of content themes, cadence, and growth actions produced during THINK/PLAN.
- **Content_Plan**: The forward-looking schedule of planned posts (each a Content_Slot) generated from the Strategy.
- **Content_Slot**: A single planned post occupying a specific publish time, with a required content source (media pool, user-created via brief, or AI-generated), draft caption, hashtags, and any drafted automation.
- **Content_Brief**: A set of step-by-step instructions Auto_Pilot sends to the user asking them to create a specific piece of media for an upcoming Content_Slot, including concept, hook, shot list, and suggested caption.
- **Media_Pool**: The accumulating collection of user-uploaded and AI-generated media items available to Auto_Pilot for a Mission's workspace.
- **Lead_Time**: The estimated duration a Content_Brief's media takes to create, computed from content complexity plus a safety buffer, used to determine when the brief must be sent.
- **Approval_Card**: An interactive item Auto_Pilot pushes into the VeeGPT chat (and the Auto Pilot view) for a user to approve, edit, or reject a proposed action.
- **Engagement_Automation**: A drafted or active `AutomationRule` (comment-reply, DM-reply, or comment→DM) attached to a published post, executed by the existing TriggerEngine/automationWorker stack.
- **Automation_Decision**: Auto_Pilot's LLM-driven determination of whether a post needs Engagement_Automation and, if so, which type and trigger keyword.
- **Guardrails**: The per-Mission constraints Auto_Pilot must operate within: brand voice, banned topics, posting-frequency caps, credit/cost budget, and the set of actions requiring human approval.
- **Credit_Budget**: The maximum credits a Mission is permitted to consume, tracked against actual consumption reported by the credit/usage system.
- **Mission_Control**: The Auto Pilot view showing Mission setup and live status, progress toward the Goal, pending approvals, and the Operating_Loop activity log.
- **Audit_Record**: A persisted, reversible record of every autonomous action Auto_Pilot takes, created through the existing AuditTrailService.
- **Escalation**: The act of surfacing a decision or edge case to the user for input via notifications and Approval_Cards when Auto_Pilot cannot proceed autonomously.
- **User_Input_Notification**: A notification informing the user that Auto_Pilot needs their input, delivered via mobile FCM push, and on web via the in-app inbox with email fallback.

## Requirements

### Requirement 1: Mission Setup and Goal Definition

**User Story:** As a creator, I want to define a growth goal, niche, brand voice, and guardrails, so that Auto Pilot pursues my desired outcome on my terms.

#### Acceptance Criteria

1. WHEN a user opens the Auto Pilot view, THE Auto_Pilot SHALL present a Mission setup form capturing Goal, niche (1 to 100 characters), brand voice (1 to 2000 characters), Operating_Mode, and Guardrails.
2. WHEN a user submits a Mission setup form, THE Auto_Pilot SHALL require a Goal whose target metric is a numeric value between 1 and 100,000,000 inclusive, and SHALL accept an optional target date.
3. IF a submitted Mission omits the target metric or the target metric is not a numeric value within the range 1 to 100,000,000 inclusive, THEN THE Auto_Pilot SHALL reject the submission, retain the user's entered form values, and return a message identifying the missing or invalid target metric.
4. IF a submitted Mission includes a target date that is not later than the submission date, THEN THE Auto_Pilot SHALL reject the submission, retain the user's entered form values, and return a message indicating that the target date must be a future date.
5. WHEN a user creates a Mission, THE Auto_Pilot SHALL bind the Mission to exactly one workspace and one connected Instagram account.
6. IF a user attempts to create a Mission for a workspace with no connected Instagram account, THEN THE Auto_Pilot SHALL reject the creation and return a message directing the user to connect an Instagram account.
7. WHEN a user selects an Operating_Mode during setup, THE Auto_Pilot SHALL store the selected mode as either `Copilot` or `Autopilot`.
8. WHEN a user changes the Operating_Mode of an existing Mission, THE Auto_Pilot SHALL store the new Operating_Mode and apply it to all subsequent actions for that Mission.

### Requirement 2: Goal Decomposition and Strategy

**User Story:** As a creator, I want Auto Pilot to turn my goal into a concrete content and growth strategy, so that daily actions ladder up to my outcome.

#### Acceptance Criteria

1. WHEN a Mission becomes active, THE Auto_Pilot SHALL generate a Strategy within 300 seconds that decomposes the Goal into one or more content themes, a posting cadence expressed as a number of posts per time period, and one or more growth actions.
2. WHEN generating a Strategy, THE Auto_Pilot SHALL use the analytics services and the web research engine as inputs to the Strategy.
3. IF the analytics services or the web research engine are unavailable while generating a Strategy, THEN THE Auto_Pilot SHALL generate the Strategy from the remaining available inputs, record each unavailable input in an Audit_Record, and mark the Strategy as generated with reduced inputs.
4. IF Strategy generation fails, THEN THE Auto_Pilot SHALL record the failure in an Audit_Record and retry generation on the next Operating_Loop iteration without terminating the Mission.
5. WHEN a Strategy is generated, THE Auto_Pilot SHALL produce a Content_Plan of forward-looking Content_Slots covering a scheduling horizon of at least 7 days ahead, with every Content_Slot's scheduled time consistent with the posting-frequency cap in the Guardrails.
6. WHEN an Operating_Loop iteration begins for an active Mission, THE Auto_Pilot SHALL revise the Strategy using the measured results recorded in the most recent MEASURE stage.
7. THE Auto_Pilot SHALL keep every Content_Slot's scheduled time within the posting-frequency cap defined in the Mission Guardrails.

### Requirement 3: Continuous Operating Loop

**User Story:** As a creator, I want Auto Pilot to run continuously in the background, so that growth work happens without my constant involvement.

#### Acceptance Criteria

1. WHILE a Mission is active, THE Auto_Pilot SHALL run the Operating_Loop stages in the order SENSE, THINK, PLAN, GATE, ACT, MEASURE, LEARN.
2. WHEN an Operating_Loop iteration completes for an active Mission, THE Auto_Pilot SHALL begin the next Operating_Loop iteration within 60 minutes.
3. WHEN the SENSE stage runs, THE Auto_Pilot SHALL collect the account's current analytics from the analytics services and research signals for the Mission's niche from the web research engine.
4. WHEN the MEASURE stage runs, THE Auto_Pilot SHALL record the Mission's current progress value toward the Goal's target metric.
5. WHILE a Mission is paused by the user, THE Auto_Pilot SHALL suspend all ACT-stage actions for that Mission until the user resumes the Mission.
6. WHEN a user pauses a Mission, THE Auto_Pilot SHALL stop initiating new autonomous actions within 60 seconds of the pause request.
7. IF the SENSE stage cannot retrieve analytics for the connected account, THEN THE Auto_Pilot SHALL record the failure in an Audit_Record and retry on the next Operating_Loop iteration without terminating the Mission.
8. WHEN the SENSE stage fails to retrieve analytics for the connected account on 3 consecutive Operating_Loop iterations, THE Auto_Pilot SHALL create an Escalation and deliver a User_Input_Notification identifying the affected Mission.

### Requirement 4: Copilot Mode Approval

**User Story:** As a hands-on creator, I want to approve, edit, or reject everything Auto Pilot proposes, so that I stay in control of what goes out.

#### Acceptance Criteria

1. WHILE a Mission's Operating_Mode is `Copilot`, THE Auto_Pilot SHALL present every Content_Slot, draft caption, and drafted Engagement_Automation as an Approval_Card no later than the Content_Slot's scheduled publish time minus a defined approval lead interval and before any execution of that item.
2. WHILE a Mission's Operating_Mode is `Copilot`, THE Auto_Pilot SHALL NOT publish a post or activate an Engagement_Automation until the corresponding Approval_Card is approved by the user.
3. WHEN a user edits a proposed item on an Approval_Card, THE Auto_Pilot SHALL validate the edited item against the Mission Guardrails and apply the user's edits to the item before execution.
4. IF a user's edits to an item on an Approval_Card introduce a banned topic from the Guardrails or exceed a Guardrail bound, THEN THE Auto_Pilot SHALL reject the edits, withhold execution of the item, retain the item in its pre-edit state, and return a message identifying the violated Guardrail.
5. WHEN a user rejects an item on an Approval_Card, THE Auto_Pilot SHALL discard the item and exclude it from execution, and WHERE the rejected item is a Content_Slot, THE Auto_Pilot SHALL either regenerate a replacement item or reschedule the Content_Slot so that no scheduled slot publishes empty.
6. WHEN a user approves an Approval_Card, THE Auto_Pilot SHALL proceed to execute the approved item within the Mission Guardrails.
7. IF an Approval_Card for a Content_Slot is neither approved, edited, nor rejected by the Content_Slot's scheduled publish time, THEN THE Auto_Pilot SHALL withhold publication of the Content_Slot, apply the Content_Slot's fallback resolution, and deliver a User_Input_Notification identifying the unactioned Approval_Card.

### Requirement 5: Autopilot Mode Autonomous Execution

**User Story:** As a busy creator, I want Auto Pilot to execute on its own within my guardrails, so that growth continues without approvals for routine actions.

#### Acceptance Criteria

1. WHILE a Mission's Operating_Mode is `Autopilot`, THE Auto_Pilot SHALL execute planned Content_Slots and activate drafted Engagement_Automations without per-item approval, provided each action passes a Guardrails check evaluating brand voice, banned topics, posting-frequency cap, Credit_Budget, and human-approval-required designation immediately before execution.
2. IF a planned action is designated as human-approval-required in the Guardrails, THEN THE Auto_Pilot SHALL present an Approval_Card, withhold execution of that action until the user approves it, and preserve the action's planned state and scheduled time while awaiting approval, even in `Autopilot` mode.
3. WHEN a user rejects an Approval_Card presented for a human-approval-required action in `Autopilot` mode, THE Auto_Pilot SHALL discard the action, exclude it from execution, and record the outcome in an Audit_Record.
4. WHEN Auto_Pilot cannot determine an ACT-stage action that satisfies all Guardrails constraints for a planned item, THE Auto_Pilot SHALL withhold that action, create an Escalation, and deliver a User_Input_Notification identifying the affected item.
5. WHILE a Mission's Operating_Mode is `Autopilot`, THE Auto_Pilot SHALL record every autonomous action as an Audit_Record.

### Requirement 6: Media Pool Management

**User Story:** As a creator, I want my uploaded and generated media to accumulate into a reusable pool, so that Auto Pilot can draw from it over time instead of demanding a large upfront upload.

#### Acceptance Criteria

1. WHEN a user uploads a media item that passes validation to a Mission's workspace, THE Auto_Pilot SHALL add the item to the Media_Pool within 10 seconds of upload completion and mark the item as available for assignment to future Content_Slots.
2. THE Auto_Pilot SHALL NOT require the user to upload media before a Mission can start.
3. WHEN Auto_Pilot generates AI media for a Content_Slot, THE Auto_Pilot SHALL add the generated item to the Media_Pool and mark it as available for assignment to future Content_Slots.
4. WHEN Auto_Pilot assigns a Media_Pool item to a Content_Slot, THE Auto_Pilot SHALL record the assigned Media_Pool item and the target Content_Slot in an Audit_Record.
5. IF an uploaded media item fails validation because it exceeds the maximum file size of 100 MB or is not a supported image or video format, THEN THE Auto_Pilot SHALL reject the item, exclude it from the Media_Pool, and return a message identifying the reason for rejection.
6. WHEN Auto_Pilot assigns a Media_Pool item to a Content_Slot, THE Auto_Pilot SHALL retain the item in the Media_Pool and keep it available for assignment to additional Content_Slots until the user removes it from the Media_Pool.

### Requirement 7: Just-in-Time Content Brief with Smart Lead-Time

**User Story:** As a creator, I want Auto Pilot to tell me exactly what to shoot and when, ahead of time, so that I can produce the right content without ever missing a scheduled slot.

#### Acceptance Criteria

1. WHEN a future Content_Slot requires user-created media that is not available in the Media_Pool, THE Auto_Pilot SHALL generate a Content_Brief containing a concept, a hook, a shot list, step-by-step creation instructions, and a suggested caption.
2. WHEN Auto_Pilot generates a Content_Brief, THE Auto_Pilot SHALL compute a Lead_Time by estimating the media's creation duration from its complexity and adding a safety buffer of at least 25 percent of the estimated duration, with the resulting Lead_Time bounded between 2 hours and 14 days.
3. WHEN Auto_Pilot computes a Lead_Time for a Content_Slot, THE Auto_Pilot SHALL send the Content_Brief no later than the Content_Slot's scheduled publish time minus the Lead_Time.
4. WHEN Auto_Pilot sends a Content_Brief, THE Auto_Pilot SHALL deliver a User_Input_Notification for the brief.
5. WHILE a Content_Brief remains undelivered by the user before the Content_Slot's publish time, THE Auto_Pilot SHALL send no more than 3 escalating reminder User_Input_Notifications, triggered when the remaining Lead_Time reaches 50 percent, 25 percent, and 10 percent.
6. IF the user has not delivered the requested media by the fallback deadline of the Content_Slot's publish time minus 30 minutes AND AI-generated backup media matching the required format can be produced, THEN THE Auto_Pilot SHALL substitute AI-generated backup media for the Content_Slot and record the substitution in an Audit_Record.
7. IF the user has not delivered the requested media by the fallback deadline of the Content_Slot's publish time minus 30 minutes AND AI-generated backup media matching the required format cannot be produced, THEN THE Auto_Pilot SHALL reschedule the Content_Slot so that no scheduled slot publishes empty and record the rescheduling in an Audit_Record.
8. WHEN a user delivers media in response to a Content_Brief, THE Auto_Pilot SHALL add the media to the Media_Pool and attach it to the associated Content_Slot.
9. IF Content_Brief generation fails, THEN THE Auto_Pilot SHALL record the failure in an Audit_Record, create an Escalation, and deliver a User_Input_Notification.

### Requirement 8: Content Generation and Vision-Grounded Captioning

**User Story:** As a creator, I want captions and media that reflect the actual content and my brand voice, so that posts feel authentic and on-brand.

#### Acceptance Criteria

1. WHEN Auto_Pilot prepares a caption for a Content_Slot, THE Auto_Pilot SHALL analyze the slot's media using the media vision analysis service and produce a caption of 1 to 2,200 characters that references at least one attribute identified in the vision analysis.
2. WHEN Auto_Pilot generates a caption, THE Auto_Pilot SHALL apply the Mission's brand voice and SHALL exclude every banned topic listed in the Mission's Guardrails.
3. WHEN a Content_Slot requires AI-generated media, THE Auto_Pilot SHALL produce the media using the existing AI image or AI video generation services.
4. WHEN Auto_Pilot generates a caption, THE Auto_Pilot SHALL generate 1 to 30 accompanying hashtags using the existing hashtag generation capability.
5. IF generated caption content contains a banned topic from the Guardrails, THEN THE Auto_Pilot SHALL regenerate or revise the caption to remove the banned topic before the caption is used, up to 3 attempts.
6. IF a caption still contains a banned topic after 3 revision attempts, THEN THE Auto_Pilot SHALL withhold the caption, create an Escalation, and deliver a User_Input_Notification.
7. IF the media vision analysis service fails or does not respond within 30 seconds, THEN THE Auto_Pilot SHALL retry up to 3 times, and IF it still fails, THEN THE Auto_Pilot SHALL create an Escalation and deliver a User_Input_Notification.

### Requirement 9: Local-Language Understanding and Generation

**User Story:** As a creator whose audience is not English-speaking, I want Auto Pilot to work in my account's language, so that captions and replies fit my audience.

#### Acceptance Criteria

1. WHEN Auto_Pilot generates a caption or reply for a Mission, THE Auto_Pilot SHALL produce the text in the Mission account's configured local language, and SHALL apply this to 100 percent of generated captions and replies for that Mission.
2. WHEN Auto_Pilot processes a comment or caption whose detected language differs from English, THE Auto_Pilot SHALL interpret its meaning in that detected language before making an Automation_Decision or generating a reply.
3. WHERE a Mission account's configured local language is not English, THE Auto_Pilot SHALL generate Content_Brief instructions in that configured local language.
4. IF a Mission account has no configured local language, THEN THE Auto_Pilot SHALL generate captions, replies, and Content_Brief instructions in English as the default.
5. IF Auto_Pilot cannot determine the language of a comment or caption within a maximum of 2 detection attempts, THEN THE Auto_Pilot SHALL interpret the text using the Mission account's configured local language and SHALL record an indication that language detection was inconclusive.
6. IF generation of text in the Mission account's configured local language fails, THEN THE Auto_Pilot SHALL withhold the caption or reply, preserve the originating Mission and Automation_Decision state without modification, and surface an error indication that local-language generation failed.

### Requirement 10: Human-Like Automation Decision

**User Story:** As a creator, I want Auto Pilot to add engagement automation only when a post actually needs it, so that my account behaves naturally and does not over-automate.

#### Acceptance Criteria

1. WHEN a Content_Slot's caption and CTA are finalized, THE Auto_Pilot SHALL make an Automation_Decision within 30 seconds using LLM reasoning over the caption and CTA, producing a decision of either needs-automation or does-not-need-automation.
2. IF the Automation_Decision determines a post needs Engagement_Automation, THEN THE Auto_Pilot SHALL select exactly one automation type from the set {comment-only, DM-only, comment→DM}.
3. IF a caption contains a response-driving CTA that instructs users to comment or message a specific trigger keyword, THEN THE Auto_Pilot SHALL derive that trigger keyword from the caption and create a drafted Engagement_Automation using that keyword.
4. WHEN a caption instructs commenters to comment a keyword to receive a direct message, THE Auto_Pilot SHALL draft a comment→DM Engagement_Automation with the derived keyword, a public comment reply, and a direct message containing the content named in the caption's CTA.
5. IF a Content_Slot's caption contains no response-driving CTA, THEN THE Auto_Pilot SHALL NOT attach Engagement_Automation to that Content_Slot.
6. WHEN Auto_Pilot drafts an Engagement_Automation, THE Auto_Pilot SHALL create it as an `AutomationRule` compatible with the existing TriggerEngine and automationWorker.
7. IF the Automation_Decision cannot be completed due to LLM failure or timeout, or a trigger keyword cannot be derived, THEN THE Auto_Pilot SHALL default to attaching no Engagement_Automation and SHALL preserve the Content_Slot state without modification.

### Requirement 11: Engagement Automation Lifecycle

**User Story:** As a creator, I want drafted automations to go live at the right time and turn off when a post is stale, so that automation matches each post's active window.

#### Acceptance Criteria

1. WHILE a Mission's Operating_Mode is `Copilot`, THE Auto_Pilot SHALL NOT activate a drafted Engagement_Automation until the user approves it.
2. WHILE a Mission's Operating_Mode is `Autopilot`, THE Auto_Pilot SHALL activate a Guardrails-passed Engagement_Automation within 60 seconds of confirmation that its associated post is published.
3. WHEN a post with an active Engagement_Automation reaches the end of its active engagement window of 90 days since publish, THE Auto_Pilot SHALL deactivate that Engagement_Automation within 3600 seconds.
4. WHEN Auto_Pilot activates or deactivates an Engagement_Automation, THE Auto_Pilot SHALL record the action as an Audit_Record.
5. IF activating an Engagement_Automation fails, THEN THE Auto_Pilot SHALL retry activation according to a defined retry policy, and IF it remains unactivated, THEN THE Auto_Pilot SHALL create an Escalation, deliver a User_Input_Notification, and record the failure in an Audit_Record.
6. IF deactivating an Engagement_Automation fails, THEN THE Auto_Pilot SHALL retry deactivation according to a defined retry policy and record the failure in an Audit_Record.
7. WHEN a user rejects a drafted Engagement_Automation in `Copilot` mode, THE Auto_Pilot SHALL discard the drafted Engagement_Automation and record the outcome in an Audit_Record.
8. THE Auto_Pilot SHALL rely on the existing AntiSpamService and Meta messaging-policy handling within the automation stack for all Engagement_Automation execution.

### Requirement 12: Publishing and Scheduling Reliability

**User Story:** As a creator, I want scheduled posts to publish reliably, so that no slot in my plan is ever missed.

#### Acceptance Criteria

1. WHEN a Content_Slot is approved or auto-approved and its scheduled publish time is reached, THE Auto_Pilot SHALL initiate publishing of the post through the existing Instagram publishing service within 60 seconds of the scheduled publish time.
2. WHEN Auto_Pilot schedules a Content_Slot, THE Auto_Pilot SHALL register a scheduled-post job for that Content_Slot with the existing TieredJobScheduler.
3. IF a publish attempt fails, THEN THE Auto_Pilot SHALL retry the publish up to 3 additional attempts, with the delay between successive attempts increasing from 30 seconds to a maximum of 300 seconds.
4. WHEN a publish attempt completes, THE Auto_Pilot SHALL record the attempt outcome of success or failure and its timestamp in an Audit_Record.
5. IF all 4 publish attempts consisting of 1 initial attempt plus 3 retries for a Content_Slot fail, THEN THE Auto_Pilot SHALL create an Escalation, deliver a User_Input_Notification identifying the failed Content_Slot, and leave the Content_Slot in an unpublished state.
6. WHILE a Content_Slot is scheduled, THE Auto_Pilot SHALL ensure the Content_Slot has delivered media, generated media, or a fallback resolution assigned no later than 5 minutes before its scheduled publish time.
7. IF a Content_Slot has already been published successfully, THEN THE Auto_Pilot SHALL NOT publish it again.

### Requirement 13: Guardrails Enforcement

**User Story:** As a creator, I want firm guardrails on voice, topics, frequency, cost, and approvals, so that Auto Pilot never acts outside my boundaries.

#### Acceptance Criteria

1. THE Auto_Pilot SHALL store per-Mission Guardrails for brand voice, banned topics, posting-frequency cap expressed as a maximum number of published actions per rolling time window, Credit_Budget, and the set of human-approval-required actions.
2. IF an action would exceed the Mission's posting-frequency cap, THEN THE Auto_Pilot SHALL withhold the action, reschedule it to the earliest time that does not violate the cap, and record the deferral in an Audit_Record.
3. IF a planned action's content includes a banned topic, THEN THE Auto_Pilot SHALL block the action from execution, retain the action content, record the matched banned topic in an Audit_Record, and surface an error indication.
4. WHEN a user updates a Mission's Guardrails, THE Auto_Pilot SHALL apply the updated Guardrails to all actions initiated after the update is saved, while actions already in flight continue under the Guardrails in effect when they started.
5. WHEN Auto_Pilot executes an autonomous action, THE Auto_Pilot SHALL record the action's pre-execution state and the reversal operation in the Audit_Record for that action.
6. WHEN a user requests to reverse an autonomous action, THE Auto_Pilot SHALL reverse the action using the reversal information stored in its Audit_Record where the action is reversible.
7. IF a planned action is designated human-approval-required in the Guardrails, THEN THE Auto_Pilot SHALL withhold the action from execution until the user approves it.
8. IF an action would cause the Mission's consumed credits to exceed its Credit_Budget, THEN THE Auto_Pilot SHALL block the action from execution.

### Requirement 14: Credit and Cost Budget

**User Story:** As a creator, I want to see and cap the credit cost of Auto Pilot, so that I control how much AI spend a mission incurs.

#### Acceptance Criteria

1. WHEN Auto_Pilot produces a Content_Plan or Strategy that will consume credits, THE Auto_Pilot SHALL present the projected credit cost as a numeric credit value to the user and SHALL withhold execution of that Content_Plan or Strategy until the user approves the projected cost.
2. WHEN Auto_Pilot performs an AI operation, THE Auto_Pilot SHALL record the actual credits consumed by that operation through the existing `withAIFeature` credit/usage tracking.
3. WHILE a Mission's consumed credits reported by the credit/usage tracking are strictly below its Credit_Budget, THE Auto_Pilot SHALL continue executing credit-consuming actions within the Guardrails.
4. IF an AI operation would cause a Mission's consumed credits to exceed its Credit_Budget, THEN THE Auto_Pilot SHALL withhold the operation without consuming credits, preserve the Mission's current state, create an Escalation, and deliver a User_Input_Notification indicating that the Credit_Budget would be exceeded within 60 seconds of withholding the operation.
5. WHEN a Mission's consumed credits reach its Credit_Budget, THE Auto_Pilot SHALL pause all credit-consuming actions for that Mission and deliver a User_Input_Notification within 60 seconds, and SHALL keep those actions paused until the user raises the Credit_Budget or approves continued spend.
6. IF a submitted Mission omits the Credit_Budget or the Credit_Budget is not an integer within the range 1 to 1,000,000 inclusive, THEN THE Auto_Pilot SHALL reject the submission, retain the user's entered values, and return a message identifying the missing or invalid Credit_Budget.
7. IF the credit/usage tracking cannot report a Mission's consumed credits or a projected credit cost cannot be computed, THEN THE Auto_Pilot SHALL withhold the affected credit-consuming operation without consuming credits, preserve the Mission's current state, create an Escalation, and deliver a User_Input_Notification indicating that credit information is unavailable within 60 seconds.

### Requirement 15: Notifications for User Input

**User Story:** As a creator, I want to be reliably told when Auto Pilot needs me, so that I can respond before a deadline, whether I am on mobile or web.

#### Acceptance Criteria

1. WHEN Auto_Pilot detects that it requires user input, THE Auto_Pilot SHALL create a User_Input_Notification through the existing notification queue within 5 seconds of the detection.
2. IF creating a User_Input_Notification in the notification queue fails, THEN THE Auto_Pilot SHALL retry creation up to 3 times, and IF it still fails, THEN THE Auto_Pilot SHALL record the notification as undelivered and preserve the pending-input state.
3. WHEN a User_Input_Notification is created and the user's active session context is mobile, THE Auto_Pilot SHALL deliver the notification via FCM push within 30 seconds of the notification being dequeued.
4. IF FCM push delivery fails, THEN THE Auto_Pilot SHALL retry delivery up to 3 times, and IF it still fails, THEN THE Auto_Pilot SHALL deliver the notification via email as fallback.
5. WHEN a User_Input_Notification is created and the user's active session context is web, THE Auto_Pilot SHALL deliver the notification to the in-app inbox within 30 seconds of the notification being dequeued.
6. IF a web in-app inbox notification remains unread for 15 minutes, THEN THE Auto_Pilot SHALL send the notification via email as fallback.
7. WHILE the web service worker is disabled, THE Auto_Pilot SHALL deliver web notifications only through the in-app inbox and email and SHALL NOT rely on browser web-push.

### Requirement 16: VeeGPT Chat Integration and Mission Control View

**User Story:** As a creator, I want Auto Pilot to narrate its decisions in chat and give me a real control surface, so that I understand and steer what it is doing.

#### Acceptance Criteria

1. WHEN the user clicks the sidebar Auto Pilot button, THE Auto_Pilot SHALL open the Mission_Control view within 2 seconds.
2. WHILE a Mission is active, THE Auto_Pilot SHALL narrate each Operating_Loop decision as a message in the VeeGPT chat within 5 seconds of the decision.
3. WHEN Auto_Pilot needs an approval, THE Auto_Pilot SHALL push the corresponding Approval_Card into the VeeGPT chat and the Mission_Control view within 5 seconds.
4. WHILE a Mission is active, THE Mission_Control view SHALL display the Mission's current progress value toward the Goal's target metric, the count and contents of all pending Approval_Cards, and the Operating_Loop activity log.
5. WHEN Auto_Pilot records progress in the MEASURE stage, THE Mission_Control view SHALL reflect the updated progress toward the Goal within 5 seconds.
6. IF the Mission_Control view fails to load, THEN THE Auto_Pilot SHALL surface an error indication, retry loading according to a defined retry policy, and preserve the Mission state.
7. IF pushing an Approval_Card fails, THEN THE Auto_Pilot SHALL retain the Approval_Card, withhold execution of the associated item, and retry the push on the next Operating_Loop iteration.

### Requirement 17: Auditability and Reversibility

**User Story:** As a creator, I want a complete, reversible record of everything Auto Pilot does, so that I can review and undo any autonomous action.

#### Acceptance Criteria

1. WHEN Auto_Pilot performs any autonomous action, THE Auto_Pilot SHALL create an Audit_Record via the existing AuditTrailService within 5 seconds of the action completing, capturing the triggering context, the action taken, the outcome, and whether the action is reversible.
2. IF creating an Audit_Record via the AuditTrailService fails, THEN THE Auto_Pilot SHALL retry creation according to a defined retry policy and, if creation continues to fail, create an Escalation and deliver a User_Input_Notification identifying the affected action.
3. WHEN a user requests to undo an autonomous action whose Audit_Record marks the action as reversible, THE Auto_Pilot SHALL reverse the action using the information in its Audit_Record within 60 seconds and notify the user that the action has been reversed.
4. IF reversing an autonomous action fails, THEN THE Auto_Pilot SHALL retain the pre-undo state without applying partial changes, return a message indicating the undo could not be completed, and identify the action.
5. IF a user requests to undo an action whose Audit_Record marks the action as not reversible, THEN THE Auto_Pilot SHALL decline the undo, return a message indicating the action cannot be undone, and identify the action.

### Requirement 18: Meta Policy Compliance and Reliability

**User Story:** As a creator, I want Auto Pilot to respect Instagram and Meta platform rules and remain reliable, so that my account stays in good standing.

#### Acceptance Criteria

1. THE Auto_Pilot SHALL execute all Instagram interactions exclusively through the existing publishing and automation services that enforce Instagram and Meta platform policy, and SHALL NOT issue any direct platform interaction that bypasses those services.
2. WHILE executing Engagement_Automation, THE Auto_Pilot SHALL submit every interaction request to the existing AntiSpamService and SHALL only perform interactions that the AntiSpamService approves against its rate and content constraints.
3. IF the AntiSpamService rejects a requested interaction due to a rate or content constraint, THEN THE Auto_Pilot SHALL skip that interaction, record the rejection with the reason returned by the AntiSpamService, and continue with the remaining Mission actions without re-attempting the rejected interaction within the same Operating_Loop iteration.
4. IF Auto_Pilot loses connectivity to a required backing service during an Operating_Loop iteration, THEN THE Auto_Pilot SHALL record the failure, preserve the affected Mission state without modification, and resume processing the affected Mission on the next Operating_Loop iteration.
5. IF a required backing service remains unreachable for 3 consecutive Operating_Loop iterations, THEN THE Auto_Pilot SHALL set the affected Mission to a paused state and surface a failure indication to the creator without discarding the preserved Mission state.
6. WHERE the platform associated with a Mission is a non-Instagram platform in v1, THE Auto_Pilot SHALL limit autonomous execution to Instagram while allowing the Mission model to represent the non-Instagram platform for future extension.
7. IF a Mission requests autonomous execution on a non-Instagram platform in v1, THEN THE Auto_Pilot SHALL decline the autonomous execution, retain the Mission definition, and surface an indication that autonomous execution is available only for Instagram in v1.
