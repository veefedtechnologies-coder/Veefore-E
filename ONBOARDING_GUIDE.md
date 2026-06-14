# Onboarding Guide for New Developers

Welcome to Veefore-E. This guide gets you productive quickly by explaining how the codebase is organized, the patterns to follow, and how to run the project.

---

## Table of Contents

1. [Project Structure Overview](#1-project-structure-overview)
2. [Key Patterns to Follow](#2-key-patterns-to-follow)
3. [How to Add a New Feature](#3-how-to-add-a-new-feature)
4. [How to Run Tests, Lint, and Build](#4-how-to-run-tests-lint-and-build)
5. [Environment Setup](#5-environment-setup)
6. [Where to Find Things](#6-where-to-find-things)

---

## 1. Project Structure Overview

Veefore-E is a full-stack monorepo:

```
Veefore-E/
├── client/                 — React + Vite frontend
│   └── src/
│       ├── features/       — Feature modules (one directory per feature)
│       │   ├── automation/     — Instagram automation builder
│       │   ├── video-generator/ — AI video generation workflow
│       │   ├── chat/           — VeeGPT chat interface
│       │   ├── auth/           — Signup, login, OAuth
│       │   ├── settings/       — User settings tabs
│       │   └── landing/        — Public marketing page
│       ├── shared/         — Truly shared cross-feature code
│       │   ├── components/ — Generic UI primitives
│       │   ├── hooks/      — Generic hooks (useDebounce etc.)
│       │   ├── services/   — MobileOptimizationService etc.
│       │   └── types/      — Shared TypeScript types
│       └── pages/          — Route entry points (thin wrappers)
│
├── server/                 — Express + Node.js backend
│   ├── features/           — Feature domains (mirroring client)
│   │   ├── ai/             — AI generation services
│   │   ├── instagram/      — Instagram API and webhooks
│   │   └── storage/        — File upload and processing
│   └── shared/             — Shared server modules
│       ├── auth/           — Shared authentication (see README)
│       ├── errors/         — Typed error classes
│       └── middleware/     — Global Express middleware
│
├── shared/                 — Shared between client and server
│   └── auth/               — Auth types and utilities
│
├── admin-panel/            — Separate admin application
│   ├── client/
│   └── server/
│
└── docs/
    ├── adr/                — Architectural decision records
    └── ARCHITECTURE.md
```

### The Core Idea: Feature Modules

Code is organized by **feature**, not by file type. If you are working on the automation feature, everything you need is in `client/src/features/automation/` (components, hooks, utils) and `server/features/instagram/` (services, repositories, webhooks).

You should rarely need to leave those directories to implement a feature change.

---

## 2. Key Patterns to Follow

### Client-Side Patterns

#### Feature Module Structure

Every feature follows this structure:

```
features/my-feature/
├── components/       — React components (presentation)
├── hooks/            — Custom React hooks (state + logic)
├── utils/            — Pure utility functions
└── index.ts          — Public exports for the feature
```

**Rule:** Keep component files under 500 lines. If a component grows beyond that, extract a hook for its logic or split into sub-components.

#### Custom Hooks for State and Logic

Business logic lives in custom hooks, not inside components:

```tsx
// ✅ Good — logic in hook, component is clean
function AutomationPage({ workspaceId }: { workspaceId: string }) {
  const { flow, updateTrigger, addAction, saveAutomation } = useAutomationFlow(workspaceId);
  return <AutomationBuilder flow={flow} onTriggerChange={updateTrigger} />;
}

// ❌ Avoid — complex logic inline in component
function AutomationPage({ workspaceId }: { workspaceId: string }) {
  const [flow, setFlow] = useState(...);
  const [loading, setLoading] = useState(false);
  // 200 lines of state management inline...
}
```

#### Error Boundaries

Wrap feature routes in error boundaries so one feature crashing doesn't crash the whole app:

```tsx
<ErrorBoundary fallback={<FeatureErrorFallback />}>
  <AutomationPage />
</ErrorBoundary>
```

#### Lazy Loading

All page-level components must use `React.lazy()` — never eager import a page component in the router:

```tsx
// ✅ Correct
const AutomationPage = lazy(() => import('./features/automation/pages/AutomationPage'));

// ❌ Never do this for page components
import AutomationPage from './features/automation/pages/AutomationPage';
```

---

### Server-Side Patterns

#### Controller → Service → Repository

Every server feature follows a strict three-layer pattern:

```
HTTP Request
    ↓
Controller  — parse request, call service, format response (~100 lines)
    ↓
Service     — business logic, orchestration, validation (~200-400 lines)
    ↓
Repository  — database access only, no business logic (~200 lines)
```

**Example — adding a new endpoint:**

```typescript
// 1. Repository: data access
// server/features/my-feature/repositories/my-feature.repository.ts
export class MyFeatureRepository {
  async findById(id: string): Promise<MyEntity | null> {
    return MyModel.findById(id).lean();
  }
}

// 2. Service: business logic
// server/features/my-feature/services/my-feature.service.ts
export class MyFeatureService {
  constructor(private repo: MyFeatureRepository) {}

  async getFeature(id: string, userId: string): Promise<MyFeatureResult> {
    const entity = await this.repo.findById(id);
    if (!entity) throw new NotFoundError(`Feature ${id} not found`);
    if (entity.userId !== userId) throw new AuthenticationError('Access denied');
    return this.formatResult(entity);
  }
}

// 3. Controller: HTTP handling only
// server/features/my-feature/controllers/my-feature.controller.ts
export const getFeature = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await myFeatureService.getFeature(req.params.id, req.userId);
    res.json(result);
  } catch (error) {
    next(error); // error handler formats the response
  }
};
```

#### Error Handling

Never throw plain `Error` objects in services. Use typed error classes:

```typescript
import { ValidationError, NotFoundError, AuthenticationError, ExternalServiceError } from '../../shared/errors';

// Input validation
if (!userId) throw new ValidationError('userId is required');

// Resource not found
if (!user) throw new NotFoundError(`User ${userId} not found`);

// Permission denied
if (!hasAccess) throw new AuthenticationError('Insufficient permissions');

// Third-party API failure
if (apiError) throw new ExternalServiceError('Instagram API unavailable');
```

The global error handler converts these to structured JSON responses with the correct HTTP status codes automatically.

---

## 3. How to Add a New Feature

### Client-Side New Feature

1. Create the feature directory:

```bash
mkdir -p client/src/features/my-feature/{components,hooks,utils}
touch client/src/features/my-feature/index.ts
```

2. Create the hook for state management:

```typescript
// client/src/features/my-feature/hooks/useMyFeature.ts
export function useMyFeature(workspaceId: string) {
  const [data, setData] = useState<MyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get(`/api/my-feature/${workspaceId}`);
      setData(result.data);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  return { data, loading, error, fetchData };
}
```

3. Create the component (presentation only):

```tsx
// client/src/features/my-feature/components/MyFeatureView.tsx
interface MyFeatureViewProps {
  data: MyData;
  onAction: (id: string) => void;
}

export const MyFeatureView = React.memo(({ data, onAction }: MyFeatureViewProps) => {
  return <div>{/* render data */}</div>;
});
```

4. Create the page (thin orchestrator):

```tsx
// client/src/pages/MyFeaturePage.tsx
import { useMyFeature } from '../features/my-feature/hooks/useMyFeature';
import { MyFeatureView } from '../features/my-feature/components/MyFeatureView';

export default function MyFeaturePage() {
  const { workspaceId } = useParams();
  const { data, loading, error, fetchData } = useMyFeature(workspaceId!);

  if (loading) return <Skeleton />;
  if (error) return <ErrorDisplay message={error} />;
  if (!data) return null;

  return <MyFeatureView data={data} onAction={fetchData} />;
}
```

5. Add to the router with lazy loading:

```tsx
// client/src/App.tsx
const MyFeaturePage = lazy(() => import('./pages/MyFeaturePage'));
```

---

### Server-Side New Feature

```bash
mkdir -p server/features/my-feature/{controllers,services,repositories,routes}
```

Follow the Controller → Service → Repository pattern shown above. Register routes in `server/routes.ts` or create a feature-level `router.ts` and import it.

---

## 4. How to Run Tests, Lint, and Build

### Install Dependencies

```bash
# Install all dependencies from project root
npm install

# Install client dependencies
cd client && npm install && cd ..

# Install server dependencies (if separate)
cd server && npm install && cd ..
```

### Run Tests

```bash
# Run all tests (server + client)
npm test

# Run only server tests
npm run test:server

# Run only client tests
npm run test:client

# Run tests in watch mode (during development)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run property-based tests (longer runtime)
npm run test:pbt
```

### Lint and Format

```bash
# Check lint issues
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Check formatting
npm run format:check

# Auto-format all files
npm run format
```

### Build

```bash
# Production build (client + server)
npm run build

# Build only client
npm run build:client

# Build only server
npm run build:server

# Analyze bundle sizes (opens browser)
npm run build:analyze

# Type-check without building
npm run typecheck
```

### Start Development Server

```bash
# Start everything (client + server) with hot reload
npm run dev

# Start only server
npm run dev:server

# Start only client (Vite)
npm run dev:client
```

---

## 5. Environment Setup

Copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

### Required Variables

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/veefore

# Redis (for sessions and queues)
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-secret-here-minimum-32-chars

# Firebase (for client-side auth)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=

# AI Providers
OPENAI_API_KEY=
GEMINI_API_KEY=
PERPLEXITY_API_KEY=

# Storage
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=

# Instagram OAuth
INSTAGRAM_CLIENT_ID=
INSTAGRAM_CLIENT_SECRET=
```

### Recommended Dev Tools

- **Node.js**: use the version in `.nvmrc` — run `nvm use` if you have nvm
- **VS Code extensions**: ESLint, Prettier, TypeScript, Tailwind CSS IntelliSense
- **Postman / Insomnia**: for testing API endpoints

---

## 6. Where to Find Things

| I need to... | Look in |
|-------------|---------|
| Change automation UI | `client/src/features/automation/` |
| Change video generation flow | `client/src/features/video-generator/` |
| Change landing page content | `client/src/features/landing/sections/` |
| Change settings forms | `client/src/features/settings/components/` |
| Change signup flow | `client/src/features/auth/` |
| Change AI generation logic | `server/features/ai/services/` |
| Change Instagram publishing | `server/features/instagram/services/instagram.service.ts` |
| Change webhook handling | `server/features/instagram/webhooks/` |
| Change file upload | `server/features/storage/services/` |
| Add an error class | `server/shared/errors/` |
| Change auth middleware | `server/shared/auth/middleware/` |
| Change shared types | `shared/types/` |
| Read architectural decisions | `docs/adr/` |
| Read migration guides | `MIGRATION_GUIDES.md` |
| Check requirements status | `REQUIREMENTS_VALIDATION.md` |

---

## Key Contacts and Resources

- **Architecture decisions:** `docs/adr/` — read these before making structural changes
- **Migration guides:** `MIGRATION_GUIDES.md` — if you see old import patterns, follow the migration guide to update them
- **API documentation:** `docs/API_DOCUMENTATION.md`
- **Test coverage report:** `TEST_COVERAGE_SUMMARY.md`
- **Bundle analysis:** Run `npm run build:analyze` to see current chunk sizes

---

## Requirements Satisfied

- **Requirement 17.1** — Architecture documentation describing file structure and component relationships ✅
- **Requirement 17.2** — Quick-start guide for new developers explaining codebase organization and patterns ✅
