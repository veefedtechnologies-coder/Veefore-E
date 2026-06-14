# GeminiService Integration Guide

This document explains how to integrate the new GeminiService with the existing AIServiceManager.

## Current Architecture

The existing `AIServiceManager` (located at `server/services/AIServiceManager.ts`) directly uses the Google Generative AI SDK. The new `GeminiService` provides a cleaner, more maintainable abstraction.

## Migration Strategy

### Phase 1: Parallel Running (Recommended)

Keep both implementations running in parallel initially:

```typescript
// In AIServiceManager.ts
import { geminiService } from '../features/ai/services';

export class AIServiceManager {
  private genAI: GoogleGenerativeAI; // Existing
  private geminiService = geminiService; // New

  public async generateText(prompt: string, preferences: UserAIPreferences = {}): Promise<string> {
    // Option 1: Use new GeminiService
    if (preferences.useNewService) {
      const response = await this.geminiService.generateText({
        prompt,
        config: {
          temperature: preferences.creativityLevel || 0.7,
          maxTokens: preferences.maxTokens,
        },
      });
      return response.text;
    }

    // Option 2: Use existing implementation (default)
    // ... existing code ...
  }
}
```

### Phase 2: Gradual Migration

Migrate specific methods to use GeminiService:

```typescript
// Example: Migrate caption generation
public async generateCaption(topic: string, preferences: UserAIPreferences = {}): Promise<string> {
  // Build system context
  const systemContext = this.buildSystemContext(preferences);

  // Use GeminiService
  const response = await this.geminiService.generateText({
    prompt: `Write an engaging Instagram caption about: "${topic}"`,
    systemContext,
    config: {
      temperature: preferences.creativityLevel || 0.7,
    },
  });

  return response.text;
}
```

### Phase 3: Complete Replacement

Once validated, replace all direct SDK usage with GeminiService:

```typescript
export class AIServiceManager {
  private geminiService: GeminiService;
  private openaiService: OpenAIService; // To be created
  
  constructor() {
    this.geminiService = new GeminiService();
    this.openaiService = new OpenAIService();
  }

  public async generateText(prompt: string, preferences: UserAIPreferences = {}): Promise<string> {
    const provider = this.selectProvider(preferences.aiModel);
    
    if (provider === 'gemini') {
      const response = await this.geminiService.generateText({
        prompt,
        systemContext: this.buildSystemContext(preferences),
        config: this.buildConfig(preferences),
      });
      return response.text;
    } else {
      const response = await this.openaiService.generateText({
        prompt,
        systemContext: this.buildSystemContext(preferences),
        config: this.buildConfig(preferences),
      });
      return response.text;
    }
  }
}
```

## Usage Examples

### Basic Text Generation

```typescript
import { geminiService } from './features/ai/services';

// Simple text generation
const response = await geminiService.generateText({
  prompt: 'Write a tagline for a coffee shop',
  config: {
    temperature: 0.8,
  },
});

console.log(response.text);
```

### With System Context (Persona)

```typescript
const response = await geminiService.generateText({
  prompt: 'Write an Instagram caption about morning coffee',
  systemContext: `You are a professional social media manager.
    Persona: Casual & Friendly
    Style: Storytelling
    Include 5-8 relevant hashtags.`,
  config: {
    temperature: 0.7,
    maxTokens: 200,
  },
});
```

### Content Analysis

```typescript
// Sentiment analysis
const sentiment = await geminiService.analyzeContent({
  content: 'I absolutely love this new feature!',
  analysisType: 'sentiment',
});

console.log(sentiment.sentiment); // { score: 0.9, label: 'positive', ... }

// Topic extraction
const topics = await geminiService.analyzeContent({
  content: 'The new iPhone features improved camera and battery life',
  analysisType: 'topics',
});

console.log(topics.topics); // ['iPhone', 'camera', 'battery', ...]

// Comprehensive analysis
const analysis = await geminiService.analyzeContent({
  content: 'Your content here',
  analysisType: 'comprehensive',
});

console.log(analysis); // { sentiment, topics, entities, safety, summary }
```

### Structured JSON Generation

```typescript
// Generate product data
interface ProductData {
  name: string;
  price: number;
  category: string;
  features: string[];
}

const product = await geminiService.generateStructuredJSON<ProductData>({
  prompt: 'Generate a product listing for wireless headphones',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      price: { type: 'number' },
      category: { type: 'string' },
      features: { type: 'array', items: { type: 'string' } },
    },
  },
  config: {
    temperature: 0.5,
  },
});

console.log(product.name, product.price, product.features);
```

### Error Handling

```typescript
import { 
  AIProviderError, 
  AIProviderRateLimitError,
  AIProviderSafetyError 
} from './features/ai/types/ai-provider.types';

try {
  const response = await geminiService.generateText({
    prompt: 'Your prompt here',
  });
  console.log(response.text);
} catch (error) {
  if (error instanceof AIProviderRateLimitError) {
    console.error('Rate limit exceeded. Please try again later.');
  } else if (error instanceof AIProviderSafetyError) {
    console.error('Content blocked by safety filters.');
  } else if (error instanceof AIProviderError) {
    console.error('AI provider error:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Configuration

### Environment Variables

```bash
# .env file
GOOGLE_API_KEY=your_google_api_key_here
```

### Service Configuration

```typescript
import { GeminiService, GeminiModel } from './features/ai/services';

// Custom configuration
const geminiService = new GeminiService({
  apiKey: process.env.GOOGLE_API_KEY,
  defaultModel: GeminiModel.PRO_2_5,
  safetyLevel: 'standard',
});

// Health check
const isHealthy = await geminiService.checkHealth();
console.log('Service healthy:', isHealthy);
```

## Benefits of Using GeminiService

1. **Cleaner Abstraction**: Well-defined interfaces and error types
2. **Better Error Handling**: Custom error types for different scenarios
3. **Type Safety**: Full TypeScript support with detailed interfaces
4. **Testability**: Easy to mock and test in isolation
5. **Consistency**: Same interface across all AI providers
6. **Extensibility**: Easy to add new features and models
7. **Maintainability**: Separated concerns and single responsibility

## Testing Integration

```typescript
// Mock GeminiService for testing
import { vi } from 'vitest';

const mockGeminiService = {
  generateText: vi.fn().mockResolvedValue({
    text: 'Generated text',
    finishReason: 'STOP',
  }),
  analyzeContent: vi.fn().mockResolvedValue({
    sentiment: { score: 0.8, label: 'positive' },
  }),
};

// Use in tests
const result = await mockGeminiService.generateText({
  prompt: 'test prompt',
});
expect(result.text).toBe('Generated text');
```

## Performance Considerations

1. **Singleton Pattern**: Use the exported `geminiService` instance to avoid multiple initializations
2. **Caching**: Consider implementing response caching for repeated queries
3. **Rate Limiting**: Monitor usage and implement client-side rate limiting if needed
4. **Model Selection**: Choose appropriate models based on task complexity:
   - `gemini-1.5-flash`: Fast, lightweight tasks
   - `gemini-2.5-pro`: Complex reasoning and analysis
   - `gemini-2.0-flash-exp`: Image generation and multimodal

## Next Steps

1. **Create OpenAIService**: Implement similar service for OpenAI
2. **Create AIServiceManager Refactor**: Update to use provider services
3. **Add Response Caching**: Implement caching layer
4. **Add Retry Logic**: Implement exponential backoff
5. **Add Streaming Support**: Support real-time streaming responses

## Support

For questions or issues, refer to:
- `/server/features/ai/README.md` - Service documentation
- `/server/features/ai/services/gemini.service.ts` - Implementation
- `/server/features/ai/services/gemini.service.test.ts` - Test examples
