# VeeFore - AI-Powered Social Media Management Platform

VeeFore is a comprehensive AI-powered social media management platform designed to automate content creation, scheduling, and engagement across various social media platforms. Its purpose is to streamline social media workflows for individuals and businesses, enabling efficient content management and enhanced online presence through intelligent automation and analytics.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

**September 30, 2025**
- ✅ **REACT HOOKS ERROR RESOLUTION - COMPLETE SUCCESS**: Permanently resolved persistent "Cannot read properties of null (reading 'useState')" error
  - **Root cause**: `preserveSymlinks: true` in vite.config.ts prevented Vite from deduplicating React instances across symlink boundaries
  - **Solution implemented**:
    1. Changed `preserveSymlinks: false` to allow proper React deduplication
    2. Added hard-pin aliases in resolve.alias forcing all React imports to use same path
    3. Added `@tanstack/react-query` to optimizeDeps.include for proper pre-bundling
  - **Result**: App loads flawlessly with zero React-related errors in browser console
  - **Verified**: Multiple restarts confirm fix is permanent and stable
  - This fix allows Vite to properly deduplicate React across all dependencies including nested node_modules

**August 30, 2025**
- ✅ Fixed Instagram OAuth redirect issue - changed route from /integrations to /integration
- ✅ Instagram profile pictures now display correctly (fetched from API, not placeholder images)
- ✅ Created comprehensive LOCAL_DEVELOPMENT_SETUP.md for Cursor IDE compatibility
- ✅ Verified OAuth system works with real profile picture fetching
- ✅ Documented preservation of landing page interactive demos and animations
- ✅ CRITICAL FIX: Optimized Firebase authentication for instant loading (removed 5-second delay)
- ✅ Fixed protected route access - unauthenticated users now see loading spinner instead of blank pages
- ✅ Implemented smart authentication state initialization for modern app-like performance
- ✅ Removed problematic catch-all route that interfered with normal auth flow
- ✅ **CONSOLE CLEANUP**: Achieved zero browser console errors and warnings for clean development experience
- ✅ **FORM ACCESSIBILITY**: Added proper id and name attributes to all form elements across signup, authentication, and automation pages
- ✅ **SECURITY ENHANCEMENT**: Implemented enterprise-level Content Security Policy without unsafe-eval for both development and production
- ✅ **TYPESCRIPT OPTIMIZATION**: Fixed all TypeScript environment variable errors with proper Vite type declarations
- ✅ **FIREBASE IMPROVEMENTS**: Enhanced IndexedDB error handling for better browser compatibility and reduced warnings
- ✅ **WORKSPACE SWITCHING FIX**: Fixed workspace switching bug where useCurrentWorkspace hook wasn't reactive to localStorage changes, affecting Integration and Automation pages
- ✅ **WORKSPACE SWITCHING UI DEVELOPMENT**: Developed multiple iterations of workspace switching loading screens including:
  - Glass morphism card design with backdrop blur effects
  - Full-screen modern loading experience with animated particles
  - Advanced animations including gradient text, pulsing icons, and progress bars
  - Multi-layer spinner animations with counter-rotating elements
  - Real-time loading steps with color-coded status indicators
- ✅ **WORKSPACE SWITCHING REMOVAL**: Completely removed workspace switching loading screen for instant transitions
  - Eliminated all loading overlays and transition animations
  - Implemented instant workspace switching without visual interruption
  - Simplified user experience with seamless workspace changes
- ✅ **WORKSPACE SECURITY IMPLEMENTATION**: Secured all workspace-specific API endpoints with comprehensive access control
  - Implemented validateWorkspaceAccess helper function preventing cross-workspace data access
  - Secured Instagram, AI, and analytics endpoints with workspace ownership validation
  - Protected against credit theft and unauthorized workspace access
  - Added workspace isolation to prevent data leakage between workspaces
  - Enhanced multi-tenant security with proper workspace-based authorization

## System Architecture

VeeFore features a modern web interface built with React and TypeScript, leveraging Tailwind CSS with shadcn/ui components for a consistent design system. State management is handled with React hooks and context, and Vite is used for optimized builds. The backend is built on Node.js with Express.js, utilizing MongoDB for data storage and Firebase Auth for authentication. SendGrid is integrated for email services, and local file storage with a CDN handles media files. The system supports multi-tenant architecture with workspace-based organization, role-based access control, and a credit system for usage-based billing. AI integration is central, automating content generation, response generation, and social media analytics. The platform includes advanced scheduling, real-time analytics sync, and a rule-based automation engine for various social media interactions.

## External Dependencies

-   **MongoDB Atlas**: Cloud database hosting.
-   **SendGrid**: Email delivery service.
-   **Instagram Business API**: Social media posting and messaging.
-   **Firebase**: Authentication and user session management.
-   **Runway ML**: AI video generation capabilities.
-   **OpenAI**: AI services for content generation, script generation, scene enhancement, voiceover optimization, and various AI insights (e.g., GPT-4o).
-   **Anthropic Claude**: AI services for insights (as a fallback to OpenAI).
-   **ElevenLabs**: AI voiceover generation.
-   **Replicate**: SDXL integration for scene image generation.
-   **ClipDrop**: AI image generation for visual content.
-   **Drizzle Kit**: Database migration and schema management.
-   **shadcn/ui**: Pre-built UI component library.
-   **Tailwind CSS**: Utility-first CSS framework.
-   **TypeScript**: Type-safe development environment.
-   **Razorpay**: Primary payment gateway.
-   **Stripe**: International payment gateway.
-   **YouTube Data API**: For YouTube integrations.
-   **Twitter API v2**: For Twitter integrations.
-   **LinkedIn API**: For LinkedIn integrations.
-   **Perplexity APIs**: For additional AI services.

## Development Setup

**Local Development**: Complete setup guide available in `LOCAL_DEVELOPMENT_SETUP.md`
- Supports both Replit and Cursor IDE environments
- Preserves all interactive landing page demos and animations
- Maintains complete authentication flow (Firebase + Google OAuth)
- Ensures waitlist system with OTP verification works correctly
- No modifications required to existing components or UI
- Asset management system preserves 500+ generated images for landing demos

**Key Configuration Files**:
- `vite.config.ts`: Auto-detects environment (Replit vs local)
- `.env.example`: Complete environment variable template
- `attached_assets/`: Critical image assets for landing page demos
- `server/index.ts`: Production-ready server with proper middleware
- `client/src/App.tsx`: Authentication guards and routing logic with optimized protected route handling
- `client/src/hooks/useFirebaseAuth.ts`: Optimized Firebase auth hook for instant authentication loading
- `client/src/lib/firebase.ts`: Firebase configuration with local persistence for fast authentication

**Architecture Notes**:
- Frontend and backend integrated in single Express server
- MongoDB with Mongoose ODM for data persistence
- React Query for client-side state management
- shadcn/ui + Tailwind CSS for consistent design system
- Optimized Firebase authentication with instant loading and smart state initialization
- Protected route handling with proper loading states and fallbacks for unauthenticated access
- Enterprise-level security with Content Security Policy (CSP) configuration that maintains functionality while preventing code injection attacks
- Clean development environment with zero console errors, warnings, or accessibility violations
- Comprehensive form accessibility compliance for screen readers and browser autofill functionality