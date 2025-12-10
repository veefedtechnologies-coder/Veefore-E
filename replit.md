# VeeFore - AI-Powered Social Media Management Platform

## Overview
VeeFore is an AI-powered social media management platform designed for creators and businesses. It offers AI-driven content creation, intelligent scheduling, and comprehensive analytics to streamline social media presence and engagement. The platform aims to provide a robust solution for efficient social media management with features like OAuth 2.0 security, mobile optimization, WCAG accessibility, and GDPR compliance.

## User Preferences
- Follow existing project structure
- Use established databases and APIs
- Maintain lazy-loading pattern for API clients
- Keep graceful fallbacks for external services

## System Architecture

### Tech Stack
-   **Frontend**: React, TypeScript, Vite
-   **Backend**: Express.js, Node.js
-   **Database**: MongoDB Atlas, PostgreSQL
-   **Caching**: Redis (with in-memory fallback)
-   **Authentication**: Firebase Auth, Session-based
-   **AI**: OpenAI API
-   **Social Integration**: Instagram API

### Core Features
-   AI-powered content generation and smart scheduling.
-   Advanced analytics and real-time insights.
-   OAuth 2.0 with PKCE for secure authentication.
-   Mobile-optimized responsive design and WCAG accessibility.
-   Performance optimization including Redis caching and database query optimization.
-   Multi-tenant workspace isolation and comprehensive security features.
-   Graceful fallbacks for external services and robust error handling.

### Design Patterns
-   **Repository Pattern**: Backend architecture is structured using a Repository Pattern for clear separation of concerns, improved maintainability, and easier testing. Business logic is centralized within repositories, ensuring a thin delegation layer from the `mongodb-storage.ts`.
-   **Lazy Loading**: API clients and certain system components are initialized using a lazy-loading pattern to optimize resource usage.
-   **Graceful Fallbacks**: The system is designed with graceful fallbacks for external dependencies like Redis (using in-memory fallback) and MongoDB (using Atlas when local is unavailable) to ensure continuous operation.

### UI/UX Decisions
-   Optimized for mobile responsiveness and WCAG accessibility.
-   Focus on clear user prompts for account reconnection and data synchronization.
-   Animations are optimized using `useRef` guards and `React.memo` for smooth performance.

## External Dependencies
-   **OpenAI API**: For AI-powered content generation.
-   **Instagram API**: For social media integration, data polling, and analytics.
-   **MongoDB Atlas**: Primary cloud database.
-   **PostgreSQL**: Used as a database (specifically mentioned for Replit).
-   **Redis (Upstash)**: Caching layer; designed with in-memory fallback for quota limitations.
-   **Firebase Authentication**: For user authentication and session management.
-   **Stripe**: For payment processing.
-   **SendGrid**: For email notifications.

## Recent Changes (December 2025)

### React "Invalid Hook Call" Fix
- **Root Cause**: Multiple React instances were being loaded due to a combination of:
  1. Cache-busting query parameter on main.tsx script tag in index.html
  2. Manual React aliases in vite.config.ts conflicting with Vite's pre-bundled modules
- **Solution Applied**:
  1. Removed cache-busting query parameter from `<script type="module" src="/src/main.tsx">` in client/index.html
  2. Removed manual React/react-dom path aliases from vite.config.ts (kept resolve.dedupe)
  3. Removed React from root package.json (only keep in client/package.json)
  4. Let Vite handle React module resolution through its default pre-bundling

### Vite Configuration Best Practices
- Do NOT add cache-busting query parameters to script tags when using Vite
- Do NOT manually alias React paths - let Vite's resolve.dedupe handle deduplication
- Keep React dependencies only in client/package.json, not root package.json
- Clear Vite cache (rm -rf client/node_modules/.vite) when troubleshooting module issues