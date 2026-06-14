# AI Utility Functions

This directory contains reusable AI utility functions extracted from the main AI routes file to support all AI services across the application.

## Overview

These utilities implement **Requirements 12.4 and 12.6** from the codebase refactoring spec, providing centralized, testable utilities for:
- Prompt processing and template management
- Content generation and optimization
- Error handling with retry logic and fallback providers

## Files

### 1. `promptProcessing.ts` (~250 lines)

Provides utilities for building AI prompts, injecting context, and managing prompt templates.

**Key Functions:**
- `buildSystemContext()` - Creates global system context with user preferences
- `injectSystemContext()` - Applies system context to prompts
- `buildCaptionPrompt()` - Builds Instagram caption generation prompts
- `buildScriptPrompt()` - Builds video script generation prompts
- `buildHashtagPrompt()` - Builds hashtag generation prompts
- `buildChatPrompt()` - Builds chat/conversational AI prompts
- `sanitizePromptInput()` - Removes prompt injection attempts
- `parseOptimizationGoals()` - Parses optimization goals from text
- `mergePromptTemplates()` - Merges multiple prompt templates

**Example Usage:**
```typescript
import { buildCaptionPrompt, injectSystemContext } from './promptProcessing';

// Build a caption prompt
const prompt = buildCaptionPrompt({
  topic: 'Travel adventure in Bali',
  platform: 'Instagram',
  postType: 'post',
  style: 'viral',
  autoHashtags: true
});

// Inject system context
const finalPrompt = injectSystemContext(prompt.userPrompt, {
  aiPersona: 'Casual & Friendly',
  captionStyle: 'Storytelling',
  optimizationGoals: 'engagement'
});
```

### 2. `contentGeneration.ts` (~250 lines)

Provides utilities for text formatting, caption optimization, and content post-processing.

**Key Functions:**
- `extractHashtags()` - Extracts hashtags from caption text
- `formatHashtags()` - Formats hashtags into standardized format
- `parseHashtagsFromText()` - Parses hashtags from AI response
- `optimizeCaption()` - Optimizes captions for platform requirements
- `calculateContentMetrics()` - Calculates comprehensive content metrics
- `formatCaptionWithLineBreaks()` - Formats captions with proper spacing
- `removeAITells()` - Removes AI tells and generic phrases
- `addEngagingCTA()` - Adds engaging CTAs to captions
- `truncateText()` - Truncates text while preserving words
- `validateCaption()` - Validates captions meet platform requirements
- `generateCaptionVariation()` - Generates caption variations

**Example Usage:**
```typescript
import { optimizeCaption, extractHashtags, validateCaption } from './contentGeneration';

// Optimize a caption
const result = optimizeCaption(
  'Great post about travel! #travel #adventure #wanderlust',
  'instagram',
  {
    maxLength: 2200,
    addLineBreaks: true,
    removeExcessiveHashtags: true
  }
);

console.log(result.optimizedCaption);
console.log(result.improvements);

// Extract and separate hashtags
const { caption, hashtags } = extractHashtags(rawCaption);

// Validate caption
const validation = validateCaption(caption, 'instagram');
if (!validation.isValid) {
  console.error('Validation errors:', validation.errors);
}
```

### 3. `errorHandling.ts` (~250 lines)

Provides utilities for retry logic, fallback providers, and error management.

**Key Features:**
- Exponential backoff with jitter
- Retryable vs non-retryable error classification
- Circuit breaker pattern implementation
- Fallback provider orchestration
- Timeout handling
- Structured error logging

**Key Functions:**
- `classifyAIError()` - Classifies errors and determines retryability
- `calculateBackoffDelay()` - Calculates exponential backoff with jitter
- `retryWithBackoff()` - Executes operations with retry logic
- `executeWithFallback()` - Executes with provider fallback
- `withTimeout()` - Wraps operations with timeout
- `wrapAIOperation()` - Comprehensive error handling wrapper
- `CircuitBreaker` - Circuit breaker implementation
- `createErrorResponse()` - Creates standardized error responses

**Example Usage:**
```typescript
import { retryWithBackoff, executeWithFallback, CircuitBreaker } from './errorHandling';

// Retry with backoff
const result = await retryWithBackoff(
  async () => await aiService.generateText(prompt),
  {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
  },
  'AI text generation'
);

if (!result.success) {
  console.error('Operation failed:', result.error);
}

// Use circuit breaker
const breaker = new CircuitBreaker(5, 60000);

try {
  const text = await breaker.execute(
    () => aiService.generateText(prompt),
    'AI generation'
  );
} catch (error) {
  if (breaker.getState() === 'OPEN') {
    console.log('Circuit is open, service degraded');
  }
}

// Execute with fallback providers
const providers = [
  {
    name: 'Gemini',
    priority: 1,
    isAvailable: async () => !!process.env.GOOGLE_API_KEY,
    execute: async (op) => await geminiService.execute(op)
  },
  {
    name: 'OpenAI',
    priority: 2,
    isAvailable: async () => !!process.env.OPENAI_API_KEY,
    execute: async (op) => await openaiService.execute(op)
  }
];

const result = await executeWithFallback(
  providers,
  (provider) => () => provider.execute(generateOperation),
  'AI generation'
);
```

## Testing

All utilities have comprehensive unit tests with 100% coverage of critical paths.

Run tests:
```bash
npm test -- features/ai/utils/__tests__/
```

Individual test files:
```bash
npm test -- features/ai/utils/__tests__/promptProcessing.test.ts --run
npm test -- features/ai/utils/__tests__/contentGeneration.test.ts --run
npm test -- features/ai/utils/__tests__/errorHandling.test.ts --run
```

## Architecture

These utilities follow the **Single Responsibility Principle** and are organized by concern:

- **promptProcessing.ts** - Input preparation (prompts, templates, context)
- **contentGeneration.ts** - Output processing (formatting, optimization, validation)
- **errorHandling.ts** - Resilience (retries, fallbacks, circuit breakers)

## Integration

These utilities are designed to be used by:
- `/server/routes/v1/ai.routes.ts` - Main AI API routes
- `/server/services/AIServiceManager.ts` - AI service orchestrator
- `/server/features/ai/services/*` - Provider-specific AI services
- `/server/ai-*.ts` - AI-specific service files (content-repurpose-ai, creative-brief-ai, etc.)

## Benefits

1. **Reusability** - Common patterns extracted from duplicated code
2. **Testability** - Pure functions with comprehensive test coverage
3. **Maintainability** - Centralized logic easier to update
4. **Reliability** - Robust error handling and retry logic
5. **Consistency** - Standardized prompts and content formatting
6. **Performance** - Efficient retry strategies with backoff

## Migration

To migrate existing AI code to use these utilities:

1. Replace inline prompt building with `buildCaptionPrompt()` or `buildScriptPrompt()`
2. Replace hashtag extraction logic with `extractHashtags()`
3. Replace caption optimization with `optimizeCaption()`
4. Replace try-catch blocks with `retryWithBackoff()` or `wrapAIOperation()`
5. Replace provider fallback logic with `executeWithFallback()`

## Requirements Mapping

- **Requirement 12.4** (Content Generation Utilities) - ✅ Implemented
  - `promptProcessing.ts` - Prompt templates and context injection
  - `contentGeneration.ts` - Text formatting and caption optimization

- **Requirement 12.6** (Error Handling) - ✅ Implemented
  - `errorHandling.ts` - Retry logic and fallback providers
  - Circuit breaker pattern for service degradation
  - Structured error classification and logging
