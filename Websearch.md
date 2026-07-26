# Project: VeeGpt Web Research & Trend Intelligence Engine

## Context

VeeGpt is the AI assistant inside Veefore. Users can ask questions like:

- "What are the latest Instagram trends for fitness creators?"
- "Find competitors of my brand."
- "Research the latest AI marketing tools."
- "Give me content ideas based on current trends."
- "What are people discussing about Shopify on Reddit?"
- "Create a report about social media trends in the fashion niche."

Currently, we do NOT want to use Perplexity API.

Instead, build our own Perplexity-like research engine specifically for VeeGpt using:

- Tavily → Web Search
- Firecrawl → Crawling and Content Extraction
- LLM → Reasoning and Answer Generation

The entire system must be designed for VeeGpt and deeply integrated into Veefore.

---

# Goals

Build a production-ready research system that can:

1. Search the web
2. Find trends in any niche
3. Discover competitors
4. Analyze discussions
5. Generate reports
6. Find content opportunities
7. Generate citations
8. Power VeeGpt's Deep Research Mode

---

# Architecture

User Message
↓
Intent Detection
↓
Query Expansion
↓
Tavily Search
↓
URL Ranking & Filtering
↓
Firecrawl Extraction
↓
Content Processing
↓
LLM Analysis
↓
Structured Response
↓
Response inside VeeGpt

---

# VeeGpt Tool Definition

Create a new internal tool:

search_web()

This tool should be automatically called by VeeGpt whenever the user asks for:

- recent information
- latest news
- trends
- competitor research
- deep research
- social listening
- industry reports
- niche discovery
- statistics
- market research

Examples:

"Latest Instagram algorithm updates"

"Trending reels in fashion"

"What are people saying about Canva?"

"Find my competitors."

"Research AI tools for creators."

---

# Query Understanding

Before searching:

Determine:

- user intent
- niche
- entities
- keywords
- time sensitivity
- location if applicable

Generate:

- original query
- related queries
- synonyms
- long-tail keywords
- industry keywords

Example:

Input:
"fitness creator trends"

Generate:

- fitness influencer trends
- fitness content trends
- trending fitness reels
- workout content ideas
- gym creator trends
- fitness hashtags

---

# Tavily Integration

Use Tavily as the search layer.

Settings:

search_depth = advanced
max_results = 10-15
include_answer = false
include_raw_content = false

Return:

- title
- url
- snippet
- domain
- date
- relevance score

---

# Source Prioritization

Prioritize sources:

1. Official websites
2. News websites
3. Reddit
4. YouTube blogs
5. Industry publications
6. Company blogs

Deprioritize:

- spam
- duplicate sites
- low authority websites

---

# Firecrawl Integration

After Tavily returns URLs:

Use Firecrawl to:

- scrape content
- extract markdown
- extract metadata
- extract headings
- extract dates
- extract structured data

Remove:

- ads
- navigation
- cookie banners
- sidebars
- footers

Return clean content only.

---

# Content Processing

Chunk content:

1000-1500 tokens.

Store:

- title
- source
- url
- date
- content

Remove:

- duplicate paragraphs
- repeated articles
- boilerplate text

---

# Trend Discovery Engine

Create an internal module:

Trend Intelligence Engine

Capabilities:

- trend detection
- topic clustering
- keyword extraction
- trend scoring
- emerging trend discovery

Trend Score Factors:

- number of mentions
- recency
- source authority
- growth velocity
- social discussion frequency

Classify trends:

- Emerging
- Rising
- Trending
- Saturated
- Declining

---

# Social Listening

Extract:

- brands
- products
- hashtags
- influencers
- pain points
- audience questions
- complaints
- feature requests

Perform:

- sentiment analysis
- topic clustering
- entity extraction
- keyword extraction

This data should power Veefore's Social Listening feature.

---

# Deep Research Mode

Create a dedicated mode inside VeeGpt:

Deep Research

Workflow:

1. Generate multiple search queries.
2. Search using Tavily.
3. Crawl with Firecrawl.
4. Read multiple sources.
5. Compare information.
6. Generate insights.
7. Generate citations.
8. Generate a final report.

Output:

- Executive Summary
- Key Findings
- Trends
- Opportunities
- Risks
- Sources

---

# Citations

Every answer inside VeeGpt must include:

- source title
- domain
- url
- publication date

Users should be able to open sources directly.

Never hallucinate citations.

---

# Redis Caching

Cache:

Search Results → 6 hours
Scraped Pages → 24 hours
Trend Reports → 12 hours
Generated Answers → 1 hour

Avoid duplicate API calls.

---

# BullMQ Jobs

Create background jobs:

- refresh trends
- refresh competitors
- refresh industry reports
- refresh niche insights
- refresh social listening data

---

# Database Collections

Create:

SearchHistory
ScrapedDocuments
TrendTopics
CompetitorReports
Insights
ResearchReports
SourceDocuments

---

# API Design

Create services:

SearchService
ResearchService
TrendService
CrawlerService
CitationService
DeepResearchService

All services should be reusable across:

- VeeGpt
- Social Listening
- Competitor Analysis
- Content Studio
- Trend Calendar

---

# Important Requirements

❌ Do NOT use Perplexity API.

❌ Do NOT depend on third-party AI search providers.

✅ Build our own research engine.

✅ Use Tavily for search.

✅ Use Firecrawl for crawling.

✅ Use our existing LLMs only for reasoning and summarization.

✅ Make the system scalable and provider-agnostic.

The final result should feel like Perplexity inside VeeGpt, but entirely owned and controlled by Veefore.