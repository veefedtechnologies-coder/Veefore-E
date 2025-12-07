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