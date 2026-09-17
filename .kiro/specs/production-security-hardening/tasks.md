# Implementation Plan

## Overview

Hardens the deployed application to an enterprise security baseline without
changing the deployment topology. The central constraint is that every control is
driven by explicit configuration rather than `NODE_ENV`, because the production
host runs `NODE_ENV=development` behind an HTTPS tunnel and the previous
`isProduction` gates silently disabled HSTS, CSP, and clickjacking protection on
live traffic.

Phases 1–3 are implemented. Phase 4 is the remaining work. Every restriction that
could break a working client ships in an observation-only mode first, so
enforcement is a separate, deliberate switch.

Status legend: `[x]` done and test-covered · `[ ]` not started · `[~]` implemented in report-only mode, awaiting enforcement

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "description": "Foundations: the flag resolver and the revocation/CSRF primitives everything else builds on.",
      "tasks": ["1", "9", "12"]
    },
    {
      "wave": 2,
      "description": "Apply the controls. Each depends only on its wave-1 foundation.",
      "tasks": ["2", "3", "4", "5", "6", "8", "10", "13"]
    },
    {
      "wave": 3,
      "description": "Bind the pieces together: posture reporting needs the CSRF status; cache invalidation needs enforcement in place.",
      "tasks": ["7", "11", "14", "19"]
    },
    {
      "wave": 4,
      "description": "Independent remaining work; no ordering constraints between these.",
      "tasks": ["15", "16", "17", "20", "21", "26"]
    },
    {
      "wave": 5,
      "description": "Enforcement switches. Gated on observation-mode reports being clean and, for CSRF, on the client sending the header.",
      "tasks": ["25", "18"]
    },
    {
      "wave": 6,
      "description": "Operator actions outside the codebase; independent of all code tasks.",
      "tasks": ["22", "23", "24"]
    }
  ]
}
```

## Tasks

### Phase 1 — Configuration-driven controls (Requirements 1, 2, 3, 4, 5, 11)

- [x] 1. Create the security flag resolver
  - `server/config/security-flags.ts`: resolves every control from explicit env, plus a Secure_Context detector shared with the cookie policy so the two can never disagree.
  - _Requirements: 1.1, 1.2, 1.5, 1.6_

- [x] 2. Enable HSTS on the HTTPS deployment
  - Replaced `isProduction ? {...} : false`. `includeSubDomains`/`preload` default OFF because they are irreversible for the duration of max-age.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Add a Content-Security-Policy
  - `server/config/csp-policy.ts` builds the directives; ships REPORT-ONLY so it cannot blank the app before its reports are reviewed.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

- [x] 4. Restore clickjacking protection
  - Removed the unconditional `res.removeHeader('X-Frame-Options')`; `frame-ancestors` now defaults to `'self'` with an optional allow-list.
  - **Also fixed an unlogged vulnerability found here:** the code honoured an attacker-controlled `?embed=true` query parameter by setting `Content-Security-Policy: frame-ancestors *`, letting any third party defeat clickjacking protection *and* wiping every other CSP directive for that response. Branch deleted.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Make the cross-origin policy explicit
  - Wildcard is ignored; unset config defaults to same-origin only and warns.
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 6. Startup posture logging
  - `reportSecurityPosture()` logs each control and warns when one is disabled while serving HTTPS.
  - _Requirements: 1.3, 1.4_

- [x] 7. Truthful security posture report
  - `deployment-hardening.ts` now derives every status from runtime config. Previously `CSRF_PROTECTION` was hard-coded `true` (asserting a control that did not exist) and `SECURE_COOKIES` was wrong in the opposite direction (reported `false` on the live HTTPS host).
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 8. Fix the express-session cookie Secure flag
  - Same `NODE_ENV` defect: the OAuth session cookie was not marked Secure on the live HTTPS deployment.
  - _Requirements: 12.4_

### Phase 2 — Session revocation (Requirement 6)

- [x] 9. Revocation enforcement module
  - `server/lib/session-revocation.ts`. Fails OPEN for a token with no `sessionVersion` claim (legacy tokens), fails CLOSED when a present claim cannot be checked.
  - _Requirements: 6.1, 6.2, 6.7_

- [x] 10. Enforce on every authenticated path
  - Wired into `require-auth.ts` (session-cookie and Bearer paths) and all three paths in `verify-auth-token.ts`. Previously `sessionVersion` was only checked on session-maintenance endpoints, so a captured cookie stayed valid for up to 14 days after logout.
  - _Requirements: 6.3, 6.4, 6.5_

- [x] 11. Bound the overhead + invalidate on bump
  - Short-TTL Redis cache; explicit invalidation at both `sessionVersion` bump sites (logout, admin invalidate-sessions) so revocation is immediate.
  - _Requirements: 6.6_

### Phase 3 — CSRF (Requirement 8)

- [x] 12. CSRF middleware
  - `server/middleware/csrf-protection.ts`. Signed double-submit cookie bound to a **session-cookie fingerprint** rather than the uid — deliberately, so it works at the global middleware layer where `req.user` is not yet populated. Binding to `req.user` would have made the check a silent no-op.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.8_

- [x] 13. Audited third-party exemptions
  - Webhooks and the payment callback are exempt and authenticated by signature instead; the exemption list is a single reviewable constant.
  - _Requirements: 8.6_

- [x] 14. Client sends the CSRF header
  - `client/src/lib/csrf.ts` reads the readable `vf_csrf` cookie. Wired into
    `apiRequest` (`client/src/lib/queryClient.ts`) on both the initial request and the
    401-retry path — the token is re-read on retry because a session refresh can
    rotate it and a stale value would fail the double-submit comparison.
  - **CORRECTION.** Patching `apiRequest` alone was NOT sufficient, and this task was
    previously marked done on that incorrect basis. An audit found ~12 client modules
    calling `fetch` directly with `credentials: 'include'` and a mutating method
    (WorkspaceSwitcher, video-editor utils, onboarding steps, brand selection). Most
    of the rest hit endpoints already on the CSRF exemption list, but those would each
    have started returning 403 the moment enforcement was enabled.
  - Fixed with a global `fetch` interceptor (`installCsrfFetchInterceptor`, installed
    in `main.tsx` before mount) rather than by patching each call site — patching
    individually would leave the same trap for the next `fetch` someone adds.
    Deliberately narrow: same-origin only (never leaks the token cross-origin),
    state-changing methods only, and never overwrites a caller-supplied header.
  - _Requirements: 8.1, 8.3_

- [x] 15. Session lifetime limits
  - `server/lib/session-lifetime.ts`, enforced on both auth paths in `require-auth.ts`.
  - Idle = sliding window tracked server-side in Redis (a client-writable value could
    be forged to keep a session alive forever). Absolute = derived from the token's
    SIGNED `auth_time`/`iat` claim, so activity cannot extend it (Req 7.5).
  - Defaults 7d idle / 30d absolute. Fails OPEN when the activity store is down —
    unlike revocation, an idle timeout is hygiene, and logging everyone out over a
    Redis blip would be a self-inflicted outage. The absolute limit still applies
    because it needs no external store.
  - Logout clears the activity marker so a replayed cookie cannot look freshly active.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 16. Rate-limit the credential endpoints
  - `server/middleware/credential-rate-limit.ts`, mounted on `/api/auth`.
  - TWO buckets, because one cannot serve both shapes without either false-positiving
    on maintenance traffic or being uselessly loose on credentials: verification
    (`/signin`, tight) vs maintenance (`/session-login`, `/refresh`, generous).
    A regression test asserts `/session-login` is NOT classified as verification —
    misclassifying it would reintroduce the original false-429 bug.
  - Keys on the real client IP behind the proxy; only consumes on POST/PUT/PATCH.
  - Fails OPEN: this is abuse mitigation, not authorization, so a limiter fault must
    not lock everyone out of signing in.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 17. Authentication audit log
  - `server/lib/auth-audit.ts` + append-only `models/Security/AuthAuditEvent.ts`.
  - Wired to: CSRF failures, session revocations, session expiries, logout, global
    logout, rate-limit trips, and tenant-isolation violations.
  - Fire-and-forget and never throws (Req 10.5) — a logging outage must not become an
    authentication outage. Always mirrors to the console so the trail survives a DB
    outage.
  - Redaction is enforced by the writer AND by the schema having no field capable of
    holding a token; nested objects are reduced to a shape marker so a secret cannot
    hide inside one. 26 tests cover this specifically.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 18. CSP violation report endpoint
  - `POST /api/security/csp-report`. Deliberately unauthenticated — the browser posts
    these without credentials, so requiring auth would silence the whole stream. Input
    is treated as untrusted: nothing is executed, fields are length-capped, answers 204.
  - Point `SECURITY_CSP_REPORT_URI` at it.
  - _Requirements: 3.5_

- [x] 21. Fix the test environment split
  - `environmentMatchGlobs` was REMOVED in Vitest 3+ and silently ignored by the
    installed v4, so every client suite ran under `node` with no `document` — the
    cause of the 6 pre-existing animation failures. Replaced with `test.projects`.
  - Also removed the root-level `include`: with `extends: true` each project inherited
    and merged it, so every server suite matched the client project too and ran TWICE.
    Verified with `vitest list` that each file now runs exactly once.
  - Fixed a stale assertion in `animation-config.test.ts` demanding a
    `backfaceVisibility` property the source deliberately removed.

- [x] 19. Tenant isolation — audit + P0/P1 fixes
  - Added `server/lib/workspace-access.ts` (`userCanAccessWorkspace`,
    `listAccessibleWorkspaceIds`) for the cases a fixed-source middleware guard
    cannot express: workspace discovered only after a DB lookup, or arriving in one
    of several mutually exclusive body fields. Fails closed.
  - **P0 — four UNAUTHENTICATED endpoints in `server/index.ts`** now require auth +
    workspace membership: `/api/instagram/disconnect`, `/reconnect/start`,
    `/force-sync`, `/ensure-account`. `disconnect` and `reconnect/start` were
    *destructive* — they nulled a social account's access/refresh tokens — so any
    anonymous caller who knew a workspace id could disconnect that tenant's
    Instagram. `disconnect` also had an IDOR on `accountId`, closed by resolving the
    row first and then checking membership of its owning workspace.
  - **P1 — `routes/social-listening.ts`**: 16 `/:workspaceId` routes had `requireAuth`
    only. Closed with a single `router.param('workspaceId', …)` guard —
    `router.use` would NOT work here because router-level middleware runs before
    route matching, so `req.params` is still empty. `POST /sources` takes the id from
    the body and got `validateWorkspaceAccess({source:'body'})`.
  - **P1** guards added to: `automation.routes.ts` (`GET /rules`, `POST /rules`,
    `GET /logs/:workspaceId`), `content.routes.ts` (all four `/workspace/:workspaceId`
    routes), `scheduler.routes.ts` (`GET /upcoming`), `facebook.routes.ts`
    (`POST /pages/connect`).
  - **Key finding:** `requireWorkspaceAccessible()` reads like an isolation guard but
    only enforces the plan's `maxWorkspaces` limit and **fails open on error**.
    Several routes used it in the position where a membership check belonged.
  - Fixed a latent trap in `validateWorkspaceMembership`: it read `req.userId`, which
    `requireAuth` never sets (it sets `req.user.id`), so any route adopting it would
    have 401'd every request. No callers today.
  - _Requirements: 13.1, 13.2, 13.3, 13.5_

- [x] 26. Tenant isolation — remaining surface (resolved)
  - **`:ruleId` IDOR (was real):** `PUT/DELETE /rules/:ruleId` and
    `POST /rules/:ruleId/toggle` mutated by rule id with no ownership check. Closed
    with a reusable `requireResourceWorkspaceAccess()` guard that loads the resource,
    resolves its owning workspace, then checks membership — the shape no fixed-source
    middleware can express because the workspace is not in the request at all.
    Responds 404 (never 403) so the endpoint cannot be used to probe which ids exist.
  - **AI controllers — verdict corrected.** I previously flagged these as "unverified
    whether the id reaches a write". Now traced: the credit-deducting endpoints
    (`creative-brief`, `content-repurpose`) and all three `content-generation` sites
    DO check ownership, so there was no cross-tenant write. But the **read** path was
    unguarded: `getPreferences` loaded a client-supplied workspace and merged its
    `aiConfiguration` (brand voice, tone, personality) with no check, then generated
    content under it. Fixed in `text-generation`, `caption-generation`,
    `caption-analysis` via a shared `getAuthorizedWorkspace()` that pairs the load
    with the authorization so the unsafe form is hard to write by accident.
  - **`instagram-diagnostics.ts` landmine:** unauthenticated and returns any
    workspace's account data. Still unmounted, but `requireAuth` + membership are now
    applied at the ROUTER level, so any future mount is guarded by default rather
    than depending on whoever mounts it remembering.
  - Requirement 13.4 (a durable, automated enumeration of workspace routes and their
    guards) remains unimplemented — the audit is a point-in-time snapshot. Tracked as
    task 28.

- [x] 28. Automated tenant-isolation coverage check
  - `scripts/check-tenant-isolation.mjs` (`npm run check:tenant-isolation`, plus
    `npm run check:security` alongside the secret check).
  - Statically finds routes that take a client workspace id with no membership guard.
    Fails the build on any NEW finding; supports a reviewed baseline so it can be
    adopted without a red build. **The baseline is currently EMPTY** — there were no
    findings left to accept.
  - **It found two real holes the manual audit had missed:**
    1. `POST /messages/:messageId/apply-edit` (`veegpt-chat.routes.ts`) looked the
       message up by id ALONE — an IDOR letting any authenticated user apply or cancel
       an edit on another user's message. `ChatMessage` has no userId, so ownership is
       now verified through the owning conversation.
    2. `GET /:workspaceId/stats` (`v1/workspace.routes.ts`) called
       `getWorkspaceStats(workspaceId)` with NO user id anywhere in the chain, leaking
       any workspace's statistics. All 9 `:workspaceId` routes in that file are now
       covered by one `router.param` guard.
  - Also closed `GET /facebook/auth` and `GET /social-auth/:platform/authorize` (the
    latter had no authentication at all) — both embed the workspaceId in OAuth state.
  - **Tuning mattered.** The first version reported 30 findings, most of them false:
    it did not recognise queries co-scoped by `userId`
    (`findOne({ userId, workspaceId })`), incrementally-built filters, or
    authorization delegated to a service (`WorkspaceService.deleteWorkspace` checks
    `ownerId`). A gate that cries wolf gets disabled, so routes that delegate to a
    controller are reported for REVIEW rather than failed — that distinction is what
    surfaced the `getStats` hole.
  - **Verified it actually works:** a deliberately unguarded probe route was added and
    initially NOT caught — the file-level gate missed destructured access
    (`const { workspaceId } = req.params`) and skipped the file entirely. Fixed, then
    re-confirmed the probe fails with exit 1 and a clean tree passes with exit 0.
  - Honest limitation, documented in the script: regex-based static analysis. A PASS
    means "no new findings of the shapes it recognises", not "isolation is proven".
  - _Requirements: 13.4_

- [x] 20. Secret-hygiene check + ignore rules
  - `scripts/check-secrets.mjs` (`npm run check:secrets`) fails when a secret-shaped
    file is TRACKED by git, with an allow-list carrying a justification per entry.
    Exits non-zero if it cannot run, so an unrunnable check cannot silently pass CI.
  - `.gitignore`: the existing rule was `/.env`, which is ROOT-ANCHORED — which is
    exactly how a nested env file came to be tracked. Added `**/`-prefixed patterns.
  - _Requirements: 14.1, 14.2, 14.3_

- [ ] 29. **ROTATE the exposed credentials** ← ACTION REQUIRED (highest priority)
  - `npm run check:secrets` reports `admin-panel/.env` tracked in git with a
    NON-EMPTY `MONGODB_URI` and `JWT_SECRET`, plus `ssl/localhost-{cert,key}.pem`.
  - `.gitignore` does NOT untrack an already-committed file, and deleting it does NOT
    invalidate it — both values are in the repository history. They must be rotated:
    1. `git rm --cached admin-panel/.env ssl/localhost-cert.pem ssl/localhost-key.pem`
    2. Rotate the database credential in `MONGODB_URI` and regenerate `JWT_SECRET`
       (rotating JWT_SECRET invalidates existing admin-panel tokens — expect a
       re-login).
    3. Regenerate the localhost certs locally; they should never be committed.
  - I did not run `git rm --cached` myself: it stages a deletion that could break a
    deployment expecting the file to be present, so it needs your call.
  - _Requirements: 14.4_

- [ ] 27. Reduce the type-error backlog
  - 724 pre-existing server type errors, mostly `wrapAsync` overload mismatches. Not a
    vulnerability, but it removes a correctness net. Held at 724 throughout this work —
    no new errors introduced. This is a genuinely large mechanical refactor and is
    deliberately not bundled into a security spec.

### Operator actions (outside the codebase)

- [ ] 22. **Disable Cloudflare Rocket Loader** for `app.veefore.com`
  - Still outstanding, and still the cause of the original blank screen: Rocket Loader rewrites `type="module"` so the app entry never executes. Dashboard → Speed → Optimization, or a Configuration Rule scoped to the hostname.

- [ ] 23. Set the production environment variables
  - `CORS_ORIGIN=https://app.veefore.com`, and confirm `SESSION_SECRET` is >= 32 chars (CSRF signing depends on it).

- [ ] 24. Move production off the local dev server
  - Real users are served by a Vite dev server over a tunnel: unminified code, HMR endpoints exposed, ~12.8s TTFB. A built artefact behind a real host is the durable fix. Note that flipping `NODE_ENV=production` alone will switch the server to static file serving and requires a build to exist first — which is why none of the work above depends on it.

## Notes

### Verification performed

- **525 tests passing across 28 files** in the touched areas (300 at the start of this
  work, 0 failing).
- New coverage: 31 security-flag/CSP, 14 session-revocation, 37 server CSRF,
  16 workspace-access, 26 auth-audit, 16 session-lifetime, 10 credential-rate-limit,
  33 client CSRF (including the global fetch interceptor).
- Server type errors held at **724 throughout — no new errors introduced**, verified by
  diffing against the pre-change baseline rather than assuming.
- The 6 previously-failing animation tests are now passing (task 21).

### Deliberately shipped inert

CSP and CSRF are ENABLED but in observation mode. This is not incompleteness — an
enforcing first-time CSP reliably blanks a page, and enforcing CSRF before every caller
sends the header would break mutations. Both log what they would block. Tasks 25 and the
CSP flip are the deliberate switches.

### Waves 1–3 status

All implemented. Remaining: 29 (rotate the exposed credentials — highest priority), 25 (flip CSRF
enforcement after one observation pass), 27 (type-error backlog), and operator
actions 22–24. All other code work is complete.
