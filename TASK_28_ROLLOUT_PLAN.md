# Task 28 – Gradual Production Rollout Plan

**Phase 5: Testing, Documentation, and Production Rollout**
_Requirements: 18.1–18.6_

---

## Overview

The production rollout follows a staged feature-flag strategy, incrementally increasing traffic exposure while monitoring for regressions at each stage. All refactored modules were gated behind feature flags during development and testing; this document describes the process for moving from 0% to 100% production traffic.

---

## 28.1 – Feature Flag Strategy

### Feature Flag Infrastructure

Feature flags are configured via environment variables (no external service dependency required for initial rollout). Each flag controls whether the refactored or original implementation is used:

```typescript
// server/shared/config/featureFlags.ts
export const FeatureFlags = {
  USE_REFACTORED_AUTOMATION:    process.env.FF_AUTOMATION    === 'true',
  USE_REFACTORED_VIDEO:         process.env.FF_VIDEO         === 'true',
  USE_REFACTORED_AUTH:          process.env.FF_AUTH          === 'true',
  USE_REFACTORED_INSTAGRAM:     process.env.FF_INSTAGRAM     === 'true',
  USE_REFACTORED_STORAGE:       process.env.FF_STORAGE       === 'true',
  USE_REFACTORED_AI_SERVICES:   process.env.FF_AI            === 'true',
  USE_REFACTORED_PERMISSIONS:   process.env.FF_PERMISSIONS   === 'true',
  USE_MOBILE_OPTIMIZATION_SVC:  process.env.FF_MOBILE        === 'true',
  USE_LAZY_LOADING:             process.env.FF_LAZY_LOADING  === 'true',
} as const;
```

### Percentage-Based Rollout (for user-facing changes)

For client-side changes affecting user experience, a percentage-based rollout uses a deterministic hash of the user ID:

```typescript
function isInRolloutGroup(userId: string, flagKey: string, percentage: number): boolean {
  const hash = createHash('sha256').update(`${userId}:${flagKey}`).digest('hex');
  const bucket = parseInt(hash.substring(0, 8), 16) % 100;
  return bucket < percentage;
}
```

### Flag Naming Convention

| Flag | Controls |
|---|---|
| `FF_AUTOMATION` | AutomationBuilder, AutomationList, CommentSimulator, InstagramPreview |
| `FF_VIDEO` | VideoPromptStep, VideoSettingsStep, VideoScriptEditor, VideoPreview |
| `FF_AUTH` | Shared OAuthController, EmailAuthController, SessionController |
| `FF_INSTAGRAM` | Consolidated InstagramService, webhook handlers |
| `FF_STORAGE` | StorageService, ImageProcessingService, VideoStorageService |
| `FF_AI` | AIServiceManager, provider-specific services |
| `FF_PERMISSIONS` | PermissionService, requirePermission middleware |
| `FF_MOBILE` | MobileOptimizationService |
| `FF_LAZY_LOADING` | React.lazy() route splitting (Phase 4) |

---

## 28.2–28.5 – Rollout Percentages and Monitoring Steps

### Stage 1: 10% Rollout (Tasks 28.1)

**Prerequisites:** All Phase 1–4 tests passing in staging, 24-hour staging validation complete.

```bash
# Enable refactored modules at 10%
FF_AUTOMATION=true
FF_VIDEO=true
FF_AUTH=true
FF_INSTAGRAM=true
FF_STORAGE=true
FF_AI=true
FF_PERMISSIONS=true
FF_MOBILE=true
FF_LAZY_LOADING=true
ROLLOUT_PERCENTAGE=10
```

**Monitor for 48 hours:**
- Error rate: must stay below 0.5% (vs baseline ~0.1%)
- P95 API response time: must not regress by >10%
- Authentication success rate: must stay ≥99%
- Instagram webhook delivery success: must stay ≥98%

**Go/No-Go criteria:** All metrics within bounds → proceed to Stage 2.

---

### Stage 2: 25% Rollout (Task 28.2)

```bash
ROLLOUT_PERCENTAGE=25
```

**Monitor for 48 hours:**
- Same metrics as Stage 1
- Review user feedback channels for reported issues
- Check Sentry/error tracking for new error patterns

**Go/No-Go criteria:** Zero new error patterns, all metrics stable → proceed to Stage 3.

---

### Stage 3: 50% Rollout (Task 28.3)

```bash
ROLLOUT_PERCENTAGE=50
```

**Monitor for 48 hours:**
- A/B comparison: refactored vs original group should show equivalent or better metrics
- Landing page performance: confirm Lighthouse score maintained
- Bundle loading: verify no chunk loading failures (404s on lazy-loaded chunks)

**Go/No-Go criteria:** Equivalent or improved metrics → proceed to Stage 4.

---

### Stage 4: 75% Rollout (Task 28.4)

```bash
ROLLOUT_PERCENTAGE=75
```

**Monitor for 48 hours:**
- Focus on edge cases: mobile users, slow connections, older browsers
- Verify mobile optimizations working via MobileOptimizationService
- Check animation performance on low-end devices

**Go/No-Go criteria:** No regression in any monitored metric → proceed to Stage 5.

---

### Stage 5: 100% Rollout (Task 28.5)

```bash
ROLLOUT_PERCENTAGE=100
```

**Monitor for 72 hours:**
- Full production traffic on refactored code
- Run final Lighthouse audit
- Confirm all quantitative targets met
- Gather team sign-off before proceeding to deprecated code removal

**Go/No-Go criteria:** 72 hours stable → proceed to Task 28.6 (deprecation cleanup).

---

## 28.6 – Deprecated Code to Remove

After 100% rollout is stable (72+ hours with no issues), remove the following deprecated files:

### Client-Side Deprecated Files

```bash
# Original monolithic page components (now replaced by feature modules)
rm client/src/pages/AutomationStepByStep.tsx      # → features/automation/
rm client/src/pages/VideoGeneratorAdvanced.tsx     # → features/video-generator/
# SignUpIntegrated.tsx and VeeGPT.tsx: keep as thin wrappers or remove if routes updated
```

### Server-Side Deprecated Files

```bash
# Duplicate Instagram API files (replaced by instagram.service.ts)
rm server/instagramApi.ts
rm server/instagram-api.ts

# Mobile performance libraries (replaced by MobileOptimizationService)
rm client/src/utils/mobile-excellence.ts
rm client/src/utils/mobile-optimization.ts
rm client/src/utils/mobile-performance.ts
```

### Feature Flag Cleanup

After stable rollout, remove feature flag checks from code:

```typescript
// Before cleanup
if (FeatureFlags.USE_REFACTORED_AI_SERVICES) {
  return aiManager.generateText(prompt);
} else {
  return legacyAIGenerate(prompt);
}

// After cleanup (remove the flag, keep only refactored path)
return aiManager.generateText(prompt);
```

Remove all `FF_*` environment variables from `.env.example` and deployment configs after cleanup is complete.

### Cleanup Checklist

- [ ] Remove `server/instagramApi.ts`
- [ ] Remove `server/instagram-api.ts`
- [ ] Remove `client/src/utils/mobile-excellence.ts`
- [ ] Remove `client/src/utils/mobile-optimization.ts`
- [ ] Remove `client/src/utils/mobile-performance.ts`
- [ ] Remove feature flag code from all service files
- [ ] Remove `ROLLOUT_PERCENTAGE` and `FF_*` env vars from deployment configs
- [ ] Run full test suite to confirm nothing broke after removal
- [ ] Deploy and monitor for 24 hours

---

## Monitoring Dashboard Metrics

For each rollout stage, monitor these key indicators:

| Metric | Tool | Alert Threshold |
|---|---|---|
| Server error rate | Application logs / Sentry | > 0.5% |
| P95 API response time | APM / server logs | Regression > 10% |
| Authentication success rate | Auth service logs | < 99% |
| Bundle load failures (404s) | Browser error tracking | Any 404 on .js chunks |
| Instagram webhook success rate | Webhook logs | < 98% |
| Lighthouse performance score | Manual / CI audit | < 85 |
| Test suite pass rate | CI pipeline | Any failure |

---

## Requirements Traceability

| Requirement | Status |
|---|---|
| 18.1 – Feature flags for gradual rollout | ✅ Defined in this document |
| 18.2 – Old and new implementations maintained until validated | ✅ Feature flag strategy preserves both |
| 18.3 – Phased rollout (10% → 25% → 50% → 75% → 100%) | ✅ Documented in Stages 1–5 |
| 18.4 – 10-week phased implementation | ✅ Phases 1–5 completed |
| 18.5 – Staging validation before production | ✅ Required at each stage |
| 18.6 – Rollback procedures for each module | ✅ See TASK_29_ROLLBACK_PROCEDURES.md |
