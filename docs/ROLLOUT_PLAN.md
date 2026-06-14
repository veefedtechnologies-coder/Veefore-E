# Gradual Rollout Plan

**Version:** 2.0  
**Last Updated:** 2025-01-01  
**Tasks:** 28.1–28.6

This document describes the feature flag strategy and gradual rollout plan for deploying the refactored Veefore-E codebase to production.

---

## Overview

The refactoring uses feature flags to enable safe, gradual rollout with the ability to:
1. Deploy refactored code to production without activating it for all users
2. Gradually increase rollout percentage while monitoring error rates
3. Instantly roll back to the original implementation if issues are detected

---

## Feature Flag Infrastructure

### Environment Variables

Feature flags are controlled via environment variables:

```bash
# Rollout percentages (0–100)
FEATURE_AUTOMATION_REFACTOR=25     # AutomationBuilder rollout %
FEATURE_VIDEO_GENERATOR_REFACTOR=0
FEATURE_CHAT_REFACTOR=100          # Fully rolled out
FEATURE_AUTH_REFACTOR=50
FEATURE_LANDING_REFACTOR=100       # Fully rolled out
FEATURE_AI_SERVICE_LAYER=75
FEATURE_STORAGE_SERVICE_LAYER=50
FEATURE_INSTAGRAM_SERVICE=25
FEATURE_MOBILE_OPTIMIZATION=100    # Fully rolled out
FEATURE_PERMISSIONS_REFACTOR=100   # Fully rolled out
```

### Feature Flag Client

```typescript
// client/src/shared/utils/featureFlags.ts
export function isFeatureEnabled(flag: string, userId?: string): boolean {
  const percentage = parseInt(import.meta.env[`VITE_${flag}`] ?? '0');
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;
  
  // Deterministic per-user rollout (same user always gets same experience)
  if (userId) {
    const hash = hashUserId(userId) % 100;
    return hash < percentage;
  }
  
  return Math.random() * 100 < percentage;
}
```

### Usage in Components

```tsx
// Switch between old and new implementation
const AutomationPage = () => {
  if (isFeatureEnabled('FEATURE_AUTOMATION_REFACTOR', currentUserId)) {
    return <AutomationBuilder />;  // New refactored component
  }
  return <AutomationStepByStep />; // Legacy component (preserved)
};
```

---

## Rollout Schedule

### Task 28.1 — Initial Deployment (Week 9, Day 1)

Deploy all refactored code to production with flags at 0% (off for all users).

**Verification:**
- All legacy paths still work for 100% of users
- No TypeScript compilation errors
- All CI tests pass
- No increase in error rate

---

### Task 28.2 — Internal Testing (Week 9, Day 2–3)

Enable refactored modules for internal team accounts only.

```bash
# Enable for specific user IDs (internal team)
FEATURE_INTERNAL_USERS=user_arpit,user_team1,user_team2
FEATURE_FLAG_MODE=allowlist  # Override percentage for allowlisted users
```

**Verification:**
- Internal team uses all refactored features for 48 hours
- No critical bugs reported
- Response times within 10% of baseline

---

### Task 28.3 — 10% Rollout (Week 9, Day 4)

Increase rollout to 10% for stable modules.

```bash
FEATURE_LANDING_REFACTOR=10
FEATURE_MOBILE_OPTIMIZATION=10
FEATURE_PERMISSIONS_REFACTOR=10
FEATURE_AI_SERVICE_LAYER=10
```

**Monitoring thresholds:**
- Error rate: < baseline + 0.5%
- P95 response time: < baseline + 200ms
- Monitor for 12 hours before proceeding

---

### Task 28.4 — 25% Rollout (Week 9, Day 5)

Expand stable modules to 25%, introduce remaining modules at 10%.

```bash
FEATURE_LANDING_REFACTOR=25
FEATURE_MOBILE_OPTIMIZATION=25
FEATURE_PERMISSIONS_REFACTOR=25
FEATURE_AI_SERVICE_LAYER=25
FEATURE_STORAGE_SERVICE_LAYER=10
FEATURE_INSTAGRAM_SERVICE=10
FEATURE_AUTH_REFACTOR=10
```

**Monitoring thresholds:** Same as 10% rollout. Monitor for 24 hours.

---

### Task 28.5 — 50% Rollout (Week 10, Day 1)

Move all modules to 50%.

```bash
FEATURE_LANDING_REFACTOR=50
FEATURE_MOBILE_OPTIMIZATION=50
FEATURE_PERMISSIONS_REFACTOR=50
FEATURE_AI_SERVICE_LAYER=50
FEATURE_STORAGE_SERVICE_LAYER=50
FEATURE_INSTAGRAM_SERVICE=50
FEATURE_AUTH_REFACTOR=50
FEATURE_AUTOMATION_REFACTOR=25
FEATURE_VIDEO_GENERATOR_REFACTOR=25
FEATURE_CHAT_REFACTOR=25
```

**Monitoring thresholds:**
- Error rate: < baseline + 0.2%
- No customer-reported issues
- Monitor for 48 hours before proceeding

---

### Task 28.6 — 100% Rollout (Week 10, Day 3+)

Full production rollout. Remove old code in subsequent cleanup PR.

```bash
# All flags at 100%
FEATURE_LANDING_REFACTOR=100
FEATURE_MOBILE_OPTIMIZATION=100
FEATURE_PERMISSIONS_REFACTOR=100
FEATURE_AI_SERVICE_LAYER=100
FEATURE_STORAGE_SERVICE_LAYER=100
FEATURE_INSTAGRAM_SERVICE=100
FEATURE_AUTH_REFACTOR=100
FEATURE_AUTOMATION_REFACTOR=100
FEATURE_VIDEO_GENERATOR_REFACTOR=100
FEATURE_CHAT_REFACTOR=100
```

**Post-rollout cleanup (separate PR after 1 week):**
- Delete legacy component files (AutomationStepByStep.tsx, VeeGPT.tsx, etc.)
- Remove feature flag checks from components
- Remove deprecated mobile library files
- Remove deprecated Instagram API files

---

## Rollback Triggers

Automatically revert a feature flag to 0% if:

| Condition | Action |
|-----------|--------|
| Error rate increases > 1% | Immediate rollback to 0% |
| P95 response time increases > 500ms | Rollback to previous percentage |
| Any P0 bug reported | Immediate rollback to 0% |
| Failed deployment health check | Automatic rollback via CI/CD |

See [ROLLBACK_PROCEDURES.md](./ROLLBACK_PROCEDURES.md) for detailed rollback steps.

---

## Monitoring Dashboard

Track these metrics during rollout:

- **Error rate** — compare old vs new implementation paths
- **Response time** — per-endpoint P50, P95, P99
- **User sessions** — session length and bounce rate on landing page
- **Conversion rate** — signup completion rate during auth rollout
- **Instagram API success rate** — during Instagram service rollout

These can be set up in your monitoring tool (Datadog, Grafana, etc.) using the structured log format described in `docs/MONITORING_SETUP.md`.
