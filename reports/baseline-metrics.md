# Baseline Metrics Report

**Generated:** 6/13/2026, 5:47:50 PM

## Overall Statistics

- **Total Files Analyzed:** 740
- **Average File Size:** 10,874 lines
- **Total Bundle Size:** 7.67 MB
- **Code Duplication:** 0.00%

## Files by Category

| Category | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 25 | Files >1000 lines |
| 🟠 HIGH | 77 | Files 500-1000 lines |
| 🟡 MEDIUM | 139 | Files 300-500 lines |
| 🟢 LOW | 499 | Files <300 lines |

## Top 20 Largest Files (Refactoring Priority)

| # | File | Lines | Functions | Classes | Complexity |
|---|------|-------|-----------|---------|------------|
| 1 | client/src/pages/AutomationStepByStep.tsx | 4353 | 221 | 0 | 468 |
| 2 | client/src/pages/VideoGeneratorAdvanced.tsx | 3126 | 163 | 0 | 185 |
| 3 | client/src/pages/SignUpIntegrated.tsx | 2420 | 98 | 0 | 212 |
| 4 | server/routes/v1/ai.routes.ts | 2370 | 34 | 0 | 283 |
| 5 | client/src/pages/VeeGPT.tsx | 2366 | 155 | 0 | 252 |
| 6 | client/src/components/settings/SettingsTabs.tsx | 2303 | 135 | 0 | 188 |
| 7 | server/storage.ts | 1993 | 78 | 1 | 130 |
| 8 | client/src/pages/Landing.tsx | 1972 | 66 | 0 | 73 |
| 9 | client/src/pages/WaitlistPage.tsx | 1962 | 82 | 0 | 166 |
| 10 | server/mongodb-storage.ts | 1780 | 39 | 1 | 195 |
| 11 | client/src/components/create/create-post.tsx | 1762 | 114 | 0 | 270 |
| 12 | server/index.ts | 1743 | 73 | 0 | 239 |
| 13 | server/services/AuthenticityScorer.ts | 1721 | 76 | 1 | 284 |
| 14 | server/services/VoiceProfileService.ts | 1661 | 75 | 1 | 196 |
| 15 | server/services/EngagementPredictor.ts | 1608 | 21 | 1 | 147 |
| 16 | server/services/PromptConstructorService.ts | 1555 | 18 | 1 | 123 |
| 17 | server/ai-content-generator.ts | 1550 | 32 | 1 | 204 |
| 18 | server/domain/types.ts | 1547 | 0 | 0 | 1 |
| 19 | client/src/lib/frontend-performance.tsx | 1300 | 71 | 1 | 122 |
| 20 | client/src/pages/SignIn.tsx | 1269 | 43 | 0 | 74 |

## Critical Files Requiring Immediate Refactoring

### client/src/pages/AutomationStepByStep.tsx
- **Lines:** 4353
- **Functions:** 221
- **Classes:** 0
- **Cyclomatic Complexity:** 468
- **Category:** CRITICAL

### client/src/pages/VideoGeneratorAdvanced.tsx
- **Lines:** 3126
- **Functions:** 163
- **Classes:** 0
- **Cyclomatic Complexity:** 185
- **Category:** CRITICAL

### client/src/pages/SignUpIntegrated.tsx
- **Lines:** 2420
- **Functions:** 98
- **Classes:** 0
- **Cyclomatic Complexity:** 212
- **Category:** CRITICAL

### server/routes/v1/ai.routes.ts
- **Lines:** 2370
- **Functions:** 34
- **Classes:** 0
- **Cyclomatic Complexity:** 283
- **Category:** CRITICAL

### client/src/pages/VeeGPT.tsx
- **Lines:** 2366
- **Functions:** 155
- **Classes:** 0
- **Cyclomatic Complexity:** 252
- **Category:** CRITICAL

### client/src/components/settings/SettingsTabs.tsx
- **Lines:** 2303
- **Functions:** 135
- **Classes:** 0
- **Cyclomatic Complexity:** 188
- **Category:** CRITICAL

### server/storage.ts
- **Lines:** 1993
- **Functions:** 78
- **Classes:** 1
- **Cyclomatic Complexity:** 130
- **Category:** CRITICAL

### client/src/pages/Landing.tsx
- **Lines:** 1972
- **Functions:** 66
- **Classes:** 0
- **Cyclomatic Complexity:** 73
- **Category:** CRITICAL

### client/src/pages/WaitlistPage.tsx
- **Lines:** 1962
- **Functions:** 82
- **Classes:** 0
- **Cyclomatic Complexity:** 166
- **Category:** CRITICAL

### server/mongodb-storage.ts
- **Lines:** 1780
- **Functions:** 39
- **Classes:** 1
- **Cyclomatic Complexity:** 195
- **Category:** CRITICAL

### client/src/components/create/create-post.tsx
- **Lines:** 1762
- **Functions:** 114
- **Classes:** 0
- **Cyclomatic Complexity:** 270
- **Category:** CRITICAL

### server/index.ts
- **Lines:** 1743
- **Functions:** 73
- **Classes:** 0
- **Cyclomatic Complexity:** 239
- **Category:** CRITICAL

### server/services/AuthenticityScorer.ts
- **Lines:** 1721
- **Functions:** 76
- **Classes:** 1
- **Cyclomatic Complexity:** 284
- **Category:** CRITICAL

### server/services/VoiceProfileService.ts
- **Lines:** 1661
- **Functions:** 75
- **Classes:** 1
- **Cyclomatic Complexity:** 196
- **Category:** CRITICAL

### server/services/EngagementPredictor.ts
- **Lines:** 1608
- **Functions:** 21
- **Classes:** 1
- **Cyclomatic Complexity:** 147
- **Category:** CRITICAL

### server/services/PromptConstructorService.ts
- **Lines:** 1555
- **Functions:** 18
- **Classes:** 1
- **Cyclomatic Complexity:** 123
- **Category:** CRITICAL

### server/ai-content-generator.ts
- **Lines:** 1550
- **Functions:** 32
- **Classes:** 1
- **Cyclomatic Complexity:** 204
- **Category:** CRITICAL

### server/domain/types.ts
- **Lines:** 1547
- **Functions:** 0
- **Classes:** 0
- **Cyclomatic Complexity:** 1
- **Category:** CRITICAL

### client/src/lib/frontend-performance.tsx
- **Lines:** 1300
- **Functions:** 71
- **Classes:** 1
- **Cyclomatic Complexity:** 122
- **Category:** CRITICAL

### client/src/pages/SignIn.tsx
- **Lines:** 1269
- **Functions:** 43
- **Classes:** 0
- **Cyclomatic Complexity:** 74
- **Category:** CRITICAL

### client/src/components/ui/skeleton.tsx
- **Lines:** 1152
- **Functions:** 56
- **Classes:** 0
- **Cyclomatic Complexity:** 29
- **Category:** CRITICAL

### server/services/HashtagGeneratorService.ts
- **Lines:** 1073
- **Functions:** 39
- **Classes:** 1
- **Cyclomatic Complexity:** 65
- **Category:** CRITICAL

### server/video-routes.ts
- **Lines:** 1033
- **Functions:** 44
- **Classes:** 0
- **Cyclomatic Complexity:** 105
- **Category:** CRITICAL

### server/routes/auth.ts
- **Lines:** 1031
- **Functions:** 9
- **Classes:** 0
- **Cyclomatic Complexity:** 94
- **Category:** CRITICAL

### client/src/components/waitlist/WaitlistModal.tsx
- **Lines:** 1028
- **Functions:** 68
- **Classes:** 0
- **Cyclomatic Complexity:** 130
- **Category:** CRITICAL

