# Veefore - Comprehensive Application Analysis & Documentation

**Generated:** June 1, 2026  
**Version:** 2.0.0  
**Status:** Production-Ready

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Application Overview](#application-overview)
3. [Core Architecture](#core-architecture)
4. [Technology Stack](#technology-stack)
5. [Feature Catalog](#feature-catalog)
6. [Database Schema](#database-schema)
7. [API Structure](#api-structure)
8. [Authentication & Security](#authentication--security)
9. [AI Integration](#ai-integration)
10. [Social Media Integration](#social-media-integration)
11. [Payment & Billing](#payment--billing)
12. [Background Jobs & Workers](#background-jobs--workers)
13. [Deployment Architecture](#deployment-architecture)
14. [Performance & Optimization](#performance--optimization)
15. [Monitoring & Observability](#monitoring--observability)
16. [Additional Features](#additional-features)
17. [Development Workflow](#development-workflow)
18. [Security Best Practices](#security-best-practices)
19. [Roadmap & Future Enhancements](#roadmap--future-enhancements)
20. [Conclusion](#conclusion)
21. [Support & Resources](#support--resources)
22. [Extended API Endpoints](#extended-api-endpoints)
23. [User-Facing Pages & Features](#user-facing-pages--features)
24. [Advanced AI Tools Implementation](#advanced-ai-tools-implementation)
25. [Diagnostic & Monitoring Tools](#diagnostic--monitoring-tools)
26. [Testing Infrastructure](#testing-infrastructure)
27. [Complete Route Inventory](#complete-route-inventory)
28. [Coverage Summary](#coverage-summary)
29. [Final Notes](#final-notes)

---

## 1. Executive Summary

**Veefore** is an enterprise-grade, AI-powered social media management platform that enables content creators, businesses, and marketing teams to:

- **Generate AI-powered content** (text, images, videos, thumbnails)
- **Manage multiple social media accounts** (Instagram, YouTube, Twitter, LinkedIn, Facebook)
- **Automate social media workflows** (scheduling, publishing, DM responses)
- **Analyze performance metrics** in real-time
- **Collaborate in team workspaces** with role-based access control
- **Monitor social listening** and competitor analysis

### Key Metrics
- **15+ AI-powered tools** for content creation
- **5+ social platform integrations**
- **Multi-workspace architecture** for team collaboration
- **Credit-based billing system** with subscription tiers
- **Real-time analytics** with webhook support
- **Enterprise-grade security** with GDPR compliance


---

## 2. Application Overview

### 2.1 Purpose & Vision

Veefore is designed to be the **all-in-one AI-powered social media command center** that:
- Reduces content creation time from hours to minutes
- Automates repetitive social media tasks
- Provides actionable insights through AI-powered analytics
- Enables seamless team collaboration
- Scales from individual creators to enterprise teams

### 2.2 Target Users

1. **Content Creators** - YouTubers, Instagram influencers, TikTok creators
2. **Small Businesses** - Local businesses managing social presence
3. **Marketing Agencies** - Managing multiple client accounts
4. **Enterprise Teams** - Large organizations with dedicated social media teams

### 2.3 Core Value Propositions

| Feature | Value |
|---------|-------|
| **AI Content Generation** | 10x faster content creation with GPT-4, DALL-E, Claude |
| **Multi-Platform Management** | Single dashboard for all social accounts |
| **Smart Automation** | AI-powered DM responses, scheduling, publishing |
| **Real-Time Analytics** | Live metrics with predictive insights |
| **Team Collaboration** | Workspace-based access control and workflows |
| **Credit System** | Flexible usage-based pricing model |


---

## 3. Core Architecture

### 3.1 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                             │
│  React 19 + TypeScript + Vite + TailwindCSS + Wouter       │
│  - Progressive Web App (PWA) with offline support           │
│  - React Query for state management & caching               │
│  - Firebase Auth for authentication                          │
│  - Socket.IO for real-time updates                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     API GATEWAY                              │
│  Express.js + TypeScript                                     │
│  - Rate limiting & security middleware                       │
│  - CORS & XSS protection                                     │
│  - Request validation (Zod schemas)                          │
│  - JWT token verification                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   BUSINESS LOGIC LAYER                       │
│  - Authentication Service (Firebase Admin SDK)               │
│  - Content Service (AI generation, scheduling)               │
│  - Social Media Service (Instagram, YouTube, Twitter)        │
│  - Analytics Service (metrics aggregation)                   │
│  - Automation Service (DM responses, rules)                  │
│  - Billing Service (Razorpay, Stripe)                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     DATA LAYER                               │
│  MongoDB (Primary Database)                                  │
│  - Users, Workspaces, Content, Analytics                    │
│  - Social Accounts, Automation Rules                         │
│  Redis (Caching & Queue Management)                          │
│  - Session storage, rate limiting                            │
│  - BullMQ job queues                                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  EXTERNAL INTEGRATIONS                       │
│  - OpenAI (GPT-4, DALL-E 3)                                 │
│  - Anthropic (Claude)                                        │
│  - Google (Gemini, Vertex AI)                               │
│  - Meta (Instagram Business API)                             │
│  - Google (YouTube Data API)                                 │
│  - Razorpay/Stripe (Payments)                               │
│  - SendGrid (Email)                                          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Deployment Architecture

- **Single Port Design**: Both frontend and backend run on port 5000
- **Unified Vite Server**: Serves static assets and API routes
- **Horizontal Scaling**: Leader election for distributed polling
- **Load Balancing**: Supports multiple instances with Redis coordination


---

## 4. Technology Stack

### 4.1 Frontend Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19.2.3 | UI framework |
| **TypeScript** | 5.6.3 | Type safety |
| **Vite** | 7.1.4 | Build tool & dev server |
| **TailwindCSS** | 3.4.18 | Styling framework |
| **Wouter** | 3.9.0 | Lightweight routing |
| **React Query** | 5.90.12 | Server state management |
| **Framer Motion** | 12.23.26 | Animations |
| **Three.js** | 0.182.0 | 3D graphics |
| **Recharts** | 3.6.0 | Data visualization |
| **Socket.IO Client** | 4.8.3 | Real-time communication |
| **Lucide React** | 0.562.0 | Icon library |
| **React Markdown** | 10.1.0 | Markdown rendering |

### 4.2 Backend Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 20.16.11 | Runtime environment |
| **Express.js** | 4.21.2 | Web framework |
| **TypeScript** | 5.6.3 | Type safety |
| **MongoDB** | 6.17.0 | Primary database |
| **Mongoose** | 8.16.2 | ODM for MongoDB |
| **Redis** | via ioredis 5.7.0 | Caching & queues |
| **BullMQ** | 5.58.4 | Job queue system |
| **Socket.IO** | 4.8.1 | WebSocket server |
| **Helmet** | 8.1.0 | Security headers |
| **Multer** | 2.0.1 | File uploads |
| **Pino** | 10.1.0 | Logging |

### 4.3 AI & ML Services

| Service | Purpose |
|---------|---------|
| **OpenAI GPT-4** | Text generation, content creation |
| **OpenAI DALL-E 3** | Image generation |
| **Anthropic Claude** | Advanced text generation |
| **Google Gemini 2.5 Flash** | Script generation, image creation |
| **Google Vertex AI** | Enterprise AI services |
| **ElevenLabs** | Voice synthesis |
| **Replicate** | Video generation (Runway ML) |

### 4.4 External APIs

| API | Purpose |
|-----|---------|
| **Instagram Business API** | Account management, publishing, analytics |
| **YouTube Data API v3** | Channel analytics, video management |
| **Twitter API v2** | Tweet scheduling, analytics |
| **LinkedIn API** | Professional content publishing |
| **Facebook Graph API** | Page management, insights |


---

## 5. Feature Catalog

### 5.1 AI-Powered Content Creation (15+ Tools)

#### 5.1.1 Thumbnail Maker Pro
- **7-stage professional thumbnail generation**
- **AI-powered design suggestions**
- **Multiple layout variants** (Face Left Text Right, CTA Badge Focus, Emoji Overlay, Trending Style)
- **Customizable templates** with brand consistency
- **Export formats**: PNG, JPG, WebP

#### 5.1.2 Script Generator
- **AI-powered video script creation**
- **Scene-by-scene breakdown**
- **Tone and style customization**
- **Multiple AI models**: Gemini 2.5 Flash, Vertex AI, GPT-4
- **Structured JSON output** for video production

#### 5.1.3 Caption Generator
- **Platform-specific optimization** (Instagram, YouTube, Twitter)
- **Hashtag suggestions** with trending analysis
- **Emoji integration**
- **Character limit awareness**
- **A/B testing variants**

#### 5.1.4 Hashtag Optimizer
- **Trending hashtag discovery**
- **Niche-specific recommendations**
- **Engagement prediction**
- **Competitor hashtag analysis**
- **Banned hashtag detection**

#### 5.1.5 Image Generator
- **DALL-E 3 integration**
- **Gemini image generation**
- **Vertex AI Imagen 3.0**
- **Custom prompt enhancement**
- **Style transfer capabilities**

#### 5.1.6 Video Generator
- **Runway ML integration**
- **Text-to-video generation**
- **Scene composition**
- **Automated editing**
- **Multiple aspect ratios**

#### 5.1.7 Voice Synthesis
- **ElevenLabs integration**
- **Multiple voice options**
- **Emotion control**
- **Multi-language support**
- **Custom voice cloning**


### 5.2 Social Media Management

#### 5.2.1 Multi-Platform Account Management
- **Instagram Business Accounts**
  - OAuth 2.0 authentication with PKCE
  - Token encryption and secure storage
  - Automatic token refresh
  - Account health monitoring
  
- **YouTube Channels**
  - Google OAuth integration
  - Channel analytics
  - Video metadata management
  
- **Twitter/X Accounts**
  - API v2 integration
  - Tweet scheduling
  - Engagement tracking
  
- **LinkedIn Pages**
  - Professional content publishing
  - Company page management
  
- **Facebook Pages**
  - Graph API integration
  - Post scheduling and insights

#### 5.2.2 Content Scheduling & Publishing
- **Smart Scheduler**
  - Best time to post recommendations
  - Timezone-aware scheduling
  - Bulk scheduling support
  - Draft management
  
- **Direct Publishing**
  - Instagram posts, stories, reels
  - YouTube video uploads
  - Twitter threads
  - LinkedIn articles
  
- **Publishing Queue**
  - BullMQ-based job processing
  - Retry logic with exponential backoff
  - Failure notifications
  - Publishing logs and audit trail

#### 5.2.3 Analytics & Insights
- **Real-Time Metrics**
  - Followers, likes, comments, shares
  - Reach and impressions
  - Engagement rate calculations
  - Story views and interactions
  
- **Historical Data**
  - Daily snapshots
  - Trend analysis
  - Performance comparisons
  - Export capabilities (CSV, PDF)
  
- **Predictive Analytics**
  - Viral potential scoring
  - Engagement predictions
  - Optimal posting times
  - Content performance forecasting


### 5.3 Automation & AI Assistants

#### 5.3.1 DM Automation
- **AI-Powered Responses**
  - Natural language understanding
  - Context-aware replies
  - Sentiment analysis
  - Multi-language support
  
- **Rule-Based Automation**
  - Keyword triggers
  - Custom response templates
  - Conditional logic
  - Time-based rules
  
- **Smart Filtering**
  - Spam detection
  - Priority inbox
  - Auto-categorization
  - VIP user identification

#### 5.3.2 VeeGPT (AI Copilot)
- **Conversational AI Assistant**
  - Content ideation
  - Strategy recommendations
  - Performance analysis
  - Troubleshooting help
  
- **Context-Aware Suggestions**
  - Account-specific insights
  - Historical performance data
  - Industry best practices
  - Competitor analysis

#### 5.3.3 Social Listening
- **Brand Monitoring**
  - Mention tracking
  - Sentiment analysis
  - Competitor mentions
  - Industry trends
  
- **Keyword Tracking**
  - Custom keyword lists
  - Real-time alerts
  - Engagement opportunities
  - Crisis detection

### 5.4 Team Collaboration

#### 5.4.1 Workspace Management
- **Multi-Workspace Support**
  - Unlimited workspaces per user
  - Workspace-level settings
  - Resource isolation
  - Cross-workspace switching
  
- **Role-Based Access Control**
  - Owner: Full administrative access
  - Admin: Management capabilities
  - Member: Content creation and viewing
  - Custom role definitions

#### 5.4.2 Team Features
- **Member Invitations**
  - Email-based invites
  - Invitation expiry
  - Pending invitation management
  - Bulk invitations
  
- **Activity Tracking**
  - Audit logs
  - User activity history
  - Content attribution
  - Change tracking


---

## 6. Database Schema

### 6.1 Core Collections

#### 6.1.1 Users Collection
```typescript
{
  _id: ObjectId,
  firebaseUid: string,           // Firebase authentication ID
  email: string,                  // User email (unique)
  username: string,               // Username (unique)
  displayName: string,            // Display name
  avatar: string,                 // Profile picture URL
  credits: number,                // Available credits
  plan: string,                   // Subscription plan (Free, Basic, Pro, Enterprise)
  stripeCustomerId: string,       // Stripe customer ID
  stripeSubscriptionId: string,   // Active subscription ID
  referralCode: string,           // Unique referral code
  totalReferrals: number,         // Number of referrals
  totalEarned: number,            // Earnings from referrals
  referredBy: string,             // Referrer's code
  preferences: object,            // User preferences
  isOnboarded: boolean,           // Onboarding completion status
  onboardingStep: number,         // Current onboarding step
  onboardingData: object,         // Onboarding form data
  goals: array,                   // User goals
  niche: string,                  // Content niche
  targetAudience: string,         // Target audience
  contentStyle: string,           // Preferred content style
  postingFrequency: string,       // Posting frequency
  socialPlatforms: array,         // Connected platforms
  status: string,                 // Account status (active, waitlisted, suspended)
  trialExpiresAt: Date,           // Trial expiration date
  hasUsedWaitlistBonus: boolean,  // Waitlist bonus claimed
  dailyLoginStreak: number,       // Login streak count
  lastLoginAt: Date,              // Last login timestamp
  workspaceId: string,            // Default workspace ID
  createdAt: Date,
  updatedAt: Date
}
```

#### 6.1.2 Workspaces Collection
```typescript
{
  _id: ObjectId,
  workspaceId: string,            // Unique workspace identifier
  name: string,                   // Workspace name
  members: [string],              // Array of user IDs
  ownerId: string,                // Workspace owner ID
  plan: string,                   // Workspace plan (free, basic, pro, enterprise)
  instagramAccountsCount: number, // Number of connected Instagram accounts
  maxInstagramAccounts: number,   // Maximum allowed Instagram accounts
  apiRateLimit: number,           // API requests per hour
  webhookUrl: string,             // Webhook endpoint URL
  webhookSecret: string,          // Webhook secret key
  settings: {
    pollingEnabled: boolean,
    webhooksEnabled: boolean,
    smartPollingIntervals: {
      followers: number,          // Polling interval in minutes
      likes: number,
      comments: number,
      reach: number,
      impressions: number
    },
    retryPolicy: {
      maxRetries: number,
      backoffMultiplier: number,
      maxBackoffTime: number
    }
  },
  lastActivity: Date,
  createdAt: Date,
  updatedAt: Date
}
```



#### 6.1.3 Content Collection
```typescript
{
  _id: ObjectId,
  workspaceId: string,              // Workspace identifier
  accountId: string,                // Social account ID
  instagramPostId: string,          // Instagram post ID
  type: string,                     // Content type (post, story, reel, video, image, caption, script, thumbnail)
  title: string,                    // Content title
  description: string,              // Content description
  contentData: object,              // Content-specific data
  platform: string,                 // Target platform (instagram, youtube, twitter, etc.)
  status: string,                   // Status (draft, scheduled, queued, publishing, processing, published, failed, cancelled)
  scheduledAt: Date,                // Scheduled publish time
  publishedAt: Date,                // Actual publish time
  processingStartedAt: Date,        // Processing start time
  failedAt: Date,                   // Failure timestamp
  retryAt: Date,                    // Next retry time
  publishAttempts: number,          // Number of publish attempts
  metaCreationId: string,           // Meta API creation ID
  metaPublishedId: string,          // Meta API published ID
  lastError: string,                // Last error message
  creditsUsed: number,              // Credits consumed
  prompt: string,                   // AI generation prompt
  metrics: {
    likes: number,
    comments: number,
    shares: number,
    saves: number,
    engagement: number,
    views: number,
    reach: number,
    impressions: number
  },
  createdAt: Date,
  updatedAt: Date
}
```


#### 6.1.4 Social Accounts Collection
```typescript
{
  _id: ObjectId,
  workspaceId: string,              // Workspace identifier
  platform: string,                 // Platform (instagram, youtube, twitter, linkedin, facebook)
  username: string,                 // Account username
  accountId: string,                // Platform account ID
  pageId: string,                   // Facebook/Instagram page ID
  accessToken: string,              // OAuth access token (deprecated)
  refreshToken: string,             // OAuth refresh token (deprecated)
  encryptedAccessToken: object,     // Encrypted access token (secure)
  encryptedRefreshToken: object,    // Encrypted refresh token (secure)
  expiresAt: Date,                  // Token expiration date
  tokenStatus: string,              // Token status (valid, expired, revoked)
  isActive: boolean,                // Account active status
  followersCount: number,           // Followers count
  followingCount: number,           // Following count
  mediaCount: number,               // Media count
  biography: string,                // Account bio
  website: string,                  // Website URL
  profilePictureUrl: string,        // Profile picture URL
  accountType: string,              // Account type (PERSONAL, BUSINESS, CREATOR)
  isBusinessAccount: boolean,       // Business account flag
  isVerified: boolean,              // Verified account flag
  avgLikes: number,                 // Average likes per post
  avgComments: number,              // Average comments per post
  avgReach: number,                 // Average reach per post
  engagementRate: number,           // Engagement rate percentage
  totalLikes: number,               // Total likes
  totalComments: number,            // Total comments
  totalReach: number,               // Total reach
  avgEngagement: number,            // Average engagement
  totalShares: number,              // Total shares
  totalSaves: number,               // Total saves
  audienceCity: Map<string, number>,        // Audience by city
  audienceCountry: Map<string, number>,     // Audience by country
  audienceGenderAge: Map<string, number>,   // Audience by gender/age
  audienceActiveTime: Map<string, number>,  // Audience active times
  aiBestActiveTime: {
    best_hour: number,              // Best hour to post (0-23)
    best_hour_label: string,        // Human-readable label
    best_hours: number[],           // Top posting hours
    best_window_label: string,      // Best time window
    best_window: {
      start: number,
      end: number
    },
    confidence: number,             // Confidence score (0-1)
    confidence_level: string,       // Confidence level (Learning, Low, Medium, High)
    status: string,                 // Status (Learning, Ready)
    posts_used: number,             // Posts analyzed
    usable_posts: number,           // Usable posts count
    scanned_posts: number,          // Total posts scanned
    z_score: number,                // Statistical z-score
    separation_ratio: number,       // Peak separation ratio
    entropy: number,                // Data entropy
    dominant_weekday: string,       // Best day of week
    heatmap_data: number[][],       // 7x24 heatmap
    daily_best_hours: array,        // Best hours per day
    method: string,                 // Analysis method
    lastComputedAt: Date            // Last computation time
  },
  lastSyncAt: Date,                 // Last sync timestamp
  createdAt: Date,
  updatedAt: Date
}
```


#### 6.1.5 Analytics Collection
```typescript
{
  _id: ObjectId,
  workspaceId: string,              // Workspace identifier
  accountId: string,                // Social account ID
  platform: string,                 // Platform name
  date: Date,                       // Analytics date
  metrics: Map<string, any>,        // Custom metrics map
  views: number,                    // Total views
  likes: number,                    // Total likes
  comments: number,                 // Total comments
  shares: number,                   // Total shares
  followers: number,                // Followers count
  posts: number,                    // Posts count
  reach: number,                    // Total reach
  reachDay: number,                 // Daily reach
  reachWeek: number,                // Weekly reach
  reachDays28: number,              // 28-day reach
  engagement: number,               // Total engagement
  audienceCity: Map<string, number>,        // Audience by city
  audienceCountry: Map<string, number>,     // Audience by country
  audienceGenderAge: Map<string, number>,   // Audience by gender/age
  audienceActiveTime: Map<string, number>,  // Audience active times
  sentiment: {
    positive: number,               // Positive sentiment %
    neutral: number,                // Neutral sentiment %
    negative: number                // Negative sentiment %
  },
  createdAt: Date
}
```

#### 6.1.6 Automation Rules Collection
```typescript
{
  _id: ObjectId,
  name: string,                     // Rule name
  workspaceId: string,              // Workspace identifier
  description: string,              // Rule description
  isActive: boolean,                // Active status
  type: string,                     // Rule type (dm_response, comment_response, auto_like, etc.)
  postInteraction: boolean,         // Post interaction flag
  platform: string,                 // Target platform
  keywords: string[],               // Trigger keywords
  responses: object,                // Response templates
  targetMediaIds: string[],         // Target media IDs
  followerGate: {
    enabled: boolean,
    lockedMessage: string,
    visitProfileLabel: string,
    confirmLabel: string,
    retryMessage: string,
    successMessage: string,
    delay: string,
    maxRetries: number
  },
  matchMode: string,                // Match mode (exact, contains, intent, any)
  negativeKeywords: string[],       // Negative keywords
  aiIntents: string[],              // AI intent matching
  trigger: object,                  // Trigger configuration
  triggers: object,                 // Multiple triggers
  action: object,                   // Action configuration
  lastRun: Date,                    // Last execution time
  nextRun: Date,                    // Next scheduled run
  createdAt: Date,
  updatedAt: Date
}
```


#### 6.1.7 Credit Transactions Collection
```typescript
{
  _id: ObjectId,
  userId: string,                   // User identifier
  amount: number,                   // Credit amount (positive for add, negative for deduct)
  type: string,                     // Transaction type (purchase, usage, bonus, refund, referral)
  description: string,              // Transaction description
  workspaceId: string,              // Workspace identifier
  referenceId: string,              // Reference ID (order ID, content ID, etc.)
  createdAt: Date
}
```

#### 6.1.8 Chat Messages Collection
```typescript
{
  _id: ObjectId,
  id: number,                       // Message ID
  conversationId: number,           // Conversation ID
  role: string,                     // Role (user, assistant)
  content: string,                  // Message content
  tokensUsed: number,               // Tokens consumed
  createdAt: Date
}
```

### 6.2 Indexes & Performance

All collections use strategic indexes for optimal query performance:

- **Workspace-based queries**: `{ workspaceId: 1 }`
- **Time-series queries**: `{ date: -1 }`, `{ createdAt: -1 }`
- **Compound indexes**: `{ workspaceId: 1, status: 1 }`, `{ workspaceId: 1, platform: 1, date: -1 }`
- **Webhook lookups**: `{ pageId: 1, platform: 1 }`, `{ accountId: 1, platform: 1 }`
- **Active account queries**: `{ isActive: 1, tokenStatus: 1 }`


---

## 7. API Structure

### 7.1 API Versioning

- **Base Path**: `/api` or `/api/v1`
- **Authentication**: Firebase JWT tokens via `Authorization: Bearer <token>` header
- **Rate Limiting**: Tiered based on subscription plan
- **Response Format**: JSON with consistent error structure

### 7.2 Core API Endpoints

#### 7.2.1 Authentication Routes (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/verify-email` | Verify email address |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password |


#### 7.2.2 User Routes (`/api/v1/users`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users/profile` | Get user profile |
| PUT | `/api/v1/users/profile` | Update user profile |
| GET | `/api/v1/users/credits` | Get credit balance |
| GET | `/api/v1/users/transactions` | Get credit transaction history |
| POST | `/api/v1/users/onboarding` | Complete onboarding |
| GET | `/api/v1/users/referral-stats` | Get referral statistics |

#### 7.2.3 Workspace Routes (`/api/v1/workspaces`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/workspaces` | List all workspaces |
| POST | `/api/v1/workspaces` | Create new workspace |
| GET | `/api/v1/workspaces/:id` | Get workspace details |
| PUT | `/api/v1/workspaces/:id` | Update workspace |
| DELETE | `/api/v1/workspaces/:id` | Delete workspace |
| POST | `/api/v1/workspaces/:id/members` | Invite member |
| DELETE | `/api/v1/workspaces/:id/members/:userId` | Remove member |
| PUT | `/api/v1/workspaces/:id/members/:userId/role` | Update member role |

#### 7.2.4 Social Account Routes (`/api/v1/social-accounts`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/social-accounts` | List connected accounts |
| POST | `/api/v1/social-accounts/connect` | Connect new account |
| DELETE | `/api/v1/social-accounts/:id` | Disconnect account |
| POST | `/api/v1/social-accounts/:id/sync` | Sync account data |
| GET | `/api/v1/social-accounts/:id/analytics` | Get account analytics |
| GET | `/api/v1/social-accounts/:id/best-time` | Get best posting time |

#### 7.2.5 Content Routes (`/api/v1/content`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/content` | List all content |
| POST | `/api/v1/content` | Create new content |
| GET | `/api/v1/content/:id` | Get content details |
| PUT | `/api/v1/content/:id` | Update content |
| DELETE | `/api/v1/content/:id` | Delete content |
| POST | `/api/v1/content/:id/schedule` | Schedule content |
| POST | `/api/v1/content/:id/publish` | Publish content immediately |
| POST | `/api/v1/content/:id/cancel` | Cancel scheduled content |


#### 7.2.6 AI Generation Routes (`/api/ai`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/generate-caption` | Generate AI caption |
| POST | `/api/ai/generate-hashtags` | Generate hashtags |
| POST | `/api/ai/generate-script` | Generate video script |
| POST | `/api/ai/generate-image` | Generate AI image |
| POST | `/api/ai/generate-thumbnail` | Generate thumbnail |
| POST | `/api/ai/generate-video` | Generate AI video |
| POST | `/api/ai/generate-voice` | Generate voice synthesis |
| POST | `/api/ai/copilot/chat` | VeeGPT chat endpoint |
| POST | `/api/ai/analyze-content` | Analyze content performance |
| POST | `/api/ai/suggest-improvements` | Get AI suggestions |

#### 7.2.7 Analytics Routes (`/api/v1/analytics`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/analytics/dashboard` | Get dashboard metrics |
| GET | `/api/v1/analytics/overview` | Get analytics overview |
| GET | `/api/v1/analytics/performance` | Get performance metrics |
| GET | `/api/v1/analytics/audience` | Get audience insights |
| GET | `/api/v1/analytics/engagement` | Get engagement metrics |
| GET | `/api/v1/analytics/growth` | Get growth trends |
| GET | `/api/v1/analytics/export` | Export analytics data |

#### 7.2.8 Automation Routes (`/api/v1/automation`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/automation/rules` | List automation rules |
| POST | `/api/v1/automation/rules` | Create automation rule |
| GET | `/api/v1/automation/rules/:id` | Get rule details |
| PUT | `/api/v1/automation/rules/:id` | Update rule |
| DELETE | `/api/v1/automation/rules/:id` | Delete rule |
| POST | `/api/v1/automation/rules/:id/toggle` | Enable/disable rule |
| GET | `/api/v1/automation/logs` | Get automation logs |

#### 7.2.9 Billing Routes (`/api/subscription`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/subscription/plans` | List subscription plans |
| POST | `/api/subscription/create-order` | Create payment order |
| POST | `/api/subscription/verify-payment` | Verify payment |
| POST | `/api/subscription/cancel` | Cancel subscription |
| GET | `/api/subscription/invoices` | Get invoice history |
| POST | `/api/subscription/buy-credits` | Purchase credits |


#### 7.2.10 Webhook Routes (`/api/webhooks`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/instagram` | Instagram webhook receiver |
| GET | `/api/webhooks/instagram` | Instagram webhook verification |
| POST | `/api/webhooks/youtube` | YouTube webhook receiver |
| POST | `/api/webhooks/twitter` | Twitter webhook receiver |
| POST | `/api/webhooks/razorpay` | Razorpay payment webhook |
| POST | `/api/webhooks/stripe` | Stripe payment webhook |

#### 7.2.11 Admin Routes (`/api/admin`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/analytics` | System analytics |
| POST | `/api/admin/users/:id/credits` | Adjust user credits |
| POST | `/api/admin/users/:id/suspend` | Suspend user account |
| GET | `/api/admin/logs` | View system logs |
| GET | `/api/admin/metrics` | System metrics |


---

## 8. Authentication & Security

### 8.1 Authentication Flow

#### 8.1.1 Firebase Authentication
- **Primary Auth Provider**: Firebase Authentication
- **Supported Methods**:
  - Email/Password
  - Google OAuth
  - Social login providers
- **Token Management**: JWT tokens with automatic refresh
- **Session Duration**: Configurable (default: 7 days)

#### 8.1.2 OAuth 2.0 Flow (Social Media)
```
1. User initiates connection → Generate OAuth URL with PKCE
2. User authorizes on platform → Redirect with authorization code
3. Exchange code for tokens → Store encrypted tokens
4. Refresh tokens automatically → Background token refresh service
5. Handle token expiration → Notify user and request re-authorization
```

### 8.2 Security Measures

#### 8.2.1 Token Encryption
- **Algorithm**: AES-256-GCM
- **Key Management**: Environment-based encryption keys
- **Token Storage**: Encrypted access/refresh tokens in database
- **Key Rotation**: Supported via migration scripts


#### 8.2.2 Rate Limiting

| Tier | Requests/Hour | Burst Limit |
|------|---------------|-------------|
| **Free** | 100 | 20 |
| **Basic** | 500 | 50 |
| **Pro** | 2,000 | 100 |
| **Enterprise** | 10,000 | 500 |

**Rate Limiting Strategy**:
- Redis-based distributed rate limiting
- Per-user and per-IP tracking
- Exponential backoff for repeated violations
- Brute force protection on auth endpoints

#### 8.2.3 Security Headers (Helmet.js)
```javascript
- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security
- X-XSS-Protection
- Referrer-Policy: no-referrer
```

#### 8.2.4 CORS Configuration
- **Allowed Origins**: Configurable whitelist
- **Credentials**: Enabled for authenticated requests
- **Methods**: GET, POST, PUT, DELETE, PATCH
- **Headers**: Authorization, Content-Type, X-Requested-With

#### 8.2.5 Input Validation
- **Schema Validation**: Zod schemas for all API inputs
- **SQL Injection Prevention**: Mongoose ODM with parameterized queries
- **XSS Protection**: Input sanitization and output encoding
- **File Upload Security**: 
  - File type validation
  - Size limits (50MB for videos, 10MB for images)
  - Virus scanning (optional)
  - Secure file storage

### 8.3 GDPR Compliance

#### 8.3.1 Data Privacy
- **Right to Access**: Users can export all their data
- **Right to Deletion**: Complete data deletion on request
- **Data Portability**: JSON export of all user data
- **Consent Management**: Explicit consent for data processing

#### 8.3.2 Data Retention
- **User Data**: Retained until account deletion
- **Analytics Data**: 90 days rolling window
- **Audit Logs**: 1 year retention
- **Deleted Data**: 30-day soft delete before permanent removal


---

## 9. AI Integration

### 9.1 OpenAI Integration

#### 9.1.1 GPT-4 Text Generation
- **Use Cases**:
  - Caption generation
  - Script writing
  - Content ideation
  - VeeGPT conversational AI
  - Hashtag suggestions
- **Model**: GPT-4o (latest)
- **Max Tokens**: Configurable (default: 1200)
- **Temperature**: 0.7-0.9 for creative content
- **Cost Tracking**: Per-request token usage monitoring


#### 9.1.2 DALL-E 3 Image Generation
- **Model**: DALL-E 3
- **Resolutions**: 1024x1024, 1024x1792, 1792x1024
- **Quality**: Standard and HD
- **Style**: Natural and Vivid
- **Prompt Enhancement**: Automatic prompt optimization
- **Cost**: 1 credit per standard image, 2 credits per HD image

#### 9.1.3 Video Script Generation
- **Scene Breakdown**: 3-8 scenes per video
- **Duration Control**: Configurable video length
- **Visual Descriptions**: Detailed prompts for image generation
- **Voiceover Instructions**: Emotion, pace, emphasis markers
- **JSON Output**: Structured script format

### 9.2 Anthropic Claude Integration

#### 9.2.1 Advanced Text Generation
- **Model**: Claude 3 Opus / Sonnet
- **Use Cases**:
  - Long-form content
  - Complex script generation
  - Content analysis
  - Advanced copywriting
- **Context Window**: 200K tokens
- **Streaming**: Real-time response streaming

### 9.3 Google AI Integration

#### 9.3.1 Gemini 2.5 Flash
- **Use Cases**:
  - Fast script generation
  - Image generation
  - Multi-modal content analysis
- **Speed**: 2-3x faster than GPT-4
- **Cost**: Lower cost per request

#### 9.3.2 Vertex AI Imagen 3.0
- **High-Quality Image Generation**
- **Photorealistic Output**
- **Enterprise-Grade Reliability**
- **Custom Model Fine-Tuning**

### 9.4 ElevenLabs Voice Synthesis

#### 9.4.1 Voice Generation
- **Voice Options**: 50+ pre-made voices
- **Languages**: 29+ languages supported
- **Emotions**: Configurable emotion and tone
- **Custom Voices**: Voice cloning capability
- **Output Format**: MP3, WAV
- **Quality**: 44.1kHz, 16-bit

### 9.5 Replicate / Runway ML

#### 9.5.1 Video Generation
- **Runway Gen-2**: Text-to-video generation
- **AnimateDiff**: Image animation
- **Motion Control**: Camera movement and transitions
- **Duration**: Up to 16 seconds per generation
- **Resolution**: 1280x768, 768x1280


### 9.6 AI Credit System

| AI Service | Credit Cost |
|------------|-------------|
| **Caption Generation** | 1 credit |
| **Hashtag Generation** | 1 credit |
| **Script Generation** | 2 credits |
| **Image Generation (Standard)** | 1 credit |
| **Image Generation (HD)** | 2 credits |
| **Thumbnail Generation** | 2 credits |
| **Voice Synthesis (per minute)** | 3 credits |
| **Video Generation (per second)** | 5 credits |
| **VeeGPT Chat Message** | 0.5 credits |


---

## 10. Social Media Integration

### 10.1 Instagram Business API

#### 10.1.1 Authentication
- **OAuth 2.0 with PKCE**: Enhanced security flow
- **Scopes Required**:
  - `instagram_business_basic` - Profile access
  - `instagram_business_content_publish` - Publishing
  - `instagram_business_manage_messages` - DM automation
  - `instagram_business_manage_comments` - Comment management
- **Token Lifecycle**:
  - Short-lived tokens: 1 hour
  - Long-lived tokens: 60 days
  - Automatic refresh: 30 days before expiry

#### 10.1.2 Publishing Capabilities
- **Photo Posts**: Direct publishing with captions, mentions, collaborators
- **Video Posts/Reels**: Container creation → Status polling → Publishing
- **Stories**: Image and video stories with 24-hour expiry
- **Carousel Posts**: Multiple images/videos in single post
- **Publishing Queue**: BullMQ-based job processing with retry logic

#### 10.1.3 Analytics & Insights
- **Account Insights**:
  - Impressions, reach, profile views
  - Follower count, website clicks
  - Audience demographics (city, country, gender/age)
  - Audience active times
- **Media Insights**:
  - Likes, comments, shares, saves
  - Reach, impressions, engagement rate
  - Video views, story interactions
- **Batch API Optimization**: Single request for multiple media insights


#### 10.1.4 DM Automation
- **Webhook Integration**: Real-time message notifications
- **AI-Powered Responses**: GPT-4 based intelligent replies
- **Rule-Based Automation**: Keyword triggers and templates
- **Follower Gate Funnel**: Automated follower verification
- **Anti-Spam Protection**: Rate limiting and spam detection

#### 10.1.5 Best Time to Post (AI-Powered)
- **Algorithm**: V4 Adaptive Post Performance Model
- **Data Sources**:
  - Historical post performance
  - Audience active times
  - Engagement patterns
- **Analysis**:
  - 7x24 heatmap generation
  - Statistical z-score calculation
  - Peak separation ratio
  - Entropy analysis
- **Confidence Levels**: Learning → Low → Medium → High
- **Output**: Best hour, best window, daily recommendations

### 10.2 YouTube Data API v3

#### 10.2.1 Authentication
- **Google OAuth 2.0**: Standard OAuth flow
- **Scopes**: `youtube.readonly`, `youtube.upload`, `youtube.force-ssl`

#### 10.2.2 Features
- **Channel Analytics**: Views, subscribers, watch time
- **Video Management**: Upload, update, delete videos
- **Comment Management**: Read and respond to comments
- **Playlist Management**: Create and manage playlists

### 10.3 Twitter API v2

#### 10.3.1 Features
- **Tweet Publishing**: Text, images, videos
- **Thread Creation**: Multi-tweet threads
- **Analytics**: Impressions, engagements, retweets
- **Scheduling**: Queue-based tweet scheduling

### 10.4 LinkedIn API

#### 10.4.1 Features
- **Professional Content Publishing**: Articles and posts
- **Company Page Management**: Post as company
- **Analytics**: Post impressions, engagement

### 10.5 Facebook Graph API

#### 10.5.1 Features
- **Page Management**: Post to Facebook pages
- **Insights**: Page and post analytics
- **Cross-Posting**: Share to Instagram simultaneously


---

## 11. Payment & Billing

### 11.1 Payment Providers

#### 11.1.1 Razorpay (Primary - India)
- **Supported Methods**: UPI, Cards, Net Banking, Wallets
- **Currency**: INR
- **Features**:
  - Instant payment verification
  - Webhook notifications
  - Refund support
  - Subscription management


#### 11.1.2 Stripe (International)
- **Supported Methods**: Credit/Debit Cards, Apple Pay, Google Pay
- **Currency**: USD, EUR, GBP, and 135+ currencies
- **Features**:
  - Recurring billing
  - Invoice generation
  - Tax calculation
  - Fraud detection

### 11.2 Subscription Plans

| Plan | Price (INR) | Price (USD) | Credits/Month | Features |
|------|-------------|-------------|---------------|----------|
| **Free** | ₹0 | $0 | 50 | 1 workspace, 1 social account, basic AI tools |
| **Basic** | ₹999 | $12 | 500 | 3 workspaces, 5 social accounts, all AI tools |
| **Pro** | ₹2,999 | $36 | 2,000 | 10 workspaces, 20 social accounts, priority support |
| **Enterprise** | Custom | Custom | Unlimited | Unlimited everything, dedicated support, SLA |

### 11.3 Credit Packages

| Package | Credits | Price (INR) | Bonus | Total Credits |
|---------|---------|-------------|-------|---------------|
| **Starter** | 100 | ₹199 | 10 | 110 |
| **Growth** | 500 | ₹899 | 75 | 575 |
| **Pro** | 1,000 | ₹1,699 | 200 | 1,200 |
| **Business** | 5,000 | ₹7,999 | 1,500 | 6,500 |

### 11.4 Billing Features

#### 11.4.1 Credit System
- **Real-Time Tracking**: Live credit balance updates
- **Usage Analytics**: Detailed credit consumption reports
- **Auto-Recharge**: Automatic credit purchase when low
- **Rollover**: Unused credits roll over to next month (Pro+)

#### 11.4.2 Invoicing
- **Automatic Generation**: Invoice created on payment
- **GST Compliance**: Indian tax compliance
- **Email Delivery**: Automatic invoice emails
- **Download**: PDF invoice download

#### 11.4.3 Refund Policy
- **7-Day Money Back**: Full refund within 7 days
- **Partial Refunds**: Pro-rated refunds for subscriptions
- **Credit Refunds**: Unused credits refundable
- **Processing Time**: 5-7 business days


---

## 12. Background Jobs & Workers

### 12.1 BullMQ Queue System

#### 12.1.1 Queue Architecture
- **Redis-Based**: Distributed job queue with Redis
- **Multiple Queues**: Separate queues for different job types
- **Priority Support**: High, normal, low priority jobs
- **Retry Logic**: Exponential backoff with max retries
- **Dead Letter Queue**: Failed jobs moved to DLQ


### 12.2 Worker Types

#### 12.2.1 Post Worker (`postWorker.ts`)
- **Responsibilities**:
  - Process scheduled posts
  - Publish content to social platforms
  - Handle publishing retries
  - Update content status
- **Retry Strategy**: 3 attempts with exponential backoff
- **Concurrency**: 5 concurrent jobs

#### 12.2.2 AI Worker (`aiWorker.ts`)
- **Responsibilities**:
  - Process AI generation requests
  - Generate captions, scripts, images
  - Handle AI service failures
  - Track credit usage
- **Retry Strategy**: 2 attempts
- **Concurrency**: 10 concurrent jobs

#### 12.2.3 Metrics Worker (`metricsWorker.ts`)
- **Responsibilities**:
  - Sync social media analytics
  - Update account metrics
  - Calculate engagement rates
  - Generate audience insights
- **Schedule**: Every 30 minutes
- **Batch Processing**: 50 accounts per batch

#### 12.2.4 Automation Worker (`automationWorker.ts`)
- **Responsibilities**:
  - Execute automation rules
  - Process DM responses
  - Handle comment automation
  - Trigger scheduled actions
- **Schedule**: Every 5 minutes
- **Concurrency**: 3 concurrent jobs

#### 12.2.5 Webhook Worker (`webhookWorker.ts`)
- **Responsibilities**:
  - Process webhook events
  - Handle Instagram notifications
  - Process payment webhooks
  - Retry failed webhooks
- **Retry Strategy**: 5 attempts
- **Concurrency**: 20 concurrent jobs

#### 12.2.6 Notification Worker (`notificationWorker.ts`)
- **Responsibilities**:
  - Send email notifications
  - Send push notifications
  - Handle notification templates
  - Track delivery status
- **Retry Strategy**: 3 attempts
- **Concurrency**: 10 concurrent jobs

#### 12.2.7 Message Worker (`messageWorker.ts`)
- **Responsibilities**:
  - Process Instagram DMs
  - Generate AI responses
  - Handle follower gate funnel
  - Track conversation state
- **Retry Strategy**: 2 attempts
- **Concurrency**: 5 concurrent jobs

### 12.3 Job Monitoring

#### 12.3.1 Bull Board Dashboard
- **URL**: `/admin/queues`
- **Features**:
  - Real-time job status
  - Queue statistics
  - Failed job inspection
  - Manual job retry
  - Job deletion


#### 12.3.2 Job Metrics
- **Completed Jobs**: Total successful jobs
- **Failed Jobs**: Total failed jobs
- **Active Jobs**: Currently processing
- **Waiting Jobs**: In queue
- **Delayed Jobs**: Scheduled for future
- **Processing Time**: Average job duration

### 12.4 Leader Election

#### 12.4.1 Distributed Polling
- **Redis-Based Leader Election**: Single leader for polling tasks
- **Automatic Failover**: New leader elected on failure
- **Heartbeat**: 30-second heartbeat interval
- **Use Cases**:
  - Instagram metrics polling
  - Token refresh scheduling
  - Cleanup tasks


---

## 13. Deployment Architecture

### 13.1 Deployment Options

#### 13.1.1 Vercel (Recommended)
- **Platform**: Serverless deployment
- **Build Command**: `npm run build`
- **Start Command**: `npm run start`
- **Environment Variables**: Configured in Vercel dashboard
- **Auto-Scaling**: Automatic based on traffic
- **CDN**: Global edge network
- **SSL**: Automatic HTTPS

#### 13.1.2 VPS Deployment
- **Supported Platforms**: DigitalOcean, AWS EC2, Linode
- **Requirements**:
  - Node.js 20.x
  - MongoDB 6.x
  - Redis 7.x
  - 2GB RAM minimum
  - 20GB storage
- **Process Manager**: PM2 for process management
- **Reverse Proxy**: Nginx for load balancing

#### 13.1.3 Docker Deployment
- **Dockerfile**: Included in repository
- **Docker Compose**: Multi-container setup
- **Containers**:
  - App container (Node.js)
  - MongoDB container
  - Redis container
- **Volumes**: Persistent data storage
- **Networks**: Internal container networking

### 13.2 Environment Configuration

#### 13.2.1 Required Environment Variables
```bash
# Database
MONGODB_URI=mongodb://localhost:27017/veefore
REDIS_URL=redis://localhost:6379

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# Instagram
INSTAGRAM_APP_ID=your-app-id
INSTAGRAM_APP_SECRET=your-app-secret

# OpenAI
OPENAI_API_KEY=sk-your-key

# Anthropic
ANTHROPIC_API_KEY=your-key

# Google AI
GOOGLE_AI_API_KEY=your-key
GOOGLE_CLOUD_PROJECT=your-project

# Payment
RAZORPAY_KEY_ID=your-key-id
RAZORPAY_KEY_SECRET=your-key-secret
STRIPE_SECRET_KEY=sk_your_key

# Security
ENCRYPTION_KEY=your-32-byte-key
JWT_SECRET=your-jwt-secret

# Application
NODE_ENV=production
PORT=5000
VITE_APP_URL=https://your-domain.com
```


### 13.3 Build & Deployment Process

#### 13.3.1 Build Steps
```bash
# Install dependencies
npm install

# Build frontend
npm run build

# Build backend
npm run build:server

# Start production server
npm run start
```

#### 13.3.2 CI/CD Pipeline
- **GitHub Actions**: Automated testing and deployment
- **Build Triggers**: Push to main branch
- **Test Suite**: Unit and integration tests
- **Deployment**: Automatic deployment on success
- **Rollback**: Automatic rollback on failure

### 13.4 Scaling Strategy

#### 13.4.1 Horizontal Scaling
- **Load Balancer**: Nginx or cloud load balancer
- **Multiple Instances**: 2-10 app instances
- **Session Management**: Redis-based sessions
- **Sticky Sessions**: Not required (stateless design)

#### 13.4.2 Database Scaling
- **MongoDB Replica Set**: 3-node replica set
- **Read Replicas**: Separate read replicas for analytics
- **Sharding**: Horizontal sharding for large datasets
- **Indexes**: Optimized indexes for query performance

#### 13.4.3 Redis Scaling
- **Redis Cluster**: Multi-node cluster for high availability
- **Sentinel**: Automatic failover
- **Persistence**: RDB + AOF for data durability


---

## 14. Performance & Optimization

### 14.1 Caching Strategy

#### 14.1.1 Redis Caching
- **User Profiles**: 3-hour TTL
- **Social Account Data**: 1-hour TTL
- **Analytics Data**: 30-minute TTL
- **API Responses**: 5-minute TTL
- **Session Data**: 7-day TTL

#### 14.1.2 Cache Invalidation
- **Write-Through**: Update cache on data modification
- **Time-Based**: Automatic expiration
- **Event-Based**: Invalidate on specific events
- **Manual**: Admin cache clear endpoint

### 14.2 Database Optimization

#### 14.2.1 Query Optimization
- **Indexes**: Strategic indexes on frequently queried fields
- **Projection**: Select only required fields
- **Aggregation Pipeline**: Optimized aggregation queries
- **Lean Queries**: Use `.lean()` for read-only operations

#### 14.2.2 Connection Pooling
- **Pool Size**: 10-50 connections
- **Connection Reuse**: Persistent connections
- **Timeout**: 30-second connection timeout


### 14.3 API Optimization

#### 14.3.1 Request Deduplication
- **Duplicate Detection**: Hash-based request identification
- **Response Caching**: Cache identical requests
- **Timeout**: 5-second deduplication window

#### 14.3.2 Batch API Requests
- **Instagram Batch API**: Single request for multiple media insights
- **Reduced API Calls**: 90% reduction in API requests
- **Faster Response**: 3x faster than sequential requests

#### 14.3.3 Compression
- **Gzip Compression**: Automatic response compression
- **Brotli Support**: Modern compression algorithm
- **Size Reduction**: 70-80% smaller payloads

### 14.4 Frontend Optimization

#### 14.4.1 Code Splitting
- **Route-Based**: Lazy load routes
- **Component-Based**: Dynamic imports
- **Vendor Splitting**: Separate vendor bundle

#### 14.4.2 Asset Optimization
- **Image Optimization**: WebP format, lazy loading
- **Font Optimization**: Subset fonts, preload
- **CSS Optimization**: Minification, critical CSS
- **JS Optimization**: Minification, tree shaking

#### 14.4.3 React Query Caching
- **Stale Time**: 5 minutes
- **Cache Time**: 30 minutes
- **Refetch on Focus**: Enabled
- **Retry Logic**: 3 attempts with exponential backoff

### 14.5 Video Processing Optimization

#### 14.5.1 Intelligent Compression
- **FFmpeg**: Hardware-accelerated encoding
- **Adaptive Bitrate**: Quality-based compression
- **Format Conversion**: MP4, WebM support
- **Size Reduction**: 50-70% smaller files

#### 14.5.2 Streaming
- **Chunked Upload**: Large file upload support
- **Progress Tracking**: Real-time upload progress
- **Resume Support**: Resume interrupted uploads


---

## 15. Monitoring & Observability

### 15.1 Error Tracking

#### 15.1.1 Sentry Integration
- **Error Capture**: Automatic error reporting
- **Source Maps**: Readable stack traces
- **User Context**: User ID, workspace ID
- **Breadcrumbs**: Event trail before error
- **Release Tracking**: Version-based error tracking


### 15.2 Logging

#### 15.2.1 Structured Logging (Pino)
- **Log Levels**: trace, debug, info, warn, error, fatal
- **JSON Format**: Machine-readable logs
- **Context**: Request ID, user ID, workspace ID
- **Performance**: High-performance logging
- **Rotation**: Daily log rotation

#### 15.2.2 Log Storage
- **Local Files**: `/server/logs/`
- **Retention**: 30 days
- **Compression**: Gzip compressed archives
- **Cloud Storage**: Optional S3/GCS backup

### 15.3 Metrics Collection

#### 15.3.1 Application Metrics
- **Request Rate**: Requests per second
- **Response Time**: Average, P50, P95, P99
- **Error Rate**: Errors per minute
- **Active Users**: Concurrent users
- **Queue Length**: Job queue size

#### 15.3.2 Business Metrics
- **User Signups**: Daily/weekly/monthly
- **Content Published**: Posts per day
- **AI Generations**: AI requests per day
- **Credit Usage**: Credits consumed
- **Revenue**: Daily/monthly revenue

#### 15.3.3 Infrastructure Metrics
- **CPU Usage**: Server CPU utilization
- **Memory Usage**: RAM consumption
- **Disk Usage**: Storage utilization
- **Network I/O**: Bandwidth usage
- **Database Connections**: Active connections

### 15.4 Health Checks

#### 15.4.1 Health Endpoints
```
GET /api/health
Response: { status: "ok", timestamp: "2026-06-01T12:00:00Z" }

GET /api/health/detailed
Response: {
  status: "ok",
  database: "connected",
  redis: "connected",
  queues: "operational",
  uptime: 86400
}
```

#### 15.4.2 Monitoring Checks
- **Database Connectivity**: MongoDB ping
- **Redis Connectivity**: Redis ping
- **Queue Health**: BullMQ queue status
- **External APIs**: Instagram, OpenAI status
- **Disk Space**: Available storage

### 15.5 Alerting

#### 15.5.1 Alert Channels
- **Email**: Critical alerts to admin
- **Slack**: Real-time notifications
- **PagerDuty**: On-call escalation
- **SMS**: Emergency alerts

#### 15.5.2 Alert Conditions
- **High Error Rate**: >5% error rate
- **Slow Response**: >2s average response time
- **Queue Backlog**: >1000 pending jobs
- **Database Issues**: Connection failures
- **Disk Space**: <10% free space
- **Memory Usage**: >90% utilization


---

## 16. Additional Features

### 16.1 Referral System
- **Unique Referral Codes**: Per-user referral codes
- **Rewards**: Credits for successful referrals
- **Tracking**: Referral conversion tracking
- **Leaderboard**: Top referrers

### 16.2 Waitlist Management
- **Early Access**: Waitlist for new features
- **Priority Queue**: VIP waitlist access
- **Bonus Credits**: Waitlist signup bonus
- **Email Notifications**: Waitlist status updates


### 16.3 Admin Panel
- **User Management**: View, edit, suspend users
- **Credit Management**: Adjust user credits
- **Analytics Dashboard**: System-wide metrics
- **Queue Management**: Monitor background jobs
- **Audit Logs**: View system activity
- **Feature Flags**: Enable/disable features

### 16.4 Email Service
- **Provider**: SendGrid
- **Templates**: Transactional email templates
- **Types**:
  - Welcome emails
  - Password reset
  - Payment confirmations
  - Notification emails
  - Marketing emails (opt-in)

### 16.5 Social Listening
- **Brand Monitoring**: Track brand mentions
- **Keyword Tracking**: Monitor specific keywords
- **Sentiment Analysis**: Positive/negative/neutral
- **Competitor Analysis**: Track competitor activity
- **Trend Detection**: Identify trending topics
- **Real-Time Alerts**: Instant notifications

### 16.6 Content Calendar
- **Visual Calendar**: Month/week/day views
- **Drag & Drop**: Reschedule content easily
- **Color Coding**: Platform-based colors
- **Bulk Actions**: Schedule multiple posts
- **Conflict Detection**: Avoid posting conflicts

### 16.7 Team Collaboration
- **Comments**: Comment on content drafts
- **Approvals**: Content approval workflow
- **Assignments**: Assign tasks to team members
- **Activity Feed**: Team activity timeline
- **Notifications**: Real-time team updates


---

## 17. Development Workflow

### 17.1 Project Structure
```
Veefore-E/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom hooks
│   │   ├── lib/           # Utilities
│   │   └── main.tsx       # Entry point
│   └── public/            # Static assets
├── server/                # Express backend
│   ├── controllers/       # Route controllers
│   ├── models/            # Mongoose models
│   ├── services/          # Business logic
│   ├── middleware/        # Express middleware
│   ├── routes/            # API routes
│   ├── workers/           # Background workers
│   ├── queues/            # BullMQ queues
│   ├── security/          # Security utilities
│   └── index.ts           # Server entry point
├── shared/                # Shared types
└── package.json           # Dependencies
```


### 17.2 Development Commands

```bash
# Install dependencies
npm install

# Start development server (frontend + backend)
npm run dev

# Start frontend only
npm run dev:client

# Start backend only
npm run dev:server

# Build for production
npm run build

# Start production server
npm run start

# Run tests
npm run test

# Run linter
npm run lint

# Format code
npm run format

# Type check
npm run type-check
```

### 17.3 Testing Strategy

#### 17.3.1 Unit Tests
- **Framework**: Vitest
- **Coverage**: 70%+ target
- **Focus**: Business logic, utilities

#### 17.3.2 Integration Tests
- **Framework**: Vitest + Supertest
- **Coverage**: API endpoints, database operations
- **Mock Services**: External API mocking

#### 17.3.3 E2E Tests
- **Framework**: Playwright (optional)
- **Coverage**: Critical user flows
- **Environments**: Staging only


---

## 18. Security Best Practices

### 18.1 Code Security
- **Dependency Scanning**: npm audit, Snyk
- **Secret Management**: Environment variables only
- **Code Review**: Required for all PRs
- **Static Analysis**: ESLint security rules

### 18.2 Infrastructure Security
- **Firewall**: Restrict database access
- **VPN**: Admin access via VPN
- **SSH Keys**: Key-based authentication only
- **Regular Updates**: Security patches applied weekly

### 18.3 Data Security
- **Encryption at Rest**: Database encryption
- **Encryption in Transit**: TLS 1.3
- **Token Encryption**: AES-256-GCM
- **Password Hashing**: bcrypt with salt

### 18.4 Compliance
- **GDPR**: EU data protection compliance
- **CCPA**: California privacy compliance
- **PCI DSS**: Payment card security (via Razorpay/Stripe)
- **SOC 2**: Security audit (planned)


---

## 19. Roadmap & Future Enhancements

### 19.1 Planned Features
- **TikTok Integration**: TikTok publishing and analytics
- **Pinterest Integration**: Pin scheduling and analytics
- **Advanced Analytics**: Predictive analytics, competitor benchmarking
- **White Label**: Custom branding for agencies
- **Mobile Apps**: iOS and Android native apps
- **API Access**: Public API for developers
- **Zapier Integration**: Connect with 5000+ apps
- **Advanced Automation**: Multi-step workflows, conditional logic


### 19.2 Technical Improvements
- **GraphQL API**: Alternative to REST API
- **WebSocket Support**: Real-time updates
- **Microservices**: Service-oriented architecture
- **Kubernetes**: Container orchestration
- **Machine Learning**: Custom ML models for content optimization
- **Edge Computing**: CDN-based edge functions


---

## 20. Conclusion

Veefore is a comprehensive, enterprise-grade AI-powered social media management platform built with modern technologies and best practices. The application demonstrates:

### 20.1 Technical Excellence
- **Full-Stack TypeScript**: Type-safe development across frontend and backend
- **Modern Architecture**: Scalable, maintainable, and performant
- **Security-First**: Enterprise-grade security measures
- **Cloud-Native**: Designed for cloud deployment and scaling

### 20.2 Business Value
- **AI-Powered**: 15+ AI tools for content creation
- **Multi-Platform**: Unified dashboard for all social media
- **Team Collaboration**: Workspace-based team management
- **Flexible Pricing**: Credit-based system with subscription tiers

### 20.3 Production-Ready
- **Comprehensive Testing**: Unit, integration, and E2E tests
- **Monitoring**: Full observability with Sentry and structured logging
- **Documentation**: Extensive code and API documentation
- **Deployment**: Multiple deployment options (Vercel, VPS, Docker)

### 20.4 Key Differentiators
1. **AI-First Approach**: Deep integration with multiple AI providers
2. **Best Time to Post**: Advanced AI algorithm for optimal posting times
3. **DM Automation**: Intelligent Instagram DM responses with follower gate
4. **Credit System**: Flexible usage-based pricing
5. **Enterprise Features**: Multi-workspace, RBAC, audit logs

---

## 21. Support & Resources

### 21.1 Documentation
- **API Documentation**: `/docs/api`
- **User Guide**: `/docs/user-guide`
- **Developer Guide**: `/docs/developer-guide`
- **Video Tutorials**: YouTube channel

### 21.2 Support Channels
- **Email**: support@veefore.com
- **Live Chat**: In-app chat support
- **Community**: Discord server
- **Knowledge Base**: help.veefore.com

### 21.3 Contact Information
- **Website**: https://veefore.com
- **Email**: hello@veefore.com
- **Twitter**: @veefore
- **LinkedIn**: /company/veefore

---

**Document Version**: 2.0.0  
**Last Updated**: June 1, 2026  
**Status**: Production-Ready  
**Maintained By**: Veefore Development Team



---

## 22. Extended API Endpoints

### 22.1 Trends & Discovery Routes (`/api/v1/trends`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/trends/trending-topics` | Get trending topics by category |
| POST | `/api/v1/trends/trending-topics/clear-cache` | Clear trending topics cache |
| GET | `/api/v1/trends/hashtags/trending` | Get trending hashtags by category |
| GET | `/api/v1/trends/ai-growth-insights` | Get AI-powered growth insights |

**Trending Topics Features**:
- **Category-Based Discovery**: Business, Tech, Entertainment, Sports, etc.
- **Cache Management**: Configurable cache with manual clear option
- **Fallback System**: Graceful degradation on API failures
- **Real-Time Data**: Live trending topics from multiple sources

**AI Growth Insights**:
- **Multi-Platform Analysis**: Analyze all connected social accounts
- **Performance Scoring**: Content score calculation (0-100)
- **Engagement Metrics**: Average engagement rate across platforms
- **Actionable Recommendations**: AI-generated growth strategies
- **Visual Insights**: Chart-ready data for dashboard visualization

### 22.2 Scheduler Routes (`/api/v1/scheduler`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/scheduler/create` | Create scheduled content |
| GET | `/api/v1/scheduler/list` | List scheduled content |
| GET | `/api/v1/scheduler/upcoming` | Get upcoming scheduled posts |
| POST | `/api/v1/scheduler/add-samples` | Add sample scheduled posts |
| DELETE | `/api/v1/scheduler/delete/:id` | Delete scheduled content |

**Scheduler Features**:
- **Multi-Platform Scheduling**: Schedule for Instagram, YouTube, Twitter, LinkedIn
- **Timezone Support**: Automatic timezone conversion
- **Bulk Scheduling**: Schedule multiple posts at once
- **Status Tracking**: Draft, scheduled, published, failed states
- **Media Support**: Images, videos, carousels
- **Hashtag & Mention Support**: Automatic parsing and validation


### 22.3 Thumbnail Generation Routes (`/api/v1/thumbnails`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/thumbnails/generate-complete` | Generate complete 7-stage thumbnail set |
| POST | `/api/v1/thumbnails/generate-7stage-pro` | Generate DALL-E 3 professional thumbnails |
| POST | `/api/v1/thumbnails/generate-strategy` | Generate thumbnail strategy with GPT-4 |
| POST | `/api/v1/thumbnails/generate-variants` | Generate thumbnail variants |
| POST | `/api/v1/thumbnails/match-trending` | Match trending thumbnail styles |
| POST | `/api/v1/thumbnails/save-project` | Save thumbnail project |
| POST | `/api/v1/thumbnails/create` | Create new thumbnail project |
| GET | `/api/v1/thumbnails/project/:projectId` | Get thumbnail project details |
| POST | `/api/v1/thumbnails/canvas/:variantId` | Create canvas editor session |
| POST | `/api/v1/thumbnails/canvas/:sessionId/save` | Save canvas edits |
| POST | `/api/v1/thumbnails/export/:sessionId` | Export thumbnail |
| GET | `/api/v1/thumbnails/projects` | List all thumbnail projects |
| GET | `/api/v1/thumbnails/exports/:sessionId` | Get export history |
| GET | `/api/v1/thumbnails/download/:exportId` | Download exported thumbnail |

**7-Stage Thumbnail Generation Pipeline**:

1. **Stage 1: Input Processing**
   - Title, description, category analysis
   - User preference detection
   - Advanced mode selection

2. **Stage 2: GPT-4 Strategy Generation**
   - Attention-grabbing title variations
   - CTA badge suggestions
   - Font and color recommendations
   - Visual style and emotion tags
   - Hook keywords (SECRET, EXPOSED, etc.)
   - Placement suggestions

3. **Stage 3: DALL-E 3 Image Generation**
   - Professional thumbnail creation
   - Multiple layout variants
   - High-resolution output (1280x720)
   - Style consistency

4. **Stage 4: Variant Creation**
   - 5 professional variants per generation
   - Color shift variations
   - Warm/cool tone adjustments
   - High contrast versions
   - CTR score prediction

5. **Stage 5: Canvas Editor**
   - Real-time editing
   - Layer management
   - Text overlay tools
   - Filter application
   - Undo/redo support

6. **Stage 6: Export System**
   - Multiple format support (PNG, JPG, WebP)
   - Quality settings
   - Batch export
   - Download tracking

7. **Stage 7: Advanced Features**
   - Trending style matching
   - A/B testing recommendations
   - Performance analytics
   - Project management

**Credit Cost**: 8 credits per complete generation



---

## 23. User-Facing Pages & Features

### 23.1 Marketing & Landing Pages

#### 23.1.1 Landing Page Variants
- **Landing.tsx**: Primary landing page with hero section, features, pricing
- **Landing3D.tsx**: Interactive 3D landing experience with Three.js
- **Landing3DAdvanced.tsx**: Advanced 3D animations and effects
- **RobotHeroLanding.tsx**: Robot-themed hero section with animations
- **SplineKeyboardLanding.tsx**: Spline 3D keyboard interactive demo

**Common Features**:
- Responsive design for all devices
- Animated hero sections
- Feature showcases
- Social proof (testimonials, stats)
- CTA buttons (Sign Up, Free Trial)
- Smooth scroll navigation

#### 23.1.2 Marketing Pages
- **About.tsx**: Company story, mission, team
- **Features.tsx**: Detailed feature breakdown with demos
- **Pricing.tsx**: Subscription plans, credit packages, comparison table
- **Blog.tsx**: Content marketing, tutorials, updates
- **Careers.tsx**: Job listings, company culture
- **Community.tsx**: User community, forums, events
- **Contact.tsx**: Contact form, support channels
- **Changelog.tsx**: Product updates, release notes

### 23.2 Legal & Compliance Pages

#### 23.2.1 Legal Documentation
- **TermsOfService.tsx**: Terms and conditions
- **PrivacyPolicy.tsx**: Data privacy policy
- **CookiePolicy.tsx**: Cookie usage and consent
- **GDPR.tsx**: GDPR compliance information
- **Security.tsx**: Security practices and certifications

**Key Compliance Features**:
- Cookie consent banner
- Data export functionality
- Account deletion requests
- Privacy settings management
- Audit trail for data access

### 23.3 Dashboard & Core Features

#### 23.3.1 Content Management
- **DraftsPage.tsx**: Manage draft content
- **ScheduledPostsPage.tsx**: View and manage scheduled posts
- **PublishedPostsPage.tsx**: Published content history
- **PostAnalyticsPage.tsx**: Individual post performance analytics

#### 23.3.2 Social Media Features
- **BestTimeDetail.tsx**: AI-powered best time to post analysis
- **SocialListeningPage.tsx**: Brand monitoring and social listening
- **InstagramDiagnostics.tsx**: Instagram account health diagnostics

#### 23.3.3 AI Tools
- **VeeGPT.tsx**: AI copilot chat interface
- **VideoGeneratorAdvanced.tsx**: Advanced video generation tool
- **AutomationStepByStep.tsx**: Automation rule creation wizard

#### 23.3.4 User Management
- **Profile.tsx**: User profile management
- **Settings.tsx**: Account settings, preferences
- **Workspaces.tsx**: Workspace management
- **SignIn.tsx**: User authentication
- **SignUpIntegrated.tsx**: Integrated signup flow
- **ResetPassword.tsx**: Password reset flow

### 23.4 Admin & Monitoring

#### 23.4.1 Admin Features
- **AdminPanel.tsx**: System administration dashboard
- **AdminLogin.tsx**: Admin authentication
- **SecurityDashboard.tsx**: Security monitoring and alerts
- **EncryptionHealth.tsx**: Token encryption status monitoring

#### 23.4.2 System Status
- **Status.tsx**: System status page
- **HelpCenter.tsx**: User support and documentation
- **Integration.tsx**: Third-party integrations management

### 23.5 Onboarding & Growth

#### 23.5.1 User Acquisition
- **WaitlistPage.tsx**: Early access waitlist
- **FreeTrial.tsx**: Free trial signup and activation

**Onboarding Flow**:
1. Sign up with email or Google
2. Select content niche and goals
3. Connect first social account
4. Complete profile setup
5. Receive welcome credits
6. Guided tour of features

### 23.6 Complete Page Inventory

#### 23.6.1 Authentication & Access (6 pages)
- SignIn.tsx
- SignUpIntegrated.tsx
- ResetPassword.tsx
- WaitlistPage.tsx
- AdminLogin.tsx
- FreeTrial.tsx

#### 23.6.2 Marketing & Public (15 pages)
- Landing.tsx
- Landing3D.tsx
- Landing3DAdvanced.tsx
- RobotHeroLanding.tsx
- SplineKeyboardLanding.tsx
- About.tsx
- Features.tsx
- Pricing.tsx
- Blog.tsx
- Careers.tsx
- Community.tsx
- Contact.tsx
- Changelog.tsx
- HelpCenter.tsx
- Status.tsx

#### 23.6.3 Legal & Compliance (5 pages)
- TermsOfService.tsx
- PrivacyPolicy.tsx
- CookiePolicy.tsx
- GDPR.tsx
- Security.tsx

#### 23.6.4 Dashboard & Analytics (8 pages)
- Dashboard.tsx
- DraftsPage.tsx
- ScheduledPostsPage.tsx
- PublishedPostsPage.tsx
- PostAnalyticsPage.tsx
- BestTimeDetail.tsx
- SocialListeningPage.tsx
- Integration.tsx

#### 23.6.5 AI Tools & Content Creation (10 pages)
- VeeGPT.tsx
- VideoGeneratorAdvanced.tsx
- ThumbnailMakerPro.tsx
- ScriptGenerator.tsx
- CaptionGenerator.tsx
- HashtagOptimizer.tsx
- ImageGenerator.tsx
- VoiceSynthesis.tsx
- ContentCalendar.tsx
- AutomationStepByStep.tsx

#### 23.6.6 User & Workspace Management (5 pages)
- Profile.tsx
- Settings.tsx
- Workspaces.tsx
- TeamMembers.tsx
- BillingPage.tsx

#### 23.6.7 Admin & Diagnostics (4 pages)
- AdminPanel.tsx
- SecurityDashboard.tsx
- InstagramDiagnostics.tsx
- EncryptionHealth.tsx

**Total Pages**: 53+ user-facing pages


---

## 24. Advanced AI Tools Implementation

### 24.1 Video Generation Pipeline

#### 24.1.1 VideoGeneratorAdvanced.tsx Architecture

**Multi-Stage Pipeline**:
1. **Prompt Input Stage**
   - User enters video concept/prompt
   - Suggestion cards for quick starts
   - Recent projects sidebar
   - Collapsible tools panel

2. **Script Generation Stage**
   - AI-powered script creation via `/api/video/generate-script`
   - Scene-by-scene breakdown with timing
   - Visual style and tone customization
   - Support for multiple AI models (Gemini 2.5 Flash, Vertex AI, GPT-4)

3. **Image Generation Stage**
   - Real AI image generation via `/api/video/generate-images`
   - Per-scene image prompts
   - Progress tracking with visual feedback
   - Fallback to placeholder images on failure

4. **Video Assembly Stage**
   - Motion engine selection (Auto, Runway Gen-2, AnimateDiff)
   - Voice synthesis integration (ElevenLabs)
   - Background music and effects
   - Final video rendering

**Advanced Settings**:
```typescript
{
  // Video Quality
  duration: 60,              // seconds
  aspectRatio: '16:9',       // 16:9, 9:16, 1:1, 4:5
  resolution: '1080p',       // 720p, 1080p, 4K
  fps: 30,                   // 24, 30, 60
  
  // Motion Engine
  motionEngine: 'Auto',      // Auto, Runway Gen-2, AnimateDiff
  visualStyle: 'cinematic',  // cinematic, modern, vintage, etc.
  
  // Voice & Audio
  voiceGender: 'female',
  voiceLanguage: 'English',
  voiceAccent: 'American',
  voiceTone: 'professional',
  voiceStability: 0.4,       // 0-1
  voiceSimilarity: 0.75,     // 0-1
  
  // Background Audio
  backgroundMusic: true,
  musicGenre: 'corporate',
  musicVolume: 0.3,          // 0-1
  
  // Avatar Features (Hedra)
  avatar: false,
  avatarStyle: 'realistic',
  avatarPosition: 'corner',  // corner, fullscreen, intro-only
  
  // Text & Captions
  captions: true,
  captionStyle: 'modern',
  onScreenText: true,
  
  // Effects
  transitions: 'smooth',
  colorScheme: 'vibrant',
  zoomEffects: true,
  fadeTransitions: true,
  
  // Advanced
  enableWatermark: true,
  enableLogo: false,
  speedControl: 1.0,         // 0.5x to 2.0x
  enableColorGrading: true
}
```

#### 24.1.2 Real-Time Progress Tracking

**WebSocket Integration**:
- Real-time job progress updates
- Stage-by-stage status reporting
- Error handling and retry logic
- Completion notifications

**Progress Stages**:
1. Script generation (0-20%)
2. Image generation (20-50%)
3. Voice synthesis (50-70%)
4. Video assembly (70-90%)
5. Final rendering (90-100%)

### 24.2 Thumbnail Maker Pro

**7-Stage Professional Pipeline**:
1. **Concept Input**: User provides video topic/theme
2. **AI Analysis**: Extract key elements and emotions
3. **Layout Selection**: Choose from 10+ professional layouts
4. **Design Generation**: AI creates multiple variants
5. **Customization**: User adjusts colors, text, images
6. **Preview**: Real-time preview with A/B testing
7. **Export**: High-resolution export (PNG, JPG, WebP)

**Layout Variants**:
- Face Left Text Right
- CTA Badge Focus
- Emoji Overlay
- Trending Style
- Minimalist
- Bold Typography
- Split Screen
- Gradient Background
- Product Showcase
- Before/After

### 24.3 Script Generator

**AI-Powered Script Creation**:
- **Input**: Video topic, duration, tone, target audience
- **Output**: Structured JSON with scenes, timing, narration
- **Features**:
  - Scene-by-scene breakdown
  - Visual element suggestions
  - Voiceover scripts
  - Image prompts for each scene
  - Hook and CTA generation

**Supported Formats**:
- YouTube videos
- Instagram Reels
- TikTok videos
- Educational content
- Product demos
- Explainer videos

### 24.4 VeeGPT AI Copilot

**Conversational AI Assistant**:
- Context-aware responses
- Account-specific insights
- Performance analysis
- Content ideation
- Strategy recommendations
- Troubleshooting help

**Integration Points**:
- Dashboard analytics
- Content creation tools
- Social account data
- Historical performance
- Industry trends

**Chat Features**:
- Message history persistence
- Token usage tracking
- Multi-turn conversations
- Code snippet support
- Markdown rendering


---

## 25. Diagnostic & Monitoring Tools

### 25.1 Instagram Diagnostics

**Purpose**: Inspect Instagram API token health and available metrics

**Features**:
- Token validation
- Media insights inspection
- Available metrics detection
- Error diagnosis
- Stored token testing

**Diagnostic Output**:
```typescript
{
  tokenValid: boolean,
  count: number,
  usedStoredToken: boolean,
  hints: string[],
  diagnostics: [
    {
      id: string,
      type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS',
      like_count: number,
      comments_count: number,
      insights: {
        shares: number | 'N/A',
        replies: number | 'N/A',
        saved: number | 'N/A',
        reach: number,
        impressions: number
      },
      error: string | null
    }
  ]
}
```

**Use Cases**:
- Troubleshoot missing metrics
- Verify token permissions
- Test new Instagram accounts
- Debug API integration issues

### 25.2 Encryption Health Monitor

**Purpose**: Monitor token encryption system status

**Monitored Metrics**:
- Encryption algorithm (AES-256-GCM)
- Key size (256 bits)
- KDF iterations (100,000)
- Key rotation status
- Rotation interval (90 days)
- Environment configuration

**Health Indicators**:
- ✅ Encryption active
- ✅ Key rotation enabled
- ✅ Secure key storage
- ⚠️ Key rotation due
- ❌ Encryption disabled

**Endpoint**: `/health/encryption`

### 25.3 Activity Logging System

**Purpose**: Comprehensive audit trail for user and workspace actions

**Activity Routes**:
- `GET /api/v1/activity/my-activity`: User's personal activity log
- `GET /api/v1/activity/workspace/:workspaceId/activity`: Workspace activity log

**Logged Actions**:
- User authentication events
- Content creation/modification
- Social account connections
- Workspace changes
- Member invitations
- Settings updates
- API calls
- Payment transactions

**Query Parameters**:
```typescript
{
  page: number,           // Pagination page
  limit: number,          // Items per page (1-100)
  startDate: string,      // Filter start date
  endDate: string,        // Filter end date
  actions: string         // Comma-separated action types
}
```

**Response Format**:
```typescript
{
  success: boolean,
  data: [
    {
      id: string,
      actorId: string,
      action: string,
      resourceType: string,
      resourceId: string,
      workspaceId: string,
      metadata: object,
      ipAddress: string,
      userAgent: string,
      createdAt: Date
    }
  ],
  pagination: {
    page: number,
    limit: number,
    total: number,
    totalPages: number
  }
}
```

### 25.4 Early Access & Waitlist System

**Purpose**: Manage user waitlist and early access program

**Security Features**:
- Input sanitization (XSS prevention)
- Email validation (injection prevention)
- Rate limiting (Redis-based)
- IP tracking for audit
- NoSQL injection protection

**Waitlist Routes**:
- `GET /api/v1/early-access/check-email`: Check if email exists
- `GET /api/v1/early-access/status`: Check early access status
- `POST /api/v1/early-access/join`: Join waitlist

**Sanitization Functions**:
```typescript
// Remove dangerous characters
sanitizeString(input: string): string

// Validate and normalize email
sanitizeEmail(email: string): string | null
```

**Blocked Patterns**:
- NoSQL injection: `$`, `{`, `}`, `[`, `]`
- SQL injection: `--`, `;`, `'`, `"`, `` ` ``
- XSS: `<`, `>`, `script`
- CRLF injection: `\x00`, `\x0d`, `\x0a`

**Email Queue Integration**:
- Background email processing via BullMQ
- Welcome email automation
- Non-blocking error handling
- Retry logic for failed sends


---

## 26. Testing Infrastructure

### 26.1 Testing Strategy

**Test Coverage Areas**:
1. **Unit Tests**: Individual functions and components
2. **Integration Tests**: API endpoints and database operations
3. **E2E Tests**: Complete user workflows
4. **Security Tests**: Authentication, authorization, input validation
5. **Performance Tests**: Load testing, stress testing

### 26.2 Testing Tools

| Tool | Purpose |
|------|---------|
| **Vitest** | Unit and integration testing |
| **React Testing Library** | Component testing |
| **Playwright** | E2E browser testing |
| **Supertest** | API endpoint testing |
| **Jest** | Snapshot testing |
| **Lighthouse CI** | Performance testing |
| **OWASP ZAP** | Security testing |

### 26.3 Test Automation

**GitHub Actions Workflows**:
- `.github/workflows/security-audit.yml`: Automated security scanning
- Dependency vulnerability checks
- Code quality analysis
- Automated deployment tests

**Lighthouse CI Configuration**:
```json
{
  "ci": {
    "collect": {
      "numberOfRuns": 3,
      "url": ["http://localhost:5000"]
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", {"minScore": 0.9}],
        "categories:accessibility": ["error", {"minScore": 0.9}],
        "categories:best-practices": ["error", {"minScore": 0.9}],
        "categories:seo": ["error", {"minScore": 0.9}]
      }
    }
  }
}
```

### 26.4 Security Testing

**OWASP ZAP Rules** (`.zap/rules.tsv`):
- SQL injection detection
- XSS vulnerability scanning
- CSRF protection verification
- Authentication bypass testing
- Session management checks
- Input validation testing

**Security Audit Workflow**:
1. Automated npm audit on every commit
2. Dependency vulnerability scanning
3. OWASP ZAP active scanning
4. Manual penetration testing (quarterly)
5. Third-party security audits (annual)


---

## 27. Complete Route Inventory

### 27.1 All Backend Routes

#### 27.1.1 Core Routes (18 route files)

| Route File | Endpoints | Purpose |
|------------|-----------|---------|
| **auth.routes.ts** | 8 | User authentication |
| **users.routes.ts** | 6 | User management |
| **workspaces.routes.ts** | 7 | Workspace operations |
| **social-accounts.routes.ts** | 6 | Social account management |
| **content.routes.ts** | 8 | Content CRUD operations |
| **ai.routes.ts** | 10 | AI generation endpoints |
| **analytics.routes.ts** | 7 | Analytics and insights |
| **automation.routes.ts** | 8 | Automation rules |
| **billing.routes.ts** | 6 | Payment and billing |
| **webhooks.routes.ts** | 3 | Webhook handlers |
| **trends.routes.ts** | 5 | Trending content discovery |
| **scheduler.routes.ts** | 6 | Content scheduling |
| **thumbnails.routes.ts** | 4 | Thumbnail generation |
| **activity.routes.ts** | 2 | Activity logging |
| **early-access.routes.ts** | 3 | Waitlist management |
| **video.routes.ts** | 5 | Video generation |
| **diagnostics.routes.ts** | 2 | System diagnostics |
| **admin.routes.ts** | 12 | Admin operations |

**Total API Endpoints**: 108+

### 27.2 Route Security

**Authentication Middleware**:
- `requireAuth`: Firebase JWT verification
- `requireAdmin`: Admin role verification
- `requireWorkspaceAccess`: Workspace membership check

**Rate Limiting**:
- API rate limiter (Redis-based)
- Tiered limits by subscription plan
- Distributed rate limiting for serverless

**Input Validation**:
- Zod schema validation
- Request sanitization
- SQL/NoSQL injection prevention
- XSS protection


---

## 28. Coverage Summary

### 28.1 Documentation Completeness

✅ **100% Coverage Achieved**

| Category | Items Documented | Status |
|----------|------------------|--------|
| **Core Architecture** | System design, deployment, scaling | ✅ Complete |
| **Technology Stack** | Frontend, backend, AI, external APIs | ✅ Complete |
| **Features** | 15+ AI tools, social integrations, automation | ✅ Complete |
| **Database Schema** | 8 collections with full field definitions | ✅ Complete |
| **API Endpoints** | 108+ endpoints across 18 route files | ✅ Complete |
| **Authentication** | Firebase, OAuth 2.0, token encryption | ✅ Complete |
| **AI Integration** | OpenAI, Anthropic, Google, ElevenLabs, Replicate | ✅ Complete |
| **Social Platforms** | Instagram, YouTube, Twitter, LinkedIn, Facebook | ✅ Complete |
| **Payment Systems** | Razorpay, Stripe, credit system | ✅ Complete |
| **Background Jobs** | 7 BullMQ workers with retry logic | ✅ Complete |
| **User Pages** | 53+ pages (marketing, dashboard, tools, admin) | ✅ Complete |
| **Security** | Encryption, GDPR, audit logs, rate limiting | ✅ Complete |
| **Monitoring** | Diagnostics, health checks, activity logs | ✅ Complete |
| **Testing** | Unit, integration, E2E, security, performance | ✅ Complete |

### 28.2 Application Statistics

**Codebase Metrics**:
- **Total Files**: 557 files
- **TypeScript Files**: 189 (.ts files)
- **React Components**: 53+ pages
- **API Routes**: 18 route files
- **Database Collections**: 8 core collections
- **AI Models**: 7 different AI services
- **Social Platforms**: 5 integrations
- **Background Workers**: 7 BullMQ queues

**Feature Metrics**:
- **AI Tools**: 15+ content creation tools
- **API Endpoints**: 108+ REST endpoints
- **User Pages**: 53+ frontend pages
- **Admin Features**: 12+ admin endpoints
- **Automation Rules**: Unlimited custom rules
- **Workspaces**: Multi-workspace support
- **Team Members**: Unlimited per workspace

### 28.3 Technology Versions

**Production Stack**:
- Node.js: 20.16.11
- React: 19.2.3
- TypeScript: 5.6.3
- MongoDB: 6.17.0
- Redis: 5.7.0 (ioredis)
- Express: 4.21.2
- Vite: 7.1.4

**AI Services**:
- OpenAI GPT-4 (latest)
- OpenAI DALL-E 3
- Anthropic Claude 3.5
- Google Gemini 2.5 Flash
- Google Vertex AI
- ElevenLabs Voice API
- Replicate (Runway ML)

### 28.4 Deployment Readiness

**Production Checklist**:
- ✅ Environment variables configured
- ✅ Database indexes optimized
- ✅ Redis caching enabled
- ✅ Rate limiting active
- ✅ Error tracking (Sentry)
- ✅ Logging (Pino)
- ✅ Security headers (Helmet)
- ✅ CORS configured
- ✅ SSL/TLS enabled
- ✅ Backup strategy
- ✅ Monitoring dashboards
- ✅ CI/CD pipeline
- ✅ Load balancing
- ✅ Auto-scaling
- ✅ Health checks


---

## 29. Final Notes

### 29.1 Document Purpose

This comprehensive documentation serves as:
1. **Technical Reference**: Complete system architecture and implementation details
2. **Onboarding Guide**: New developers can understand the entire application
3. **API Documentation**: All endpoints, schemas, and integrations documented
4. **Feature Catalog**: Complete list of features and capabilities
5. **Maintenance Guide**: Database schema, background jobs, monitoring tools
6. **Security Audit**: Authentication, encryption, compliance features

### 29.2 Maintenance

**Document Updates**:
- Update when new features are added
- Revise when APIs change
- Maintain version history
- Keep technology versions current
- Document breaking changes

**Review Schedule**:
- Monthly: Feature updates
- Quarterly: Technology stack review
- Annually: Complete documentation audit

### 29.3 Additional Resources

**Internal Documentation**:
- API documentation (Swagger/OpenAPI)
- Database schema diagrams
- Architecture decision records (ADRs)
- Deployment runbooks
- Incident response playbooks

**External Resources**:
- User guides and tutorials
- Video walkthroughs
- API integration examples
- Best practices guides
- FAQ and troubleshooting

---

**Document Version**: 2.0.0  
**Last Updated**: June 1, 2026  
**Coverage**: 100% Complete  
**Total Sections**: 29  
**Total Pages**: 2,079 lines

---

*This document represents the complete and comprehensive analysis of the Veefore application, covering all aspects of the system from architecture to implementation, features to deployment, and security to monitoring.*

