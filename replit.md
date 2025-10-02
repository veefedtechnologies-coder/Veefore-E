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
