# Bugfix Requirements Document

## Introduction

This document defines the requirements for fixing the AI Caption & Hashtag Generation System that is currently failing with HTTP 400 "Invalid body data" errors. The root cause is Zod schema validation failure when the `mediaType` field is undefined, even though it should be treated as an optional field. This prevents users from generating AI content for posts without media or when media type cannot be determined.

Additionally, the AI generation system needs enhancement to leverage user insights, trending topics, uploaded media analysis, and historical performance data to generate higher quality, more engaging captions and hashtags.

**Impact**: Users cannot generate AI captions and hashtags through the `/api/v1/ai/generate-content` endpoint, blocking a core feature of the content creation workflow.

**Affected Components**:
- `/api/v1/ai/generate-content` endpoint validation
- `GenerateContentSchema` in `ai.routes.ts`
- AI content generation logic in `ai-content-generator.ts`
- Frontend integration in `create-post.tsx`

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user submits a content generation request through `/api/v1/ai/generate-content` with `mediaType` as `undefined` or `null` THEN the system returns HTTP 400 error with "Invalid body data" message due to Zod validation failure

1.2 WHEN a user tries to generate AI content without uploading media first THEN the system fails validation because `mediaType` is required by the schema

1.3 WHEN the frontend sends a request with `mediaUrl` but without explicit `mediaType` THEN the validation rejects the request instead of inferring or accepting optional values

1.4 WHEN `buildUserPrompt()` method is called THEN it does not leverage trending data or viral hooks from `getTrendingData()` method

1.5 WHEN hashtag generation occurs THEN it does not use trending hashtags from the insights data despite having `getTrendingData()` helper available

1.6 WHEN the AI generation runs THEN it does not integrate real-time trend API calls, relying only on curated static data

1.7 WHEN trending data is fetched multiple times THEN there is no caching mechanism, causing redundant API calls and potential rate limiting issues

1.8 WHEN OpenAI API key is missing from environment THEN the error handling does not provide a clear user-facing message

1.9 WHEN media analysis or generation fails THEN the logging is insufficient for debugging production issues

### Expected Behavior (Correct)

2.1 WHEN a user submits a content generation request with `mediaType` as `undefined` or `null` THEN the system SHALL accept the request and proceed with text-only generation or infer media type from `mediaUrl`

2.2 WHEN a user tries to generate AI content without uploading media THEN the system SHALL successfully generate caption and hashtags based on existing caption or post context

2.3 WHEN the frontend sends a request with `mediaUrl` without explicit `mediaType` THEN the validation SHALL accept the request and either infer the type or proceed without media analysis

2.4 WHEN `buildUserPrompt()` method is called with available insights data THEN it SHALL incorporate trending topics, viral hooks, and performance-based recommendations into the prompt

2.5 WHEN hashtag generation occurs THEN it SHALL prioritize trending hashtags from `getTrendingData()` results that match the content niche and optimization goals

2.6 WHEN the AI generation system initializes THEN it SHALL integrate with real-time trend APIs (when available) instead of using only static curated data

2.7 WHEN trending data is requested THEN the system SHALL implement caching with hourly expiration to reduce redundant API calls and avoid rate limiting

2.8 WHEN OpenAI API key is missing from environment THEN the system SHALL return a user-friendly error with clear instructions to contact support

2.9 WHEN any AI operation fails or completes THEN the system SHALL log detailed information including request parameters, error details, and execution time for debugging

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user submits a valid content generation request with all required fields including explicit `mediaType` THEN the system SHALL CONTINUE TO generate captions and hashtags as before

3.2 WHEN media analysis is performed on uploaded images or videos THEN the system SHALL CONTINUE TO use GPT-4 Vision API to analyze visual content

3.3 WHEN user insights are fetched THEN the system SHALL CONTINUE TO retrieve preferences, AI configuration, recent performance data, and connected social accounts

3.4 WHEN caption generation completes THEN the system SHALL CONTINUE TO return engagement scores, virality predictions, and CTA recommendations

3.5 WHEN AI credits are checked and deducted THEN the system SHALL CONTINUE TO validate sufficient credits and deduct the appropriate amount per request

3.6 WHEN system prompts are built THEN the system SHALL CONTINUE TO respect user preferences including AI persona, caption style, content niche, and creativity level

3.7 WHEN hashtags are generated THEN the system SHALL CONTINUE TO return 15-20 hashtags mixing high-volume and niche tags optimized for the target platform

3.8 WHEN the frontend calls the generate endpoint THEN it SHALL CONTINUE TO display AI-generated content in the review interface with apply/discard options

3.9 WHEN content is published after AI generation THEN the system SHALL CONTINUE TO save applied captions and hashtags to the content record

3.10 WHEN workspace permissions are checked THEN the system SHALL CONTINUE TO validate that the requesting user owns or has access to the specified workspace
