# Requirements Document

## Introduction

VeeFore's production deployment (`app.veefore.com`) currently runs with `NODE_ENV=development` behind a Cloudflare tunnel. Because a large part of the security posture is gated on an `isProduction` check derived from `NODE_ENV`, an entire tier of protections is silently inactive in production: HSTS, Content-Security-Policy, and clickjacking defences are all disabled, and one middleware actively strips `X-Frame-Options`. This was verified empirically against the live host — the response headers contain no `strict-transport-security`, no `content-security-policy`, and no `x-frame-options`.

Separately, session revocation is not enforced on the authenticated request path. Both `require-auth.ts` and `verify-auth-token.ts` call `verifySessionCookie(session, false)` (`checkRevoked: false`) and neither validates the `sessionVersion` claim, so a session cookie that has been logged out or globally invalidated continues to authorize API requests until it naturally expires (up to 14 days). CSRF protection is absent: a `csrfValidationSchema` exists but is wired to no route, `X-CSRF-Token` is permitted by CORS but never validated, and the only mitigation is the `SameSite=Lax` cookie attribute. Finally, `deployment-hardening.ts` reports `CSRF_PROTECTION: true`, asserting a control that does not exist.

This feature hardens the deployed application to an enterprise baseline WITHOUT requiring the deployment topology to change. The central design constraint is that security controls must be driven by **explicit configuration**, never inferred from `NODE_ENV`, so that a deployment serving real users over HTTPS is fully protected even while `NODE_ENV=development`.

This document specifies **what** the system must do, not **how**.

## Glossary

- **Security_Subsystem**: The collection of middleware, configuration, and verification logic that enforces transport security, browser security headers, session authenticity, request authorization, and abuse protection.
- **Deployed_Environment**: Any environment serving real user traffic over a publicly reachable hostname, regardless of the value of `NODE_ENV`.
- **Secure_Context**: A request context in which the application is reached over HTTPS, including where TLS is terminated by an upstream proxy or tunnel.
- **Security_Header**: An HTTP response header whose purpose is to constrain browser behaviour, including `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, and `Referrer-Policy`.
- **CSP**: Content-Security-Policy — a Security_Header restricting the origins from which the browser may load or execute resources.
- **CSP_Report_Only**: A CSP delivered via `Content-Security-Policy-Report-Only`, which reports violations without blocking them.
- **HSTS**: HTTP Strict Transport Security — a Security_Header instructing browsers to use HTTPS exclusively for a host.
- **Session_Cookie**: The httpOnly, server-verifiable `__session` cookie that represents an authenticated browser session.
- **Auth_Cookie**: The httpOnly `auth_token` cookie carrying a Firebase token.
- **Cookie_Policy**: The single authoritative module that determines the attribute tuple (name, domain, path, Secure, SameSite, max-age) for every authentication cookie.
- **Session_Revocation**: Server-side invalidation of a session such that subsequent requests presenting it are rejected.
- **Session_Version**: A monotonically increasing per-user counter embedded as a token claim; a token whose claim is behind the user's current value is considered revoked.
- **Revocation_Check**: Verification, on the authenticated request path, that a presented session has not been revoked, via Session_Version comparison and/or the identity provider's revocation state.
- **Idle_Timeout**: Maximum permitted duration of inactivity before a session is invalid.
- **Absolute_Timeout**: Maximum total session lifetime from initial authentication, regardless of activity.
- **CSRF**: Cross-Site Request Forgery — causing an authenticated user's browser to issue an unintended state-changing request using its ambient Session_Cookie.
- **CSRF_Token**: An unguessable value that must accompany a state-changing request and be validated server-side.
- **State_Changing_Request**: Any request that creates, modifies, or deletes server-side state. Includes non-idempotent methods (POST, PUT, PATCH, DELETE) and any GET endpoint that mutates state.
- **Credential_Endpoint**: Any endpoint that accepts or exchanges authentication material, including sign-in, session establishment, token update, and token refresh.
- **Auth_Event**: A security-relevant authentication occurrence (login, logout, revocation, CSRF failure, rate-limit trip, authentication failure).
- **Audit_Log**: A durable, append-only record of Auth_Events.
- **Security_Posture_Report**: Any programmatic self-assessment the system emits describing which security controls are active.
- **Tenant_Isolation**: The guarantee that a user can only read or modify data belonging to a workspace they are a member of.

## Requirements

### Requirement 1: Configuration-Driven Security Controls

**User Story:** As an operator, I want security controls driven by explicit configuration rather than `NODE_ENV`, so that a deployment serving real users over HTTPS is fully protected even when `NODE_ENV` is not `production`.

#### Acceptance Criteria

1. THE Security_Subsystem SHALL determine whether to emit each Security_Header from explicit configuration, and SHALL NOT require `NODE_ENV=production` to enable any Security_Header.
2. WHERE the application is reached over a Secure_Context, THE Security_Subsystem SHALL treat the deployment as a Deployed_Environment for the purpose of enabling transport security.
3. WHEN the Security_Subsystem starts, THE Security_Subsystem SHALL log which security controls are enabled and which are disabled.
4. IF a security control is disabled while the application is serving a Secure_Context, THEN THE Security_Subsystem SHALL log a warning identifying the disabled control.
5. THE Security_Subsystem SHALL preserve the existing deployment topology and SHALL NOT require a change to `NODE_ENV` in order to enable security controls.
6. WHERE a local development context is detected, THE Security_Subsystem SHALL permit security controls to be relaxed so local workflows are not broken.

### Requirement 2: Transport Security (HSTS)

**User Story:** As a security-conscious operator, I want HSTS enforced on the production hostname, so that browsers refuse to contact it over plaintext.

#### Acceptance Criteria

1. WHERE the application serves a Secure_Context, THE Security_Subsystem SHALL emit a `Strict-Transport-Security` response header.
2. THE Security_Subsystem SHALL set the HSTS `max-age` to at least one year.
3. THE Security_Subsystem SHALL make HSTS `includeSubDomains` and `preload` independently configurable.
4. WHERE the application is served over plaintext in a local development context, THE Security_Subsystem SHALL NOT emit HSTS.

### Requirement 3: Content-Security-Policy

**User Story:** As a security-conscious operator, I want a Content-Security-Policy enforced, so that injected scripts cannot execute and exfiltrate session data.

#### Acceptance Criteria

1. THE Security_Subsystem SHALL support emitting a CSP for all application responses.
2. THE Security_Subsystem SHALL support operating the CSP in CSP_Report_Only mode so violations can be observed before enforcement.
3. THE Security_Subsystem SHALL allow selecting between CSP_Report_Only and enforcing mode by configuration, without a code change.
4. THE CSP SHALL permit the origins the application legitimately requires, including its own origin, its configured API and asset origins, and its identity provider endpoints.
5. WHEN a CSP violation is reported, THE Security_Subsystem SHALL record it in a form sufficient to identify the violated directive and the blocked resource.
6. THE CSP SHALL restrict which origins may embed the application, replacing the removed frame protections of Requirement 4.
7. IF the CSP is disabled while the application serves a Secure_Context, THEN THE Security_Subsystem SHALL log a warning.

### Requirement 4: Clickjacking Protection

**User Story:** As a user, I want the application protected from being embedded by a hostile site, so that my clicks cannot be hijacked.

#### Acceptance Criteria

1. THE Security_Subsystem SHALL constrain which origins may frame the application.
2. THE Security_Subsystem SHALL NOT unconditionally remove frame-protection headers from responses.
3. WHERE embedding by a specific trusted origin is required, THE Security_Subsystem SHALL permit that origin to be configured explicitly rather than allowing all origins.
4. WHEN no embedding origin is configured, THE Security_Subsystem SHALL deny framing by third-party origins by default.

### Requirement 5: Cross-Origin Request Policy

**User Story:** As a security-conscious operator, I want the allowed cross-origin set stated explicitly, so that the API does not advertise a permissive policy.

#### Acceptance Criteria

1. THE Security_Subsystem SHALL resolve the allowed cross-origin set from explicit configuration.
2. THE Security_Subsystem SHALL NOT emit an `Access-Control-Allow-Origin` wildcard together with `Access-Control-Allow-Credentials: true`.
3. IF no cross-origin configuration is supplied, THEN THE Security_Subsystem SHALL default to same-origin only and SHALL log a warning.
4. WHEN a request presents an origin outside the allowed set, THE Security_Subsystem SHALL NOT return cross-origin access headers permitting that origin.

### Requirement 6: Session Revocation Enforcement

**User Story:** As a user who has logged out or reported a compromise, I want every existing session to stop working immediately, so that a copied session cookie cannot continue to act as me.

#### Acceptance Criteria

1. WHEN a request to a protected route presents a Session_Cookie, THE Security_Subsystem SHALL perform a Revocation_Check before authorizing the request.
2. IF the presented session's Session_Version is behind the user's current Session_Version, THEN THE Security_Subsystem SHALL reject the request with 401.
3. WHEN a user logs out, THE Security_Subsystem SHALL cause every subsequent request presenting that session to be rejected with 401, even if the Session_Cookie value is replayed from outside the browser.
4. WHEN a user's sessions are globally invalidated, THE Security_Subsystem SHALL cause requests presenting any previously issued session for that user to be rejected with 401.
5. THE Revocation_Check SHALL apply on the primary authenticated request path, not only on session-maintenance endpoints.
6. THE Revocation_Check SHALL NOT add an unbounded per-request latency cost, and SHALL use caching or an equivalent mechanism to bound its overhead.
7. IF the Revocation_Check cannot be completed because a dependency is unavailable, THEN THE Security_Subsystem SHALL fail closed for the affected request.
8. WHEN a session is rejected as revoked, THE Security_Subsystem SHALL record a revocation Auth_Event.

### Requirement 7: Session Lifetime Limits

**User Story:** As a security-conscious operator, I want sessions to expire after inactivity and after a maximum lifetime, so that abandoned sessions cannot be used indefinitely.

#### Acceptance Criteria

1. WHILE a session has been inactive longer than the configured Idle_Timeout, THE Security_Subsystem SHALL treat it as invalid and SHALL return 401 on protected routes.
2. WHILE a session has existed longer than the configured Absolute_Timeout, THE Security_Subsystem SHALL treat it as invalid regardless of activity.
3. THE Security_Subsystem SHALL expose Idle_Timeout and Absolute_Timeout as configuration.
4. WHEN a session is invalidated by Idle_Timeout or Absolute_Timeout, THE Security_Subsystem SHALL record a session-expiry Auth_Event.
5. WHEN a session is renewed by continued activity, THE Security_Subsystem SHALL NOT extend it beyond the Absolute_Timeout.

### Requirement 8: CSRF Protection

**User Story:** As a user, I want state-changing requests protected against forgery, so that a malicious page cannot act as me using my logged-in session.

#### Acceptance Criteria

1. WHEN a State_Changing_Request is authorized by an ambient Session_Cookie, THE Security_Subsystem SHALL require and validate a CSRF defence.
2. IF a State_Changing_Request fails CSRF validation, THEN THE Security_Subsystem SHALL reject it with 403 and SHALL NOT apply any state change.
3. THE Security_Subsystem SHALL issue a CSRF_Token to authenticated clients through a mechanism readable by the application's own client code.
4. THE Security_Subsystem SHALL bind the CSRF_Token to the authenticated session so a token issued for one session is not valid for another.
5. WHERE a request is authorized solely by an `Authorization` header rather than an ambient cookie, THE Security_Subsystem SHALL NOT require a CSRF_Token.
6. WHERE an endpoint is invoked by a trusted third-party service that cannot present a CSRF_Token, THE Security_Subsystem SHALL authenticate that endpoint by an alternative verifiable means and SHALL document the exemption.
7. WHEN CSRF validation fails, THE Security_Subsystem SHALL record a CSRF-failure Auth_Event.
8. THE Security_Subsystem SHALL NOT rely solely on the Session_Cookie `SameSite` attribute as its CSRF defence.

### Requirement 9: Abuse Protection on Credential Endpoints

**User Story:** As a security-conscious operator, I want credential endpoints rate-limited, so that brute-force and credential-stuffing attempts are throttled.

#### Acceptance Criteria

1. THE Security_Subsystem SHALL apply rate limiting to every Credential_Endpoint.
2. WHEN requests to a Credential_Endpoint from one client source exceed the configured threshold within the configured window, THE Security_Subsystem SHALL reject further requests with 429.
3. WHILE a user performs normal sign-in, session establishment, and navigation, THE Security_Subsystem SHALL NOT return a false 429.
4. THE Security_Subsystem SHALL derive the client source identity from the real client address behind the deployment proxy.
5. WHEN a rate limit is triggered, THE Security_Subsystem SHALL record a rate-limit Auth_Event.
6. THE Security_Subsystem SHALL keep the configured limit and the value advertised in rate-limit response headers consistent.

### Requirement 10: Authentication Audit Logging

**User Story:** As a security operator, I want authentication events recorded durably, so that I can investigate incidents.

#### Acceptance Criteria

1. WHEN a login, logout, global invalidation, session revocation, session expiry, CSRF failure, rate-limit trip, or authentication failure occurs, THE Security_Subsystem SHALL record a corresponding Auth_Event in the Audit_Log.
2. THE Security_Subsystem SHALL record for each Auth_Event a timestamp, the event type, the associated user identifier when known, and the client source identity.
3. THE Security_Subsystem SHALL NOT record credentials, session cookie values, or token values in the Audit_Log.
4. THE Audit_Log SHALL be append-only with respect to recorded Auth_Events.
5. IF writing to the Audit_Log fails, THEN THE Security_Subsystem SHALL NOT fail the user-facing request, and SHALL surface the logging failure through operational logs.

### Requirement 11: Truthful Security Posture Reporting

**User Story:** As an operator, I want the system's security self-assessment to reflect reality, so that it does not mask missing controls.

#### Acceptance Criteria

1. THE Security_Posture_Report SHALL derive every reported control status from the actual runtime configuration or a runtime probe.
2. THE Security_Posture_Report SHALL NOT report a control as active based on a hard-coded value.
3. WHEN a control is inactive, THE Security_Posture_Report SHALL report it as inactive.
4. THE Security_Posture_Report SHALL include, at minimum, the status of transport security, CSP, clickjacking protection, CSRF protection, cookie security attributes, rate limiting, and Revocation_Check.

### Requirement 12: Authentication Cookie Integrity

**User Story:** As a user, I want my session cookies scoped consistently, so that logging out reliably ends my session.

#### Acceptance Criteria

1. THE Security_Subsystem SHALL write every Auth_Cookie and Session_Cookie through the Cookie_Policy.
2. THE Cookie_Policy SHALL produce an identical attribute tuple for a given cookie at every call site.
3. WHEN a session ends, THE Security_Subsystem SHALL clear each authentication cookie under every attribute variant under which it may previously have been written.
4. THE Security_Subsystem SHALL mark every authentication cookie httpOnly, and SHALL mark it Secure whenever the application serves a Secure_Context.
5. IF the configured cookie domain does not cover the application's own hostname, THEN THE Security_Subsystem SHALL report the misconfiguration at startup.

### Requirement 13: Tenant Isolation Verification

**User Story:** As a customer, I want assurance that no other tenant can read or modify my workspace data, so that my data is private.

#### Acceptance Criteria

1. WHEN a request references a workspace, THE Security_Subsystem SHALL verify the authenticated user's membership of that workspace before returning or modifying its data.
2. IF an authenticated user references a workspace they are not a member of, THEN THE Security_Subsystem SHALL reject the request with 403 or 404 and SHALL NOT disclose the workspace's data or existence.
3. THE Security_Subsystem SHALL derive the workspace scope for a request from a server-side authorization decision, and SHALL NOT trust a client-supplied workspace identifier without verifying membership.
4. THE Security_Subsystem SHALL provide an enumeration of routes accepting a workspace identifier together with the membership check applied to each, so unprotected routes are identifiable.
5. WHEN a tenant-isolation violation is attempted, THE Security_Subsystem SHALL record an Auth_Event.

### Requirement 14: Secret Hygiene

**User Story:** As a security-conscious operator, I want no secret material in version control, so that repository access does not imply credential compromise.

#### Acceptance Criteria

1. THE repository SHALL NOT track private keys, credential files, or populated environment files.
2. WHERE a key is required only for local development, THE repository SHALL provide a documented generation step rather than a committed key.
3. THE Security_Subsystem SHALL provide an automated check that fails when a file matching a secret pattern is added to version control.
4. IF a secret has previously been committed, THEN the remediation SHALL include rotating that secret, because removal from the working tree does not invalidate it.

### Requirement 15: Verification and Regression Protection

**User Story:** As a maintainer, I want each hardening measure covered by an automated test, so that a future change cannot silently remove it.

#### Acceptance Criteria

1. THE Security_Subsystem SHALL have automated tests asserting that each required Security_Header is present on a response in a Secure_Context.
2. THE Security_Subsystem SHALL have automated tests asserting that a State_Changing_Request without a valid CSRF_Token is rejected.
3. THE Security_Subsystem SHALL have automated tests asserting that a session presenting a stale Session_Version is rejected with 401.
4. THE Security_Subsystem SHALL have automated tests asserting that authentication cookies are cleared under every previously used attribute variant.
5. THE Security_Subsystem SHALL have automated tests asserting that a user cannot access a workspace they are not a member of.
6. THE automated tests SHALL assert observable behaviour of the real implementation, and SHALL NOT assert only the behaviour of test doubles.
7. WHEN a hardening measure is added, THE corresponding test SHALL fail if that measure is reverted.

### Requirement 16: Safe Rollout

**User Story:** As an operator, I want hardening rolled out without breaking the running application, so that tightening security does not cause an outage.

#### Acceptance Criteria

1. THE Security_Subsystem SHALL allow each newly introduced restriction to be enabled independently by configuration.
2. WHERE a restriction may break existing client behaviour, THE Security_Subsystem SHALL support an observation-only mode before enforcement.
3. WHEN a restriction is enabled and causes failures, THE Security_Subsystem SHALL allow it to be disabled by configuration without a code change or redeployment of application code.
4. THE rollout SHALL define, for each restriction, the verification performed before enforcement is enabled.
5. THE Security_Subsystem SHALL preserve existing authenticated sessions across the rollout, except where a requirement explicitly invalidates them.
