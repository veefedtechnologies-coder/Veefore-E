# VeeFore - AI-Powered Social Media Management Platform

## Project Overview
VeeFore is a comprehensive social media management platform with AI-powered content creation, smart scheduling, and advanced analytics. The platform helps creators and businesses manage their social media presence efficiently.

## Architecture

### Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js + Node.js
- **Database**: MongoDB Atlas + PostgreSQL (Replit)
- **Caching**: Redis (with in-memory fallback)
- **Authentication**: Firebase Auth + Session-based
- **AI**: OpenAI API for content generation
- **Social**: Instagram API integration

### Port Configuration
- **Main App**: Port 5000 (frontend + backend via Vite middleware)
- **Admin Panel**: Port 8000/8001 (separate application)

## Environment Configuration

### Required Secrets (Currently Set)
All critical secrets are configured in Replit Secrets:

1. **OPENAI_API_KEY** - AI content generation
2. **INSTAGRAM_APP_ID** - Instagram OAuth
3. **INSTAGRAM_APP_SECRET** - Instagram OAuth  
4. **MONGODB_URI** - Database connection
5. **REDIS_URL** - Caching layer
6. **SESSION_SECRET** - Session encryption
7. **STRIPE_SECRET_KEY** - Payment processing
8. **SENDGRID_API_KEY** - Email notifications
9. **JWT_SECRET** - Token signing

### Firebase Configuration (Client-side)
Firebase credentials are stored in secrets and automatically loaded:
- Project ID, API Key, App ID, Auth Domain all configured
- Client authentication working properly

### Optional Secrets (Not Currently Used)
- Firebase Admin SDK credentials (FIREBASE_ADMIN_*)
- Can be added if server-side Firebase features are needed

## Recent Changes

### 2025-12-07: Dashboard Crash Fix - socialAccounts Array Handling (COMPLETE)
- ✅ **CRITICAL FIX**: Fixed PerformanceScore and SocialAccounts components crashing with "filter is not a function"
- ✅ **Root Cause**: API returns `{ success: true, data: [...] }` object, but code expected an array directly
- ✅ **Solution**: Added `socialAccountsArray` extraction that handles both array and object formats
- ✅ Updated all array method calls (filter, map, length) to use normalized `socialAccountsArray`
- ✅ Fixed polling query `enabled` check to handle object format
- ✅ Architect review PASSED - no remaining crash surface
- **Files Modified**: client/src/components/dashboard/performance-score.tsx, client/src/components/dashboard/social-accounts.tsx

### 2025-12-07: Critical Workspace Creation Bug Fix (COMPLETE)
- ✅ **FIX**: Onboarding now AWAITS workspace creation instead of fire-and-forget
- ✅ **FIX**: default-workspace-enforcer now creates workspace on GET /workspaces if user has none
- ✅ Root cause: `completeOnboardingFull` was not awaiting `createDefaultWorkspaceIfNeeded`, causing silent failures
- ✅ Fallback: Middleware now acts as safety net to create workspace for any user without one
- **Files Modified**: server/controllers/UserController.ts, server/middleware/default-workspace-enforcer.ts

### 2025-12-07: User Data & WorkspaceSwitcher Bug Fixes (COMPLETE)
- ✅ **FIX**: useUser hook now correctly extracts user data from nested API response
- ✅ **FIX**: /api/user endpoint returns all needed user fields (displayName, plan, credits, isOnboarded)
- ✅ **FIX**: WorkspaceSwitcher now extracts workspaces from nested API response `{ success: true, data: [...] }`
- ✅ **FIX**: useCurrentWorkspace hook now extracts workspaces from nested API response
- ✅ **FIX**: WorkspaceSwitcher no longer crashes when defaultWorkspace is undefined
- ✅ Added null check guard in validateWorkspace function to handle empty workspace arrays
- **Files Modified**: client/src/hooks/useUser.ts, server/auth-routes.ts, client/src/components/WorkspaceSwitcher.tsx

### 2025-12-07: Critical Onboarding Bug Fixes (COMPLETE)
- ✅ **FIX**: Onboarding completion no longer stuck on "Completing..." state
- ✅ **FIX**: Onboarding modal no longer shows to already onboarded users
- ✅ App.tsx onComplete handler now throws errors on failure for proper error handling
- ✅ OnboardingFlow.tsx uses `finally` block to always reset isCompleting state
- ✅ Triple safety check for modal rendering (backend + localStorage + workspaces)
- ✅ Backend timeouts increased from 3-5s to 10-15s for reliability
- ✅ Better logging in completeOnboardingFull endpoint
- **Files Modified**: App.tsx, OnboardingFlow.tsx, UserController.ts

### 2025-12-07: Architecture Refactoring - Repository Pattern (COMPLETE)
- ✅ **MAJOR REFACTOR**: Complete backend architecture overhaul using Repository Pattern
- ✅ **Thin Delegation Layer**: mongodb-storage.ts now purely delegates to repositories
- ✅ Reduced mongodb-storage.ts from ~2940 lines to ~1892 lines (36% reduction)
- ✅ Moved ALL business logic to repositories - no direct Mongoose model calls remain
- ✅ All timestamp handling (createdAt/updatedAt) moved to repository `createWithDefaults()` methods
- ✅ BaseRepository.updateById() automatically handles updatedAt timestamps
- ✅ Created ThumbnailRepository.ts with 5 new repositories for thumbnail system
- ✅ Transaction logic preserved in UserRepository and WaitlistUserRepository
- ✅ Token encryption moved to SocialAccountRepository
- ✅ Architect review PASSED - confirmed thin delegation pattern
- **Benefits**: Better code organization, separation of concerns, easier testing, maintainability
- **Key Files**:
  - `server/mongodb-storage.ts` - Thin delegation layer (~1892 lines)
  - `server/repositories/` - All entity repositories with business logic (~5500 lines total)
  - `server/repositories/ThumbnailRepository.ts` - NEW: 5 repositories for thumbnail system
  - `server/storage/converters.ts` - Data conversion utilities
  - `server/security/token-encryption.ts` - Token encryption helpers

### 2025-10-02: Real-Time Dashboard Cache Updates
- ✅ **CRITICAL FIX**: Fixed dashboard caching issue where social account data wasn't updating in real-time
- ✅ Instagram smart polling now emits WebSocket events (`instagram_data_update`) when data changes
- ✅ Frontend automatically refreshes when Instagram followers, likes, engagement are updated
- ✅ Fixed cache clearing method to use workspace-specific invalidation (`clearWorkspaceCache`)
- ✅ Reduced frontend cache staleness from 5 minutes to 2 minutes for faster updates
- ✅ Added comprehensive WebSocket event listeners for polling updates
- **Result**: Dashboard now shows real-time updates without manual refresh when Instagram data changes

### 2025-10-02: Loading State Fix & React Module Resolution
- ✅ **PERMANENT FIX**: Fixed critical React hook error that prevented app from loading
- ✅ **Root Cause**: client/package.json was missing React and react-dom dependencies
- ✅ **Solution**: Added React 18.3.1 and react-dom 18.3.1 to client/package.json
- ✅ **Loading States**: Changed condition from `if (isLoading && !data)` to `if (!data && isLoading)`
- ✅ **Result**: Cached data now displays immediately on page reload, no loading skeletons
- ✅ **Prevention**: React dependencies now properly declared in all package.json files
- **Technical**: Module resolution conflict resolved by ensuring React is declared in both root and client package.json

### 2025-10-02: Reconnect Account Prompt
- ✅ **NEW FEATURE**: Added prominent reconnect prompts when Instagram access token is missing
- ✅ **Performance Score**: Shows orange warning banner with "Reconnect Now" button when token invalid
- ✅ **Social Accounts Page**: Displays full-screen reconnect message instead of zeros when token missing
- ✅ **User Experience**: Clear messaging explaining why data isn't showing and how to fix it
- **Result**: Users will see actionable prompts to reconnect accounts instead of confusing zero data

### 2025-10-02: Instagram OAuth Auto-Sync
- ✅ **CRITICAL FIX**: Instagram OAuth now immediately syncs real data after account connection
- ✅ Added InstagramDirectSync call in OAuth callback to fetch followers, posts, engagement
- ✅ Users no longer see zeros after connecting - real data appears immediately
- **Result**: Connecting Instagram account now pulls actual follower count, posts, and metrics instantly

### 2025-10-02: Historical Analytics Data Fix
- ✅ **FIX**: Fixed historical analytics endpoint to use correct storage method (`getAnalytics` instead of `getAnalyticsByWorkspace`)
- ✅ Fixed workspace ID parameter type (MongoDB uses string ObjectIds, not integers)
- ✅ Identified root cause of missing historical data: Instagram account access token cannot be decrypted
- **Status**: Historical analytics endpoint is now working correctly
- **Action Required**: User must reconnect Instagram account in settings to enable smart polling data collection
- **Smart Polling**: System automatically creates daily analytics snapshots when valid access token is present

### 2025-10-02: Animation Performance Optimization
- ✅ **CRITICAL FIX**: Fixed fluctuating/janky animations throughout the app
- ✅ Added useRef guards to App.tsx initialization effects (P6, SEO, accessibility, mobile, web vitals)
- ✅ Each system now runs exactly once per app mount, eliminating re-render storms
- ✅ Optimized GlobalLandingPage: reduced floating particles from 30 to 10 (67% reduction)
- ✅ Grouped navigation, hero, and feature animations into stagger containers
- ✅ Wrapped GlobalLandingPage in React.memo to prevent unnecessary re-renders
- ✅ Memoized all Framer Motion variant objects with useMemo
- ✅ Simplified CSS keyframes (pulse, glow) to avoid conflicts with Framer Motion
- ✅ Removed debug logging that was causing re-renders
- **Result**: Smooth, non-flickering animations with significantly reduced re-render overhead

### 2025-10-02: Google Sign-In Redirect Fix
- ✅ **CRITICAL FIX**: Fixed stuck "Initializing..." screen after Google sign-in redirect
- ✅ Added 500ms delay after backend linking to allow Firebase session persistence
- ✅ Changed redirect method from SPA navigation to full page reload (`window.location.href`)
- ✅ Backend linking endpoint `/api/auth/link-firebase` properly creates user in MongoDB
- **Result**: Users now successfully reach dashboard after Google sign-in

### 2025-10-02: Google Sign-In Loading Screen Fix
- ✅ **CRITICAL FIX**: Fixed stuck "Initializing..." screen after Google sign-in
- ✅ Reordered React conditional rendering to check for `userData` BEFORE `userDataLoading`
- ✅ Users now see dashboard immediately after sign-in without needing to refresh
- ✅ Eliminated React Query state management race condition

### 2025-10-02: Firebase Session Persistence Fix
- ✅ **CRITICAL FIX**: Added proper error handling for `setPersistence` Promise in firebase.ts
- ✅ Firebase auth sessions now persist correctly across page refreshes
- ✅ Users no longer lose authentication state when refreshing the page
- ✅ Eliminated race condition between persistence setup and auth initialization

### 2025-10-02: Authentication Flow Bug Fixes
- ✅ Fixed critical signup bug where users got stuck on loading screen
- ✅ Added proper error handling for `/api/auth/link-firebase` endpoint
- ✅ Implemented 15-second timeout protection with AbortController
- ✅ Added retry logic (3 attempts) for user data loading in App.tsx
- ✅ Improved signin flow with better error handling
- ✅ Added helpful error UI for failed user data loads with retry button
- ✅ Fixed exponential backoff retry delay (1s, 2s, 4s) for robustness
- ✅ Timeout errors now properly reset UI state and show actionable toast
- ✅ AbortController cancels stuck requests server-side

### 2025-10-02: Replit Environment Setup
- ✅ Configured port routing (admin panel on 8000, main app on 5000)
- ✅ Fixed OpenAI client initialization (lazy loading pattern)
- ✅ Set up deployment configuration (autoscale target)
- ✅ Implemented graceful fallbacks for Redis/MongoDB
- ✅ Configured Vite for Replit proxy compatibility
- ✅ All security and optimization systems initialized

## Application Status

### Current State: ✅ RUNNING SMOOTHLY
- Frontend displaying correctly
- Backend API responding
- Database connected
- All optimization systems active
- Graceful fallbacks working for unavailable services

### Known Limitations
1. **Redis**: Quota exceeded on Upstash free tier
   - Solution: Using in-memory fallback, app fully functional
2. **MongoDB Local**: Not running (expected in Replit)
   - Solution: Using MongoDB Atlas cloud database

## User Preferences
- Follow existing project structure
- Use established databases and APIs
- Maintain lazy-loading pattern for API clients
- Keep graceful fallbacks for external services

## Deployment
- **Target**: Autoscale (stateless web app)
- **Build**: `npm run build`
- **Run**: `npm run start` (production)
- **Dev**: `npm run dev` (development)

## Development Workflow
```bash
# Start development server
npm run dev

# Build for production  
npm run build

# Run production server
npm run start

# Admin panel (separate terminal)
cd admin-panel && npm start
```

## Key Features Implemented
- 🤖 AI-powered content generation
- 📅 Smart content scheduling  
- 📊 Advanced analytics and insights
- 🔒 OAuth 2.0 with PKCE security
- 📱 Mobile-optimized responsive design
- ♿ WCAG accessibility compliance
- 🚀 Performance optimization
- 🔐 GDPR compliance features
- 📈 Real-time metrics and monitoring

## Security Features
- OAuth 2.0 PKCE flow
- Webhook signature verification
- Multi-tenant workspace isolation
- Token hygiene automation
- Rate limiting with fallbacks
- Structured logging with PII sanitization

## Performance Optimizations
- Redis caching with fallback
- Database query optimization
- Static asset optimization
- Response compression (gzip/brotli)
- Background job queue system
- Cache warming for frequent data
