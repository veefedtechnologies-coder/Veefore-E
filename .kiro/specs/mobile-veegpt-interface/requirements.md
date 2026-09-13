# Requirements Document

## Introduction

The Mobile VeeGPT Interface replaces the React Native application's lightweight Copilot and dashboard API-diagnostics entry point with a production VeeGPT experience. The Main App and VeeGPT become sibling primary modes inside one authenticated mobile application. A mode switch replaces the blue dashboard diagnostics floating action button, the last-used mode survives cold launches, and each mode retains independent navigation and interaction state.

The feature delivers original Veefore/VeeGPT visual design with ChatGPT-class mobile interaction conventions while reusing the authenticated production `/api/veegpt/*` backend contract. Scope includes workspace-scoped conversation history and search, streaming chat, tool and research progress, attachments, generated assets, memory, usage controls, agents and models, conversation actions, post-agent workflows, resilient offline/error behavior, accessibility, performance, security, observability, migration, and property-based validation. The feature does not create replacement AI routes or retain a second assistant experience.

## Glossary

- **Mobile_App**: The authenticated Veefore React Native application that contains the Main_App_Mode and VeeGPT_Mode.
- **Main_App_Mode**: The primary application mode containing the Dashboard, Content, Accounts, Analytics, and related existing navigation state.
- **VeeGPT_Mode**: The second primary application mode containing the production mobile VeeGPT experience.
- **Mode_Host**: The top-level navigation owner that switches between Main_App_Mode and VeeGPT_Mode without modeling either mode as a pushed page of the other.
- **Mode_Switch**: The Veefore-branded control that changes the active primary mode.
- **Navigation_System**: The React Navigation native-stack and native-bottom-tab configuration used by Mobile_App.
- **State_Store**: The local persistence boundary for active mode, navigation state, selected conversation, drafts, scroll positions, and supported VeeGPT preferences.
- **VeeGPT_Interface**: The complete user-facing mobile VeeGPT surface.
- **VeeGPT_Client**: The authenticated mobile API client that consumes VeeGPT_API.
- **VeeGPT_API**: The existing production backend contract under `/api/veegpt/*`, including agents, workspace-scoped conversations, search, messages, streaming, progress, stop, memory, limits, estimates, attachments, post-agent actions, research, and generated assets.
- **Workspace**: The authenticated Veefore tenant boundary that owns conversations, messages, memory, usage, accounts, and assets.
- **Conversation**: A Workspace-scoped VeeGPT thread with a title, messages, lifecycle state, and timestamps.
- **Conversation_Sidebar**: The mobile drawer or sheet that presents new chat, history, search, and account-level VeeGPT controls.
- **Composer**: The message-entry region containing text input, attachment controls, tool controls, selection controls, and send or stop action.
- **NDJSON_Stream**: The newline-delimited JSON response from a VeeGPT message request containing ordered conversation, message, status, progress, chunk, completion, or error events.
- **Stream_Renderer**: The state owner that converts NDJSON_Stream events into one coherent live assistant turn.
- **Conversation_Manager**: The VeeGPT_Interface component that creates, selects, renames, archives, deletes, and restores Conversations.
- **Error_Presenter**: The VeeGPT_Interface component that maps backend and connectivity failures to non-sensitive messages and recovery actions.
- **Accessibility_Layer**: The Mobile_App behavior that exposes VeeGPT content and controls to assistive technologies and device accessibility preferences.
- **Tool_Progress**: User-readable status for research, image generation, analysis, content, and other backend-supported tool execution.
- **Attachment_Manager**: The VeeGPT_Interface component that selects, validates, previews, uploads, removes, and presents message attachments.
- **Agent**: A backend-authorized VeeGPT persona returned for the authenticated user's entitlement.
- **Model_Selection**: A backend-supported model or automatic-routing choice available to the authenticated user.
- **Rich_Card**: A structured message artifact such as a post confirmation, edit confirmation, information card, research report, document, approval, content brief, or generated-media card.
- **Generated_Asset**: An authenticated image, document, report, or other output created by VeeGPT.
- **Memory_Control**: A user control for viewing or deleting Workspace-scoped VeeGPT memory through VeeGPT_API.
- **Usage_State**: The backend-authoritative allowance, estimate, warning band, reset time, refusal reason, and upgrade availability for VeeGPT activity.
- **Terminal_Event**: A completion, stopped, or error outcome that ends one streamed assistant turn.
- **Offline_State**: A detected condition in which Mobile_App cannot reach VeeGPT_API.
- **Telemetry_System**: The privacy-safe logging and metrics boundary for mobile VeeGPT behavior.
- **Migration_Layer**: The removal and replacement work for Copilot, `/ai/chat`, API diagnostics, and obsolete navigation entries.
- **Validation_Suite**: Automated unit, integration, property-based, accessibility, performance, and end-to-end checks for this feature.
- **Benchmark_Profile**: A release test profile using the lowest supported iOS and Android device classes, a 200-message open Conversation, 10,000 history entries, 20 Mbps connectivity, and 50 ms network round-trip latency.

## Requirements

### Requirement 1: Primary Mode Architecture

**User Story:** As a mobile user, I want VeeGPT and the main product to behave as equal app modes, so that I can switch contexts without losing my place.

#### Acceptance Criteria

1. THE Mode_Host SHALL define Main_App_Mode and VeeGPT_Mode as sibling primary modes.
2. WHEN a user activates Mode_Switch in Main_App_Mode, THE Mode_Host SHALL display VeeGPT_Mode without adding VeeGPT_Mode to the Main_App_Mode navigation back stack.
3. WHEN a user activates Mode_Switch in VeeGPT_Mode, THE Mode_Host SHALL restore Main_App_Mode without adding Main_App_Mode to the VeeGPT_Mode navigation back stack.
4. WHILE Main_App_Mode is active, THE Navigation_System SHALL present the existing native bottom tabs except the Copilot tab.
5. WHILE VeeGPT_Mode is active, THE Navigation_System SHALL reserve the full primary content area for VeeGPT_Interface and VeeGPT navigation controls.
6. WHEN the operating system invokes a back action at the root of VeeGPT_Mode, THE Mode_Host SHALL switch to Main_App_Mode.
7. WHEN a deep link targets an authorized Conversation, THE Mode_Host SHALL activate VeeGPT_Mode and open the targeted Conversation.
8. IF a deep link targets an unavailable or unauthorized Conversation, THEN THE VeeGPT_Interface SHALL display the VeeGPT landing state with a non-sensitive error message.

### Requirement 2: Mode Switch Placement and Branding

**User Story:** As a Veefore user, I want an obvious branded way to enter and leave VeeGPT, so that switching modes feels intentional and native.

#### Acceptance Criteria

1. WHEN the Dashboard renders, THE Mobile_App SHALL present Mode_Switch in the location previously occupied by the blue API-diagnostics floating action button.
2. THE Mode_Switch SHALL use original Veefore or VeeGPT names, iconography, color tokens, and motion assets.
3. THE VeeGPT_Interface SHALL apply Veefore design tokens for light mode and dark mode.
4. THE VeeGPT_Interface SHALL use interaction conventions comparable to leading mobile conversational interfaces without using third-party protected names, logos, icons, illustrations, or copied visual assets.
5. WHILE VeeGPT_Mode is active, THE VeeGPT_Interface SHALL provide a visible Mode_Switch that returns to Main_App_Mode.
6. WHEN Mode_Switch receives focus from an accessibility service, THE Mode_Switch SHALL expose the destination mode, control role, and current mode state.

### Requirement 3: Persistent Independent Mode State

**User Story:** As a returning user, I want the app to reopen where I left off and remember both modes independently, so that switching or relaunching does not disrupt my work.

#### Acceptance Criteria

1. WHEN a user changes the active primary mode, THE State_Store SHALL persist the selected mode before the mode transition completes.
2. WHEN an authenticated cold launch completes state restoration, THE Mode_Host SHALL activate the last persisted primary mode.
3. WHEN an authenticated cold launch completes state restoration, THE State_Store SHALL restore the last persisted state snapshot for each primary mode independently.
4. IF the persisted primary-mode value is absent, malformed, or unsupported, THEN THE Mode_Host SHALL activate Main_App_Mode and replace the invalid value with Main_App_Mode.
5. WHEN a user switches from Main_App_Mode to VeeGPT_Mode, THE State_Store SHALL preserve the Main_App_Mode selected tab and nested navigation state.
6. WHEN a user switches from VeeGPT_Mode to Main_App_Mode, THE State_Store SHALL preserve the selected Conversation, VeeGPT view, draft, sidebar state, and supported scroll position.
7. WHEN a user returns to either primary mode during the same authenticated session, THE Mode_Host SHALL restore that mode's most recent preserved state.
8. WHEN a user signs out, THE State_Store SHALL remove user-specific persisted mode, Conversation, draft, and Workspace state.
9. IF restored state references a Conversation outside the active Workspace, THEN THE VeeGPT_Interface SHALL discard the stale Conversation reference and display the Workspace landing state.

### Requirement 4: Production API Reuse and Authentication

**User Story:** As a product owner, I want mobile VeeGPT to use the production service contract, so that capabilities and policy stay consistent across clients.

#### Acceptance Criteria

1. THE VeeGPT_Client SHALL consume existing VeeGPT_API routes for every production VeeGPT capability.
2. THE VeeGPT_Client SHALL support the existing VeeGPT_API endpoint families for agents, conversations, search, messages, streaming, generation state, research progress, image progress, stopping, conversation lifecycle actions, message actions, attachments, memory, usage, estimates, context, post-agent workflows, research history, trends, and Generated_Asset delivery.
3. WHEN VeeGPT_Client sends a VeeGPT_API request, THE VeeGPT_Client SHALL attach the current authenticated session credentials using the Mobile_App authentication mechanism.
4. WHEN VeeGPT_Client sends a Workspace-scoped request, THE VeeGPT_Client SHALL identify the active Workspace using the VeeGPT_API contract.
5. WHEN model or tool options are required, THE VeeGPT_Client SHALL use existing Workspace AI configuration and VeeGPT_API authorization data.
6. IF VeeGPT_API returns an authentication failure, THEN THE Mobile_App SHALL enter the existing authentication recovery flow without exposing credentials in user-visible output.
7. IF VeeGPT_API returns an authorization failure, THEN THE VeeGPT_Interface SHALL withhold the protected resource and display a non-sensitive access message.
8. THE Migration_Layer SHALL remove mobile production use of `/ai/chat`.
9. THE Mobile_App SHALL add zero duplicate backend routes for chat, Conversations, streaming, attachments, or Generated_Asset delivery.
10. IF a requested capability is absent from VeeGPT_API, THEN THE VeeGPT_Interface SHALL mark the capability unavailable instead of invoking a legacy, inferred, or mobile-only route.

### Requirement 5: Landing and Empty States

**User Story:** As a user starting a conversation, I want a polished, useful landing screen, so that I can begin with confidence.

#### Acceptance Criteria

1. WHEN VeeGPT_Mode opens without a selected Conversation, THE VeeGPT_Interface SHALL display a Veefore-branded VeeGPT landing state.
2. WHEN the active Workspace has no Conversations, THE VeeGPT_Interface SHALL display a new-user empty state without an empty history list.
3. WHEN the active Workspace has Conversations but no selected Conversation, THE VeeGPT_Interface SHALL display a new-chat landing state and make Conversation_Sidebar available.
4. THE VeeGPT landing state SHALL present a Composer and backend-supported starter prompts.
5. WHEN a user selects a starter prompt, THE Composer SHALL populate the selected prompt for user review before submission.
6. WHEN a user submits the first valid message from the landing state, THE VeeGPT_Client SHALL create one Conversation and stream the first assistant turn through VeeGPT_API.
7. WHILE first-message creation is pending, THE Composer SHALL prevent a second submission from creating a duplicate Conversation.
8. IF first-message creation fails, THEN THE VeeGPT_Interface SHALL preserve the user's draft and attachments and present a retry action.

### Requirement 6: Conversation Sidebar, History, and Search

**User Story:** As a frequent VeeGPT user, I want fast mobile access to my chats and search, so that I can resume prior work.

#### Acceptance Criteria

1. WHEN a user opens Conversation_Sidebar, THE Conversation_Sidebar SHALL present a new-chat action, Workspace-scoped Conversation history, search, and VeeGPT settings entry points.
2. WHEN Conversation history loads, THE Conversation_Sidebar SHALL order Conversations by most recent activity using VeeGPT_API results.
3. WHEN a user selects a Conversation, THE VeeGPT_Interface SHALL close the mobile overlay and display the selected Conversation.
4. WHEN a user submits a non-empty search query, THE Conversation_Sidebar SHALL request Workspace-scoped conversation search through VeeGPT_API.
5. WHEN search results contain a message match, THE Conversation_Sidebar SHALL present the Conversation title, a matching snippet, and the match location.
6. WHEN a user selects a message search result, THE VeeGPT_Interface SHALL open the owning Conversation, scroll to the matched message, and indicate the match.
7. IF history or search fails, THEN THE Conversation_Sidebar SHALL retain the current query and present a retry action.
8. WHILE additional history is loading, THE Conversation_Sidebar SHALL preserve the visible list position.
9. WHEN the active Workspace changes, THE Conversation_Sidebar SHALL replace history and search results with data scoped to the new Workspace.

### Requirement 7: Conversation Management

**User Story:** As a user, I want to organize and remove chats from mobile, so that history remains manageable.

#### Acceptance Criteria

1. WHEN a user starts a new chat, THE VeeGPT_Interface SHALL display an empty Composer without deleting the previously selected Conversation.
2. WHEN a user submits a valid rename, THE Conversation_Manager SHALL update the Conversation title through VeeGPT_API and reflect the confirmed title in history.
3. IF a rename is empty or exceeds the VeeGPT_API title limit, THEN THE Conversation_Manager SHALL retain the prior title and identify the validation error.
4. WHEN a user confirms archive, THE Conversation_Manager SHALL archive the Conversation through VeeGPT_API and remove the Conversation from active history.
5. WHEN a user confirms delete, THE Conversation_Manager SHALL delete the Conversation through VeeGPT_API and remove the Conversation from local state.
6. IF archive or delete fails, THEN THE Conversation_Manager SHALL retain the Conversation in local history and present a retryable error.
7. WHILE a Conversation has an active generation, THE Conversation_Manager SHALL preserve generation state when the user opens another Conversation.
8. WHEN a user returns to a Conversation with an active generation, THE Conversation_Manager SHALL resume visible generation, research, and image progress from VeeGPT_API state endpoints.

### Requirement 8: Composer and Keyboard Interaction

**User Story:** As a mobile user, I want the composer and keyboard to behave predictably, so that long prompts and attachments remain easy to manage.

#### Acceptance Criteria

1. WHEN a user enters text, THE Composer SHALL grow from its minimum height to a maximum height that leaves the active message context and send controls visible.
2. WHEN Composer content exceeds the maximum height, THE Composer SHALL scroll the input content without expanding further.
3. WHILE the software keyboard is visible, THE Composer SHALL remain above the keyboard and safe-area inset.
4. WHEN a user opens a Conversation, THE VeeGPT_Interface SHALL avoid opening the software keyboard until the user focuses Composer.
5. WHEN a user taps outside Composer while the software keyboard is visible, THE Composer SHALL dismiss the software keyboard without discarding the draft.
6. WHEN a user submits non-whitespace text or at least one valid attachment, THE Composer SHALL send one message.
7. IF Composer contains only whitespace and no valid attachment, THEN THE Composer SHALL keep send disabled.
8. WHILE a generation is active for the selected Conversation, THE Composer SHALL replace the send action with a stop action.
9. WHEN a message submission is accepted, THE Composer SHALL clear only the draft and attachments included in the accepted submission.
10. IF message submission is rejected before acceptance, THEN THE Composer SHALL retain the draft and attachments.

### Requirement 9: Streaming and Generation Lifecycle

**User Story:** As a user, I want responses to appear live with reliable stop and resume behavior, so that VeeGPT feels responsive and controllable.

#### Acceptance Criteria

1. WHEN VeeGPT_Client submits a message, THE VeeGPT_Client SHALL consume the returned NDJSON_Stream from the same message request.
2. WHEN Stream_Renderer receives a chunk event, THE Stream_Renderer SHALL update one assistant message with the event's cumulative content.
3. WHEN Stream_Renderer receives a status event, THE Stream_Renderer SHALL present the current user-readable generation status without replacing streamed answer content.
4. WHEN Stream_Renderer receives a completion event, THE Stream_Renderer SHALL finalize the assistant message once and stop the active generation indicator.
5. WHEN a user activates stop, THE VeeGPT_Client SHALL request stop for the selected Conversation through VeeGPT_API.
6. WHEN VeeGPT_API confirms stop, THE Stream_Renderer SHALL preserve received partial content and mark the turn as stopped.
7. IF the stream connection ends without a Terminal_Event, THEN THE Stream_Renderer SHALL query generation state and persisted messages before offering retry.
8. WHEN a user reopens an actively generating Conversation, THE Stream_Renderer SHALL restore partial answer content and continue progress polling until a Terminal_Event is observed.
9. IF malformed NDJSON data is received, THEN THE Stream_Renderer SHALL preserve valid prior events and present a recoverable stream error.
10. WHILE one Conversation generates in the background, THE VeeGPT_Interface SHALL permit navigation to other Conversations without attaching the background stream to the selected Conversation.

### Requirement 10: Tool, Research, and Image Progress

**User Story:** As a user running advanced VeeGPT tasks, I want honest live progress, so that I understand what VeeGPT is doing.

#### Acceptance Criteria

1. WHEN VeeGPT_API emits Tool_Progress, THE Stream_Renderer SHALL display the backend-provided operation status in the active assistant turn.
2. WHEN VeeGPT_API emits research progress, THE Stream_Renderer SHALL display the current phase, accumulated steps, source count, search count, and available sources.
3. WHEN VeeGPT_API emits image progress, THE Stream_Renderer SHALL display a generation or editing card with the backend-provided operation and subject.
4. WHEN a user returns to an active research Conversation, THE Stream_Renderer SHALL restore research progress from VeeGPT_API.
5. WHEN a user returns to an active image Conversation, THE Stream_Renderer SHALL restore image progress from VeeGPT_API.
6. WHEN multiple tools run during one turn, THE Stream_Renderer SHALL present the combined backend status without inventing unreported operations.
7. WHEN a Tool_Progress operation reaches a terminal state, THE Stream_Renderer SHALL replace transient progress with the persisted result or terminal error.
8. IF progress polling fails while generation remains active, THEN THE Stream_Renderer SHALL retain the most recent progress and present a reconnecting state.

### Requirement 11: Message Presentation and Actions

**User Story:** As a user, I want readable messages and familiar actions, so that I can reuse, correct, and evaluate VeeGPT output.

#### Acceptance Criteria

1. WHEN a Conversation loads, THE VeeGPT_Interface SHALL render user and assistant messages in chronological order with stable message identity.
2. WHEN assistant content includes supported Markdown, THE VeeGPT_Interface SHALL render headings, lists, links, quotations, tables, and code blocks as accessible native content.
3. WHEN a user activates copy on an assistant message, THE VeeGPT_Interface SHALL copy the message's textual content and confirm the action.
4. WHEN a user activates regenerate on an eligible assistant turn, THE VeeGPT_Client SHALL request one alternative response through VeeGPT_API.
5. WHEN VeeGPT_API returns multiple response variants, THE VeeGPT_Interface SHALL provide variant navigation and persist the selected active variant through VeeGPT_API.
6. WHEN a user retries an eligible failed message, THE VeeGPT_Client SHALL submit one retry associated with the original Conversation.
7. WHEN a message contains links, THE VeeGPT_Interface SHALL distinguish external destinations before opening the operating-system link handler.
8. WHEN a message action is unavailable for the message state, THE VeeGPT_Interface SHALL omit or disable the action and expose the unavailable state to accessibility services.
9. WHILE new streamed content arrives near the bottom of the thread, THE VeeGPT_Interface SHALL keep the latest content visible.
10. WHILE a user is reading content away from the bottom, THE VeeGPT_Interface SHALL preserve the reading position and present a jump-to-latest control.

### Requirement 12: Attachments and Media

**User Story:** As a user, I want to send and inspect supported files, so that VeeGPT can work with my media and documents.

#### Acceptance Criteria

1. WHEN a user opens attachment controls, THE Attachment_Manager SHALL offer only device sources supported by VeeGPT_API and the operating system permission state.
2. WHEN a user selects files, THE Attachment_Manager SHALL validate count, MIME type, and byte size against the shared VeeGPT_API attachment limits before upload.
3. IF a selected file violates an attachment limit, THEN THE Attachment_Manager SHALL exclude the invalid file and identify the violated limit.
4. WHEN a valid image or video is selected, THE Attachment_Manager SHALL display a local preview before message submission.
5. WHEN a valid non-previewable document is selected, THE Attachment_Manager SHALL display file name, type, and size before message submission.
6. WHEN a user removes a pending attachment, THE Attachment_Manager SHALL exclude that attachment from the next submission.
7. WHEN a user submits valid attachments, THE Attachment_Manager SHALL upload the attachments through VeeGPT_API and associate returned attachment references with the submitted message.
8. WHILE an attachment upload is active, THE Attachment_Manager SHALL present per-upload progress and a cancellation action.
9. IF attachment upload fails, THEN THE Attachment_Manager SHALL retain the pending attachment and present retry or removal actions.
10. WHEN a user activates message media, THE VeeGPT_Interface SHALL open an accessible full-screen viewer with close, share, and download actions permitted by the asset contract.
11. IF operating-system media permission is denied, THEN THE Attachment_Manager SHALL explain the denied capability and provide a settings action where the operating system supports one.

### Requirement 13: Agents, Models, Accounts, and Tools

**User Story:** As an advanced user, I want to choose supported VeeGPT capabilities, so that responses match my task and account context.

#### Acceptance Criteria

1. WHEN VeeGPT_Interface loads selectable Agents, THE VeeGPT_Client SHALL retrieve the authenticated entitlement-filtered Agent list from VeeGPT_API.
2. WHEN a user selects an Agent, THE Composer SHALL apply the Agent identifier to subsequent submissions until the user changes the selection or the Agent becomes unavailable.
3. IF a selected Agent is absent from a refreshed entitlement-filtered list, THEN THE Composer SHALL select the backend-defined default Agent and inform the user.
4. WHEN VeeGPT_API exposes Model_Selection options, THE Composer SHALL present only the options authorized for the active Workspace and user.
5. WHEN a user explicitly selects a model, THE VeeGPT_Client SHALL preserve the selection unless VeeGPT_API returns a structured refusal.
6. IF VeeGPT_API refuses a selected model and offers a faster model, THEN THE VeeGPT_Interface SHALL request user confirmation before using the offered model.
7. WHEN a user selects a connected social account focus, THE Composer SHALL include the selected account identifier in subsequent supported requests.
8. WHEN the active Workspace changes, THE Composer SHALL clear any account selection unavailable in the new Workspace.
9. WHEN a user arms a backend-supported tool, THE Composer SHALL apply the tool to the next submission and clear the armed state after that submission is accepted.
10. IF an Agent, model, account, or tool request is rejected by VeeGPT_API, THEN THE VeeGPT_Interface SHALL display the backend-authoritative reason and retain an editable draft where applicable.

### Requirement 14: Rich Cards, Post Actions, and Generated Assets

**User Story:** As a creator, I want VeeGPT's structured outputs to remain interactive on mobile, so that advanced workflows have full production parity.

#### Acceptance Criteria

1. WHEN a message contains a supported Rich_Card, THE VeeGPT_Interface SHALL render the card's title, status, content, and available actions.
2. WHEN a user confirms a post card, THE VeeGPT_Client SHALL persist the confirmation through the existing VeeGPT_API post-card or post-agent action.
3. WHEN a user cancels a post card, THE VeeGPT_Client SHALL persist the cancelled state through VeeGPT_API.
4. WHEN a user applies an edit confirmation, THE VeeGPT_Client SHALL persist the action through the existing VeeGPT_API edit action.
5. WHILE a Rich_Card is completed, cancelled, or applying, THE VeeGPT_Interface SHALL prevent duplicate activation of its terminal action.
6. WHEN a user opens a research report or generated document, THE VeeGPT_Interface SHALL present the complete artifact in an accessible mobile viewer.
7. WHEN a user opens a Generated_Asset, THE VeeGPT_Client SHALL retrieve the asset through its authenticated VeeGPT_API delivery route.
8. WHEN a user activates download or share for a Generated_Asset, THE VeeGPT_Interface SHALL use the operating-system action supported for the asset type.
9. WHEN VeeGPT_API returns generated-image album data, THE VeeGPT_Interface SHALL present Workspace-scoped assets and a link to each source Conversation.
10. IF a Rich_Card type is unsupported by the installed mobile version, THEN THE VeeGPT_Interface SHALL present a safe textual fallback containing no executable payload.
11. IF a Rich_Card action fails, THEN THE VeeGPT_Interface SHALL retain the pre-action card state and present a retryable error.

### Requirement 15: Memory and Usage Controls

**User Story:** As a user, I want visibility and control over memory and limits, so that VeeGPT behavior remains understandable and manageable.

#### Acceptance Criteria

1. WHEN a user opens Memory_Control, THE VeeGPT_Client SHALL retrieve memory and memory usage for the active Workspace through VeeGPT_API.
2. WHEN a user confirms deletion of one memory item, THE VeeGPT_Client SHALL delete that item through VeeGPT_API and remove the item from the confirmed local view.
3. WHEN a user confirms clearing Workspace memory, THE VeeGPT_Client SHALL clear memory through VeeGPT_API and present the confirmed empty state.
4. IF a memory deletion fails, THEN THE VeeGPT_Interface SHALL retain the affected memory item and display a retryable error.
5. WHEN Composer becomes ready for a new turn, THE VeeGPT_Client SHALL retrieve current Usage_State through VeeGPT_API.
6. WHEN VeeGPT_API provides a usage estimate for a high-cost operation, THE VeeGPT_Interface SHALL display the estimate before user confirmation.
7. WHEN Usage_State reports a warning band, THE VeeGPT_Interface SHALL display the backend-provided plain-language warning, reset time, and available upgrade action.
8. IF Usage_State reports a reached limit, THEN THE Composer SHALL prevent the refused operation and display the backend-provided recovery choices.
9. IF premium capacity is exhausted and fast continuation is offered, THEN THE VeeGPT_Interface SHALL require explicit user approval before resubmitting with the offered fallback.
10. THE VeeGPT_Interface SHALL avoid representing message count as the authoritative VeeGPT allowance.

### Requirement 16: Offline, Error, and Recovery States

**User Story:** As a mobile user, I want failures and network changes handled without losing work, so that I can recover safely.

#### Acceptance Criteria

1. WHEN Mobile_App enters Offline_State, THE VeeGPT_Interface SHALL display an offline indicator and preserve the current draft, pending attachments, and cached Conversation content.
2. WHILE Offline_State is active, THE Composer SHALL withhold network submission and preserve the unsent message for explicit user submission after reconnection.
3. WHEN connectivity returns, THE VeeGPT_Interface SHALL refresh the selected Conversation and active Workspace history without automatically sending an unsent draft.
4. IF a request times out, THEN THE VeeGPT_Interface SHALL distinguish the timeout from authentication, authorization, validation, limit, and server failures.
5. IF VeeGPT_API returns a structured error code, THEN THE Error_Presenter SHALL map the code to a specific recovery action supported by the response.
6. IF VeeGPT_API returns an unknown error, THEN THE Error_Presenter SHALL display a generic retryable message and a correlation identifier where provided.
7. IF a retry could duplicate a non-idempotent action, THEN THE VeeGPT_Interface SHALL refresh server state before enabling the retry.
8. WHEN an application process restarts after a pending generation, THE VeeGPT_Interface SHALL reconcile generation state and persisted messages before permitting regeneration.
9. IF cached Conversation data cannot be decoded, THEN THE State_Store SHALL discard the invalid cache segment and request fresh Workspace-scoped data.

### Requirement 17: Accessibility and Inclusive Interaction

**User Story:** As a user with accessibility needs, I want VeeGPT to work with assistive technologies and display preferences, so that I can use every core workflow.

#### Acceptance Criteria

1. THE Accessibility_Layer SHALL provide accessible names, roles, states, and hints for every interactive VeeGPT control.
2. THE Accessibility_Layer SHALL maintain a minimum interactive target of 44 by 44 logical points.
3. THE VeeGPT_Interface SHALL provide text and essential icon contrast of at least 4.5:1 for normal text and 3:1 for large text or graphical controls.
4. WHEN device text size is set to 200 percent, THE VeeGPT_Interface SHALL preserve access to message content, Composer, Mode_Switch, and primary actions without horizontal page scrolling.
5. WHEN a screen reader is active, THE Stream_Renderer SHALL announce status changes and completed responses without announcing every individual stream chunk.
6. WHEN reduce-motion is enabled, THE VeeGPT_Interface SHALL replace non-essential motion with immediate or opacity-only state changes.
7. WHEN keyboard or switch-control navigation is used, THE VeeGPT_Interface SHALL expose a logical focus order and visible focus indication.
8. WHEN color communicates generation, error, warning, or selection state, THE VeeGPT_Interface SHALL provide a non-color indicator for the same state.
9. WHEN media contains backend-provided alternative text, THE VeeGPT_Interface SHALL expose the alternative text to accessibility services.
10. IF media lacks alternative text, THEN THE VeeGPT_Interface SHALL expose the media type and available action instead of an invented description.

### Requirement 18: Performance and Responsiveness

**User Story:** As a mobile user, I want VeeGPT to remain responsive with long histories and streams, so that production-scale use feels polished.

#### Acceptance Criteria

1. WHEN VeeGPT_Mode activates under Benchmark_Profile with cached chrome assets, THE VeeGPT_Interface SHALL present interactive navigation and Composer within 2 seconds.
2. WHEN a cached Conversation opens under Benchmark_Profile, THE VeeGPT_Interface SHALL present the first visible message viewport within 1 second.
3. WHILE a 200-message Conversation is open under Benchmark_Profile, THE VeeGPT_Interface SHALL virtualize off-screen message content.
4. WHILE 10,000 Conversations are available under Benchmark_Profile, THE Conversation_Sidebar SHALL paginate or incrementally load history without rendering the full result set simultaneously.
5. WHEN a stream chunk arrives under Benchmark_Profile, THE Stream_Renderer SHALL paint the cumulative content within 100 milliseconds at the 95th percentile.
6. WHILE streaming under Benchmark_Profile, THE Stream_Renderer SHALL batch visual updates to avoid more than 20 message-body renders per second.
7. WHILE scrolling messages on Benchmark_Profile, THE VeeGPT_Interface SHALL maintain at least 50 rendered frames per second at the 95th percentile of sampled one-second windows.
8. WHEN VeeGPT_Mode becomes inactive, THE VeeGPT_Interface SHALL release media previews, listeners, and polling that are not required for an active background generation.
9. WHILE a background generation remains active, THE VeeGPT_Client SHALL limit progress polling to the intervals defined by VeeGPT_API or mobile configuration.

### Requirement 19: Advanced Production Capabilities

**User Story:** As a production VeeGPT user, I want mobile access to backend-supported advanced capabilities, so that mobile is not limited to basic chat.

#### Acceptance Criteria

1. WHEN a user opens research history, THE VeeGPT_Client SHALL retrieve Workspace-scoped reports through VeeGPT_API.
2. WHEN a user requests a supported trend refresh, THE VeeGPT_Client SHALL initiate the refresh through VeeGPT_API and present the returned job state.
3. WHEN a user requests current VeeGPT context, THE VeeGPT_Client SHALL retrieve the Workspace-scoped context snapshot through VeeGPT_API.
4. WHEN a user confirms context refresh, THE VeeGPT_Client SHALL request refresh through VeeGPT_API and present the confirmed refresh state.
5. WHEN a user starts a backend-supported post-agent workflow, THE VeeGPT_Client SHALL execute the workflow through the existing VeeGPT_API post-agent action.
6. WHEN VeeGPT_API returns an approval or content-brief workflow, THE VeeGPT_Interface SHALL render the supported actions and persist each selected action through the existing backend contract.
7. WHERE Auto Pilot is enabled for the authenticated entitlement, THE VeeGPT_Interface SHALL provide access to the production Auto Pilot surface without creating a second assistant identity.
8. WHERE conversational video editing is enabled for the authenticated entitlement, THE VeeGPT_Interface SHALL provide access to the production video-editing surface within VeeGPT_Mode.
9. WHERE a generated-asset album is enabled for the authenticated entitlement, THE VeeGPT_Interface SHALL preserve the selected asset and source Conversation when switching between album and chat views.
10. IF an advanced capability is unavailable for the authenticated entitlement, THEN THE VeeGPT_Interface SHALL present the backend-provided availability or upgrade state without invoking the capability.

### Requirement 20: Security and Workspace Isolation

**User Story:** As a workspace member, I want VeeGPT data isolated and protected, so that another workspace or user cannot access my conversations or assets.

#### Acceptance Criteria

1. THE VeeGPT_Client SHALL derive authenticated user identity from the Mobile_App session rather than user-editable request data.
2. THE VeeGPT_Client SHALL store authentication secrets only through the existing operating-system-protected credential mechanism.
3. WHEN VeeGPT_Client receives a Conversation, message, memory item, or Generated_Asset response, THE VeeGPT_Client SHALL associate the response with the active Workspace scope.
4. IF a response resource identifies a Workspace different from the active Workspace, THEN THE VeeGPT_Interface SHALL withhold the resource, clear the affected cache entry, and record a security telemetry event.
5. WHEN the active Workspace changes, THE State_Store SHALL prevent cached data from the prior Workspace from appearing in the new Workspace.
6. WHEN a user signs out or the session is revoked, THE State_Store SHALL remove locally persisted VeeGPT content and attachment references for that user.
7. THE Telemetry_System SHALL exclude authentication tokens, provider keys, full prompt content, attachment bodies, and private Generated_Asset URLs from logs.
8. WHEN VeeGPT_Interface opens a remote link, THE VeeGPT_Interface SHALL accept only operating-system-supported web schemes.
9. IF an attachment or Generated_Asset delivery request is unauthorized, THEN THE VeeGPT_Interface SHALL withhold cached protected content and present an access error.
10. THE Mobile_App SHALL apply platform data protection to persisted Conversation content, drafts, and VeeGPT preferences.

### Requirement 21: Observability and Product Quality Signals

**User Story:** As an operator, I want privacy-safe VeeGPT telemetry, so that mobile failures and experience quality can be diagnosed.

#### Acceptance Criteria

1. WHEN a VeeGPT_API request starts, THE Telemetry_System SHALL record route category, request correlation identifier, active mode, and start time without recording sensitive payload content.
2. WHEN a VeeGPT_API request ends, THE Telemetry_System SHALL record outcome category, duration, retry count, and structured backend error code where present.
3. WHEN a streamed turn starts or reaches a Terminal_Event, THE Telemetry_System SHALL record Conversation-scoped pseudonymous identifiers, time to first content, total duration, and terminal outcome.
4. WHEN a mode transition occurs, THE Telemetry_System SHALL record source mode, destination mode, restoration outcome, and transition duration.
5. WHEN state restoration fails, THE Telemetry_System SHALL record the failed state category and recovery path without recording restored content.
6. WHEN Workspace isolation rejects a resource, THE Telemetry_System SHALL record a security event with pseudonymous user and Workspace identifiers.
7. WHEN attachment upload, research progress, image progress, or Rich_Card action fails, THE Telemetry_System SHALL record the capability category and failure code.
8. THE Telemetry_System SHALL expose metrics for crash-free VeeGPT sessions, stream completion rate, stop success rate, mode restoration success rate, and message-send failure rate.
9. IF telemetry delivery fails, THEN THE Telemetry_System SHALL preserve Mobile_App functionality and bound queued telemetry according to the application's retention policy.

### Requirement 22: Copilot and Diagnostics Migration

**User Story:** As a user, I want one production AI experience without debug artifacts, so that the app is coherent and release-ready.

#### Acceptance Criteria

1. THE Migration_Layer SHALL remove the Copilot tab from Main_App_Mode.
2. THE Migration_Layer SHALL remove the Copilot screen from Navigation_System route registration and navigation type declarations.
3. THE Migration_Layer SHALL remove the dashboard AI Copilot quick action or redirect the action to Mode_Switch with VeeGPT labeling.
4. THE Migration_Layer SHALL remove the mobile Copilot service and hooks that send production chat requests to `/ai/chat`.
5. THE Migration_Layer SHALL remove user-facing AI Copilot naming from mobile production surfaces and replace applicable labels with VeeGPT naming.
6. THE Migration_Layer SHALL remove the API Diagnostic screen from Navigation_System route registration and navigation type declarations.
7. THE Migration_Layer SHALL remove the API Diagnostic screen implementation from the production mobile application.
8. THE Migration_Layer SHALL remove every dashboard navigation path to the Diagnostic route.
9. WHEN an obsolete persisted Copilot or Diagnostic route is restored after upgrade, THE Navigation_System SHALL migrate the route to VeeGPT_Mode or Main_App_Mode respectively.
10. IF an external deep link targets the removed Copilot route, THEN THE Navigation_System SHALL activate VeeGPT_Mode without creating a second assistant route.
11. IF an external deep link targets the removed Diagnostic route, THEN THE Navigation_System SHALL activate Main_App_Mode without exposing diagnostics.
12. THE Mobile_App SHALL contain exactly one user-facing conversational AI identity named VeeGPT.

### Requirement 23: Validation and Property-Based Correctness

**User Story:** As an engineering team, I want automated correctness properties and release validation, so that navigation, streaming, isolation, and recovery remain reliable across edge cases.

#### Acceptance Criteria

1. THE Validation_Suite SHALL include unit tests for mode switching, state restoration, Composer validation, stream reduction, attachment validation, usage refusals, and Migration_Layer redirects.
2. THE Validation_Suite SHALL include integration tests against VeeGPT_API for authentication, Workspace scoping, history, search, streaming, stop, progress restoration, conversation actions, attachments, memory, limits, estimates, post-agent actions, and Generated_Asset delivery.
3. THE Validation_Suite SHALL include end-to-end tests for cold launch into each mode, switching modes with preserved state, first-message creation, background generation navigation, offline recovery, and sign-out cleanup.
4. WHEN a property-based test generates any finite sequence of valid mode switches and cold-launch restorations, THE Validation_Suite SHALL verify that the restored active mode equals the most recently persisted valid mode.
5. WHEN a property-based test generates independent valid states for both primary modes and any finite switch sequence, THE Validation_Suite SHALL verify that switching one mode leaves the other mode's preserved state unchanged.
6. WHEN a property-based test serializes and restores any supported State_Store value, THE Validation_Suite SHALL verify that restoration produces the same supported value or the documented safe default for invalid data.
7. WHEN a property-based test generates an ordered NDJSON_Stream with cumulative chunks and one Terminal_Event, THE Validation_Suite SHALL verify that Stream_Renderer produces one assistant turn whose final content equals the terminal content.
8. WHEN a property-based test repeats any NDJSON_Stream event or Terminal_Event, THE Validation_Suite SHALL verify that Stream_Renderer does not duplicate message content, Rich_Card actions, or terminal state transitions.
9. WHEN a property-based test generates interleaved events for multiple Conversation identifiers, THE Validation_Suite SHALL verify that each event updates only the matching Conversation state.
10. WHEN a property-based test generates resources across multiple Workspace identifiers, THE Validation_Suite SHALL verify that VeeGPT_Interface exposes only resources matching the active Workspace.
11. WHEN a property-based test generates arbitrary attachment sets, THE Validation_Suite SHALL verify that accepted attachments satisfy every shared count, MIME-type, and byte-size constraint and rejected attachments violate at least one constraint.
12. WHEN a property-based test generates arbitrary Conversation timestamps with deterministic tie breakers, THE Validation_Suite SHALL verify that displayed history order is stable and non-increasing by recent activity.
13. WHEN a property-based test generates repeated confirmations for one terminal Rich_Card action, THE Validation_Suite SHALL verify that at most one actionable request is issued after the first accepted confirmation.
14. WHEN a property-based test generates Offline_State transitions and unsent drafts, THE Validation_Suite SHALL verify that reconnection does not automatically submit a draft.
15. THE Validation_Suite SHALL run accessibility checks for labels, focus order, target size, contrast, reduced motion, and 200-percent text scaling on supported iOS and Android versions.
16. THE Validation_Suite SHALL run Benchmark_Profile checks for launch readiness, cached Conversation display, chunk rendering latency, history scalability, scrolling, and resource cleanup.
17. THE Validation_Suite SHALL fail release validation when any Workspace-isolation, duplicate-send, duplicate-terminal-action, authentication-secret exposure, or obsolete production `/ai/chat` check fails.
