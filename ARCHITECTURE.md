# Veefore-E Architecture

## Overview

Veefore-E is a social media automation and AI content creation platform. The codebase follows a monorepo structure with four top-level packages:

```
Veefore-E/
├── client/          # React SPA (Vite + TypeScript)
├── server/          # Express API server (TypeScript + ESM)
├── admin-panel/     # Separate admin interface (React + Express)
├── shared/          # Shared modules (auth, types, utilities)
└── mobile/          # Mobile application (React Native)
```

---

## Package Responsibilities

### `client/` — Main Application Frontend

The React SPA served to end users. Built with Vite, TypeScript strict mode, Tailwind CSS, and Framer Motion.

**Entry points:**
- `client/src/main.tsx` — React root
- `client/src/App.tsx` — Router with lazy-loaded page routes
- `client/src/AuthenticatedApp.tsx` — Authenticated shell with lazy-loaded dashboard components

All page-level routes use `React.lazy()` for automatic code splitting. The initial app shell is ~47 kB gzip.

### `server/` — Main Application Backend

Express API server using ESM modules and TypeScript. Handles all business logic, third-party integrations, and real-time WebSocket connections.

**Entry point:** `server/index.ts`

### `admin-panel/` — Administrative Interface

A standalone application (separate client + server) for internal administration. Has its own authentication, permission system, and React frontend.

### `shared/` — Cross-Package Modules

Shared code available to both the main app and admin panel:
- `shared/auth/` — Authentication controllers, middleware, session stores
- `shared/types/` — Common TypeScript interfaces and types

---

## Feature Module Organization

Both the server and client are organized around **feature modules** rather than technical layers.

### Server: `/server/features/`

```
server/features/
├── ai/
│   ├── controllers/        # Thin request/response handlers
│   ├── services/           # Business logic (AIServiceManager, OpenAI, Gemini, Perplexity)
│   └── utils/              # promptProcessing, contentGeneration, errorHandling
├── storage/
│   ├── controllers/        # file-upload, image-processing controllers
│   ├── services/           # StorageService, ImageProcessingService, VideoStorageService
│   └── repositories/       # StorageRepository (MongoDB file metadata)
├── instagram/
│   ├── services/           # InstagramService (unified API integration)
│   ├── repositories/       # InstagramRepository (token + data storage)
│   └── webhooks/           # message.webhook.ts, comment.webhook.ts, media.webhook.ts
└── admin/
    ├── middleware/          # requirePermission Express middleware
    ├── permissions/         # permissionDefinitions (all permission constants)
    ├── repositories/        # PermissionRepository
    └── services/            # PermissionService (grant, revoke, check)
```

### Client: `/client/src/features/`

```
client/src/features/
├── automation/
│   ├── components/         # AutomationBuilder, AutomationList, InstagramPreview, CommentSimulator
│   └── hooks/              # useAutomationFlow
├── auth/
│   ├── components/         # SignUpForm, EmailVerification, OnboardingFlow
│   ├── hooks/              # useSignUpFlow
│   └── utils/              # validation.ts (email, password strength, name)
├── chat/
│   ├── components/         # ChatInterface, ConversationSidebar, MessageList
│   ├── hooks/              # useWebSocketChat
│   └── utils/              # markdownConverter
├── landing/
│   ├── animations/         # animationVariants.ts, BetaLaunchAnimation
│   ├── components/         # FeatureCard, StickyScrollContainer
│   ├── hooks/              # useScrollAnimation, useParallaxEffect
│   └── sections/           # HeroSection, FeaturesGrid, PricingSection, TestimonialSection, CTASection
├── settings/
│   └── components/         # ProfileSettings, SecuritySettings, BillingSettings, IntegrationsSettings
└── video-generator/
    ├── components/         # VideoPromptStep, VideoSettingsStep, VideoScriptEditor, VideoPreview
    └── hooks/              # useVideoGeneration
```

### Shared Client Utilities: `/client/src/shared/`

```
client/src/shared/
├── components/             # ErrorBoundary, reusable UI components
├── services/               # MobileOptimizationService
└── utils/mobile/           # touchHandlers, responsive, performance
```

---

## Key Architectural Patterns

### 1. Service Layer (Server)

Business logic lives in service classes, never in route handlers or controllers.

```
Route Handler → Controller → Service → Repository → Database
```

- **Routes** (`server/routes/`) — Register Express handlers, apply middleware
- **Controllers** — Parse request, call service, format response (no business logic)
- **Services** — All business logic, orchestration, external API calls
- **Repositories** — All database queries abstracted behind an interface

Example: AI text generation request flow
```
POST /api/ai/generate-text
  → text-generation.controller.ts    (parse body, call service, return JSON)
  → ai-manager.service.ts            (select provider, delegate)
  → openai.service.ts                (call OpenAI API, handle retries)
```

### 2. Repository Pattern (Server)

Database interactions are abstracted behind repository interfaces. This isolates MongoDB/Redis logic and makes services testable without a real database.

```typescript
interface IStorageRepository {
  saveFileMetadata(file: FileMetadata): Promise<FileRecord>;
  getFileById(id: string): Promise<FileRecord | null>;
  deleteFile(id: string): Promise<void>;
}
```

### 3. Custom Hooks (Client)

Complex state management and side effects are extracted into custom hooks, keeping components focused on rendering.

```typescript
// Component uses hook, doesn't manage state directly
const { generateScript, status, error } = useVideoGeneration();
```

### 4. Route-Based Code Splitting (Client)

Every page component is wrapped in `React.lazy()`. The build produces 60+ individual chunks, each loaded only when the user navigates to that route.

```typescript
const VideoGeneratorAdvanced = React.lazy(
  () => import('./pages/VideoGeneratorAdvanced')
);
```

### 5. Centralized Error Handling (Server)

All errors are caught by a central middleware rather than being handled per-route:

```
server/shared/errors/          # Typed error classes (AppError, ValidationError, etc.)
server/shared/middleware/
  errorHandler.ts              # centralErrorHandler (4-arg Express middleware)
  asyncHandler.ts              # Wraps async route handlers, forwards errors
```

### 6. Shared Authentication (Shared Package)

Authentication logic is shared between the main app and admin panel:

```
shared/auth/
├── controllers/
│   ├── OAuthController.ts      # Google, Facebook, Instagram OAuth
│   ├── EmailAuthController.ts  # Email/password with bcrypt
│   └── SessionController.ts    # JWT generation, validation, refresh
└── middleware/
    └── authenticate.ts         # JWT validation + RBAC middleware
```

---

## Build and Tooling

| Tool | Purpose |
|---|---|
| Vite | Client bundler with manual chunk splitting |
| esbuild | Server production bundle |
| tsx watch | Server development with hot reload |
| Vitest | Unit and integration tests (server + client) |
| fast-check | Property-based testing |
| ESLint + Prettier | Code quality, enforced via Husky pre-commit |
| TypeScript strict | Enabled for all packages |

**Build commands:**
```bash
npm run build          # Build client + server (sequential)
npm run build:parallel # Build client + server (concurrent)
npm run test           # Run server test suite (vitest run)
npm run lint           # ESLint with TypeScript rules
```

---

## Navigating the Refactored Codebase

**Finding a feature's server code:**
Look in `server/features/<domain>/`. Each domain has `services/`, `controllers/`, and `repositories/` subdirectories.

**Finding a feature's client code:**
Look in `client/src/features/<domain>/`. Each domain has `components/`, `hooks/`, and optionally `utils/` and `animations/` subdirectories.

**Finding shared utilities:**
- Server shared: `server/shared/` (errors, middleware, auth stores)
- Client shared: `client/src/shared/` (MobileOptimizationService, ErrorBoundary)
- Cross-package: `shared/` (auth controllers, common types)

**Finding tests:**
Tests are co-located with source files using `.test.ts` / `.test.tsx` suffixes, or in `__tests__/` subdirectories within the same feature folder.

---

## Architectural Decision Records

Key decisions made during the refactoring initiative:

| Decision | Rationale |
|---|---|
| Feature module structure over layered architecture | Enables independent development and deployment of features; related code stays together |
| Service/repository pattern | Separates business logic from infrastructure; enables unit testing without database |
| `React.lazy()` for all routes | Reduces initial bundle to ~47 kB gzip from a potential 3+ MB monolithic bundle |
| Shared `auth/` package | Eliminates duplicated authentication logic between main app and admin panel |
| Vitest over Jest | Native ESM support; faster execution; works with the existing Vite setup |
| fast-check for property-based tests | Validates invariants across arbitrary inputs; catches edge cases unit tests miss |
