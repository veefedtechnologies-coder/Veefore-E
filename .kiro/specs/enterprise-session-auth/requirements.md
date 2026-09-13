# Requirements Document

## Introduction

VeeFore currently runs two parallel authentication systems that must be kept in sync: the Firebase client SDK (tokens in browser IndexedDB, hourly ID-token refresh, `onAuthStateChanged`, Bearer header assembled in the client) and server session cookies (`__session` + `auth_token`) added later for SSR instant-load. Keeping both in sync produces a storm of maintenance requests on nearly every navigation (`/api/auth/session-login`, `/api/auth/update-token`, `/api/auth/refresh`, `sessionVersion` bumping, cross-tab `veefore_logout` localStorage guards, and a restore-from-cookie ladder). It also causes spurious auto-logouts: when Firebase emits a transient `null` from `onAuthStateChanged`, the client bounces an actively-using user to the sign-in page even though the server session is still valid.

This feature replaces that architecture with a single, enterprise-grade, server-owned session model of the kind used by large SaaS platforms. The browser session becomes a single source of truth: an httpOnly, Secure, SameSite server-set session cookie. The SPA never handles or stores tokens. Firebase is retained solely as an identity provider for the login moment (verifying Google or email/password once) and is removed from the per-request path. The feature covers login, session establishment, silent refresh/renewal, single and global logout with server-side revocation, multi-tab correctness, SSR bootstrap compatibility, CSRF and cookie security, rate limiting and abuse protection, audit logging, observability, and a phased, feature-flagged, reversible migration that preserves the existing flow until the new one is verified.

This document specifies **what** the system must do (properties and behaviors), not **how** (the specific mechanism — rotating refresh tokens versus Firebase session cookies — is chosen in the design phase).

## Glossary

- **Auth_System**: The complete server-owned authentication and session subsystem being specified, including session issuance, verification, refresh, revocation, and audit components.
- **Session_Cookie**: An httpOnly, Secure, SameSite server-set browser cookie that is the sole client-side representation of an authenticated session. The client cannot read its value from JavaScript.
- **Access_Token**: A short-lived credential (server-side or embedded in the session material) used to authorize individual API requests. Has a short lifetime measured in minutes.
- **Refresh_Token**: A long-lived credential used to obtain a new Access_Token without re-authentication. Never exposed to client JavaScript.
- **Rotation**: The practice of issuing a new Refresh_Token each time a Refresh_Token is used, invalidating the previous one.
- **Reuse_Detection**: Detection of an already-consumed (rotated-out) Refresh_Token being presented again, which indicates theft and triggers revocation of the affected session family.
- **Session_Family**: The chain of Refresh_Tokens produced by successive Rotation events originating from a single login. Reuse_Detection operates on a Session_Family.
- **Idle_Timeout**: The maximum duration a session may remain inactive (no authenticated request) before it is invalidated.
- **Absolute_Timeout**: The maximum total lifetime of a session from initial login, after which it is invalidated regardless of activity.
- **Identity_Provider**: Firebase, used only to verify the user's identity at the login moment (Google OAuth or email/password). Not used on the per-request authorization path.
- **Auth_State_Endpoint**: A single server endpoint (e.g. `GET /api/me`) that returns the authenticated user when a valid session exists and an unauthenticated response otherwise. The client determines auth state solely from this endpoint.
- **SSR_Bootstrap**: The server-side render path that inlines the user's dashboard data into the first HTML byte for authenticated requests.
- **BFF**: Backend-for-Frontend — the server acts as the trusted intermediary that holds tokens and exchanges them for a Session_Cookie, so the browser never handles tokens directly.
- **CSRF**: Cross-Site Request Forgery — an attack where a malicious site causes an authenticated user's browser to send an unintended state-changing request using the ambient Session_Cookie.
- **Session_Fixation**: An attack where an attacker sets or fixes a session identifier before authentication so the session is known to the attacker after the victim logs in.
- **Session_Revocation**: Server-side invalidation of a session (or all of a user's sessions) so that subsequent requests using it are rejected.
- **Global_Logout**: Revocation of all active sessions for a user across all devices and tabs ("log out everywhere").
- **Feature_Flag**: A configuration switch that selects between the legacy authentication flow and the new Auth_System, enabling phased and reversible rollout.
- **Auth_Event**: A security-relevant authentication occurrence (login, logout, refresh, revocation, reuse detection, failure) recorded to the Audit_Log.
- **Audit_Log**: The durable, append-only record of Auth_Events.
- **Protected_Route**: An API route or client route that requires an authenticated session.

## Requirements

### Requirement 1: Email/Password Authentication

**User Story:** As a returning user, I want to sign in with my email and password, so that I can access my dashboard securely.

#### Acceptance Criteria

1. WHEN a user submits valid email and password credentials, THE Auth_System SHALL verify the credentials through the Identity_Provider and establish a server-owned session.
2. IF a user submits credentials that the Identity_Provider rejects, THEN THE Auth_System SHALL return an authentication-failed response and SHALL NOT establish a session.
3. WHEN email/password verification succeeds, THE Auth_System SHALL set a Session_Cookie and SHALL NOT return any Access_Token or Refresh_Token in a form readable by client JavaScript.
4. WHEN a user authenticates successfully, THE Auth_System SHALL record a login Auth_Event in the Audit_Log.
5. IF the Identity_Provider is unavailable during credential verification, THEN THE Auth_System SHALL return a service-unavailable response and SHALL NOT establish a session.

### Requirement 2: Google OAuth Authentication

**User Story:** As a user, I want to sign in with my Google account, so that I can access VeeFore without managing a separate password.

#### Acceptance Criteria

1. WHEN a user initiates Google sign-in, THE Auth_System SHALL start a server-side OAuth 2.0 Authorization Code flow with a state parameter for CSRF protection.
2. WHEN Google redirects back to the OAuth callback with a valid authorization code and matching state, THE Auth_System SHALL verify the user identity and establish a server-owned session.
3. IF the OAuth callback state does not match the stored state, THEN THE Auth_System SHALL reject the callback and SHALL NOT establish a session.
4. WHERE the OAuth flow is a sign-in for a non-existent account, THE Auth_System SHALL redirect the user to the waitlist and SHALL NOT create a new account.
5. WHEN Google OAuth authentication succeeds, THE Auth_System SHALL set a Session_Cookie and SHALL record a login Auth_Event in the Audit_Log.
6. WHEN Google OAuth authentication completes, THE Auth_System SHALL redirect an onboarded user to the dashboard and a not-onboarded user to the onboarding flow.

### Requirement 3: Server-Owned Session Establishment

**User Story:** As a user, I want my logged-in state to be maintained by the server through a secure cookie, so that the browser never has to store or manage authentication tokens.

#### Acceptance Criteria

1. WHEN a session is established, THE Auth_System SHALL represent the browser session solely as a single Session_Cookie set by the server.
2. THE Session_Cookie SHALL be marked httpOnly, Secure, and SameSite.
3. THE Auth_System SHALL determine the authenticated user for every Protected_Route from the Session_Cookie without requiring the Identity_Provider on the per-request path.
4. THE Auth_System SHALL NOT require the client to store Access_Tokens or Refresh_Tokens in browser storage (IndexedDB, localStorage, or sessionStorage).
5. THE Auth_System SHALL NOT require the client to assemble an Authorization Bearer header for Protected_Route requests.
6. WHEN a request to a Protected_Route carries a valid Session_Cookie, THE Auth_System SHALL authorize the request and attach the authenticated user context.
7. IF a request to a Protected_Route carries no Session_Cookie or an invalid Session_Cookie, THEN THE Auth_System SHALL return a 401 Unauthorized response.
8. THE Auth_System SHALL authenticate a request only from a cryptographically verified session credential and SHALL reject any request whose credential cannot be verified.

### Requirement 4: Single Auth-State Endpoint

**User Story:** As a developer, I want the client to determine authentication state from one endpoint, so that we eliminate `onAuthStateChanged`-driven redirects and transient-null logouts.

#### Acceptance Criteria

1. WHEN the client requests the Auth_State_Endpoint with a valid Session_Cookie, THE Auth_System SHALL return a 200 response containing the authenticated user profile.
2. WHEN the client requests the Auth_State_Endpoint without a valid session, THE Auth_System SHALL return a 401 response.
3. THE client SHALL determine authentication state solely from the Auth_State_Endpoint response and SHALL NOT redirect based on Identity_Provider client-SDK state-change events.
4. WHILE a valid Session_Cookie exists, THE Auth_System SHALL NOT redirect an actively-using user to the sign-in page in response to a transient Identity_Provider client-SDK signal.

### Requirement 5: Silent Session Refresh and Renewal

**User Story:** As a user, I want my session to stay alive seamlessly while I work, so that I am not interrupted or logged out during normal use.

#### Acceptance Criteria

1. WHILE a session is within its Idle_Timeout and Absolute_Timeout, THE Auth_System SHALL renew the Access_Token on the server without requiring user interaction.
2. WHEN an Access_Token expires but the session remains valid, THE Auth_System SHALL issue a new Access_Token on the next request without returning a 401 to the client.
3. THE Auth_System SHALL perform session refresh on the server side and SHALL NOT require a client-side refresh timer.
4. WHERE Rotation is in effect, THE Auth_System SHALL issue a new Refresh_Token on each refresh and SHALL invalidate the previously used Refresh_Token.
5. IF a Refresh_Token that has already been rotated out is presented, THEN THE Auth_System SHALL treat the event as Reuse_Detection, SHALL revoke the entire Session_Family, and SHALL record a reuse-detection Auth_Event in the Audit_Log.
6. WHEN a session refresh occurs, THE Auth_System SHALL record a refresh Auth_Event in the Audit_Log.

### Requirement 6: Session Lifetime Limits

**User Story:** As a security-conscious operator, I want sessions to expire after inactivity and after a maximum lifetime, so that stale or abandoned sessions cannot be used indefinitely.

#### Acceptance Criteria

1. WHILE a session has been inactive for longer than the configured Idle_Timeout, THE Auth_System SHALL treat the session as invalid and SHALL return 401 on Protected_Route requests.
2. WHILE a session has existed for longer than the configured Absolute_Timeout from initial login, THE Auth_System SHALL treat the session as invalid regardless of activity.
3. THE Auth_System SHALL expose the configured Idle_Timeout and Absolute_Timeout values as server configuration.
4. WHEN a session is invalidated by Idle_Timeout or Absolute_Timeout, THE Auth_System SHALL record a session-expiry Auth_Event in the Audit_Log.

### Requirement 7: Logout (Single Session)

**User Story:** As a user, I want to log out on the current device, so that my session on this browser can no longer be used.

#### Acceptance Criteria

1. WHEN a user logs out, THE Auth_System SHALL revoke the current session on the server and SHALL clear the Session_Cookie.
2. WHEN a user logs out, THE Auth_System SHALL record a logout Auth_Event in the Audit_Log.
3. WHEN a session has been revoked by logout, THE Auth_System SHALL return 401 for subsequent Protected_Route requests that present the revoked session.
4. WHEN a user logs out, THE Auth_System SHALL NOT re-establish the session from any residual client-side or cookie state.

### Requirement 8: Global Logout and Server-Side Revocation

**User Story:** As a user, I want to log out everywhere, so that all my active sessions across devices are terminated.

#### Acceptance Criteria

1. WHEN a user requests Global_Logout, THE Auth_System SHALL revoke all active sessions belonging to that user.
2. WHEN a user's password is changed, THE Auth_System SHALL revoke all active sessions belonging to that user.
3. WHEN sessions are revoked by Global_Logout, THE Auth_System SHALL return 401 for subsequent Protected_Route requests from any device presenting a revoked session.
4. WHEN Global_Logout occurs, THE Auth_System SHALL record a global-logout Auth_Event in the Audit_Log.
5. THE Auth_System SHALL provide an administrative capability to revoke a specific user's sessions on demand.

### Requirement 9: Multi-Tab Consistency

**User Story:** As a user with multiple tabs open, I want logging out in one tab to log me out everywhere, so that my authentication state is consistent across tabs without hacks.

#### Acceptance Criteria

1. WHEN a user logs out in one browser tab, THE Auth_System SHALL cause subsequent Protected_Route requests from every other tab in the same browser to receive 401.
2. THE Auth_System SHALL achieve cross-tab logout consistency through the shared Session_Cookie and SHALL NOT require a localStorage logout-broadcast key.
3. WHEN a tab detects a 401 from the Auth_State_Endpoint after a session was valid, THE client SHALL present the signed-out state for that tab.
4. WHEN a second tab is opened while a valid session exists, THE Auth_System SHALL authenticate that tab from the shared Session_Cookie without re-establishing or duplicating the session.

### Requirement 10: SSR Instant-Load Bootstrap Compatibility

**User Story:** As a returning user, I want my dashboard data to load on the first byte, so that the app feels instant without a cold skeleton.

#### Acceptance Criteria

1. WHEN an authenticated HTML document request carries a valid Session_Cookie, THE Auth_System SHALL make the verified user identity available to the SSR_Bootstrap for first-byte data inlining.
2. WHEN a document request carries no valid Session_Cookie, THE SSR_Bootstrap SHALL render the logged-out state without inlining user data.
3. WHEN seeded data underlying the SSR_Bootstrap changes due to a relevant mutation, THE Auth_System SHALL invalidate the cached bootstrap for the affected user.
4. WHERE the SSR_Bootstrap indicates an authenticated onboarded session, THE client SHALL mount the authenticated dashboard without waiting for a separate client-side authentication round-trip.

### Requirement 11: CSRF Protection

**User Story:** As a security-conscious operator, I want cookie-based authentication protected against CSRF, so that malicious sites cannot perform actions using a user's ambient session.

#### Acceptance Criteria

1. WHEN a state-changing request (POST, PUT, PATCH, DELETE) is made to a Protected_Route using the Session_Cookie, THE Auth_System SHALL require and validate a CSRF defense.
2. IF a state-changing request to a Protected_Route fails CSRF validation, THEN THE Auth_System SHALL reject the request with a 403 response.
3. THE Session_Cookie SHALL be configured with a SameSite attribute that mitigates cross-site request forgery.
4. WHEN a CSRF validation failure occurs, THE Auth_System SHALL record a CSRF-failure Auth_Event in the Audit_Log.

### Requirement 12: Cookie Security Attributes

**User Story:** As a security-conscious operator, I want session cookies to carry secure attributes, so that they resist theft and misuse.

#### Acceptance Criteria

1. THE Session_Cookie SHALL be set with the httpOnly attribute.
2. THE Session_Cookie SHALL be set with the Secure attribute in production.
3. THE Session_Cookie SHALL be set with an explicit SameSite attribute.
4. WHERE a production cookie domain is configured, THE Auth_System SHALL scope the Session_Cookie to that domain.
5. THE Auth_System SHALL set the Session_Cookie with a path and expiry consistent with the configured Idle_Timeout and Absolute_Timeout.

### Requirement 13: Session Fixation Protection

**User Story:** As a security-conscious operator, I want a fresh session identifier issued at login, so that a pre-set session cannot be used to hijack an authenticated user.

#### Acceptance Criteria

1. WHEN a user authenticates successfully, THE Auth_System SHALL issue a new session identifier and SHALL NOT reuse any session identifier that was present before authentication.
2. WHEN a session is established at login, THE Auth_System SHALL bind the session to the newly authenticated user identity.
3. IF a session credential presented at login does not correspond to a completed authentication, THEN THE Auth_System SHALL discard it and issue a new one.

### Requirement 14: Rate Limiting and Abuse Protection

**User Story:** As a security-conscious operator, I want authentication endpoints rate-limited, so that credential-stuffing and brute-force attacks are throttled without breaking normal login and logout cycles.

#### Acceptance Criteria

1. WHEN authentication requests from a single client source exceed the configured rate limit within the configured window, THE Auth_System SHALL reject further requests with a 429 response until the window resets.
2. THE Auth_System SHALL apply rate limiting to login initiation, OAuth initiation, and credential verification endpoints.
3. WHILE a user performs normal repeated login and logout cycles within documented thresholds, THE Auth_System SHALL NOT return a false 429 rate-limit response.
4. WHEN a rate limit is triggered, THE Auth_System SHALL record a rate-limit Auth_Event in the Audit_Log.
5. THE Auth_System SHALL derive the client source identity for rate limiting from the real client IP address behind the deployment proxy.

### Requirement 15: Audit Logging of Authentication Events

**User Story:** As a security operator, I want authentication events recorded, so that I can investigate incidents and demonstrate compliance.

#### Acceptance Criteria

1. WHEN any of login, logout, Global_Logout, session refresh, Reuse_Detection, session revocation, session expiry, CSRF failure, or authentication failure occurs, THE Auth_System SHALL record a corresponding Auth_Event in the Audit_Log.
2. THE Auth_System SHALL record for each Auth_Event a timestamp, the event type, the associated user identifier when known, and the client source identity.
3. THE Auth_System SHALL NOT record raw credentials, Access_Tokens, or Refresh_Token values in the Audit_Log.
4. THE Audit_Log SHALL be append-only with respect to recorded Auth_Events.

### Requirement 16: Firebase Restricted to Identity Provider Role

**User Story:** As a maintainer, I want Firebase used only at the login moment, so that it is removed from the per-request path and the dual-system maintenance load disappears.

#### Acceptance Criteria

1. THE Auth_System SHALL invoke the Identity_Provider only during login (Google OAuth verification or email/password verification) and SHALL NOT invoke the Identity_Provider on the per-request Protected_Route authorization path.
2. WHEN the Identity_Provider verifies a user at login, THE Auth_System SHALL immediately establish the server-owned session and SHALL NOT depend on the Identity_Provider for subsequent request authorization.
3. THE client SHALL NOT run an Identity_Provider client-SDK auth-state listener that drives redirects or session establishment.
4. THE Auth_System SHALL NOT maintain the Identity_Provider client session and the server session as two synchronized sources of truth.

### Requirement 17: Reduced Per-Navigation Auth Call Volume

**User Story:** As a user, I want navigation to be fast and quiet, so that moving between pages does not trigger a storm of authentication maintenance requests.

#### Acceptance Criteria

1. WHILE a user navigates between pages of the SPA with a valid session, THE Auth_System SHALL NOT require per-navigation calls to session-login, update-token, or refresh maintenance endpoints.
2. WHEN a user navigates within the SPA, THE client SHALL rely on the ambient Session_Cookie and SHALL NOT re-establish the session per navigation.
3. THE Auth_System SHALL remove the client-driven token-refresh timer, cross-tab logout localStorage guard, and restore-from-cookie ladder from the per-navigation path.

### Requirement 18: Elimination of Spurious Auto-Logouts

**User Story:** As a user, I want to stay logged in while I am actively using the app, so that I am never bounced to the sign-in page while my session is still valid.

#### Acceptance Criteria

1. WHILE a valid Session_Cookie exists, THE Auth_System SHALL keep the user authenticated and SHALL NOT redirect the user to the sign-in page.
2. IF the Identity_Provider client SDK emits a transient null state, THEN THE client SHALL NOT redirect the user to the sign-in page while the Auth_State_Endpoint still returns 200.
3. WHEN a Protected_Route request returns 401 because the session is genuinely invalid, THE client SHALL redirect the user to the sign-in page.
4. WHEN the session is genuinely invalid, THE client SHALL distinguish it from a transient signal by consulting the Auth_State_Endpoint before redirecting.

### Requirement 19: Phased, Feature-Flagged, Reversible Migration

**User Story:** As a maintainer, I want to cut over to the new session model behind a feature flag, so that the current flow keeps working until the new one is verified and I can roll back instantly.

#### Acceptance Criteria

1. THE Auth_System SHALL provide a Feature_Flag that selects between the legacy authentication flow and the new server-owned session flow.
2. WHILE the Feature_Flag selects the legacy flow, THE Auth_System SHALL behave exactly as the current authentication system behaves.
3. WHEN the Feature_Flag is switched from the new flow back to the legacy flow, THE Auth_System SHALL restore legacy behavior without requiring a code redeployment.
4. WHERE the Feature_Flag selects the new flow, THE Auth_System SHALL establish server-owned sessions for new logins while allowing already-authenticated legacy sessions to continue until they expire or the user re-authenticates.
5. THE Auth_System SHALL document the migration phases and the verification checks required before advancing each phase.

### Requirement 20: Backward Compatibility During Migration

**User Story:** As a currently-logged-in user, I want to keep working during the migration, so that the cutover does not forcibly log me out or break my access.

#### Acceptance Criteria

1. WHILE the migration is in progress, THE Auth_System SHALL continue to authorize existing valid legacy sessions on Protected_Routes.
2. WHEN a user with a legacy session performs an action that re-establishes authentication under the new flow, THE Auth_System SHALL transition that user to a server-owned session without data loss.
3. THE Auth_System SHALL preserve Google OAuth login, email/password login, the SSR_Bootstrap, and all existing Protected_Route contracts throughout the migration.
4. IF a request presents both legacy and new session credentials during migration, THEN THE Auth_System SHALL resolve authentication deterministically according to the active Feature_Flag configuration.

### Requirement 21: Observability

**User Story:** As an operator, I want metrics and logs for the authentication subsystem, so that I can verify the migration reduces load and detect regressions.

#### Acceptance Criteria

1. THE Auth_System SHALL expose metrics for authentication outcomes, including login success count, login failure count, refresh count, and revocation count.
2. THE Auth_System SHALL expose a metric or log signal for the volume of auth maintenance requests, so that the reduction relative to the legacy flow is measurable.
3. WHEN the Auth_State_Endpoint or a Protected_Route returns an authentication error, THE Auth_System SHALL emit a log entry sufficient to diagnose the cause without exposing credential values.
4. THE Auth_System SHALL record which flow (legacy or new) served each authentication outcome so that migration progress is observable.
