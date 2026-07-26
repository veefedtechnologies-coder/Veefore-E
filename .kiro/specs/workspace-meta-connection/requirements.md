# Requirements Document

## Introduction

This document defines the requirements for the **Workspace & Meta Account Connection** feature in Veefore — a social media management SaaS. A workspace represents one brand, business, creator, or client. Each workspace acts as an isolated container for all social accounts, analytics, content, AI memory, and settings that belong to that brand.

This spec covers: the Workspace data model and lifecycle, plan-based workspace limit enforcement, the Meta OAuth connection flow from a workspace perspective, onboarding UX for first-time Meta connections, the "Add Workspace" flow for paid plans, workspace context isolation in the dashboard, the workspace switcher UI, team/roles schema readiness, and management of authorized-but-inactive brands.

This spec **does not** re-specify Meta OAuth token exchange, Page Access Token lifecycle, or the `SocialAccount` database model fields — those are fully specified in the `facebook-page-integration` spec. This spec references and extends that spec where necessary.

---

## Glossary

- **Workspace**: A named container representing one brand, business, creator, or client. One workspace holds multiple social accounts and all associated data for that brand.
- **Workspace_Service**: The backend service responsible for creating, reading, updating, deleting, and enforcing limits on workspaces.
- **Active_Workspace**: The workspace currently selected by the user in the dashboard; all data displayed and all actions performed are scoped to the Active_Workspace.
- **Workspace_Switcher**: The UI control that allows a user with more than one workspace to change their Active_Workspace.
- **SocialAccount**: A database record representing one connected platform account (Instagram Business account, Facebook Page, or future platform) belonging to a specific workspace. Defined and extended in the `facebook-page-integration` spec.
- **Meta_OAuth_Flow**: The OAuth 2.0 authorization flow initiated with Meta (Facebook/Instagram) that returns authorized Facebook Pages and their linked Instagram Professional accounts.
- **Authorized_Brand**: A Facebook Page (plus its linked Instagram account, if any) that the user granted Veefore access to via Meta OAuth but has not yet imported into a workspace.
- **Inactive_Brand**: An Authorized_Brand that exists in Veefore's authorized-brands store but is not yet imported into any workspace.
- **Plan_Limit**: The maximum number of workspaces a user is allowed to create under their current subscription plan.
- **Workspace_Context**: The full set of data scoped to a specific workspace: connected social accounts, analytics, calendar, drafts, AI memory, competitor tracking, social listening, scheduled posts, team members, and settings.
- **Onboarding_Flow**: The sequence of steps a new user completes after account creation: Login → Connect Meta → Choose brand (only if multiple brands authorized) → Dashboard.
- **Brand_Selection_Step**: A single onboarding screen shown only when the user authorized multiple Facebook Pages via Meta OAuth, asking them to choose which brand to manage first.
- **Workspace_Role**: A named permission level assigned to a team member within a workspace. Defined roles are: Owner, Admin, Editor, Content_Creator, Viewer.
- **WorkspaceMember**: A join record linking a User to a Workspace with a specific Workspace_Role.

---

## Requirements

---

### Requirement 1: Workspace Data Model

**User Story:** As a developer, I want a Workspace data model that represents one brand per workspace and supports all future social accounts and team members, so that all product data can be consistently scoped to the correct brand.

#### Acceptance Criteria

1. THE Workspace_Service SHALL store each workspace record with the following fields: `id` (unique identifier), `ownerId` (the Firebase UID of the user who created the workspace), `name` (the human-readable brand name, maximum 100 characters), `plan` (one of: `FREE`, `STARTER`, `PRO`, `BUSINESS`, `ENTERPRISE`), `createdAt` (UTC timestamp), `updatedAt` (UTC timestamp), and `status` (one of: `ACTIVE`, `SUSPENDED`, `DELETED`).
2. THE Workspace_Service SHALL enforce that `ownerId` references a valid, non-deleted user record; IF the referenced user does not exist, THEN THE Workspace_Service SHALL reject the create operation with a descriptive error.
3. THE Workspace_Service SHALL enforce that no two workspaces with the same `ownerId` share the same `name` (case-insensitive); IF a duplicate name is submitted, THEN THE Workspace_Service SHALL return a conflict error with error code `WORKSPACE_NAME_CONFLICT`.
4. THE Workspace_Service SHALL support a `WorkspaceMember` join record with fields: `workspaceId`, `userId`, `role` (one of: `OWNER`, `ADMIN`, `EDITOR`, `CONTENT_CREATOR`, `VIEWER`), `invitedAt` (UTC timestamp, set on invite creation), and `joinedAt` (UTC timestamp, nullable until the member accepts the invitation); this schema SHALL be persisted and enforced at the database level to support future role enforcement without requiring a schema migration.
5. THE SocialAccount model (as defined in the `facebook-page-integration` spec) SHALL include a `workspaceId` foreign key; THE Workspace_Service SHALL enforce that each SocialAccount belongs to exactly one workspace and that the same `provider + providerAccountId` combination cannot be imported into more than one workspace simultaneously; IF a duplicate import is attempted, THE Workspace_Service SHALL return a conflict error with error code `SOCIAL_ACCOUNT_ALREADY_IMPORTED`.
6. WHEN a workspace is deleted, THE Workspace_Service SHALL mark all associated `WorkspaceMember` records as `DELETED` (preserving the records for audit history) and SHALL mark all associated `SocialAccount` records as `DISCONNECTED`; it SHALL NOT hard-delete either `WorkspaceMember` or `SocialAccount` records.

---

### Requirement 2: Plan-Based Workspace Limit Enforcement

**User Story:** As a product owner, I want workspace creation to be gated by the user's subscription plan, so that workspace limits are enforced consistently and upgrades are incentivised.

#### Acceptance Criteria

1. THE Workspace_Service SHALL enforce the following maximum workspace counts per plan: Free — 1 workspace; Starter — 2 workspaces; Pro — 5 workspaces; Business — 20 workspaces; Enterprise — no default enforced limit.
2. WHEN a user attempts to create a new workspace, THE Workspace_Service SHALL count the user's existing non-deleted workspaces and compare against the plan limit; IF the count equals or exceeds the limit, THEN THE Workspace_Service SHALL reject the request with an error code of `WORKSPACE_LIMIT_REACHED` and a message indicating the current plan limit.
3. WHEN a user's subscription plan is upgraded, THE Workspace_Service SHALL immediately apply the new plan's workspace limit; previously created workspaces SHALL remain accessible and SHALL NOT be affected.
4. WHEN a user's subscription plan is downgraded to a plan with a lower workspace limit than the user's current workspace count, THE Workspace_Service SHALL NOT automatically delete workspaces; it SHALL mark workspaces exceeding the new limit as `SUSPENDED` in descending order of creation date (most recently created first), surface an in-app notification to the user stating the number of suspended workspaces and requiring them to reduce their active workspace count, and leave all workspaces within the new limit as `ACTIVE`.
5. IF a user on the Enterprise plan has a custom workspace limit set by an admin (a positive integer between 1 and 999 inclusive), THEN THE Workspace_Service SHALL enforce that custom limit rather than the default unlimited behavior.
6. THE Workspace_Service SHALL expose a read endpoint (`GET /workspaces/limits`) that returns: `currentCount` (number of non-deleted workspaces), `planLimit` (`null` for Enterprise unlimited), and `remainingCapacity` (`null` for Enterprise unlimited, otherwise `max(0, planLimit - currentCount)`), so the frontend can disable "Add Workspace" controls and display upgrade prompts without making a separate limit check.
7. WHEN two or more concurrent workspace creation requests are received for the same user at or near the plan limit, THE Workspace_Service SHALL use an atomic database operation (e.g., a transaction with a count-and-insert) to enforce the limit; IF the atomic check determines the limit would be exceeded, THEN only the first request that fits within the limit SHALL succeed and all others SHALL receive the `WORKSPACE_LIMIT_REACHED` error.

---

### Requirement 3: Meta OAuth Connection — Workspace Import Flow

**User Story:** As a user, I want connecting Meta to automatically import my authorized Facebook Pages and Instagram accounts into a workspace, so that I never have to manually re-select accounts that Meta already authorized.

#### Acceptance Criteria

1. WHEN the Meta OAuth callback returns successfully, THE Workspace_Service SHALL call the `facebook-page-integration` spec's FacebookProvider to retrieve all authorized Facebook Pages and their linked Instagram Professional accounts using Meta's exact returned Page ↔ Instagram mappings.
2. THE Workspace_Service SHALL NOT infer, guess, or re-derive Page-to-Instagram relationships; it SHALL use only the explicit `instagram_business_account` field returned by Meta's `/me/accounts` response for each Page.
3. WHEN a Facebook Page has no linked Instagram account in Meta's response, THE Workspace_Service SHALL import only the Facebook Page as a SocialAccount and SHALL allow an Instagram account to be connected to that workspace manually at a later time.
4. WHEN the Meta OAuth callback returns successfully, THE Workspace_Service SHALL upsert an Authorized_Brand record for each authorized Page: IF an Authorized_Brand record already exists for the `pageId`, THE Workspace_Service SHALL update its `authorizationToken`, `authorizedAt`, and reset `status` to `INACTIVE` if the brand has not yet been imported; IF no record exists, THE Workspace_Service SHALL create a new Authorized_Brand record containing: `pageId`, `pageName`, `pageProfilePictureUrl`, `linkedInstagramAccountId` (nullable), `linkedInstagramUsername` (nullable), `authorizationToken` (reference to the User Access Token from the `facebook-page-integration` spec), `authorizedAt` (UTC timestamp), and `status` (one of: `INACTIVE`, `IMPORTED`, `EXPIRED`).
5. WHEN an Authorized_Brand is imported into a workspace, THE Workspace_Service SHALL create the corresponding SocialAccount records (Facebook Page and Instagram account, if present) inside that workspace and SHALL set the Authorized_Brand's `status` to `IMPORTED`; IF the SocialAccount creation fails, THE Workspace_Service SHALL NOT set the status to `IMPORTED` and SHALL return an error to the caller.
6. WHEN the Meta OAuth callback `/me/accounts` API call fails, THE Workspace_Service SHALL NOT create or modify any Authorized_Brand or Workspace records; it SHALL return an error response to the frontend with a human-readable message and a retry option.
7. IF the User Access Token associated with an Authorized_Brand expires before the brand is imported, THE Workspace_Service SHALL set the Authorized_Brand's `status` to `EXPIRED` at the time of the import attempt; WHEN the user attempts to import that brand, THE Workspace_Service SHALL require the user to re-initiate the Meta OAuth flow before proceeding.
8. THE Workspace_Service SHALL NOT surface a page or account selection screen after Meta OAuth completes; the selection of which brand to manage first is handled by the Onboarding_Flow (Requirement 4) or the Add Workspace flow (Requirement 5).

---

### Requirement 4: Onboarding UX — First-Time Meta Connection

**User Story:** As a new user, I want onboarding to be as frictionless as possible, so that I reach the dashboard quickly without having to understand what a workspace is unless I actually manage multiple brands.

#### Acceptance Criteria

1. THE Onboarding_Flow SHALL follow the sequence: account creation → Connect Meta (Meta OAuth) → Brand_Selection_Step (conditional) → dashboard; THE Onboarding_Flow SHALL NOT include a manual "Create Workspace" step.
2. WHEN the Meta OAuth callback returns exactly one authorized Facebook Page, THE Onboarding_Flow SHALL automatically: create one workspace named after the Facebook Page (editable by the user later), import all SocialAccounts associated with that Page, and redirect the user to the dashboard without showing any additional onboarding step.
3. WHEN the Meta OAuth callback returns exactly one authorized Facebook Page and workspace or SocialAccount creation fails, THE Onboarding_Flow SHALL display an error screen with a retry option and SHALL NOT redirect the user to the dashboard until the workspace and at least the Facebook Page SocialAccount are successfully created.
4. WHEN the Meta OAuth callback returns zero authorized Facebook Pages (the user completed OAuth but granted access to no pages), THE Onboarding_Flow SHALL display an explanatory message: "No Facebook Pages were authorized. Please reconnect Meta and authorize at least one Page." with a "Reconnect Meta" button; THE Onboarding_Flow SHALL NOT create any workspace.
5. WHEN the Meta OAuth callback returns more than one authorized Facebook Page, THE Onboarding_Flow SHALL display the Brand_Selection_Step as the only additional onboarding step before the dashboard.
6. THE Brand_Selection_Step SHALL display the title "Choose the brand you want to manage first." and SHALL render one selectable card or radio option per authorized Facebook Page, showing the page name and profile picture; THE Brand_Selection_Step SHALL NOT ask the user to re-select Pages or Instagram accounts because Meta has already handled that authorization.
7. WHEN the user selects a brand on the Brand_Selection_Step and confirms, THE Onboarding_Flow SHALL: create one workspace for the selected brand, import the selected Facebook Page and its linked Instagram account (if any) as SocialAccounts, set all remaining Authorized_Brands to `INACTIVE` status, and redirect the user to the dashboard.
8. WHEN the user arrives at the dashboard after completing the Brand_Selection_Step and one or more Inactive_Brands remain, THE dashboard SHALL display a dismissible informational banner: "You've authorized [N] additional brand(s). Upgrade or create another workspace later to manage them." where N is the count of remaining Inactive_Brands.
9. WHILE the Onboarding_Flow is active (any step from account creation through brand selection), THE Workspace_Switcher SHALL NOT be rendered; THE Workspace_Switcher SHALL become visible only after onboarding is complete and only if the user has more than one workspace.
10. THE Onboarding_Flow SHALL integrate with the existing `useSignUpFlow` hook and `SignUpIntegrated.tsx` by inserting the Meta OAuth connection step and the conditional Brand_Selection_Step after the existing `onboarding-plan` step, without altering the existing profile → goals → platforms → plan step sequence.

---

### Requirement 5: Add Workspace Flow — Paid Plans

**User Story:** As a paid user managing multiple brands, I want to add new workspaces for my other authorized brands without re-authenticating with Meta when my existing authorization is still valid, so that adding a workspace is fast and frictionless.

#### Acceptance Criteria

1. WHEN a user with a paid plan (Starter, Pro, Business, or Enterprise) clicks "Add Workspace", THE Workspace_Service SHALL check if the user has any Authorized_Brands with `status = INACTIVE` and a `tokenExpiresAt` timestamp that is in the future at the moment of the check (valid, non-expired authorization).
2. IF one or more such Inactive_Brands exist, THE System SHALL display an "Available Brands" panel listing each Inactive_Brand by name and profile picture, and SHALL allow the user to select one to import directly into a new workspace without initiating Meta OAuth.
3. WHEN the user selects an Inactive_Brand from the Available Brands panel, THE Workspace_Service SHALL create a new workspace named after that brand, import all SocialAccounts for that brand, set the Authorized_Brand's `status` to `IMPORTED`, and navigate the user to the new workspace context.
4. WHEN workspace creation or SocialAccount import fails during the Add Workspace flow, THE Workspace_Service SHALL NOT partially create the workspace; it SHALL roll back any partially created records and display an error message with a retry option.
5. IF no Inactive_Brands with valid authorization exist, THE System SHALL initiate the Meta OAuth flow.
6. WHEN the Meta OAuth flow initiated in criterion 5 completes successfully with newly authorized pages, THE Workspace_Service SHALL present the newly authorized brands for import using the Available Brands panel described in criterion 2.
7. IF the Meta OAuth flow initiated in criterion 5 is cancelled by the user or fails, THE System SHALL return the user to the Add Workspace entry point with an appropriate status message and SHALL NOT create any workspace or Authorized_Brand record.
8. IF the user attempts to add a workspace but has reached their Plan_Limit, THE System SHALL disable the "Add Workspace" button, display the current workspace count and plan limit, and show an upgrade prompt; it SHALL NOT allow bypassing the limit.
9. WHEN adding a subsequent workspace, THE Workspace_Service SHALL check that the `provider + providerAccountId` of each SocialAccount being imported does not already exist as an `ACTIVE` SocialAccount in another workspace owned by the same user; IF one or more duplicates are found, THE Workspace_Service SHALL reject the import of those specific SocialAccounts with individual error messages, complete the import of all non-duplicate SocialAccounts, and present a summary to the user showing how many accounts were imported and how many were rejected with reasons.

---

### Requirement 6: Workspace Context Isolation

**User Story:** As a user managing multiple brands, I want switching workspaces to completely change the context of the dashboard, so that data from one brand never appears in another brand's view.

#### Acceptance Criteria

1. THE Active_Workspace SHALL determine the scope of all data returned by every backend API endpoint; all of the following data categories SHALL belong exclusively to the Active_Workspace and no data belonging to a different workspace SHALL be included: connected social accounts, analytics metrics, content calendar, drafts, AI memory, competitor tracking, social listening, scheduled posts, team members, and workspace settings.
2. WHEN a user initiates an Active_Workspace switch, THE System SHALL invalidate all client-side data previously loaded for the prior workspace and SHALL NOT display any prior-workspace data after the switch is initiated; fresh data scoped to the newly selected workspace SHALL be loaded and rendered within 5 seconds under normal network conditions.
3. WHEN the fresh data fetch for the newly selected workspace fails or times out during a workspace switch, THE System SHALL display an error message within the dashboard indicating that the workspace data could not be loaded, SHALL retain the prior workspace's view state as a fallback, and SHALL provide a retry button; THE System SHALL NOT display a blank or partially loaded dashboard.
4. THE backend SHALL validate that the `workspaceId` in every authenticated request is associated with the requesting user as a WorkspaceMember; IF the requesting user is not a member of the referenced workspace, THEN THE backend SHALL return an authorization error response and SHALL NOT return any workspace data.
5. THE System SHALL persist the user's last-selected Active_Workspace identifier in the user's session or local preference store; WHEN the user returns to the application, THE System SHALL restore this workspace as the Active_Workspace; IF the persisted workspace is no longer accessible (e.g., deleted or suspended), THE System SHALL fall back to the user's oldest remaining ACTIVE workspace and display a notification explaining the fallback.
6. WHEN the Active_Workspace has no connected SocialAccounts, THE dashboard SHALL display a "Connect your first account" empty state for that workspace rather than showing data from any other workspace.
7. THE Workspace_Service SHALL expose a `GET /workspaces/active` endpoint that returns the Active_Workspace's `id`, `name`, `plan`, and the count of connected SocialAccounts, to be consumed by the dashboard shell, sidebar, and Workspace_Switcher.

---

### Requirement 7: Workspace Switcher UI

**User Story:** As a user managing multiple brands, I want a workspace switcher in the dashboard, so that I can move between brand contexts quickly without confusion.

#### Acceptance Criteria

1. THE Workspace_Switcher SHALL be rendered in the sidebar or navigation area only when the authenticated user has more than one non-deleted workspace; IF the user has exactly one workspace (or zero), THE Workspace_Switcher SHALL NOT be rendered and workspace concepts SHALL remain invisible to the user.
2. THE Workspace_Switcher SHALL display: the name of the Active_Workspace, an avatar derived from the workspace's primary connected social account profile picture (or a generated placeholder using the first letter of the workspace name if no profile picture is available), and a visible dropdown trigger control.
3. WHEN the Workspace_Switcher dropdown is opened, THE System SHALL display a list of all the user's workspaces with `status` of `ACTIVE` or `SUSPENDED` (excluding `DELETED` workspaces), each showing the workspace name, avatar placeholder, and a count of connected social accounts.
4. WHEN the user selects a different workspace from the Workspace_Switcher dropdown, THE System SHALL update the Active_Workspace, invalidate stale client-side cached data for the prior workspace, and begin loading the newly selected workspace context as defined in Requirement 6.
5. THE Workspace_Switcher dropdown SHALL include an "Add Workspace" option; WHEN the user has not reached their Plan_Limit, this option SHALL be enabled and SHALL initiate the Add Workspace flow (Requirement 5); WHEN the user has reached their Plan_Limit, this option SHALL be visually disabled and SHALL display an upgrade prompt tooltip on hover or focus.
6. THE Workspace_Switcher SHALL use existing Veefore sidebar design tokens, typography, spacing, and theme support (dark/light mode) without introducing new design patterns or new component libraries.

---

### Requirement 8: Authorized-but-Inactive Brands Management

**User Story:** As a Free plan user who authorized multiple brands during Meta OAuth, I want to be able to see and manage my inactive brands later, so that I can import them when I upgrade without having to re-authorize with Meta.

#### Acceptance Criteria

1. THE System SHALL maintain a persistent Authorized_Brand record for each user-authorized Facebook Page; WHEN the Authorized_Brand's `tokenExpiresAt` is in the future, THE System SHALL classify it as eligible for import without re-authentication; WHEN the `tokenExpiresAt` is in the past, THE System SHALL classify it as requiring re-authorization before import.
2. WHEN a user navigates to the workspace settings or account settings page, THE System SHALL display the count of Inactive_Brands (Authorized_Brand records with `status = INACTIVE`) as a labeled item (e.g., "3 unimported brands available") in that settings page.
3. WHEN a user on the Free plan views their inactive brands list, THE System SHALL display each brand's name and profile picture alongside a label "Upgrade to import" and a link to the plan upgrade page; THE System SHALL NOT render an import button and SHALL reject any import API call from a Free plan user whose workspace count is already at the plan limit.
4. IF an Authorized_Brand record has `status = INACTIVE` and its `tokenExpiresAt` is in the past, THE System SHALL display that brand with a label "Authorization expired — reconnect Meta" and a "Reconnect Meta" button that initiates the Meta OAuth flow; THE System SHALL preserve the Authorized_Brand record in its expired state so the user can see it is waiting to be re-authorized.
5. WHEN a user explicitly requests to remove an Inactive_Brand record (via a "Remove" action in the inactive brands list), THE System SHALL delete that Authorized_Brand record after displaying a confirmation prompt; THE System SHALL NOT remove Authorized_Brand records automatically.
6. WHEN a user re-initiates the Meta OAuth flow, THE Workspace_Service SHALL match each newly returned Page by `pageId` to existing Authorized_Brand records: for matching records not yet imported (`status != IMPORTED`), THE Workspace_Service SHALL update the `authorizationToken`, `tokenExpiresAt`, and `authorizedAt` and reset `status` to `INACTIVE`; for Pages with no matching record, THE Workspace_Service SHALL create new Authorized_Brand records with `status = INACTIVE`.

---

### Requirement 9: Workspace Rename and Basic Management

**User Story:** As a user, I want to rename and manage my workspaces, so that I can keep workspace names aligned with my evolving brand or client relationships.

#### Acceptance Criteria

1. WHEN a user submits a workspace rename request, THE Workspace_Service SHALL validate that the new name is between 1 and 100 characters, does not consist entirely of whitespace, and does not duplicate another workspace name owned by the same user (case-insensitive); IF any validation rule fails, THE Workspace_Service SHALL return a descriptive error identifying which rule was violated.
2. WHEN a workspace rename request passes all validation rules in criterion 1, THE Workspace_Service SHALL update the `name` and `updatedAt` fields within 1 second and SHALL return the updated workspace record; the Workspace_Switcher SHALL reflect the new name without requiring a page reload.
3. WHEN a user initiates workspace deletion, THE Workspace_Service SHALL display a confirmation dialog requiring the user to explicitly confirm the action before proceeding; WHEN the user confirms, THE Workspace_Service SHALL set `status = DELETED`, cascade-disconnect all associated SocialAccounts (per Requirement 1 criterion 6), and redirect the user to their remaining active workspace.
4. IF the user has no remaining ACTIVE workspaces after deletion, THE System SHALL redirect to the onboarding flow to create or connect a new workspace.
5. THE Workspace_Service SHALL prevent the deletion of the user's last `ACTIVE` workspace while the user's account is active; IF only one active workspace exists, THE delete option SHALL be rendered in a disabled state with a tooltip explaining why deletion is not available.
6. THE Workspace_Service SHALL track `createdAt` and `updatedAt` for all workspace mutations and SHALL expose these fields in the workspace detail endpoint for use in the admin panel and audit logs.

---

### Requirement 10: Future Team and Roles Readiness

**User Story:** As a developer, I want the workspace schema and APIs to be ready for team role enforcement, so that when team features are activated, no database migrations are required.

#### Acceptance Criteria

1. WHEN a workspace is created, THE Workspace_Service SHALL create a `WorkspaceMember` record for the creating user with `role = OWNER`, `invitedAt` set to the workspace creation timestamp, and `joinedAt` set to the workspace creation timestamp; this ensures team membership is tracked from day one.
2. WHEN a request to `GET /workspaces/:id/members` is received from a user with `role = OWNER` or `ADMIN` for the specified workspace, THE Workspace_Service SHALL return the full `WorkspaceMember` list including each member's `userId`, `role`, `invitedAt`, and `joinedAt`.
3. WHEN a request to `GET /workspaces/:id/members` is received from a user who is NOT a member of the specified workspace or whose role is neither `OWNER` nor `ADMIN`, THE Workspace_Service SHALL return a 403 authorization error and SHALL NOT return any member data.
4. THE Workspace_Service SHALL expose a `POST /workspaces/:id/members` endpoint for adding workspace members and a `DELETE /workspaces/:id/members/:userId` endpoint for removing them; regardless of the requesting user's role, both endpoints SHALL return a `501 Not Implemented` response until the team feature spec activates them; they SHALL validate the request format and return appropriate 400 errors for malformed requests before returning 501.
5. WHEN any request targeting a specific workspace is received, THE backend middleware SHALL read the `WorkspaceMember.role` for the authenticated user and attach it to the request context object; the role SHALL be available for logging and future enforcement without requiring additional database queries during request processing.
6. THE Workspace data model and all workspace API responses SHALL include a `memberCount` field representing the total count of all `WorkspaceMember` records associated with that workspace (regardless of role or join status), so that the UI can display team size without a separate query.
