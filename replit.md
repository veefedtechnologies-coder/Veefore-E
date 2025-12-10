# VeeFore - AI-Powered Social Media Management Platform

## Overview
VeeFore is an AI-powered social media management platform designed for creators and businesses. It offers AI-driven content creation, intelligent scheduling, and comprehensive analytics to streamline social media presence and engagement. The platform provides a robust solution for efficient social media management with features like OAuth 2.0 security, mobile optimization, WCAG accessibility, and GDPR compliance.

## User Preferences
- Follow existing project structure
- Use established databases and APIs
- Maintain lazy-loading pattern for API clients
- Keep graceful fallbacks for external services
- Use Repository Pattern for backend architecture

---

## System Architecture

### Tech Stack
- **Frontend**: React 18, TypeScript, Vite, TanStack Query, Wouter (routing), Tailwind CSS, Framer Motion
- **Backend**: Express.js, Node.js, TypeScript
- **Database**: MongoDB Atlas (primary), PostgreSQL (Drizzle ORM schema definitions)
- **Caching**: Redis (Upstash) with in-memory fallback
- **Authentication**: Firebase Auth (client-side) + Firebase Admin SDK (server verification)
- **AI Services**: OpenAI GPT-4o, Google Gemini, Anthropic Claude, Perplexity (hybrid AI system)
- **Social APIs**: Instagram Business API, YouTube Data API, Twitter API v2
- **Payments**: Razorpay (primary, INR), Stripe (international)
- **Email**: SendGrid SMTP
- **Monitoring**: Sentry (error tracking), Pino (logging)

### Project Structure
```
VeeFore/
├── client/                     # React frontend
│   ├── src/
│   │   ├── components/         # UI components (layout, dashboard, analytics, etc.)
│   │   ├── pages/              # Route pages (Landing, SignIn, Workspaces, etc.)
│   │   ├── hooks/              # Custom React hooks (useFirebaseAuth, useUser, etc.)
│   │   ├── lib/                # Utilities (firebase, queryClient, theme, seo, etc.)
│   │   ├── App.tsx             # Main app with routing
│   │   └── main.tsx            # Entry point
│   └── index.html              # HTML template
├── server/                     # Express.js backend
│   ├── routes/v1/              # API routes (auth, user, workspace, ai, etc.)
│   ├── repositories/           # Data access layer (Repository Pattern)
│   ├── services/               # Business logic services
│   ├── models/                 # Mongoose models
│   ├── middleware/             # Express middleware (auth, rate-limiting, security)
│   ├── security/               # Security modules (GDPR, PKCE, workspace isolation)
│   ├── infrastructure/         # Infrastructure modules
│   │   ├── media-upload.ts     # Multer configuration for file uploads
│   │   ├── leader-election.ts  # Distributed leader election for polling
│   │   └── mongodb-connection.ts # MongoDB connection manager with retry
│   ├── domain/                 # Domain types
│   │   └── types.ts            # MongoDB-native domain types (string IDs)
│   ├── index.ts                # Server entry point
│   ├── routes.ts               # Route registration (~58 lines, minimal)
│   └── mongodb-storage.ts      # Storage interface implementation
├── shared/                     # Shared types and schemas
│   └── schema.ts               # Drizzle/Zod schema definitions
├── vite.config.ts              # Vite configuration
└── replit.md                   # This file
```

---

## Core Features

### 1. AI-Powered Content Creation
- **15+ AI Tools**: Content generation, image creation, video editing
- **Hybrid AI System**: Routes queries to optimal provider (OpenAI, Gemini, Perplexity)
- **Thumbnail Maker Pro**: 7-stage professional thumbnail generation
- **Script Generator**: AI-powered video script creation with voiceover instructions
- **Hashtag Optimizer**: Trending hashtag suggestions
- **Caption Generator**: Platform-specific caption optimization
- **Creative Brief Generator**: AI-generated campaign briefs
- **Content Repurposer**: Multi-language content adaptation

### 2. Instagram Integration
- **OAuth 2.0 Flow**: Secure account connection via Instagram Business API
- **Smart Polling**: Hybrid webhook + polling system for real-time data
- **Direct Publishing**: Post to Instagram directly from the platform
- **DM Automation**: Automated message responses
- **Analytics**: Followers, engagement, reach, impressions tracking
- **Token Management**: Long-lived access tokens with auto-refresh

### 3. Scheduling & Automation
- **Content Scheduler**: Multi-platform content scheduling
- **Automation Rules**: Custom automation rule engine for DM responses
- **Background Scheduler Service**: Processes scheduled content every minute
- **Leader Election**: Distributed lock system for multi-instance deployments

### 4. Team & Workspace Management
- **Multi-Workspace**: Team-based workspace management
- **Role-Based Access**: Owner, editor, viewer roles with permissions
- **Team Invitations**: Secure token-based team member onboarding
- **Credit System**: Usage-based billing with credit transactions
- **Workspace Isolation**: Multi-tenant data isolation

### 5. Analytics & Insights
- **Real-Time Analytics**: Live social media metrics dashboard
- **Performance Score**: AI-calculated account performance
- **Recommendations**: AI-powered improvement suggestions
- **Competitor Analysis**: Track and analyze competitors

### 6. Subscription & Billing
- **Plans**: Free, Starter (₹699), Pro (₹1499), Business (₹2199)
- **Credit Packages**: 100, 500, 1000, 2500 credits
- **Razorpay Integration**: Indian payment processing
- **Plan Enforcement**: Middleware for feature gating

---

## API Structure

### V1 Routes (mounted at `/api`)
- `/api/auth/*` - Authentication (register, login, verify email)
- `/api/user/*` - User profile, settings, onboarding
- `/api/workspaces/*` - Workspace CRUD, team management
- `/api/social-accounts/*` - Social account connection/management
- `/api/content/*` - Content creation, scheduling
- `/api/ai/*` - AI content generation, analysis
- `/api/analytics/*` - Real-time metrics, insights
- `/api/billing/*` - Subscriptions, credit purchases
- `/api/automation/*` - DM automation rules
- `/api/scheduler/*` - Content scheduling
- `/api/thumbnails/*` - Thumbnail generation
- `/api/trends/*` - Trending topics
- `/api/activity/*` - User activity logs and audit trail

### Authentication Flow
1. Client uses Firebase Auth for login (email/password or Google OAuth)
2. Firebase issues JWT token
3. Client includes token in `Authorization: Bearer <token>` header
4. Server's `requireAuth` middleware verifies token via Firebase Admin SDK
5. User is retrieved/created in MongoDB based on Firebase UID

---

## Design Patterns

### Repository Pattern
Backend uses Repository Pattern for data access:
- `UserRepository`, `WorkspaceRepository`, `SocialAccountRepository`, etc.
- Repositories handle all database operations
- `mongodb-storage.ts` implements `IStorage` interface, delegating to repositories
- Clear separation between API routes → Services → Repositories → Models

### Lazy Loading
- API clients (OpenAI, etc.) initialized on first use
- React components use `React.lazy()` for code splitting
- Heavy modules deferred until needed

### Graceful Fallbacks
- Redis → in-memory cache fallback
- MongoDB Atlas → local MongoDB fallback
- AI providers → fallback chain (OpenAI → Gemini → Perplexity → placeholder)

---

## Security Features

### Authentication & Authorization
- Firebase Auth with JWT token verification
- Session-based authentication support
- Role-based access control (RBAC)
- Workspace-level permissions

### Security Middleware
- Rate limiting (global, auth, API, AI endpoints)
- Brute force protection
- CORS security with strict policies
- XSS protection
- CSRF tokens
- Helmet.js security headers

### Data Protection
- Token encryption (AES-256)
- OAuth 2.0 with PKCE
- GDPR compliance module
- Webhook signature verification
- Workspace isolation (multi-tenant)
- Audit trail logging

### Audit Trail System
- **Automatic Logging**: Middleware captures all successful API requests across content, workspace, social accounts, and billing routes
- **Sensitive Data Sanitization**: Passwords, tokens, and signatures are redacted before logging
- **Activity APIs**: `/api/activity/my-activity` and `/api/activity/workspace/:id/activity` with pagination
- **Role-Based Access**: Workspace activity logs require Owner or Admin role
- **Retention Policy**: 90-day default retention with critical log archiving
- **AuditRetentionService**: Automated cleanup with archive support for critical logs

---

## Frontend Architecture

### State Management
- TanStack Query for server state (caching, refetching)
- React Context for app-wide state
- Local storage persistence for query cache

### Routing
- Wouter for client-side routing
- Protected routes via `ProtectedRoute` component
- Lazy-loaded page components

### UI Components
- Custom component library in `components/ui/`
- Tailwind CSS for styling
- Framer Motion for animations
- Dark/light theme support

### Accessibility (P6/P7 Systems)
- SEO optimization with meta tags, structured data
- Core Web Vitals monitoring
- Keyboard navigation support
- Screen reader announcements
- Focus management
- Reduced motion support
- Mobile excellence (P11) system

---

## External Dependencies

| Service | Purpose | Environment Variables |
|---------|---------|----------------------|
| MongoDB Atlas | Primary database | `MONGODB_URI` |
| Firebase | Authentication | `FIREBASE_SERVICE_ACCOUNT_KEY`, `VITE_FIREBASE_*` |
| OpenAI | AI content generation | `OPENAI_API_KEY` |
| Google Gemini | AI fallback | `GEMINI_API_KEY`, `GOOGLE_API_KEY` |
| Instagram API | Social integration | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` |
| Razorpay | Payment processing | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |
| SendGrid | Email service | `SENDGRID_API_KEY` |
| Redis/Upstash | Caching | `REDIS_URL` |
| Sentry | Error tracking | `SENTRY_DSN`, `VITE_SENTRY_DSN` |

---

## Development Guidelines

### Running the Application
```bash
npm install          # Install dependencies
npm run dev          # Start development server (port 5000)
```

### Vite Configuration Best Practices
- Do NOT add cache-busting query parameters to script tags
- Do NOT manually alias React paths - use `resolve.dedupe` instead
- Keep React dependencies only in `client/package.json`
- Clear Vite cache (`rm -rf client/node_modules/.vite`) when troubleshooting

### Code Conventions
- TypeScript throughout (strict mode)
- Repository Pattern for data access
- Lazy loading for API clients
- Graceful fallbacks for external services
- Use existing utilities and patterns

### Adding New Features
1. Define schema in `shared/schema.ts`
2. Create Mongoose model in `server/models/`
3. Create repository in `server/repositories/`
4. Add methods to `IStorage` interface and `MongoStorage` class
5. Create API routes in `server/routes/v1/`
6. Add frontend components and integrate with TanStack Query

---

## Recent Changes (December 2025)

### Architecture Overhaul - MongoDB-Native Types (December 10, 2025)
- **Domain Types**: Created `server/domain/types.ts` with MongoDB-native types using string IDs (ObjectId) instead of numeric IDs
- **IStorage Interface**: Updated `server/storage.ts` to use string IDs throughout, eliminating Drizzle/Postgres-era numeric IDs
- **Type Alignment**: Resolved 83+ LSP type errors in mongodb-storage.ts by aligning types with MongoDB schema
- **Webhook Optimization**: 
  - Added `pageId_1_platform_1` and `platform_1_accountId_1_isActive_1` indexes to SocialAccount model
  - Refactored webhook handler to use indexed queries only (no full collection scans)
  - Re-enabled Meta webhook signature validation for production security
- **Repository Pattern**: All database operations now properly delegate to specialized repositories

### React "Invalid Hook Call" Fix
- **Root Cause**: Multiple React instances loaded due to:
  1. Cache-busting query parameter on main.tsx script tag
  2. Manual React aliases conflicting with Vite's pre-bundling
- **Solution**: Removed cache-busting parameter, simplified vite.config.ts

### Migration from Replit Agent
- Successfully migrated to standard Replit environment
- Resolved module resolution conflicts
- All systems operational (Firebase auth, accessibility, optimization)

---

## Troubleshooting

### Common Issues

#### Vite Module Errors
```bash
rm -rf client/node_modules/.vite
npm run dev
```

#### Firebase Auth Issues
- Verify `VITE_FIREBASE_*` environment variables are set
- Check Firebase console for authorized domains

#### MongoDB Connection
- Verify `MONGODB_URI` is correct
- Check IP whitelist in MongoDB Atlas

#### Instagram OAuth
- Verify redirect URI matches Meta app settings
- Check `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`

---

## Deployment

### Recommended: Vercel
```bash
npm install -g vercel
vercel --prod
```

### Docker
```bash
docker build -t veefore:latest .
docker run -p 5000:5000 --env-file .env veefore:latest
```

---

**Version**: 2.0.0  
**Status**: Production Ready  
**Last Updated**: December 2025
