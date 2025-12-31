# VeeFore - AI-Powered Social Media Management Platform

## Overview
VeeFore is an AI-powered social media management platform for creators and businesses. It offers AI-driven content creation, intelligent scheduling, and comprehensive analytics to streamline social media presence and engagement. The platform focuses on efficient social media management with features like OAuth 2.0 security, mobile optimization, WCAG accessibility, and GDPR compliance.

## User Preferences
- Follow existing project structure
- Use established databases and APIs
- Maintain lazy-loading pattern for API clients
- Keep graceful fallbacks for external services
- Use Repository Pattern for backend architecture

## System Architecture

### Tech Stack
- **Frontend**: React 18, TypeScript, Vite, TanStack Query, Wouter, Tailwind CSS, Framer Motion
- **Backend**: Express.js, Node.js, TypeScript
- **Database**: MongoDB Atlas (primary), PostgreSQL (Drizzle ORM schema definitions)
- **Caching**: Redis (Upstash) with in-memory fallback
- **Authentication**: Firebase Auth (client-side) + Firebase Admin SDK (server verification)
- **AI Services**: OpenAI GPT-4o, Google Gemini, Anthropic Claude, Perplexity (hybrid AI system)

### Project Structure
The project is organized into `client/` (React frontend), `server/` (Express.js backend), and `shared/` (shared types/schemas).
The backend follows a Repository Pattern with distinct layers for routes, services, repositories, and models. MongoDB-native domain types are used.

### Core Features
- **AI-Powered Content Creation**: Over 15 AI tools for content generation, image/video editing, scripting, hashtag optimization, and caption generation, utilizing a hybrid AI routing system.
- **Instagram Integration**: Secure OAuth 2.0 flow, smart polling, direct publishing, DM automation, and analytics via Instagram Business API.
- **Scheduling & Automation**: Multi-platform content scheduling, custom automation rules, and a background scheduler service with distributed leader election.
- **Team & Workspace Management**: Multi-tenant workspaces with role-based access control, team invitations, and a credit-based billing system.
- **Analytics & Insights**: Real-time dashboards, AI-driven performance scores, recommendations, and competitor analysis.
- **Subscription & Billing**: Tiered plans and credit packages, integrated with Razorpay and Stripe.

### Design Patterns
- **Repository Pattern**: Used in the backend for clean separation of data access logic.
- **Lazy Loading**: Applied to API clients and React components for performance optimization.
- **Graceful Fallbacks**: Implemented for caching (Redis to in-memory), databases (MongoDB Atlas to local), and AI providers (chain of OpenAI, Gemini, Perplexity).

### Security Features
- **Authentication & Authorization**: Firebase Auth, JWT verification, session support, RBAC, and workspace-level permissions.
- **Security Middleware**: Rate limiting, brute force protection, CORS, XSS, CSRF, and Helmet.js headers.
- **Data Protection**: Token encryption, OAuth 2.0 with PKCE, GDPR compliance, webhook signature verification, workspace isolation, and an audit trail system with sensitive data sanitization and role-based access.

### Frontend Architecture
- **State Management**: TanStack Query for server state and React Context for global state.
- **Routing**: Wouter for client-side routing with protected routes and lazy-loaded components.
- **UI Components**: Custom component library built with Tailwind CSS and Framer Motion, supporting dark/light themes.
- **Accessibility**: SEO optimization, Core Web Vitals, keyboard navigation, screen reader support, and mobile optimization.
- **Real-time Updates**: Socket.IO-based `RealtimeContext` with Firebase authentication, providing real-time data updates and cache invalidation for TanStack Query.
- **Skeleton Loading System**: Comprehensive skeleton components and page-specific loaders with GPU-accelerated shimmer animation across 15+ pages.

### Mobile Performance Optimization System
The app includes a comprehensive mobile performance optimization system for lightning-fast performance on all devices:

- **Adaptive Animation System** (`client/src/lib/mobile-performance-optimizer.ts`):
  - Device capability detection (memory, CPU cores, GPU, connection type)
  - Quality tiers: ultra, high, medium, low with auto-selection
  - FPS monitoring with auto-downgrade/upgrade
  - `prefers-reduced-motion` support
  - Animation presets for each quality tier
  - `AdaptiveAnimationProvider` wraps the app in `App.tsx`

- **Optimized Image Component** (`client/src/components/ui/optimized-image.tsx`):
  - IntersectionObserver-based lazy loading
  - Blur-up placeholder effect
  - WebP/AVIF format detection
  - Responsive srcSet generation
  - SSR-compatible with proper guards

- **Virtual List Component** (`client/src/components/ui/virtual-list.tsx`):
  - Windowed rendering for long lists
  - Dynamic and fixed item height support
  - Mobile touch optimization with momentum scrolling
  - Keyboard navigation for accessibility

- **Build Optimizations** (`vite.config.ts`):
  - Code splitting: react-vendor, three-vendor, ui-vendor, firebase-vendor, query-vendor
  - Terser minification with console removal
  - PWA with service worker caching (StaleWhileRevalidate for JS/CSS, CacheFirst for fonts/images)
  - Offline fallback page

- **CSS Performance** (`client/src/index.css`):
  - GPU acceleration classes (`.gpu-accelerated`, `.will-animate-*`)
  - CSS containment utilities (`.contain-layout`, `.contain-paint`)
  - Quality tier-based styling via `[data-quality-tier]`
  - Touch-friendly 44px tap targets on mobile
  - Content visibility for off-screen content

## External Dependencies

| Service | Purpose |
|---------|---------|
| MongoDB Atlas | Primary database |
| Firebase | Authentication |
| OpenAI | AI content generation |
| Google Gemini | AI fallback |
| Instagram API | Social media integration |
| Razorpay | Payment processing (INR) |
| Stripe | Payment processing (International) |
| SendGrid | Email service |
| Redis/Upstash | Caching |
| Sentry | Error tracking |