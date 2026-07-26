# Implementation Plan: Workspace & Meta Account Connection

## Overview

Implement the full workspace isolation layer on top of the existing `facebook-page-integration` spec. The plan proceeds in strict dependency order: new Mongoose models → index extension on `SocialAccountModel` → `WorkspaceService` with MongoDB transactions → Express routes → middleware extension → OAuth callback extension → frontend context/hook/component → onboarding step extensions → sidebar wiring. Property-based tests using `fast-check` are placed immediately after the implementation task they validate.

---

## Tasks

- [x] 1. Create Mongoose data models for workspace entities
  - [x] 1.1 Create `WorkspaceModel` at `server/models/Workspace/WorkspaceModel.ts`
    - Define `IWorkspace` interface and `WorkspaceSchema` with all required fields: `ownerId`, `name` (maxlength 100, trim), `plan` enum, `status` enum, `customWorkspaceLimit` (nullable, 1–999), `createdAt`, `updatedAt`
    - Add compound unique partial index `{ ownerId: 1, name: 1 }` with `partialFilterExpression: { status: { $ne: 'DELETED' } }`
    - Add `memberCount` virtual populating from `WorkspaceMember` collection
    - Export `WorkspacePlan` and `WorkspaceStatus` types
    - _Requirements: 1.1, 1.3, 10.6_

  - [x] 1.2 Create `WorkspaceMemberModel` at `server/models/Workspace/WorkspaceMemberModel.ts`
    - Define `IWorkspaceMember` interface and `WorkspaceMemberSchema` with fields: `workspaceId` (ObjectId ref), `userId` (Firebase UID string), `role` enum (`OWNER | ADMIN | EDITOR | CONTENT_CREATOR | VIEWER`), `status` enum (`ACTIVE | DELETED`), `invitedAt`, `joinedAt` (nullable)
    - Add compound unique index `{ workspaceId: 1, userId: 1 }`
    - Export `WorkspaceRole` and `MemberStatus` types
    - _Requirements: 1.4, 10.1, 10.5_

  - [x] 1.3 Create `AuthorizedBrandModel` at `server/models/AuthorizedBrand/AuthorizedBrandModel.ts`
    - Define `IAuthorizedBrand` interface and `AuthorizedBrandSchema` with fields: `userId`, `pageId`, `pageName`, `pageProfilePictureUrl`, `linkedInstagramAccountId` (nullable), `linkedInstagramUsername` (nullable), `authorizationTokenRef` (ObjectId ref to `UserAccessToken`), `tokenExpiresAt`, `authorizedAt`, `status` enum (`INACTIVE | IMPORTED | EXPIRED`)
    - Add compound unique index `{ userId: 1, pageId: 1 }`
    - Export `AuthorizedBrandStatus` type
    - _Requirements: 3.4, 8.1, 8.6_

- [x] 2. Extend `SocialAccountModel` with compound uniqueness index
  - [x] 2.1 Add compound unique partial index to `SocialAccountModel` in `server/models/SocialAccount/SocialAccount.ts`
    - Add index `{ platform: 1, accountId: 1, ownerId: 1 }` with `partialFilterExpression: { connectionStatus: 'ACTIVE' }` and `name: 'unique_active_account_per_owner'`
    - Do NOT alter any existing fields, indexes, or logic in the `facebook-page-integration` spec's model file
    - _Requirements: 1.5_

- [x] 3. Implement `WorkspaceService` class
  - [x] 3.1 Create `server/services/WorkspaceService.ts` with skeleton: `WorkspaceError` class, `PLAN_LIMITS` map, `MetaPage` interface, `WorkspaceLimits` / `CreateWorkspaceInput` / `ImportBrandInput` interfaces, and the `WorkspaceService` class shell with all method signatures as declared in the design
    - _Requirements: 2.1, 2.6_

  - [x] 3.2 Implement `WorkspaceService.createWorkspace` with atomic MongoDB transaction
    - Validate owner exists (lookup by `firebaseUid`)
    - Within session: count non-deleted workspaces, compare against `resolveLimit(user.plan, user.customWorkspaceLimit)`, throw `WORKSPACE_LIMIT_REACHED` if at or over limit
    - Case-insensitive name uniqueness check using `$regex` with `escapeRegExp`, throw `WORKSPACE_NAME_CONFLICT` on duplicate
    - Create `Workspace` document and bootstrap `WorkspaceMember` record with `role = 'OWNER'`, `invitedAt = joinedAt = workspace.createdAt`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.2, 2.7, 10.1_

  - [x] 3.3 Write property test for Workspace Limit Invariant
    - **Property 1: Workspace Limit Invariant**
    - Fire N concurrent `createWorkspace` calls for the same user; assert `finalCount <= planLimit` for plans `FREE`, `STARTER`, `PRO`
    - **Validates: Requirements 2.2, 2.7**

  - [x] 3.4 Write property test for Workspace Name Uniqueness Per Owner
    - **Property 6: Workspace Name Uniqueness Per Owner**
    - Generate arbitrary workspace names including case variants; assert `WORKSPACE_NAME_CONFLICT` is always returned for case-insensitive duplicates and that no duplicate non-deleted workspace is persisted
    - **Validates: Requirements 1.3, 9.1**

  - [x] 3.5 Implement `WorkspaceService.upsertAuthorizedBrands`
    - Iterate over `MetaPage[]`; for each page call `AuthorizedBrandModel.findOneAndUpdate` with `{ upsert: true, new: true }`
    - Reset `status` to `INACTIVE` only if the brand has not already been `IMPORTED` (check via `shouldResetStatus` helper)
    - Return the full array of upserted `IAuthorizedBrand` records
    - _Requirements: 3.4, 8.1, 8.6_

  - [x] 3.6 Write property test for AuthorizedBrand Upsert Idempotency
    - **Property 3: AuthorizedBrand Upsert Idempotency**
    - Generate a random set of pages and call `upsertAuthorizedBrands` K ≥ 1 times; assert exactly one record per unique `pageId` and that the final record reflects the last call's values
    - **Validates: Requirements 3.4, 8.6**

  - [x] 3.7 Implement `WorkspaceService.importAuthorizedBrand` with transactional workspace + SocialAccount creation
    - Within session: fetch `AuthorizedBrand`, check token expiry (set `EXPIRED` and throw `TOKEN_EXPIRED` if past), create or reuse workspace, import Facebook Page `SocialAccount`, import Instagram `SocialAccount` if `linkedInstagramAccountId` is non-null, mark `AuthorizedBrand.status = 'IMPORTED'`
    - On any mid-transaction failure the session rolls back — no partial records persist
    - Throw `SOCIAL_ACCOUNT_ALREADY_IMPORTED` if compound index constraint is violated
    - _Requirements: 1.5, 3.1, 3.2, 3.3, 3.5, 3.7, 5.4_

  - [x] 3.8 Write property test for Workspace Mutation Atomicity
    - **Property 10: Workspace Mutation Atomicity**
    - Inject failures at random points during `importAuthorizedBrand`; assert that after every failure no partial `Workspace`, `WorkspaceMember`, or `SocialAccount` records exist for that operation
    - **Validates: Requirements 5.4, 3.5**

  - [x] 3.9 Write property test for SocialAccount Exclusivity Invariant
    - **Property 2: SocialAccount Exclusivity Invariant**
    - Generate a (platform, accountId) pair already active in one workspace; attempt import into any other workspace for the same user; assert `SOCIAL_ACCOUNT_ALREADY_IMPORTED` is always returned and no new record is created
    - **Validates: Requirements 1.5, 5.9**

  - [x] 3.10 Write property test for SocialAccount Import Fidelity
    - **Property 9: SocialAccount Import Fidelity**
    - Generate arbitrary `MetaPage[]` arrays with varying `linkedInstagramAccountId` nullability; assert that after import the set of `SocialAccount` records exactly matches pages × accounts described by Meta — no extra or missing records
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 3.11 Implement `WorkspaceService.deleteWorkspace` with soft-delete cascade
    - Within session: load workspace and verify ownership, count active workspaces and throw `CANNOT_DELETE_LAST_WORKSPACE` if only one, set `workspace.status = 'DELETED'`, bulk-set all `WorkspaceMember` records to `DELETED`, bulk-set all `SocialAccount` records to `DISCONNECTED`, update `user.activeWorkspaceId` to the oldest remaining ACTIVE workspace
    - _Requirements: 1.6, 9.3, 9.5_

  - [x] 3.12 Write property test for Workspace Deletion Cascade
    - **Property 4: Workspace Deletion Cascade**
    - Generate workspaces with arbitrary member and SocialAccount counts; after `deleteWorkspace` assert all members have `status='DELETED'`, all SocialAccounts have `connectionStatus='DISCONNECTED'`, workspace has `status='DELETED'`, and no records are hard-deleted
    - **Validates: Requirements 1.6, 9.3**

  - [x] 3.13 Implement `WorkspaceService.getWorkspaceLimits`, `getActiveWorkspace`, `switchWorkspace`, `getUserWorkspaces`, `getWorkspaceById`, and `renameWorkspace`
    - `getWorkspaceLimits`: return `{ currentCount, planLimit, remainingCapacity }` with `null` for Enterprise unlimited
    - `getActiveWorkspace`: read `user.activeWorkspaceId`, validate membership, fall back to oldest ACTIVE workspace if invalid
    - `switchWorkspace`: update `user.activeWorkspaceId` in MongoDB
    - `getUserWorkspaces`: return all non-deleted workspaces for user
    - `getWorkspaceById`: return workspace if user is a member
    - `renameWorkspace`: validate 1–100 chars, non-whitespace-only, case-insensitive uniqueness; update `name` and `updatedAt`
    - _Requirements: 2.3, 2.6, 6.5, 6.7, 9.1, 9.2_

  - [x] 3.14 Write property test for Limits Endpoint Mathematical Consistency
    - **Property 11: Limits Endpoint Mathematical Consistency**
    - Generate arbitrary (C, L) pairs where L is non-null; call `getWorkspaceLimits`; assert `currentCount == C`, `planLimit == L`, `remainingCapacity == max(0, L - C)`. For Enterprise (L = null) assert both `planLimit` and `remainingCapacity` are null
    - **Validates: Requirements 2.1, 2.6**

  - [x] 3.15 Implement plan downgrade suspension logic in `WorkspaceService`
    - When called (e.g. after a plan change webhook), count non-deleted workspaces, compare to new plan limit; if count > limit, mark the (count - limit) most recently created workspaces as `SUSPENDED` in descending `createdAt` order; leave oldest M workspaces `ACTIVE`
    - _Requirements: 2.4_

  - [x] 3.16 Write property test for Plan Downgrade Suspension Ordering
    - **Property 12: Plan Downgrade Suspension Ordering**
    - Generate K workspaces with distinct `createdAt` timestamps and a target limit M < K; after downgrade assert exactly K-M of the newest are `SUSPENDED` and the M oldest remain `ACTIVE`
    - **Validates: Requirements 2.4**

- [x] 4. Checkpoint — Ensure all service-layer tests pass
  - Run `npx vitest --run tests/workspace-meta-connection.property.test.ts` and fix any failures before proceeding.

- [x] 5. Implement workspace API routes and middleware
  - [x] 5.1 Create `server/routes/workspace.routes.ts` with all workspace endpoints
    - Implement all routes from the API design: `GET /api/workspaces`, `POST /api/workspaces`, `GET /api/workspaces/limits`, `GET /api/workspaces/active`, `POST /api/workspaces/active`, `GET /api/workspaces/:id`, `PATCH /api/workspaces/:id`, `DELETE /api/workspaces/:id`
    - Apply `requireAuth` to all routes; apply `validateWorkspaceAccess` to routes with `:id`
    - Use `handleWorkspaceError` helper for consistent error response shapes matching the error code table in the design
    - _Requirements: 2.6, 6.7, 9.1, 9.2, 9.3_

  - [x] 5.2 Create `server/routes/workspace.routes.ts` — members sub-routes
    - `GET /api/workspaces/:id/members`: return member list for OWNER or ADMIN only; return 403 for all other roles
    - `POST /api/workspaces/:id/members`: validate request format (return 400 for malformed), then return 501
    - `DELETE /api/workspaces/:id/members/:userId`: validate request format (return 400 for malformed), then return 501
    - _Requirements: 10.2, 10.3, 10.4_

  - [x] 5.3 Create `server/routes/authorized-brands.routes.ts`
    - `GET /api/authorized-brands`: return all `AuthorizedBrand` records for the authenticated user
    - `DELETE /api/authorized-brands/:pageId`: delete an `INACTIVE` brand after confirming it is not `IMPORTED`; apply `requireAuth`
    - `POST /api/authorized-brands/:pageId/import`: call `workspaceService.importAuthorizedBrand`; return the created workspace on success; map `WorkspaceError` to correct HTTP status codes
    - _Requirements: 3.5, 3.7, 5.1, 5.2, 5.3, 8.3, 8.5_

  - [x] 5.4 Extend `server/middleware/workspace-validation.ts` with WorkspaceMember lookup
    - Read `workspaceId` from resolution order: `X-Workspace-ID` header → `req.query.workspaceId` → `req.body.workspaceId`
    - Query `WorkspaceMemberModel` for `{ workspaceId, userId, status: 'ACTIVE' }`; return 403 with `WORKSPACE_ACCESS_DENIED` if not found
    - Attach `req.workspaceId` and `req.workspaceRole` for downstream use
    - Extend the Express `Request` type declaration to include these two fields
    - _Requirements: 6.4, 10.5_

  - [x] 5.5 Write property test for Workspace Membership Authorization
    - **Property 8: Workspace Membership Authorization**
    - Generate requests from users who are not members of the target workspace; assert every such request to a workspace-scoped endpoint returns HTTP 403 with `WORKSPACE_ACCESS_DENIED` and no workspace data
    - **Validates: Requirements 6.4, 10.3**

  - [x] 5.6 Register workspace and authorized-brand routers in `server/index.ts`
    - Mount `workspaceRouter` at `/api/workspaces` and `authorizedBrandsRouter` at `/api/authorized-brands`
    - Ensure mount order does not conflict with existing route registrations
    - _Requirements: 2.6, 3.4, 6.7_

- [x] 6. Extend `facebook.routes.ts` OAuth callback to call `upsertAuthorizedBrands`
  - [x] 6.1 In the existing Meta OAuth callback handler in `server/routes/facebook.routes.ts`, after `FacebookProvider.getAuthorizedPages` succeeds, call `workspaceService.upsertAuthorizedBrands(userId, pages)`
    - If the Meta API call fails, do NOT call `upsertAuthorizedBrands`; return `{ success: false, error: { code: 'META_API_ERROR', message: '...' } }` to the frontend
    - On success, return `{ success: true, authorizedBrandCount: N }` where N is the length of the upserted array
    - _Requirements: 3.1, 3.4, 3.6, 3.8_

- [x] 7. Checkpoint — Ensure all backend tests pass
  - Run the full server test suite; confirm workspace routes return correct status codes for limit-reached, name-conflict, unauthorized access, and token-expiry scenarios.

- [x] 8. Implement frontend workspace context and hook
  - [x] 8.1 Create `client/src/contexts/ActiveWorkspaceContext.tsx`
    - Implement `ActiveWorkspaceProvider` that reads initial `activeWorkspaceId` from `localStorage.currentWorkspaceId`
    - Expose `setActiveWorkspaceId` (persists to `localStorage` and dispatches `workspace-changed` event), `invalidateWorkspaceData` (invalidates all workspace-scoped React Query keys: `analytics`, `social-accounts`, `posts`, `calendar`, `inbox`, `settings`)
    - Export `useActiveWorkspaceContext` hook with guard throwing if used outside provider
    - _Requirements: 6.2, 6.5_

  - [x] 8.2 Create `client/src/hooks/useWorkspace.ts`
    - Implement `useWorkspace` hook using `useQuery` for `/api/workspaces`, `/api/workspaces/limits`, and `/api/authorized-brands` (all with 5-minute `staleTime`)
    - Derive `activeWorkspace` from `activeWorkspaceId` with fallback to `workspaces[0]`
    - Implement `switchWorkspace` that calls `POST /api/workspaces/active`, then calls `setActiveWorkspaceId` and `invalidateWorkspaceData`
    - Derive `isAtLimit` boolean from limits response
    - Return the `UseWorkspaceReturn` shape as defined in the design
    - _Requirements: 6.2, 6.5, 7.4, 7.5_

  - [x] 8.3 Write property test for Workspace Context Isolation
    - **Property 7: Workspace Context Isolation**
    - Seed two workspaces with distinct data; fire API requests scoped to W1 and W2 via `X-Workspace-ID` header; assert no W2 data appears in W1 responses and vice versa across all workspace-scoped endpoints
    - **Validates: Requirements 6.1, 6.4**

  - [x] 8.4 Write property test for Owner Membership Bootstrap and memberCount Consistency
    - **Property 5: Owner Membership Bootstrap and memberCount Consistency**
    - After creating arbitrary workspaces, assert exactly one `OWNER` member record exists per workspace, and that the `memberCount` virtual equals the count of all associated `WorkspaceMember` records regardless of their role or join status
    - **Validates: Requirements 10.1, 10.6**

- [x] 9. Create `WorkspaceSwitcher` component and integrate into sidebar
  - [x] 9.1 Create `client/src/components/workspace/WorkspaceSwitcher.tsx`
    - Render `null` (return early) when `workspaces.length <= 1`
    - Render trigger button showing active workspace initial letter avatar, name, and `ChevronDown` icon
    - Render dropdown listing all non-`DELETED` workspaces; highlight the active one with `aria-selected`
    - Include "Add Workspace" button at the bottom of the dropdown; disable it and show a tooltip when `isAtLimit` is true, linking to `/settings/billing` on upgrade
    - Use `useWorkspace()` for data and `useLocation()` from `wouter` for navigation
    - Follow existing sidebar design tokens, spacing, and dark/light mode classes
    - _Requirements: 4.9, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 9.2 Extend `client/src/components/layout/sidebar.tsx` to render `WorkspaceSwitcher`
    - Import `WorkspaceSwitcher` and render it immediately above the VeeGPT logo section `<div>`
    - Do not alter any existing sidebar sections, classes, or logic
    - _Requirements: 7.1, 7.6_

- [x] 10. Extend onboarding flow with Meta connection and brand selection steps
  - [x] 10.1 Extend `SignupStep` union type in `client/src/features/auth/hooks/useSignUpFlow.ts`
    - Add `'onboarding-connect-meta'` and `'onboarding-brand-selection'` to the union type
    - Update `handleOnboardingNext`: `'onboarding-plan'` → `'onboarding-connect-meta'` (replacing current direct-completion path)
    - Update `getOnboardingStepNumber`: `'onboarding-connect-meta'` → 5, `'onboarding-brand-selection'` → 6
    - Do not change the existing `profile → goals → platforms → plan` step sequence
    - _Requirements: 4.1, 4.10_

  - [x] 10.2 Create `OnboardingConnectMeta` step component (inline or at `client/src/features/auth/steps/OnboardingConnectMeta.tsx`)
    - Display a prominent "Connect your Meta account" CTA screen with a button that initiates the Meta OAuth flow
    - On OAuth callback with N=0: display "No Facebook Pages were authorized…" message with a "Reconnect Meta" button; do NOT create any workspace
    - On OAuth callback with N=1: call `POST /api/authorized-brands/:pageId/import`, store `workspace.id` in `localStorage.currentWorkspaceId`, redirect to `/dashboard`
    - On OAuth callback with N>1: advance `useSignUpFlow` to `'onboarding-brand-selection'` step
    - On error: display error screen with retry option; do NOT redirect to dashboard
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [x] 10.3 Create `OnboardingBrandSelection` step component (inline or at `client/src/features/auth/steps/OnboardingBrandSelection.tsx`)
    - Display title "Choose the brand you want to manage first."
    - Render one selectable card per `InactiveBrand` from `useWorkspace().inactiveBrands` showing `pageName` and `pageProfilePictureUrl`
    - On confirm: call `POST /api/authorized-brands/:pageId/import` for the selected brand, store `workspace.id` in `localStorage.currentWorkspaceId`, redirect to `/dashboard`
    - _Requirements: 4.6, 4.7_

  - [x] 10.4 Extend `client/src/pages/SignUpIntegrated.tsx` to render the two new steps
    - Add `case 'onboarding-connect-meta': return <OnboardingConnectMeta ... />`
    - Add `case 'onboarding-brand-selection': return <OnboardingBrandSelection ... />`
    - Ensure the `WorkspaceSwitcher` is NOT rendered while the step is any onboarding step (guard at the layout/provider level or by conditionally excluding `ActiveWorkspaceProvider` during onboarding)
    - _Requirements: 4.9, 4.10_

- [x] 11. Wire `ActiveWorkspaceProvider` into the application root
  - [x] 11.1 Wrap the root application component (e.g., `client/src/App.tsx` or the React QueryClient provider shell) with `ActiveWorkspaceProvider`
    - Ensure `ActiveWorkspaceProvider` is placed inside `QueryClientProvider` so `useQueryClient()` is available
    - Verify `WorkspaceSwitcher` and `useWorkspace` resolve context without errors in both onboarding and dashboard routes
    - _Requirements: 6.2, 6.5_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Run the full test suite (`npx vitest --run`); verify all 12 property tests, all unit tests, and all route integration tests pass with no errors or warnings.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; they validate correctness properties and should be executed before shipping to production.
- All 12 property-based tests use `fast-check` and must be tagged with `// Feature: workspace-meta-connection, Property N: <title>` for traceability.
- MongoDB Memory Server (`mongodb-memory-server`) should be used for all property and service-layer tests to avoid hitting the production database.
- The `facebook-page-integration` spec owns `SocialAccountModel` field definitions; only the new index (Task 2.1) is added here — do not modify existing fields.
- `WorkspaceService` has no Express dependencies and can be tested entirely as a plain class.
- Each task references specific requirements sub-clauses for full traceability.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "3.5"] },
    { "id": 4, "tasks": ["3.6", "3.7"] },
    { "id": 5, "tasks": ["3.8", "3.9", "3.10", "3.11"] },
    { "id": 6, "tasks": ["3.12", "3.13"] },
    { "id": 7, "tasks": ["3.14", "3.15"] },
    { "id": 8, "tasks": ["3.16", "5.1"] },
    { "id": 9, "tasks": ["5.2", "5.3", "5.4"] },
    { "id": 10, "tasks": ["5.5", "5.6"] },
    { "id": 11, "tasks": ["6.1"] },
    { "id": 12, "tasks": ["8.1"] },
    { "id": 13, "tasks": ["8.2"] },
    { "id": 14, "tasks": ["8.3", "8.4", "9.1"] },
    { "id": 15, "tasks": ["9.2", "10.1"] },
    { "id": 16, "tasks": ["10.2", "10.3"] },
    { "id": 17, "tasks": ["10.4", "11.1"] }
  ]
}
```
