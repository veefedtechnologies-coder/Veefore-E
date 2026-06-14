# Rollback Procedures

**Version:** 2.0  
**Last Updated:** 2025-01-01  
**Tasks:** 29.1–29.3

This document describes rollback procedures for each refactored module. All rollbacks are designed to be executed in under 5 minutes without a code deployment.

---

## Rollback Strategy Overview

The refactoring uses a **feature flag-based rollback** strategy. Legacy code is preserved alongside new code until the rollout is complete and stable. This means:

1. **Fast rollback** — set environment variable to 0%, restart app (< 2 minutes)
2. **Granular rollback** — roll back individual features without affecting others
3. **Zero downtime** — flag changes take effect without a code deploy (via runtime config)
4. **Automatic rollback** — CI/CD pipeline can trigger rollback on health check failure

---

## Task 29.1 — Feature Flag Rollback

### Immediate Rollback (Any Module)

To instantly roll back any feature to the legacy implementation:

```bash
# Example: roll back AI service layer
export FEATURE_AI_SERVICE_LAYER=0
pm2 restart veefore-server  # or your process manager

# Or in Kubernetes:
kubectl set env deployment/veefore-api FEATURE_AI_SERVICE_LAYER=0

# Or via your CI/CD platform (Vercel, Render, Railway):
# Update environment variable in dashboard — auto-redeploys
```

### All-Module Emergency Rollback

```bash
# scripts/rollback-all.sh
#!/bin/bash
echo "EMERGENCY ROLLBACK — reverting all feature flags to 0"

export FEATURE_AUTOMATION_REFACTOR=0
export FEATURE_VIDEO_GENERATOR_REFACTOR=0
export FEATURE_CHAT_REFACTOR=0
export FEATURE_AUTH_REFACTOR=0
export FEATURE_LANDING_REFACTOR=0
export FEATURE_AI_SERVICE_LAYER=0
export FEATURE_STORAGE_SERVICE_LAYER=0
export FEATURE_INSTAGRAM_SERVICE=0
export FEATURE_MOBILE_OPTIMIZATION=0
export FEATURE_PERMISSIONS_REFACTOR=0

pm2 restart all
echo "Rollback complete. All users now on legacy implementation."
```

---

## Task 29.2 — Module-Specific Rollback Procedures

### Landing Page

**Symptom:** Broken layout, missing sections, animation errors on `/`

```bash
export FEATURE_LANDING_REFACTOR=0
pm2 restart veefore-server
```

**Legacy path:** `client/src/pages/Landing.tsx` (1,534 lines) — serves as fallback  
**Verification:** Visit `/` and confirm all sections render correctly

---

### AI Service Layer

**Symptom:** AI generation failing, timeout errors, 502 responses on `/api/ai/*`

```bash
export FEATURE_AI_SERVICE_LAYER=0
pm2 restart veefore-server
```

**Legacy path:** `server/routes/v1/ai.routes.ts` — original route with inline logic  
**Verification:** Test caption generation, image generation endpoints  
**SLA:** AI service P95 < 10s after rollback

---

### Storage Service

**Symptom:** File upload failures, image processing errors, S3 errors

```bash
export FEATURE_STORAGE_SERVICE_LAYER=0
pm2 restart veefore-server
```

**Legacy path:** `server/storage.ts` — original storage handler  
**Verification:** Upload a test image, verify S3 URL is returned  
**Data note:** Files already uploaded are safe — only routing changes

---

### Instagram Service

**Symptom:** Instagram publishing failures, webhook processing errors, DM failures

```bash
export FEATURE_INSTAGRAM_SERVICE=0
pm2 restart veefore-server
```

**Legacy paths:**  
- `server/instagramApi.ts` (if preserved)  
- `server/instagram-api.ts` (if preserved)  
**Verification:** Trigger a test Instagram post, verify webhook receipt  
**Important:** Verify any in-progress automations are not disrupted

---

### Authentication

**Symptom:** Login failures, OAuth redirect errors, JWT validation failures

```bash
export FEATURE_AUTH_REFACTOR=0
pm2 restart veefore-server
```

**Legacy paths:**  
- `server/middleware/auth.ts` (Main App)
- `admin-panel/server/middleware/auth.ts` (Admin Panel)  
**Verification:** Complete a full login flow for both email and OAuth  
**Note:** Existing JWT tokens remain valid across rollback — no user re-login needed

---

### Automation Module

**Symptom:** Automation creation broken, flow not saving, preview not rendering

```bash
export FEATURE_AUTOMATION_REFACTOR=0
```

**Legacy path:** `client/src/components/AutomationStepByStep.tsx` (if preserved)  
**Client-side rollback:** Feature flag read from `VITE_FEATURE_AUTOMATION_REFACTOR`  
**Verification:** Create a test automation end-to-end

---

### Video Generator

**Symptom:** Video generation workflow broken, script editor not loading

```bash
export VITE_FEATURE_VIDEO_GENERATOR_REFACTOR=0
# Requires client rebuild or CDN cache bust
npm run build && npm run deploy:client
```

**Legacy path:** `client/src/components/VideoGeneratorAdvanced.tsx` (if preserved)

---

### Permissions Module

**Symptom:** Admin permission checks failing, unauthorized access or over-restriction

```bash
export FEATURE_PERMISSIONS_REFACTOR=0
pm2 restart veefore-server
```

**Legacy path:** `server/permissions.ts`  
**Verification:** Log in as admin, verify all admin operations work

---

### Mobile Optimization

**Symptom:** Broken responsive layout, device detection incorrect, touch events broken

```bash
export VITE_FEATURE_MOBILE_OPTIMIZATION=0
npm run build && npm run deploy:client
```

**Legacy paths:**  
- `client/src/lib/mobile-excellence.ts`  
- `client/src/lib/mobile-optimization.ts`  
- `client/src/lib/mobile-performance.ts`

---

## Task 29.3 — Database/Data Rollback

The refactoring is **purely structural** — no database schema changes were made. All MongoDB collections, Redis keys, and S3 bucket structure are identical before and after refactoring. Therefore:

- **No data migration needed for rollback**
- **No data loss risk from rolling back**
- Existing sessions, user data, automations, and media are unaffected by feature flag changes

The only exception: if the permissions refactoring added new permission fields to the admin database schema, verify old permission middleware can still read those fields after rollback. Both old and new permission schemas are designed to be forward-compatible.

---

## Escalation Path

1. **Auto-rollback** — CI/CD pipeline detects health check failure, sets flag to 0% automatically
2. **On-call engineer** — sets individual module flag to 0% using procedures above (< 2 min)
3. **Full code rollback** — `git revert` the refactoring commits and redeploy (< 15 min)
4. **Database restore** — not required (no schema changes)

For full git rollback (last resort):

```bash
# Find the last stable commit before Phase 5 started
git log --oneline | grep "Phase 4"

# Revert to that commit
git revert HEAD~N  # or git checkout <commit-hash>
git push origin main
```
