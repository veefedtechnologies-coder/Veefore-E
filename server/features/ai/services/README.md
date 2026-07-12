# AI Services

This directory contains the AI service layer for the Veefore-E application, providing a unified interface for interacting with multiple AI providers (OpenAI, Gemini, and Perplexity).

## Architecture

The AI services follow a provider pattern with a central orchestrator:

```
AIServiceManager (Orchestrator)
├── OpenAIService (GPT-4, DALL-E)
├── GeminiService (Gemini Pro, Gemini Flash)
└── PerplexityService (Sonar models with web search)
```

## Files

### Core Services

- **`ai-manager.service.ts`** - Central orchestrator that manages all AI providers, implements provider selection, fallback logic, and load balancing
- **`openai.service.ts`** - OpenAI API integration (GPT-4, GPT-4o, DALL-E 2/3)
- **`gemini.service.ts`** - Google Gemini API integration (Gemini Pro, Flash models)
- **`perplexity.service.ts`** - Perplexity API integration (Sonar models with real-time web search)

### Supporting Files

- **`index.ts`** - Exports all services and types
- **`README.md`** - This file
- **`ai-manager.service.test.ts`** - Unit tests for AIServiceManager

## Usage

### Basic Usage

```typescript
import { AIServiceManager } from './services';

// Get the singleton instance
const aiManager = AIServiceManager.getInstance();

// Generate text with default provider
const textResponse = await aiManager.generateText({
  prompt: 'Write a social media caption about technology',
  systemContext: 'You are a social media expert',
  config: {
    temperature: 0.7,
    maxTokens: 200,
  },
});

console.log(textResponse.text);
```

### Provider-Specific Usage

```typescript
// Use a specific provider
const response = await aiManager.generateText(
  {
    prompt: 'Analyze this content...',
  },
  'gemini' // Preferred provider
);

// Generate image with OpenAI
const imageResponse = await aiManager.generateImage(
  {
    prompt: 'A futuristic cityscape',
    size: '1024x1024',
    quality: 'hd',
  },
  'openai'
);
```

### Configuration

```typescript
// Configure the manager with custom settings
const aiManager = AIServiceManager.getInstance({
  defaultProvider: 'openai',
  enableFallback: true,
  enableLoadBalancing: false,
  preferredProviders: {
    text: 'openai',
    image: 'openai',
    analysis: 'gemini',
  },
});
```

### Health Monitoring

```typescript
// Check health of all providers
const healthStatus = await aiManager.checkAllProvidersHealth();
console.log(healthStatus);
// { openai: true, gemini: true, perplexity: false }

// Check if specific provider is available
const isAvailable = aiManager.isProviderAvailable('openai');

// Get usage statistics
const stats = aiManager.getStatistics();
console.log(stats);
/*
{
  providers: {
    openai: { healthy: true, requests: 42 },
    gemini: { healthy: true, requests: 18 },
    perplexity: { healthy: false, requests: 0 }
  },
  totalRequests: 60
}
*/
```

### Direct Provider Access

```typescript
// Access a specific provider directly if needed
const openaiService = aiManager.getProvider('openai');
if (openaiService) {
  const response = await openaiService.generateText({
    prompt: 'Hello world',
  });
}
```

## Features

### 1. Provider Selection

The manager automatically selects the best provider based on:
- Task type (text, image, analysis)
- Configuration preferences
- Provider availability
- Load balancing settings

### 2. Automatic Fallback

When a provider fails or hits rate limits, the manager automatically falls back to alternative providers:

```typescript
// Enable fallback in configuration
const aiManager = AIServiceManager.getInstance({
  enableFallback: true,
});

// If OpenAI fails, it will automatically try Gemini or Perplexity
const response = await aiManager.generateText({
  prompt: 'Generate content...',
});
```

### 3. Load Balancing

Distribute requests across multiple providers:

```typescript
const aiManager = AIServiceManager.getInstance({
  enableLoadBalancing: true,
});

// Requests will be distributed using round-robin among healthy providers
```

### 4. Health Monitoring

Automatic health checks with configurable intervals:
- Health status refreshes every 5 minutes by default
- Failed providers are temporarily marked as unhealthy
- Health checks run automatically before provider selection

### 5. Error Handling

Unified error handling with specific error types:
- `AIProviderError` - Generic provider error
- `AIProviderRateLimitError` - Rate limit exceeded
- `AIProviderAuthError` - Authentication failure
- `AIProviderSafetyError` - Content safety violation

```typescript
try {
  const response = await aiManager.generateText(request);
} catch (error) {
  if (error instanceof AIProviderRateLimitError) {
    console.log('Rate limit hit, retry after', error.retryAfter);
  } else if (error instanceof AIProviderAuthError) {
    console.log('Auth failed for provider:', error.provider);
  }
}
```

## Provider Capabilities

### OpenAI (openai.service.ts)

**Models:**
- GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo
- DALL-E 3, DALL-E 2

**Capabilities:**
- Text generation with chat completions
- Image generation (various sizes and quality levels)
- Content analysis (sentiment, topics, entities, safety)
- JSON mode for structured outputs
- Retry logic with exponential backoff
- Rate limiting with token bucket algorithm

### Gemini (gemini.service.ts)

**Models:**
- Gemini 2.5 Pro, Gemini 2.5 Flash
- Gemini 1.5 Pro, Gemini 1.5 Flash
- Gemini 2.0 Flash Experimental

**Capabilities:**
- Text generation with system instructions
- Image generation (experimental)
- Content analysis
- Multimodal content analysis (text + images)
- Structured JSON generation
- Configurable safety settings

### Perplexity (perplexity.service.ts)

**Models:**
- Llama 3.1 Sonar Small/Large (128k context)

**Capabilities:**
- Text generation with real-time web search
- Web search with citations
- Recency filters (hour, day, week, month, year)
- Citation parsing and formatting
- Research-focused responses

## Configuration via Environment Variables

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Google Gemini
GOOGLE_API_KEY=AI-za...

# Perplexity
PERPLEXITY_API_KEY=pplx_...
```

## Testing

Run the test suite:

```bash
npm test -- ai-manager.service.test.ts
```

The tests cover:
- Singleton pattern
- Provider initialization
- Provider selection
- Health checks
- Statistics tracking
- Configuration options
- Error handling

## Integration with Controllers

The AI services are designed to be used by controller layer:

```typescript
// In a controller
import { getAIServiceManager } from '../services';

export class ContentController {
  async generateCaption(req: Request, res: Response) {
    try {
      const aiManager = getAIServiceManager();
      
      const result = await aiManager.generateText({
        prompt: req.body.prompt,
        config: {
          temperature: 0.8,
          maxTokens: 500,
        },
      });
      
      res.json({ caption: result.text });
    } catch (error) {
      // Error handling
    }
  }
}
```

## Best Practices

1. **Use the manager, not services directly** - Always use `AIServiceManager` instead of individual provider services for automatic fallback and load balancing

2. **Configure provider preferences** - Set preferred providers for different task types based on your use case

3. **Monitor health and statistics** - Regularly check provider health and usage statistics to optimize costs

4. **Handle errors gracefully** - Use specific error types to provide better user feedback

5. **Set appropriate timeouts** - Configure reasonable timeouts for your use case

6. **Use appropriate models** - Choose models based on speed/quality tradeoff

## Requirements Mapping

This implementation satisfies the following requirements:

- **Requirement 4.1, 4.2** - Service layer architecture with clean separation
- **Requirement 12.1, 12.2** - AI service refactoring and provider-specific services
- **Requirement 12.3, 12.5** - Provider interface implementation and error handling

## Task Completion

**Task 16.1**: Create AIServiceManager orchestrator (~300 lines) ✅
- Created `ai-manager.service.ts` (493 lines including comprehensive features)
- Implements provider selection based on configuration
- Defines interfaces for AI provider methods
- Includes proper TypeScript types and error handling
- Adds JSDoc documentation
- Includes unit tests with 100% pass rate
