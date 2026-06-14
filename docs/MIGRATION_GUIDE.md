# Migration Guide

**Version:** 2.0 (Post-Refactoring)  
**Last Updated:** 2025-01-01

This guide documents what changed in the Veefore-E codebase refactoring and how to update imports and usage patterns.

---

## Table of Contents

1. [Automation Module](#1-automation-module)
2. [Video Generator Module](#2-video-generator-module)
3. [Instagram API Consolidation](#3-instagram-api-consolidation)
4. [Auth Consolidation](#4-auth-consolidation)
5. [AI Routes → Feature Module](#5-ai-routes--feature-module)
6. [Storage Module](#6-storage-module)
7. [Permissions Module](#7-permissions-module)
8. [Mobile Libraries](#8-mobile-libraries)
9. [Landing Page](#9-landing-page)
10. [Settings Module](#10-settings-module)
11. [Chat Module](#11-chat-module)

---

## 1. Automation Module

**Before:** `client/src/components/AutomationStepByStep.tsx` (4,352 lines)

**After:** `/client/src/features/automation/`

```
features/automation/
├── components/
│   ├── AutomationBuilder.tsx    ← main orchestrator (~500 lines)
│   ├── AutomationList.tsx       ← list view with filters
│   ├── InstagramPreview.tsx     ← preview mockup
│   └── CommentSimulator.tsx     ← simulation interface
├── hooks/
│   ├── useAutomationFlow.ts     ← state machine for flow creation
│   └── useInstagramSimulation.ts
└── types/
    └── automation.types.ts
```

**Import Migration:**

```typescript
// Before
import AutomationStepByStep from '@/components/AutomationStepByStep';

// After
import { AutomationBuilder } from '@/features/automation/components/AutomationBuilder';
import { AutomationList } from '@/features/automation/components/AutomationList';
import { useAutomationFlow } from '@/features/automation/hooks/useAutomationFlow';
```

---

## 2. Video Generator Module

**Before:** `client/src/components/VideoGeneratorAdvanced.tsx` (3,125 lines)

**After:** `/client/src/features/video-generator/`

```
features/video-generator/
├── components/
│   ├── VideoPromptStep.tsx      ← prompt input + AI generation
│   ├── VideoSettingsStep.tsx    ← duration, aspect ratio, style
│   ├── VideoScriptEditor.tsx    ← rich text script editor
│   └── VideoPreview.tsx         ← player with timeline controls
├── hooks/
│   └── useVideoGeneration.ts   ← reducer-based state management
└── types/
    └── video.types.ts
```

**Import Migration:**

```typescript
// Before
import VideoGeneratorAdvanced from '@/components/VideoGeneratorAdvanced';

// After
import { VideoPromptStep } from '@/features/video-generator/components/VideoPromptStep';
import { VideoPreview } from '@/features/video-generator/components/VideoPreview';
import { useVideoGeneration } from '@/features/video-generator/hooks/useVideoGeneration';
```

---

## 3. Instagram API Consolidation

**Before:**
- `server/instagramApi.ts` (995 lines)
- `server/instagram-api.ts` (780 lines)

**After:** `/server/features/instagram/`

```
features/instagram/
├── services/
│   ├── instagram.service.ts         ← main service (IInstagramService)
│   ├── instagram-publishing.service.ts
│   ├── instagram-messaging.service.ts
│   └── instagram-automation.service.ts
├── repositories/
│   └── instagram.repository.ts      ← DB + API abstraction
├── controllers/
│   ├── instagram.controller.ts
│   └── webhook.controller.ts
└── webhooks/
    ├── message.webhook.ts
    ├── comment.webhook.ts
    └── media.webhook.ts
```

**Import Migration:**

```typescript
// Before (anywhere in server)
import { publishToInstagram } from '../instagramApi';
import { handleWebhook } from '../instagram-api';

// After — use the service via DI or direct import
import { InstagramService } from './features/instagram/services/instagram.service';

// Methods preserved:
// instagramService.publishMedia(userId, mediaPayload)
// instagramService.processWebhook(event)
// instagramService.sendDirectMessage(userId, recipientId, message)
// instagramService.automateComments(userId, config)
```

**Removed files** (after migration verified):
- `server/instagramApi.ts`
- `server/instagram-api.ts`

---

## 4. Auth Consolidation

**Before:**
- `server/middleware/auth.ts` (Main App)
- `admin-panel/server/middleware/auth.ts` (Admin Panel — 509 lines)
- Authentication logic duplicated in both apps

**After:** `/shared/auth/`

```
shared/auth/
├── controllers/
│   ├── OAuthController.ts        ← Google, Facebook, Instagram OAuth
│   ├── EmailAuthController.ts    ← email/password, hashing, reset
│   └── SessionController.ts     ← JWT + Redis session management
└── middleware/
    └── authenticate.ts          ← JWT validation + RBAC middleware
```

**Import Migration:**

```typescript
// Before (Main App)
import { authenticateJWT } from '../middleware/auth';

// Before (Admin Panel)  
import { adminAuth } from '../middleware/auth';

// After (both apps)
import { authenticate } from '../../shared/auth/middleware/authenticate';
import { OAuthController } from '../../shared/auth/controllers/OAuthController';
import { SessionController } from '../../shared/auth/controllers/SessionController';
```

**Backward Compatibility:** Existing JWT tokens and sessions remain valid. No re-login required for active users.

---

## 5. AI Routes → Feature Module

**Before:** `server/routes/v1/ai.routes.ts` (2,369 lines — business logic in routes)

**After:** `/server/features/ai/`

```
features/ai/
├── controllers/
│   ├── text-generation.controller.ts
│   ├── image-generation.controller.ts
│   └── caption-analysis.controller.ts
├── services/
│   ├── ai-manager.service.ts    ← orchestrator
│   ├── openai.service.ts
│   ├── gemini.service.ts
│   └── perplexity.service.ts
└── utils/
    ├── promptProcessing.ts
    ├── contentGeneration.ts
    └── errorHandling.ts
```

**Route Configuration:**

```typescript
// ai.routes.ts now thin routing only
import { generateText } from '../features/ai/controllers/text-generation.controller';
import { generateImage } from '../features/ai/controllers/image-generation.controller';

router.post('/generate/text', authenticate, generateText);
router.post('/generate/image', authenticate, generateImage);
```

**API endpoints unchanged** — same URLs, same request/response shapes.

---

## 6. Storage Module

**Before:** `server/storage.ts` (1,992 lines)

**After:** `/server/features/storage/`

```
features/storage/
├── controllers/
│   ├── file-upload.controller.ts
│   └── image-processing.controller.ts
├── services/
│   ├── storage.service.ts         ← AWS S3 upload/delete/signed URLs
│   ├── image-processing.service.ts ← Sharp resize/compress/convert
│   └── video-storage.service.ts   ← video upload + transcoding
└── repositories/
    └── storage.repository.ts      ← MongoDB file metadata
```

**Import Migration:**

```typescript
// Before
import { uploadFile, deleteFile, processImage } from '../storage';

// After
import { StorageService } from './features/storage/services/storage.service';
import { ImageProcessingService } from './features/storage/services/image-processing.service';

// Methods preserved:
// storageService.uploadFile(file, options)
// storageService.deleteFile(fileId)
// storageService.getSignedUrl(fileId, expirySeconds)
// imageService.resize(buffer, width, height)
// imageService.compress(buffer, quality)
// imageService.convertFormat(buffer, format)
```

---

## 7. Permissions Module

**Before:** `server/permissions.ts` (1,020 lines — definitions + logic + middleware mixed)

**After:** `/server/features/admin/`

```
features/admin/
├── services/
│   └── permission.service.ts
├── middleware/
│   └── admin.middleware.ts
└── utils/
    ├── permissionDefinitions.ts   ← constants and role mappings
    └── permissionChecker.ts       ← pure permission check functions
```

**Import Migration:**

```typescript
// Before
import { checkPermission, PERMISSIONS } from '../permissions';

// After
import { PERMISSIONS } from './features/admin/utils/permissionDefinitions';
import { checkPermission } from './features/admin/utils/permissionChecker';
import { requirePermission } from './features/admin/middleware/admin.middleware';
```

---

## 8. Mobile Libraries

**Before:**
- `client/src/lib/mobile-excellence.ts` (714 lines)
- `client/src/lib/mobile-optimization.ts` (665 lines)
- `client/src/lib/mobile-performance.ts` (640 lines)

**After:** `/client/src/shared/`

```
shared/
├── services/
│   └── MobileOptimizationService.ts   ← unified service class
└── utils/mobile/
    ├── touchHandlers.ts               ← gesture detection, swipe
    ├── responsive.ts                  ← breakpoints, media queries
    └── performance.ts                 ← network monitoring, adaptive loading
```

**Import Migration:**

```typescript
// Before
import { isMobile, detectOS } from '@/lib/mobile-excellence';
import { getBreakpoint } from '@/lib/mobile-optimization';

// After
import { MobileOptimizationService } from '@/shared/services/MobileOptimizationService';
// or for tree-shakeable utilities:
import { isMobile, detectOS } from '@/shared/utils/mobile/responsive';
import { getBreakpoint } from '@/shared/utils/mobile/responsive';
```

---

## 9. Landing Page

**Before:** `client/src/pages/Landing.tsx` (1,971 lines)

**After:** `/client/src/features/landing/`

All sections are lazy-loaded individually. The page orchestrator is now ~150 lines.

**No consumer changes needed** — routing points to the same `Landing` export.

---

## 10. Settings Module

**Before:** `client/src/components/settings/SettingsTabs.tsx` (2,302 lines)

**After:** `/client/src/features/settings/`

Each settings category is now an independent component. The `SettingsLayout` manages tab navigation.

---

## 11. Chat Module

**Before:** `client/src/pages/VeeGPT.tsx` (2,365 lines)

**After:** `/client/src/features/chat/`

WebSocket logic is now isolated in `useWebSocketChat` hook. Markdown rendering is in `utils/markdownConverter.ts`.

---

## General Migration Checklist

When updating a file that imports from a deprecated path:

- [ ] Replace import path with new feature module path
- [ ] Check that all previously used exports are still available
- [ ] Run `npx tsc --noEmit` to verify type safety
- [ ] Run affected test suite
- [ ] Remove the old import if the old file has been deleted

For questions about specific migrations, see the [Architecture documentation](./ARCHITECTURE.md).
