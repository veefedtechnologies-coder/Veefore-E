# Secrets Rotation & Management Plan

## Goals
Protect all credentials, rotate compromised/aged keys, and centralize management without breaking environments.

## Actions
1. Inventory secrets across server/.env, client/.env, admin-panel/.env.
2. Create managed secrets per environment (prod, staging, dev) in your hosting/CI platform.
3. Rotate keys: OpenAI, Anthropic, Google, Instagram (app/webhook), Stripe/Razorpay, Firebase, SendGrid, Redis, Sentry.
4. Remove real values from the repository; keep placeholders only in .env.example.
5. Enable CI secret scanning to fail on detections (TruffleHog already present).
6. Audit logs: ensure no secret values are printed; scrub in structured logger.

## Rollout
1. Update staging with new secrets; validate login, AI calls, publish flows.
2. Update production secrets during a low-traffic window; monitor errors and rate limits.
3. Document rotation cadence (quarterly) and incident rotation procedure.
