⸻

We are building an enterprise-grade AI-powered Social Listening system inside our app Veefore.

Veefore is a creator-focused AI social media management platform for creators, influencers, agencies, and brands.

This Social Listening system should NOT feel like a basic keyword tracker.

The goal is to help creators and brands discover:

* emerging trends
* viral narratives
* audience pain points
* emotional sentiment
* competitor strategies
* viral hooks
* content opportunities
* market shifts

The feature should feel modern, AI-native, intelligent, visual, and insight-driven.

Use our existing stack:

* Frontend: React + TypeScript + TailwindCSS
* Backend: Express.js + TypeScript
* Database: MongoDB
* Existing authentication system already exists

Build this as a fully integrated module inside Veefore.

⸻

CORE FEATURE REQUIREMENTS

Create these major modules:

1. Social Listening Dashboard
2. Trend Detection Engine
3. Sentiment Analysis Engine
4. Competitor Listening
5. Viral Hook Intelligence
6. Audience Pain Point Mining
7. AI Insight Generator
8. Alert System
9. Opportunity Scoring System
10. Multi-source Data Aggregation Pipeline

⸻

DATA SOURCES

Initially support:

* Reddit
* YouTube
* Public web/blog/news sources

Architecture must be expandable later for:

* Instagram
* TikTok
* X/Twitter
* LinkedIn

Use modular source adapters.

Each source adapter should support:

* fetching posts
* comments
* metadata
* engagement metrics
* timestamps
* author info
* URLs
* hashtags/topics

Create normalized data schemas.

⸻

BACKEND ARCHITECTURE

Build a scalable backend architecture.

Create:

* ingestion workers
* processing queues
* AI analysis pipeline
* caching layer
* scheduled crawlers
* analytics aggregation services

Use:

* BullMQ or queue system
* Redis caching
* modular services
* clean architecture

Create backend services for:

* keyword tracking
* trend clustering
* sentiment analysis
* emotion analysis
* entity extraction
* topic modeling
* engagement scoring
* trend velocity analysis
* spike detection
* opportunity scoring

⸻

AI ANALYSIS FEATURES

Implement advanced AI intelligence.

1. SENTIMENT ANALYSIS
    Detect:

* positive
* negative
* neutral
* excitement
* anger
* frustration
* curiosity
* hype
* purchase intent

2. PAIN POINT MINING
    AI should detect repeated frustrations and unmet needs from comments/posts.

Example:
“Creators are frustrated with low Instagram reach.”

3. VIRAL HOOK EXTRACTION
    Extract:

* best hooks
* opening lines
* CTA styles
* storytelling patterns
* viral phrases

4. TREND DETECTION
    Detect:

* rising topics
* exploding hashtags
* increasing discussion volume
* emerging creator strategies
* niche shifts

5. COMPETITOR ANALYSIS
    Track:

* competitor content performance
* audience reactions
* sentiment differences
* viral content patterns

6. AI INSIGHT GENERATOR
    Generate natural-language insights like:

* “Short-form educational storytelling is rapidly growing in the fitness niche.”
* “Audience sentiment toward AI automation tools became 34% more positive this week.”
* “Creators are increasingly discussing burnout and content fatigue.”

⸻

TREND ENGINE

Build a trend scoring algorithm.

Track:

* mention growth velocity
* engagement velocity
* comment acceleration
* sentiment shifts
* cross-platform discussion spikes

Generate:

* trend scores
* opportunity scores
* virality potential

Classify trends:

* Early Emerging
* Growing
* Viral
* Saturated
* Declining

⸻

FRONTEND UI/UX

Create an extremely modern AI-first dashboard.

UI should feel like:

* futuristic
* premium SaaS
* analytics-heavy
* insight-focused
* visually clean
* highly interactive

Use:

* cards
* charts
* heatmaps
* trend graphs
* sentiment graphs
* topic clusters
* AI insight panels
* real-time indicators

Dashboard sections:

* Trend Radar
* Audience Mood
* Viral Opportunities
* Competitor Insights
* Pain Point Analysis
* Trending Hooks
* AI Recommendations

Add:

* filtering
* keyword search
* timeframe controls
* platform filters
* export system

⸻

AI CHAT ASSISTANT

Add an AI assistant inside social listening.

Users can ask:

* “What trends are rising in fitness?”
* “What are creators complaining about?”
* “Which hooks are performing best?”
* “Analyze competitor sentiment.”

Assistant should answer using collected listening data.

⸻

DATABASE DESIGN

Create optimized MongoDB collections for:

* sources
* posts
* comments
* trends
* entities
* sentiment data
* topic clusters
* opportunities
* alerts
* competitors
* AI insights

Use indexes and scalable schemas.

⸻

ALERT SYSTEM

Create smart alerts for:

* sudden trend spikes
* negative sentiment spikes
* viral opportunities
* competitor growth
* niche changes

Allow:

* email alerts
* in-app alerts
* webhook support

⸻

SCALABILITY

System must support:

* millions of collected posts/comments
* asynchronous processing
* future platform expansion
* background workers
* rate limiting
* retry handling
* source failures

⸻

ADMIN FEATURES

Create admin controls for:

* managing sources
* queue monitoring
* failed jobs
* AI prompt tuning
* moderation
* blacklist filtering
* trend review

⸻

IMPLEMENTATION REQUIREMENTS

Generate:

* production-ready code
* backend APIs
* database schemas
* worker architecture
* frontend pages
* reusable components
* charts
* AI pipeline services
* TypeScript types
* folder structure
* environment variable setup
* Redis integration
* cron jobs
* caching logic

Do NOT generate placeholder pseudocode.

Generate real implementation-ready code.

⸻

IMPORTANT PRODUCT DIRECTION

This feature is creator-first social intelligence.

Do NOT build boring enterprise PR monitoring.

Focus heavily on:

* creators
* influencers
* content trends
* audience psychology
* viral mechanics
* social growth intelligence

The experience should feel like:
“AI that understands internet culture and predicts content opportunities.”

Build this feature to feel significantly more modern and AI-native than traditional social listening tools.

⸻

Now another important thing:

Do NOT expect one-shot generation to build this perfectly.

The real workflow should be:

1. Generate architecture first
2. Generate DB schemas
3. Generate ingestion pipeline
4. Generate AI services
5. Generate APIs
6. Generate frontend
7. Refine each module separately

If you try:

“Generate entire feature at once”

you’ll likely get bloated, inconsistent code. Split the work into stages after this master prompt establishes context