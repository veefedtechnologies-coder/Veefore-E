# Migration Guides

This document explains how to update import paths and usage patterns for every module refactored during the codebase refactoring initiative.

---

## Table of Contents

1. [AutomationStepByStep → Automation Feature Module](#1-automationstepbystep--automation-feature-module)
2. [VideoGeneratorAdvanced → Video Generator Feature Module](#2-videogeneratoradvanced--video-generator-feature-module)
3. [Using the New Instagram Service](#3-using-the-new-instagram-service)
4. [Using Shared Auth Modules](#4-using-shared-auth-modules)

---

## 1. AutomationStepByStep → Automation Feature Module

### What Changed

`AutomationStepByStep.tsx` (4,352 lines) was decomposed into six focused modules under `/client/src/features/automation/`.

| Old File | New File | Responsibility |
|----------|----------|----------------|
| `AutomationStepByStep.tsx` | `features/automation/components/AutomationBuilder.tsx` | Orchestrator / main entry point |
| (inline) | `features/automation/components/AutomationList.tsx` | List view with filtering and CRUD |
| (inline) | `features/automation/components/InstagramPreview.tsx` | iPhone mockup + post preview |
| (inline) | `features/automation/components/CommentSimulator.tsx` | Comment automation testing UI |
| (inline) | `features/automation/hooks/useAutomationFlow.ts` | State management for the flow |

### Before

```tsx
import AutomationStepByStep from '@/components/AutomationStepByStep';

// Usage
<AutomationStepByStep workspaceId={workspaceId} />
```

### After

```tsx
import { AutomationBuilder } from '@/features/automation/components/AutomationBuilder';
import { AutomationList } from '@/features/automation/components/AutomationList';
import { useAutomationFlow } from '@/features/automation/hooks/useAutomationFlow';

// Show the builder for creating/editing
<AutomationBuilder workspaceId={workspaceId} onSave={handleSave} />

// Show the list view
<AutomationList workspaceId={workspaceId} onEdit={handleEdit} />

// Or use the hook directly for custom UIs
const { flow, updateTrigger, addAction, validateFlow, saveAutomation } = useAutomationFlow(workspaceId);
```

### Key API Changes

- The monolithic component is now two views: `AutomationBuilder` (create/edit) and `AutomationList` (list)
- State management is exposed via `useAutomationFlow` hook — no need to manage local state in the parent
- `InstagramPreview` and `CommentSimulator` can be imported independently if needed for custom layouts

---

## 2. VideoGeneratorAdvanced → Video Generator Feature Module

### What Changed

`VideoGeneratorAdvanced.tsx` (3,125 lines) was decomposed into five focused modules under `/client/src/features/video-generator/`.

| Old File | New File | Responsibility |
|----------|----------|----------------|
| `VideoGeneratorAdvanced.tsx` | `features/video-generator/components/VideoPromptStep.tsx` | Prompt input + AI generation trigger |
| (inline) | `features/video-generator/components/VideoSettingsStep.tsx` | Duration, aspect ratio, style config |
| (inline) | `features/video-generator/components/VideoScriptEditor.tsx` | Rich text script editing with auto-save |
| (inline) | `features/video-generator/components/VideoPreview.tsx` | Video player with timeline scrubbing |
| (inline) | `features/video-generator/hooks/useVideoGeneration.ts` | Reducer-based state + API calls |

### Before

```tsx
import VideoGeneratorAdvanced from '@/components/VideoGeneratorAdvanced';

<VideoGeneratorAdvanced projectId={projectId} />
```

### After

```tsx
import { useVideoGeneration } from '@/features/video-generator/hooks/useVideoGeneration';
import { VideoPromptStep } from '@/features/video-generator/components/VideoPromptStep';
import { VideoSettingsStep } from '@/features/video-generator/components/VideoSettingsStep';
import { VideoScriptEditor } from '@/features/video-generator/components/VideoScriptEditor';
import { VideoPreview } from '@/features/video-generator/components/VideoPreview';

function VideoGeneratorPage({ projectId }: { projectId: string }) {
  const {
    state,
    generateScript,
    generateVideo,
    updateSettings,
    saveProject,
  } = useVideoGeneration(projectId);

  return (
    <>
      {state.step === 'prompt' && <VideoPromptStep onGenerate={generateScript} />}
      {state.step === 'settings' && <VideoSettingsStep onUpdate={updateSettings} />}
      {state.step === 'script' && <VideoScriptEditor script={state.script} onSave={saveProject} />}
      {state.step === 'preview' && <VideoPreview videoUrl={state.videoUrl} />}
    </>
  );
}
```

### Key API Changes

- Steps are now separate components — use the `state.step` discriminator to render the correct one
- `useVideoGeneration` is the single source of truth for generation state, loading, and error handling
- `VideoScriptEditor` has built-in auto-save (debounced 2s) — no need to implement save logic in the parent

---

## 3. Using the New Instagram Service

### What Changed

`instagramApi.ts` (995 lines) and `instagram-api.ts` (780 lines) were consolidated into a unified service under `/server/features/instagram/`.

| Old File | New File | Responsibility |
|----------|----------|----------------|
| `server/instagramApi.ts` | `server/features/instagram/services/instagram.service.ts` | All Instagram API operations |
| `server/instagram-api.ts` | (merged into above) | Duplicate — removed |
| (inline) | `server/features/instagram/repositories/instagram.repository.ts` | Token storage, DB access |
| (inline) | `server/features/instagram/webhooks/message.webhook.ts` | DM webhook handler |
| (inline) | `server/features/instagram/webhooks/comment.webhook.ts` | Comment webhook handler |
| (inline) | `server/features/instagram/webhooks/media.webhook.ts` | Media webhook handler |

### Before (in route handlers or controllers)

```typescript
import { instagramApi } from '../instagramApi';
// or
import * as instagramAPI from '../instagram-api';

// Publish a post
await instagramApi.publishMedia(accessToken, mediaData);

// Webhook was handled inline in route handler
```

### After

```typescript
import { InstagramService } from '../features/instagram/services/instagram.service';

const instagramService = new InstagramService();

// Publish a post
await instagramService.publishMedia(userId, mediaData);

// Handle a webhook event
await instagramService.processWebhook(webhookPayload, signature);

// Send a DM
await instagramService.sendDirectMessage(userId, recipientId, message);

// Automate a comment response
await instagramService.automateComments(userId, commentRule);
```

### Webhook Handler Registration

The new webhook handlers are registered through a `WebhookRouter`:

```typescript
import { WebhookRouter } from '../features/instagram/webhooks/WebhookRouter';

// In your Express app setup
app.post('/webhooks/instagram', WebhookRouter.handle);
```

### Key API Changes

- Both old files are **removed** — update any direct imports to use `InstagramService`
- Token management is now internal to the service; callers pass `userId` instead of raw access tokens
- Webhook handling is automatic — register `WebhookRouter.handle` on your webhook endpoint

---

## 4. Using Shared Auth Modules

### What Changed

Authentication logic was duplicated between the Main App and Admin Panel. It is now consolidated in two shared locations:

- **`/shared/auth/`** — Client-facing shared auth types and utilities
- **`/server/shared/auth/`** — Server-side shared auth controllers, middleware, and services

### Main App Migration

#### Before

```typescript
// server/auth-routes.ts (old pattern — inline logic)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
  res.json({ token });
});
```

#### After

```typescript
// server/features/auth/routes/auth.routes.ts (new pattern)
import { EmailAuthController } from '../../../server/shared/auth/controllers/EmailAuthController';
import { authenticate } from '../../../server/shared/auth/middleware/authenticate';

const emailAuth = new EmailAuthController();

router.post('/login', emailAuth.login);
router.post('/register', emailAuth.register);
router.post('/password-reset', emailAuth.requestPasswordReset);

// Protect routes
router.get('/profile', authenticate, getProfile);
```

### Admin Panel Migration

#### Before

```typescript
// admin-panel/server/middleware/auth.ts (old — duplicated logic)
export const requireAdmin = (req, res, next) => {
  // 509 lines of auth logic...
};
```

#### After

```typescript
// admin-panel/server/middleware/admin-auth.ts (new — extends shared)
import { authenticate, requireRole } from '../../../server/shared/auth/middleware/authenticate';

// Chain shared middleware with admin-specific role check
export const authenticateAdmin = [authenticate, requireRole('admin')];

router.get('/admin/users', authenticateAdmin, listUsers);
```

### OAuth Migration

```typescript
import { OAuthController } from '../../../server/shared/auth/controllers/OAuthController';

const oauthController = new OAuthController({
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackBaseUrl: process.env.APP_URL,
});

router.get('/auth/google', oauthController.initiateGoogle);
router.get('/auth/google/callback', oauthController.handleGoogleCallback);
```

### JWT / Session Migration

```typescript
import { SessionController } from '../../../server/shared/auth/controllers/SessionController';

const session = new SessionController({
  jwtSecret: process.env.JWT_SECRET,
  redisUrl: process.env.REDIS_URL,
});

// Generate tokens on successful login
const { accessToken, refreshToken } = await session.createSession(userId, { role: 'user' });

// Validate on protected routes (usually handled by authenticate middleware)
const payload = await session.validateAccessToken(token);

// Refresh expired access token
const newTokens = await session.refreshSession(refreshToken);

// Logout (invalidates refresh token in Redis)
await session.destroySession(refreshToken);
```

---

## Summary

| Module | Old Import | New Import |
|--------|-----------|------------|
| Automation UI | `@/components/AutomationStepByStep` | `@/features/automation/components/AutomationBuilder` |
| Video Generator UI | `@/components/VideoGeneratorAdvanced` | `@/features/video-generator/hooks/useVideoGeneration` + step components |
| Instagram API (server) | `../instagramApi` or `../instagram-api` | `../features/instagram/services/instagram.service` |
| Auth middleware | (per-app inline) | `../server/shared/auth/middleware/authenticate` |
| Auth controllers | (per-app inline) | `../server/shared/auth/controllers/EmailAuthController` etc. |

For questions or issues migrating to the new modules, refer to the relevant `README.md` in each feature directory.
