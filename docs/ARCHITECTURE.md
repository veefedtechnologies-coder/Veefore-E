# Veefore-E Architecture Documentation

**Version:** 2.0 (Post-Refactoring)  
**Last Updated:** 2025-01-01  
**Phase:** 5 — Documentation Completion

---

## Overview

Veefore-E follows a feature-based, layered architecture separating client and server concerns. The refactoring initiative (Tasks 1–30) transformed the codebase from a collection of monolithic files (30+ files >1,000 lines) into a modular, domain-driven structure with clear separation of concerns.

---

## Directory Structure

### Client (`/client/src/`)

```
client/src/
├── features/                    # Feature modules (domain-driven)
│   ├── automation/
│   │   ├── components/          # UI components (AutomationBuilder, AutomationList, etc.)
│   │   ├── hooks/               # useAutomationFlow, useInstagramSimulation
│   │   ├── services/            # Client-side automation service
│   │   └── types/               # TypeScript interfaces
│   ├── video-generator/
│   │   ├── components/          # VideoPromptStep, VideoSettingsStep, VideoScriptEditor, VideoPreview
│   │   ├── hooks/               # useVideoGeneration
│   │   └── types/
│   ├── chat/
│   │   ├── components/          # ChatInterface, ConversationSidebar, MessageList
│   │   ├── hooks/               # useWebSocketChat
│   │   ├── services/
│   │   └── utils/               # markdownConverter
│   ├── auth/
│   │   ├── components/          # SignUpForm, EmailVerification, OnboardingFlow
│   │   ├── hooks/               # useSignUpFlow
│   │   └── utils/               # validation.ts
│   ├── settings/
│   │   ├── components/          # ProfileSettings, SecuritySettings, BillingSettings, IntegrationsSettings
│   │   └── hooks/               # useProfileSettings, useBillingSettings
│   └── landing/
│       ├── sections/            # HeroSection, FeaturesGrid, PricingSection, TestimonialSection, CTASection
│       ├── components/          # FeatureCard, StickyScrollContainer
│       ├── hooks/               # useScrollAnimation, useParallaxEffect
│       └── animations/          # animationVariants.ts, BetaLaunchAnimation
│
├── shared/
│   ├── components/              # Reusable UI components (Button, Card, Modal, Form)
│   ├── hooks/                   # Reusable cross-feature hooks
│   ├── services/                # MobileOptimizationService
│   ├── types/                   # Shared TypeScript types
│   └── utils/
│       └── mobile/              # touchHandlers, responsive, performance
│
└── pages/                       # Route-level page components (thin wrappers)
```

### Server (`/server/`)

```
server/
├── features/                    # Feature modules (domain-driven)
│   ├── ai/
│   │   ├── controllers/         # text-generation, image-generation, caption-analysis
│   │   ├── services/            # ai-manager, openai, gemini, perplexity
│   │   └── utils/               # promptProcessing, contentGeneration, errorHandling
│   ├── storage/
│   │   ├── controllers/         # file-upload, image-processing
│   │   ├── services/            # storage.service, image-processing, video-storage
│   │   └── repositories/        # storage.repository
│   ├── instagram/
│   │   ├── controllers/         # instagram.controller, webhook.controller
│   │   ├── services/            # instagram.service, publishing, messaging, automation
│   │   ├── repositories/        # instagram.repository
│   │   └── webhooks/            # message, comment, media webhook handlers
│   └── admin/
│       ├── services/            # permission.service
│       ├── middleware/          # admin.middleware
│       └── utils/               # permissionDefinitions, permissionChecker
│
└── shared/
    ├── auth/                    # Consolidated auth middleware
    ├── types/
    ├── schemas/
    └── errors/                  # Typed error classes

shared/                          # Top-level shared package
└── auth/
    ├── controllers/             # OAuthController, EmailAuthController, SessionController
    └── middleware/              # authenticate.ts
```

---

## Service Layer Pattern

All server modules follow a strict three-layer architecture:

```
HTTP Request
     │
     ▼
┌─────────────┐
│  Controller  │  — Handles HTTP request/response only
│              │  — Validates input shape
│              │  — Delegates to service
└──────┬───────┘
       │
       ▼
┌─────────────┐
│   Service    │  — Contains all business logic
│              │  — Orchestrates multiple repositories
│              │  — Handles transactions, validation, errors
└──────┬───────┘
       │
       ▼
┌─────────────┐
│ Repository   │  — Abstracts all data access (MongoDB, Redis, external APIs)
│              │  — No business logic
│              │  — Returns typed domain objects
└──────┬───────┘
       │
       ▼
  Data Store (MongoDB / Redis / AWS S3 / Instagram API)
```

### Example: AI Feature

```typescript
// Controller — only HTTP concerns
export const generateText = async (req: Request, res: Response) => {
  const { prompt, provider } = req.body;
  const result = await aiManager.generateText(prompt, provider);
  res.json(result);
};

// Service — business logic
export class AIServiceManager {
  async generateText(prompt: string, provider?: string): Promise<TextResult> {
    const selectedProvider = this.selectProvider(provider);
    return selectedProvider.generateText(prompt);
  }
}

// Repository / Provider — external API abstraction
export class OpenAIService implements IAIProvider {
  async generateText(prompt: string): Promise<TextResult> {
    const response = await this.openai.chat.completions.create({ ... });
    return this.parseResponse(response);
  }
}
```

---

## Shared Modules

### `/shared/auth/`

Shared authentication package used by both Main App and Admin Panel.

| Module | Responsibility |
|--------|---------------|
| `OAuthController` | Google, Facebook, Instagram OAuth flows |
| `EmailAuthController` | Email/password login, hashing, password reset |
| `SessionController` | JWT generation, validation, refresh, Redis storage |
| `middleware/authenticate.ts` | JWT validation + RBAC middleware |

### `/client/src/shared/`

Client-side shared modules used across feature domains.

| Module | Responsibility |
|--------|---------------|
| `services/MobileOptimizationService.ts` | Unified mobile detection, breakpoints, touch handling |
| `utils/mobile/touchHandlers.ts` | Gesture detection, swipe handlers |
| `utils/mobile/responsive.ts` | Breakpoint utilities, media query helpers |
| `utils/mobile/performance.ts` | Network monitoring, adaptive loading |

### `/server/shared/`

Server-side shared infrastructure.

| Module | Responsibility |
|--------|---------------|
| `errors/` | Typed error classes (ValidationError, AuthError, NotFoundError, ExternalServiceError) |
| `schemas/` | Shared Zod/validation schemas |
| `types/` | Shared TypeScript interfaces |

---

## Error Handling System

The refactored codebase uses a centralized error handling approach:

### Typed Error Classes

```typescript
class ValidationError extends AppError { statusCode = 400 }
class AuthenticationError extends AppError { statusCode = 401 }
class AuthorizationError extends AppError { statusCode = 403 }
class NotFoundError extends AppError { statusCode = 404 }
class ExternalServiceError extends AppError { statusCode = 502 }
```

### Express Error Middleware

All controllers use `next(error)` to propagate errors to a centralized handler that:
1. Maps error type to HTTP status code
2. Formats a consistent JSON error response
3. Logs error with request context (request ID, user ID, stack trace)

### Client Error Boundaries

React error boundary components wrap feature modules to prevent full-page crashes and display user-friendly fallback UI.

---

## Bundle Optimization Approach

### Code Splitting Strategy

1. **Route-based splitting** — Every page-level component is lazy-loaded with `React.lazy()`
2. **Section-level splitting** — Large page sections (landing page) are independently lazy-loaded
3. **Vendor chunk separation** — Third-party libraries (Framer Motion, chart libs, video players) are in separate chunks
4. **Dynamic imports** — Heavy utilities loaded on-demand

### Landing Page Example

```tsx
// Landing.tsx — ~150 lines orchestrator
const HeroSection = lazy(() => import('./sections/HeroSection'));
const FeaturesGrid = lazy(() => import('./sections/FeaturesGrid'));
const PricingSection = lazy(() => import('./sections/PricingSection'));

export const Landing = () => (
  <>
    <Suspense fallback={<HeroSkeleton />}>
      <HeroSection />
    </Suspense>
    <Suspense fallback={<ContentSkeleton />}>
      <FeaturesGrid />
      <PricingSection />
    </Suspense>
  </>
);
```

### Animation Performance

- All animations use `transform` and `opacity` (GPU-accelerated)
- `will-change` applied strategically to animated elements
- `useReducedMotion` hook respects accessibility preferences
- IntersectionObserver triggers animations only on viewport entry

---

## Key Architectural Principles

1. **Single Responsibility** — Each file/module has one clear reason to change
2. **Dependency Inversion** — Modules depend on interfaces, not concrete implementations
3. **DRY** — Shared logic lives in shared modules, never duplicated
4. **File Size Limit** — All files target <500 lines; critical files refactored to <300 lines
5. **TypeScript Strict** — All refactored code uses strict TypeScript with no `any` types
6. **Testability** — All business logic in services/hooks (not controllers/components) for easy unit testing

---

## Related Documents

- [Migration Guide](./MIGRATION_GUIDE.md)
- [API Documentation](./API_DOCUMENTATION.md)
- [ADR-001: Service Layer](./adr/ADR-001-service-layer.md)
- [ADR-002: Code Consolidation](./adr/ADR-002-code-consolidation.md)
- [ADR-003: Bundle Optimization](./adr/ADR-003-bundle-optimization.md)
