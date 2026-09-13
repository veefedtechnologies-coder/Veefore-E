# Implementation Plan: Mobile VeeGPT Interface

## Overview

Implement one production React Native VeeGPT mode beside the existing Main App mode, backed exclusively by the authenticated `/api/veegpt/*` contract. Work proceeds from mode architecture and migration through typed transport, conversation runtime, original Veefore mobile UI, advanced capabilities, resilience, and release validation. Each increment must reuse the existing backend and remove obsolete mobile assistant paths so no duplicate assistant identity, client service, or backend implementation survives.

## Tasks

- [x] 1. Establish sibling mode architecture and remove obsolete assistant navigation
  - [x] 1.1 Define versioned mode state, protected persistence, and scoped restoration codecs
    - Add `PrimaryMode`, independent Main/VeeGPT snapshots, user/workspace scope keys, segmented decoding, atomic commits, sign-out clearing, and safe defaults under `mobile-native/src/modes/`.
    - Keep authentication secrets, raw attachment bodies, stream buffers, and temporary asset URLs outside persisted feature state.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 3.9, 20.2, 20.5, 20.6, 20.10_

  - [x] 1.2 Implement `ModeHost` with Main App and VeeGPT sibling navigator roots
    - Preserve independent navigator trees/snapshots, persist before transitions, lock duplicate transitions, implement VeeGPT-root back-to-Main behavior, and restore the last valid mode after authentication.
    - Ensure switching never pushes either primary mode onto the other mode's stack.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.7_

  - [x] 1.3 Implement mode-aware deep linking and legacy state migration
    - Resolve authorized conversation links into VeeGPT only after workspace-scoped authorization; route missing/forbidden conversations to a safe landing error.
    - Idempotently map legacy Copilot links/state to VeeGPT landing and Diagnostic links/state to Main Dashboard without registering compatibility screens.
    - _Requirements: 1.7, 1.8, 22.9, 22.10, 22.11_

  - [x] 1.4 Replace dashboard diagnostics and Copilot entry points with the VeeGPT mode switch
    - Replace the blue diagnostics FAB in place with an original Veefore/VeeGPT control, redirect the dashboard AI quick action, add the VeeGPT return switch, and expose destination/current-mode accessibility state.
    - Remove Copilot and Diagnostic route/type registrations, screens, imports, labels, `/ai/chat` service/hooks, and production navigation paths after all callers are migrated.
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 4.8, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8, 22.12_

  - [x] 1.5 Write unit tests for mode transitions, storage restoration, links, and migration redirects
    - Cover persistence failure rollback, malformed state repair, root back behavior, authorized/forbidden links, sign-out cleanup, and removal of obsolete route restoration.
    - _Requirements: 1.2, 1.3, 1.6, 1.7, 1.8, 3.1, 3.4, 3.8, 22.9, 22.10, 22.11, 23.1_
  - [x] 1.6 Write the property test for last-valid-mode restoration
    - **Property 1: Last valid mode wins**
    - Generate valid/invalid mode sequences, cold launches, and persistence repairs for at least 100 cases.
    - **Validates: Requirements 3.1, 3.2, 3.4, 3.7, 23.4**

  - [x] 1.7 Write the property test for non-interfering sibling mode state
    - **Property 2: Primary mode state is non-interfering**
    - **Validates: Requirements 1.2, 1.3, 3.3, 3.5, 3.6, 23.5**

  - [x] 1.8 Write the property test for safe state round trips
    - **Property 3: Supported state round-trips safely**
    - **Validates: Requirements 3.3, 3.4, 16.9, 23.6**

  - [x] 1.9 Write the property test for legacy navigation migration
    - **Property 24: Legacy navigation migration is deterministic and idempotent**
    - **Validates: Requirements 22.9**

- [x] 2. Build the single production VeeGPT client and transport boundary
  - [x] 2.1 Define typed contracts, decoders, request scope, and exhaustive error types
    - Create React Native-safe types for conversations, messages, events, progress, cards, attachments, manifests, usage, memory, assets, pagination, and structured errors.
    - Validate response shape and workspace scope before normalized insertion; expose no editable user identity or arbitrary route-string API.
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.7, 20.1, 20.3, 20.4_

  - [x] 2.2 Implement authenticated ordinary-request and NDJSON streaming transports
    - Acquire the current session token per request, add correlation/workspace metadata, support abort/timeouts, and incrementally decode UTF-8 NDJSON while preserving accepted records after malformed input.
    - Keep stream fetch behavior separate from ordinary requests while sharing authentication, redaction, and scope enforcement.
    - _Requirements: 4.3, 4.4, 9.1, 9.7, 9.9, 16.4, 20.1, 21.1, 21.2_

  - [x] 2.3 Implement the allowlisted `/api/veegpt/*` typed client
    - Add typed methods for agents, history/search, messages/streaming, generation/progress/stop, lifecycle/message actions, attachments, memory, usage/limits/estimates, context, post-agent, research, album, and authenticated assets.
    - Return `CapabilityUnavailable` for absent methods; never fall back to `/ai/chat`, construct routes from payloads, or add/fork backend chat, attachment, stream, or asset routes.
    - _Requirements: 4.1, 4.2, 4.5, 4.8, 4.9, 4.10, 19.1, 19.2, 19.3, 19.4, 19.5_

  - [x] 2.4 Implement client security controls and privacy-safe telemetry primitives
    - Reject/evict cross-workspace resources, restrict external URI schemes, invalidate unauthorized protected media, redact sensitive fields, pseudonymize identifiers, and use a bounded non-blocking telemetry queue.
    - Emit allowlisted request, stream, restore, mode-transition, capability-failure, and workspace-rejection events without product-flow coupling.
    - _Requirements: 11.7, 20.4, 20.7, 20.8, 20.9, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 21.9_

  - [x] 2.5 Write unit tests for contracts, request builders, NDJSON parsing, errors, security, and redaction
    - Verify authentication recovery, authorization withholding, timeout distinction, decoder failures, correlation metadata, URI allowlisting, and zero sensitive payload leakage.
    - _Requirements: 4.6, 4.7, 9.9, 16.4, 16.5, 16.6, 20.4, 20.7, 20.8, 23.1_

  - [x] 2.6 Write the property test for workspace exposure isolation
    - **Property 4: Workspace scope is an exposure invariant**
    - **Validates: Requirements 3.9, 6.9, 14.9, 20.3, 20.4, 20.5, 23.10**

  - [x] 2.7 Write the property test for security-sensitive output allowlisting
    - **Property 22: Security-sensitive output is allowlisted**
    - **Validates: Requirements 11.7, 20.7, 20.8, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7**

  - [x] 2.8 Write the property test for non-blocking bounded telemetry
    - **Property 23: Telemetry failure cannot block product behavior**
    - **Validates: Requirements 21.9**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement workspace conversations and the original Veefore mobile chat shell
  - [x] 4.1 Implement the workspace-scoped VeeGPT interaction store and query cache boundary
    - Store selected conversation/view, drawer/search state, drafts, scroll anchors, capability selection, album source, and conversation-keyed runtime independently from server-confirmed entities.
    - Reset or re-scope state on workspace/session change and discard stale conversation references without exposing prior-scope content.
    - _Requirements: 3.6, 3.8, 3.9, 6.9, 7.7, 9.10, 20.5, 20.6_

  - [x] 4.2 Build the ChatGPT-class, original Veefore `VeeGPTShell`, landing state, thread, and composer
    - Implement native Veefore light/dark tokens, header/drawer host, branded empty/new-chat states, backend starter prompts, keyboard/safe-area behavior, auto-growing input, send/stop state, and immutable submission snapshots.
    - Use familiar mobile conversation conventions without copied third-party names/assets and prevent duplicate first-conversation creation with a synchronous ownership lock.
    - _Requirements: 2.3, 2.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_

  - [x] 4.3 Implement conversation drawer, paginated history, search, and management
    - Add virtualized server ordering, debounced cancellable search, message-hit navigation/highlighting, anchor-preserving pagination, new chat, rename validation, archive/delete confirmations, retry states, and workspace refresh.
    - Preserve active background generation when selecting or managing another conversation.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 4.4 Implement virtualized message rendering and message actions
    - Render stable chronological messages, accessible native Markdown/code/tables, variants, copy, regenerate, retry, safe links, action availability, bottom-follow behavior, scroll preservation, and jump-to-latest.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_

  - [x] 4.5 Write unit tests for conversation ordering, search/navigation, management, composer, and thread actions
    - Cover first-send locking, snapshot clearing, draft preservation, title limits, pessimistic deletion, match anchoring, variant selection, and scroll-follow decisions.
    - _Requirements: 5.5, 5.7, 5.8, 6.2, 6.6, 7.2, 7.6, 8.6, 8.7, 8.9, 8.10, 11.1, 23.1_
  - [x] 4.6 Write the property test for single-owner first-message creation
    - **Property 5: First-message creation is single-owner**
    - **Validates: Requirements 5.7**

  - [x] 4.7 Write the property test for composer submission snapshots
    - **Property 6: Composer acceptance owns only its submitted snapshot**
    - **Validates: Requirements 5.5, 5.8, 8.5, 8.6, 8.7, 8.9, 8.10, 13.9**

  - [x] 4.8 Write the property test for stable conversation and message ordering
    - **Property 11: Conversation and message ordering is stable**
    - **Validates: Requirements 6.2, 11.1, 23.12**

- [x] 5. Implement streaming, progress, stop, and background recovery
  - [x] 5.1 Implement conversation-keyed stream and progress reducers
    - Reduce cumulative chunks into one live turn, deduplicate event/terminal identities, keep status separate from content, reject mismatched scope, and flush final terminal state once.
    - Accumulate only backend-reported research, image, and tool progress and replace terminal progress with persisted output/error.
    - _Requirements: 9.2, 9.3, 9.4, 9.6, 9.9, 9.10, 10.1, 10.2, 10.3, 10.6, 10.7_

  - [x] 5.2 Implement generation controllers, stop handling, and centralized recovery scheduling
    - Bind streams to conversation IDs rather than selection, retain partial content, reconcile generation/messages after missing terminal events or process restart, and resume research/image progress on reopen.
    - Keep background work alive across conversation navigation, use one app-state-aware bounded polling scheduler, and release nonessential work when VeeGPT becomes inactive.
    - _Requirements: 7.7, 7.8, 9.5, 9.6, 9.7, 9.8, 9.10, 10.4, 10.5, 10.8, 16.8, 18.8, 18.9_

  - [x] 5.3 Implement truthful inline progress and reconnection presentation
    - Render research phases/sources/counts, image operation/subject cards, combined tool status, stopping/stopped/reconnecting states, and persisted terminal results without inventing operations.
    - _Requirements: 9.3, 9.6, 10.1, 10.2, 10.3, 10.6, 10.7, 10.8_

  - [x] 5.4 Write unit tests for stream lifecycle, progress accumulation, stop, and recovery scheduling
    - Cover malformed records, missing terminal reconciliation, duplicate/conflicting terminals, cross-conversation interleaving, background navigation, process restart, and polling backoff.
    - _Requirements: 7.8, 9.2, 9.4, 9.5, 9.7, 9.8, 9.9, 9.10, 10.8, 16.8, 23.1_

  - [x] 5.5 Write the property test for coherent stream reduction
    - **Property 7: Stream reduction yields one coherent assistant turn**
    - **Validates: Requirements 9.2, 9.3, 9.4, 9.6, 23.7**

  - [x] 5.6 Write the property test for idempotent conversation-isolated streams
    - **Property 8: Stream reduction is idempotent and conversation-isolated**
    - **Validates: Requirements 9.10, 23.8, 23.9**

  - [x] 5.7 Write the property test for malformed stream recovery
    - **Property 9: Malformed stream input preserves valid progress**
    - **Validates: Requirements 9.7, 9.9**

  - [x] 5.8 Write the property test for truthful recoverable progress
    - **Property 10: Progress is cumulative, truthful, and recoverable**
    - **Validates: Requirements 10.2, 10.6, 10.7, 10.8**

  - [x] 5.9 Write the property test for bounded rendering and polling
    - **Property 21: Rendering and polling remain bounded**
    - **Validates: Requirements 18.6, 18.9**

- [x] 6. Add attachments and backend-authorized capability selection
  - [x] 6.1 Implement attachment selection, validation, upload, and media viewing
    - Support permitted camera/library/document sources, shared count/MIME/size limits, local previews/metadata, cancellable per-file progress, retry/removal, accepted-message association, cleanup, and permission settings recovery.
    - Add authenticated full-screen viewers with contract-permitted close/share/download behavior and authorization cache eviction.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11, 20.9_

  - [x] 6.2 Implement agents, models, connected accounts, tools, and capability reconciliation
    - Drive selections from the entitlement-filtered backend manifest, apply defaults, preserve accepted explicit models, clear invalid account focus, make tools one-shot after acceptance, and require confirmation for offered fallbacks.
    - Disable absent/denied capabilities with backend availability or upgrade state and issue no inferred/legacy request.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 19.10_

  - [x] 6.3 Write unit tests for attachment workflows and capability reconciliation
    - Cover mixed valid/invalid selections, upload cancellation/failure, permission denial, workspace changes, removed entitlements, model refusal, and one-shot tools.
    - _Requirements: 12.1, 12.2, 12.3, 12.6, 12.8, 12.9, 12.11, 13.3, 13.6, 13.8, 13.9, 23.1_

  - [x] 6.4 Write the property test for attachment validation soundness
    - **Property 12: Attachment validation is sound**
    - **Validates: Requirements 12.2, 12.3, 12.6, 23.11**

  - [x] 6.5 Write the property test for attachment failure preservation
    - **Property 13: Attachment failure does not destroy pending work**
    - **Validates: Requirements 12.9**

  - [x] 6.6 Write the property test for manifest-authorized selections
    - **Property 14: Capability selections obey the current manifest**
    - **Validates: Requirements 4.4, 13.2, 13.3, 13.5, 13.7, 13.8, 13.9**

  - [x] 6.7 Write the property test for unavailable capability behavior
    - **Property 15: Unavailable capabilities are never inferred**
    - **Validates: Requirements 4.10, 19.9, 19.10**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
- [x] 8. Implement rich outputs, generated assets, and advanced VeeGPT child surfaces
  - [x] 8.1 Implement the closed rich-card renderer and at-most-once action controller
    - Render typed post/edit/information/approval/content-brief/report/document/media cards, persist supported actions, guard applying/terminal states, reconcile ambiguous failures, and fall back to inert allowlisted text for unknown cards.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.10, 14.11, 19.6_

  - [x] 8.2 Implement authenticated artifact viewers, generated album, and chat linkage
    - Present accessible reports/documents/media, retrieve assets through authenticated delivery, expose permitted share/download, and preserve workspace-scoped selected asset/source conversation across album/chat navigation.
    - _Requirements: 12.10, 14.6, 14.7, 14.8, 14.9, 19.9, 20.9_

  - [x] 8.3 Implement research, context, Auto Pilot, post-agent, and video-editor VeeGPT child surfaces
    - Add entitlement-gated research history/trend refresh, context view/refresh, production post-agent workflows, Auto Pilot, and conversational video editing under the same `VeeGPTShell` identity.
    - Use only existing client methods and backend-authoritative job/availability states.
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8, 19.10, 22.12_

  - [x] 8.4 Write unit tests for rich actions, safe fallback, viewers, and advanced-surface gating
    - Cover repeated taps, confirmed/cancelled/edit states, ambiguous failures, malicious unknown payloads, asset authorization, preserved album linkage, and denied entitlements.
    - _Requirements: 14.2, 14.3, 14.4, 14.5, 14.9, 14.10, 14.11, 19.7, 19.8, 19.9, 19.10_

  - [x] 8.5 Write the property test for at-most-once rich-card terminal actions
    - **Property 16: Terminal rich-card actions are at-most-once**
    - **Validates: Requirements 14.5, 14.10, 14.11, 23.13**

- [x] 9. Implement memory, usage, offline, and deterministic recovery behavior
  - [x] 9.1 Implement memory and backend-authoritative usage controls
    - Add workspace memory listing/usage, item deletion, clear-all confirmation, current usage refresh, high-cost estimates, warning/reset/upgrade states, reached-limit blocking, and explicit fast-fallback approval.
    - Never infer allowance from message or conversation count.
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10_

  - [x] 9.2 Implement connectivity state, error presentation, and mutation reconciliation
    - Preserve cached content/drafts/attachments offline, withhold sends without queueing, refresh but never auto-send on reconnect, and segment corrupt-cache recovery.
    - Exhaustively map authentication, authorization, validation, limit, timeout, conflict, unavailable, server, stream, and unknown failures; reconcile ambiguous non-idempotent actions before retry.
    - _Requirements: 4.6, 4.7, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9_

  - [x] 9.3 Write unit tests for memory, usage refusal, offline preservation, and error recovery
    - Cover failed deletion retention, warning/reset rendering, estimates, explicit fallback approval, reconnect refresh-only behavior, cache-segment failure, and retry ordering.
    - _Requirements: 15.4, 15.6, 15.7, 15.8, 15.9, 16.1, 16.2, 16.3, 16.7, 16.9, 23.1_

  - [x] 9.4 Write the property test for backend-authoritative usage
    - **Property 17: Usage state remains backend-authoritative**
    - **Validates: Requirements 13.6, 15.6, 15.7, 15.8, 15.9, 15.10**

  - [x] 9.5 Write the property test for explicit offline submission
    - **Property 18: Offline transitions never submit implicitly**
    - **Validates: Requirements 16.1, 16.2, 16.3, 23.14**

  - [x] 9.6 Write the property test for deterministic error and retry mapping
    - **Property 19: Error classification and retry ordering are deterministic**
    - **Validates: Requirements 16.4, 16.5, 16.6, 16.7**

- [x] 10. Complete accessibility, responsive behavior, and production performance
  - [x] 10.1 Apply the VeeGPT accessibility layer across every surface
    - Add localized names/roles/states/hints, 44-point targets, logical focus/focus restoration, non-color status, debounced stream announcements, backend alt text policy, and keyboard/switch-control support.
    - Make light/dark themes meet contrast targets, reflow at 200% text, and replace nonessential motion under reduce-motion.
    - _Requirements: 2.6, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 17.10_

  - [x] 10.2 Optimize shell readiness, long lists, streaming paint, and resource cleanup
    - Bundle shell chrome locally, paint cache before revalidation, virtualize/memoize messages and rich media, paginate 10,000-item history, batch stream paints to 20/sec, and instrument benchmark marks.
    - Centralize cleanup of listeners, previews, decoders, animations, and polling while retaining only required background generation work.
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8, 18.9_

  - [x] 10.3 Write unit and component tests for accessibility transformations and resource cleanup
    - Verify semantic labels/focus, target sizing, 200% reflow, reduced motion, announcement throttling, virtualized mounting, cleanup, and final-frame flushing.
    - _Requirements: 17.1, 17.2, 17.4, 17.5, 17.6, 17.7, 18.3, 18.6, 18.8_

  - [x] 10.4 Write the property test for meaning-preserving accessibility transformations
    - **Property 20: Accessibility transformations preserve meaning**
    - **Validates: Requirements 2.3, 17.3, 17.6, 17.9, 17.10**
- [x] 11. Validate production contracts and native integrations
  - [x] 11.1 Write `/api/veegpt/*` client integration tests
    - Validate real contract fixtures for authentication/401 recovery, workspace scoping, agents, history/search/messages, streaming/stop, generation/research/image restoration, conversation/message/card/edit actions, attachments, memory, usage/limits/estimates, context, post-agent, research, album, and authenticated asset delivery.
    - Assert no mock-only mobile contract, duplicate backend route, dynamic payload route, or `/ai/chat` fallback is exercised.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.8, 4.9, 6.4, 7.2, 7.4, 7.5, 9.1, 9.5, 10.4, 10.5, 12.7, 14.7, 15.1, 15.5, 19.1, 19.2, 19.3, 19.4, 19.5, 23.2_

  - [x] 11.2 Write React Native integration tests for platform behavior
    - Validate protected persistence, keyboard/safe area, media permission matrix, upload cancellation, authenticated viewers, share/download, accessibility announcements/focus, app-state polling, and cleanup on iOS and Android adapters.
    - _Requirements: 3.2, 8.3, 12.8, 12.10, 12.11, 17.5, 17.7, 18.8, 18.9, 20.10, 23.2_

- [x] 12. Validate complete production journeys and enforce release gates
  - [x] 12.1 Write E2E tests for primary modes, persistence, migration, and deep links
    - Cover cold launch into Main/VeeGPT, repeated switching with independent navigation state, root back, authorized/forbidden conversation links, legacy Copilot/Diagnostic redirects, and invalid-state repair.
    - _Requirements: 1.2, 1.3, 1.6, 1.7, 1.8, 3.2, 3.3, 3.4, 22.9, 22.10, 22.11, 23.3_

  - [x] 12.2 Write E2E tests for chat, background generation, stop, and offline recovery
    - Cover first-message duplicate protection, accepted snapshot clearing, conversation switching during generation, stop/reopen, process recovery, malformed-stream recovery, reconnection without auto-send, and retained pending attachments.
    - _Requirements: 5.6, 5.7, 5.8, 7.7, 7.8, 8.9, 8.10, 9.5, 9.7, 9.8, 9.10, 12.9, 16.1, 16.2, 16.3, 16.8, 23.3_

  - [x] 12.3 Write E2E tests for advanced capabilities, isolation, and sign-out cleanup
    - Cover history/search/message targeting, agents/models/accounts/tools, rich-action deduplication, generated assets, memory/usage, research/context/post-agent, album/chat linkage, entitlement denial, workspace switch isolation, and complete sign-out cleanup.
    - _Requirements: 6.1, 6.6, 13.1, 13.6, 13.8, 14.5, 14.7, 15.2, 15.8, 19.1, 19.3, 19.5, 19.9, 19.10, 20.5, 20.6, 23.3_

  - [x] 12.4 Add automated accessibility and `Benchmark_Profile` release validation
    - Run supported iOS/Android checks for labels, focus, 44-point targets, contrast, reduced motion, 200% text, mode readiness, cached-thread paint, chunk latency, 10,000-history scale, 200-message scrolling, render rate, polling, and cleanup.
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8, 18.9, 23.15, 23.16_

  - [x] 12.5 Add CI source, security, telemetry, and exactly-once release guards
    - Fail on workspace leakage, duplicate create/send/terminal/card actions, authentication-secret exposure, unsafe URI handling, unbounded telemetry, obsolete production `/ai/chat`, Copilot/Diagnostic registrations, duplicate mobile assistant services, added VeeGPT backend routes, or more than one user-facing conversational identity.
    - _Requirements: 4.8, 4.9, 20.4, 20.7, 20.8, 21.9, 22.1, 22.2, 22.4, 22.6, 22.12, 23.17_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster implementation pass.
- Property tasks map one-to-one to all 24 correctness properties in the design and should run at least 100 generated cases with the required feature/property tag.
- The mobile client must remain the only new implementation boundary: it reuses existing `/api/veegpt/*` routes and must not create replacement backend endpoints or preserve a second assistant service.
- Remove obsolete Copilot/Diagnostic code only after references are migrated, then keep CI guards to prevent reintroduction.
- Checkpoints provide explicit points for incremental validation before advanced surfaces and release testing.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.4"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.3"] },
    { "id": 3, "tasks": ["1.5", "1.6", "1.7", "1.8", "1.9", "2.5", "2.6", "2.7", "2.8", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.1", "6.1", "6.2"] },
    { "id": 5, "tasks": ["4.4", "4.5", "4.6", "4.7", "4.8", "5.2", "5.3", "6.3", "6.4", "6.5", "6.6", "6.7", "9.1", "9.2"] },
    { "id": 6, "tasks": ["5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "8.1", "8.2", "8.3", "9.3", "9.4", "9.5", "9.6"] },
    { "id": 7, "tasks": ["8.4", "8.5", "10.1", "10.2"] },
    { "id": 8, "tasks": ["10.3", "10.4", "11.1", "11.2"] },
    { "id": 9, "tasks": ["12.1", "12.2", "12.3", "12.4", "12.5"] }
  ]
}
```
