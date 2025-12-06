# Sentry Integration Debug Report

## Summary
- Objective: Integrate Sentry for server-side error tracking and verify ingestion.
- Result: SDK initialized and routes wired; ingestion to Sentry fails upstream, so no issues appear in the UI.
- Primary Cause: DSN ingestion returns HTTP 403 during a direct envelope test, indicating a DSN/project/key mismatch or permission issue.

## Work Completed
- Server environment loading updated so `SENTRY_DSN` is reliably available:
  - `server/index.ts:1–3` loads both root `.env` and `server/.env`.
- Sentry initialization implemented with `@sentry/node`:
  - `server/monitoring/sentry-init.ts:1–60` initializes with `debug: true`, optional profiling integration, request/tracing/error handlers, and emits a startup message (`sentry-initialized`).
- Safe helpers added:
  - `sentryCaptureException`, `sentryCaptureMessage`, `isSentryReady` for gated capture and flush.
  - `sentryDirectTest` performs raw envelope POST to the DSN for connectivity verification.
- Debug endpoints wired:
  - Error: `server/routes.ts:12199–12206` → `GET /debug-sentry` throws, captures, and flushes.
  - Status: `server/routes.ts:12207–12212` → `GET /debug-sentry/status` reports readiness and DSN presence, emits a message.
  - Direct: `server/routes.ts:12213–12217` → `GET /debug-sentry/direct` posts a raw envelope to Sentry and reports HTTP status.
- Client note:
  - Client uses `VITE_SENTRY_DSN` (configured in `client/.env`). This is independent from server DSN.

## Verification Performed
- Start from the repo root on unified port `5000`:
  - `npm run dev`
- Trigger endpoints:
  - `GET /debug-sentry/status` → `200` with `{ sentryReady: true, dsnPresent: true }`.
  - `GET /debug-sentry` → `500` with `{"error":"Debug Sentry error triggered"}`; server captures and flushes.
  - `GET /debug-sentry/direct` → returns `{ ok: false, status: 403 }`.

## Current Behavior
- SDK is initialized and reporting readiness.
- Error capture attempts execute and flush locally.
- Direct envelope test returns `403`, confirming Sentry ingestion rejects the DSN.
- As a result, Sentry UI shows no issues for these events.

## What Failed and Why
- Failed: Sentry ingestion (server → Sentry) using current DSN.
  - Evidence: `GET /debug-sentry/direct` reports `403`.
  - Effect: Both startup message (`sentry-initialized`) and debug errors do not appear in Sentry Issues.
- Succeeded:
  - Local error capture and flush logic (`captureException` + `flush`).
  - Readiness/status reporting.
  - Route responses and server stability.

## Possible Root Causes
- DSN belongs to a different project or organization than the one being viewed.
- DSN is malformed, partially copied, or includes hidden characters.
- DSN key is disabled/rotated or lacks permission; project disabled or archived.
- Region mismatch or egress restrictions (e.g., project in EU, DSN pointing to US; firewall/VPN blocks `*.ingest.*.sentry.io`).
- Sentry project filters or UI environment filters hiding `development` events.
- Organization quotas or enforcement policies returning non-200 (rare for `403`; `429` is typical for rate limits).

## Next Actions (Future Fix)
- Replace `SENTRY_DSN` in `server/.env` with the DSN from the exact project intended for server events (Project → Settings → Client Keys).
- Re-run: `npm run dev`, then hit:
  - `GET /debug-sentry/direct` → expect `{ ok: true, status: 200 }`.
  - `GET /debug-sentry` → check Sentry Issues for “Sentry debug route triggered”.
- Confirm Sentry environment is not filtered out in UI (set to `development`).
- If using region-specific Sentry, ensure DSN host matches the project region.
- Optionally add a small `sentryStartSpan(name, op, fn)` helper and route-level spans for Performance after ingestion is working.

## Important Notes
- Do not commit or share any secret values (DSN keys, API keys) in code or docs.
- Server and client DSNs are independent; verify both if you also expect front-end events.

## Conclusion
- Integration is correct on the application side. Ingestion is blocked upstream (`403` from Sentry), so events do not reach the project. Fix requires a valid, reachable DSN for the intended Sentry project and environment.

