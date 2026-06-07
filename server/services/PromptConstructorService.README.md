# PromptConstructorService

## Overview

The `PromptConstructorService` implements a sophisticated 6-layer prompt architecture for authentic Instagram caption generation. This service orchestrates multiple data sources to build comprehensive AI prompts that generate captions indistinguishable from human-written content.

## Architecture

### 6-Layer Prompt Structure

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1: Base Context                                      │
│  Platform-native writing principles & viral formulas        │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  LAYER 2: Voice Layer                                       │
│  User's unique writing style & patterns                     │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  LAYER 3: Viral Patterns                                    │
│  Proven high-engagement caption structures & hooks          │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  LAYER 4: Niche Context                                     │
│  Industry-specific language, slang, & cultural references   │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  LAYER 5: Examples (Few-Shot Learning)                      │
│  Real high-performing captions from target niche            │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  LAYER 6: Constraints & Task                                │
│  Task-specific instructions & content safety guidelines     │
└──────────────────────────────────────────────────────────────┘
```

## Requirements Addressed

- **Requirement 1.4**: Voice profile integration into caption generation
- **Requirement 2.4**: Viral pattern adaptation to user's voice
- **Requirement 3.4**: Niche-specific language incorporation
- **Requirement 7.4**: Few-shot learning with real examples
- **Requirement 11.1, 11.4, 11.5**: Content safety and brand protection

## Usage

### Basic Usage

```typescript
import { promptConstructorService } from './services/PromptConstructorService';

// Build a prompt for caption generation
const prompt = await promptConstructorService.buildGenerationPrompt({
  userId: 'user123',
  workspaceId: 'workspace456',
  postType: 'post',
  platform: 'Instagram',
  aiPreferences: {
    contentNiche: 'fitness',
    optimizationGoals: 'Engagement',
    contentSafety: 'standard',
  },
});

// Use with AI Service Manager
import { aiServiceManager } from './services/AIServiceManager';
const caption = await aiServiceManager.generateText(prompt, aiPreferences);
```

### Using Individual Formatting Methods

The service exposes public formatting methods that can be used independently:

```typescript
import { promptConstructorService } from './services/PromptConstructorService';
import { voiceProfileService } from './services/VoiceProfileService';

// Format voice profile independently
const voiceProfile = await voiceProfileService.getProfile(userId, workspaceId);
const voiceInstructions = promptConstructorService.voiceProfileToPrompt(voiceProfile);

// Format viral patterns independently
const patterns = await viralPatternService.getRelevantPatterns('fitness', 'post', 3);
const hooks = await viralPatternService.getViralHooks('fitness', 5);
const viralInstructions = promptConstructorService.viralPatternsToPrompt(patterns, hooks);

// Format niche context independently
const nicheContext = await nicheContextService.getNicheContext('fitness');
const nicheInstructions = promptConstructorService.nicheContextToPrompt(nicheContext);

// Format examples independently
const examples = await exampleCaptionService.getExamplesForGeneration('fitness', 'post', 3);
const exampleInstructions = promptConstructorService.examplesToPrompt(examples, 'post');

// Build task instructions independently
const taskInstructions = promptConstructorService.buildTaskInstructions({
  userId: 'user123',
  workspaceId: 'workspace456',
  postType: 'post',
  platform: 'Instagram',
  aiPreferences: { contentNiche: 'fitness' },
});
```

### With Media Analysis

```typescript
const prompt = await promptConstructorService.buildGenerationPrompt({
  userId: 'user123',
  workspaceId: 'workspace456',
  mediaAnalysis: 'Image shows person doing a deadlift at the gym',
  postType: 'post',
  platform: 'Instagram',
  aiPreferences: {
    contentNiche: 'fitness',
  },
});
```

### Improving Existing Caption

```typescript
const prompt = await promptConstructorService.buildGenerationPrompt({
  userId: 'user123',
  workspaceId: 'workspace456',
  existingCaption: 'Check out my workout today!',
  postType: 'post',
  platform: 'Instagram',
  aiPreferences: {
    contentNiche: 'fitness',
  },
});
```

## Public API Methods

### `buildGenerationPrompt(params)`

Main orchestration method that builds the complete 6-layer prompt.

**Parameters:**
- `userId` (string): User identifier
- `workspaceId` (string): Workspace identifier
- `postType` ('post' | 'story' | 'reel'): Type of post
- `platform` (string): Social media platform
- `aiPreferences` (object): AI generation preferences
  - `contentNiche` (string, optional): Content niche/vertical
  - `optimizationGoals` (string, optional): Optimization goals
  - `contentSafety` ('strict' | 'standard' | 'off', optional): Safety level
- `mediaAnalysis` (string, optional): Analysis of visual content
- `existingCaption` (string, optional): Caption to improve

**Returns:** Complete multi-layered prompt string

### `voiceProfileToPrompt(profile)`

Formats a voice profile into prompt instructions.

**Parameters:**
- `profile` (VoiceProfile | null): User's voice profile

**Returns:** Formatted voice profile instructions string

**Use Cases:**
- Standalone voice profile formatting
- Custom prompt construction
- Voice profile preview/debugging

### `viralPatternsToPrompt(patterns, hooks)`

Formats viral patterns and hooks into prompt instructions.

**Parameters:**
- `patterns` (ViralPattern[]): Array of relevant viral patterns
- `hooks` (ViralHook[]): Array of viral hooks

**Returns:** Formatted viral patterns instructions string

**Use Cases:**
- Pattern library documentation
- Custom pattern recommendations
- Pattern testing and validation

### `nicheContextToPrompt(context)`

Formats niche context into prompt instructions.

**Parameters:**
- `context` (NicheContext | null): Niche-specific context data

**Returns:** Formatted niche context instructions string

**Use Cases:**
- Niche language guidelines
- Content style guides
- Community tone documentation

### `examplesToPrompt(examples, postType)`

Formats example captions into few-shot learning instructions.

**Parameters:**
- `examples` (ExampleCaption[]): Array of high-performing examples
- `postType` (string): Type of post for context

**Returns:** Formatted examples instructions string

**Use Cases:**
- Example library preview
- Few-shot learning documentation
- Pattern extraction analysis

### `buildTaskInstructions(params)`

Builds task-specific instructions and constraints.

**Parameters:**
- Same as `buildGenerationPrompt()` params

**Returns:** Formatted task instructions string

**Use Cases:**
- Custom task definitions
- Safety guideline documentation
- Variation strategy specification

## Layer Details

### Layer 1: Base Context

Provides foundational guidance including:
- Platform-specific formatting rules (Instagram, etc.)
- Post type conventions (feed post, story, reel)
- AI tell warnings (words and phrases to avoid)
- Authentic writing characteristics
- Mobile-first readability principles

**Platform Guidelines by Post Type:**
- **Feed Posts**: Story-Insight-Question structure, 1-2 sentence paragraphs, 2-5 emojis
- **Stories**: Ultra-casual 1-2 sentences, interactive elements, heavy emoji usage acceptable
- **Reels**: Hook-first structure, short and punchy, high-energy, CTA for saves/shares

### Layer 2: Voice Profile

Integrates user's unique writing style:
- Vocabulary frequency patterns
- Signature phrases
- Sentence length distribution
- Emoji usage patterns
- Punctuation style
- Tone markers (casual, professional, humorous, etc.)
- Hook patterns and engagement question styles
- Storytelling structure preference

**Graceful Degradation**: Falls back to default authentic voice guidelines if no profile exists.

### Layer 3: Viral Patterns

Incorporates proven engagement formulas:
- 3-5 viral patterns relevant to niche and post type
- 5 high-performing viral hooks
- Example captions using each pattern
- Engagement boost statistics
- Pattern adaptation instructions (not verbatim copying)

**Pattern Categories:**
- Hook patterns
- Structure patterns
- Engagement patterns
- Storytelling patterns

### Layer 4: Niche Context

Provides industry-specific authenticity:
- Current trending topics (last 30 days)
- Niche-specific vocabulary (20-25 terms)
- Current slang and phrases with meanings
- Typical emojis for the niche
- Tone guidelines for the community
- Cultural references

**Supported Niches**: 15+ including fitness, food, travel, fashion, tech, business, beauty, etc.

### Layer 5: Examples (Few-Shot Learning)

Real high-performing captions as learning samples:
- 3 verified examples from target niche
- Engagement rate for each
- Hook type and style classification
- Pattern analysis (hook structure, storytelling technique, engagement format)
- Learning instructions (study structure, don't copy content)

### Layer 6: Constraints & Task

Task-specific generation requirements:
- **3 Distinct Variations**:
  1. Maximum Virality - Aggressive hooks, trending patterns
  2. Authentic Storytelling - Personal, vulnerable, voice-first
  3. Balanced Engagement - Formula + unique voice blend

- **Universal Requirements**:
  - 80+ authenticity score
  - Exact voice profile match
  - Natural niche language usage
  - Platform-appropriate formatting
  - Specific engagement question
  - Mobile-first line breaks
  - No hashtags in body

- **Content Safety** (3 levels):
  - **Strict**: Family-friendly, no controversy, advertiser-friendly
  - **Standard**: Authentic with reasonable boundaries, flag sensitive topics
  - **Off**: Creative freedom, user responsibility (still follows platform TOS)

## Integration with Other Services

### Dependencies

```typescript
VoiceProfileService    → User's writing style analysis
ViralPatternService   → High-engagement pattern library
NicheContextService   → Industry-specific language database
ExampleCaptionService → Real caption examples library
```

### Error Handling

The service implements graceful degradation:
- Missing voice profile → Uses default authentic guidelines
- Service failures → Continues with available layers
- Empty results → Provides fallback content
- All errors logged but don't block prompt generation

### Parallel Loading

All context data loads in parallel for optimal performance:
```typescript
const [voiceProfile, viralPatterns, viralHooks, nicheContext, examples] = 
  await Promise.all([
    loadVoiceProfile(),
    loadViralPatterns(),
    loadViralHooks(),
    loadNicheContext(),
    loadExamples(),
  ]);
```

## Output Format

The generated prompt is a comprehensive, well-structured document with:
- Clear layer separations using visual dividers
- Detailed instructions for each layer
- Specific requirements and constraints
- Examples and reference material
- Safety guidelines

**Typical Prompt Size**: 7,000-8,500 characters

## Testing

Comprehensive test coverage with 36 unit tests:
- ✅ All 6 layers present and formatted correctly
- ✅ Platform-specific guidelines for each post type
- ✅ Voice profile integration and fallback
- ✅ Viral patterns and hooks inclusion
- ✅ Niche context integration
- ✅ Example captions with few-shot learning
- ✅ Task constraints and safety levels
- ✅ Error handling and graceful degradation
- ✅ Media analysis and existing caption improvement
- ✅ Parallel context loading
- ✅ **Public formatting methods (`voiceProfileToPrompt`, `viralPatternsToPrompt`, `nicheContextToPrompt`, `examplesToPrompt`, `buildTaskInstructions`)**
- ✅ **Null and empty input handling for all formatters**
- ✅ **Independent method usage and reusability**

Run tests:
```bash
npm test -- PromptConstructorService --run
```

## Performance Considerations

### Optimization Strategies

1. **Parallel Loading**: All context data fetched concurrently
2. **Service Caching**: NicheContextService implements 24-hour TTL cache
3. **Error Tolerance**: Service failures don't block prompt generation
4. **Selective Loading**: Only loads data relevant to the request

### Expected Performance

- Prompt construction: 100-300ms (with parallel loading)
- Cache hit on niche context: < 10ms
- Cold start (no cache): 200-500ms

## Best Practices

### When to Use

✅ **Use this service for**:
- AI caption generation requests
- Caption improvement/rewriting
- Multi-variation generation
- Voice-matched content creation

❌ **Don't use for**:
- Simple text generation (use AIServiceManager directly)
- Non-caption content (comments, bios, etc.)
- Quick replies or automated responses

### Configuration Tips

1. **Niche Selection**: Always provide `contentNiche` for best results
2. **Voice Profile**: Ensure users have analyzed profiles for authentic voice
3. **Safety Level**: Choose based on brand guidelines:
   - Strict → Corporate brands, family content
   - Standard → Most creators, balanced approach
   - Off → Edgy creators, personal brands

4. **Post Type**: Match to actual post format:
   - `post` → Feed posts (main content)
   - `story` → 24-hour stories
   - `reel` → Short-form video captions

## Future Enhancements

Potential improvements:
- [ ] A/B testing variation strategies
- [ ] Real-time trend integration
- [ ] Multi-language prompt construction
- [ ] Custom pattern libraries per user
- [ ] Engagement prediction integration
- [ ] Dynamic layer weighting based on performance

## Related Services

- **VoiceProfileService**: Analyzes and stores user writing styles
- **ViralPatternService**: Manages viral pattern and hook libraries
- **NicheContextService**: Maintains niche-specific language databases
- **ExampleCaptionService**: Curates high-performing caption examples
- **AuthenticityScorer**: Evaluates caption authenticity (downstream)
- **EngagementPredictor**: Predicts caption performance (downstream)
- **AIServiceManager**: Executes AI generation with constructed prompts

## Contributing

When modifying this service:
1. Maintain the 6-layer architecture
2. Add tests for new functionality
3. Document new parameters and options
4. Consider backward compatibility
5. Update this README with changes

## License

Part of the Veefore project - Authentic Instagram Caption Generation system.
