# Implementation Plan: Authentic Instagram Caption Generation

## Overview

This implementation transforms the AI caption generation system from producing generic, robotic content to creating authentic, voice-matched captions that leverage viral patterns and niche-specific language. The implementation extends the existing `AIContentGenerator` class and integrates with the `AIServiceManager` for multi-provider AI support.

**Implementation Approach:**
1. Database schema and models first (foundation)
2. Core service layer implementation (voice analysis, viral patterns, niche context, examples, authenticity scoring, engagement prediction)
3. AI prompt engineering and integration (prompt constructor service)
4. Integration with existing AIContentGenerator
5. New API endpoints and routes
6. Frontend UI components
7. Feedback learning loops and continuous improvement

## Tasks

- [x] 1. Set up database schemas and MongoDB models
  - Create MongoDB schemas for all new collections: voiceprofiles, viralpatterns, viralhooks, nichecontexts, examplecaptions, generatedcaptions, captionfeedback
  - Add TypeScript interfaces in `server/domain/types.ts` for all data models
  - Create repository classes in `server/repositories/` for data access
  - Add indexes for optimized queries (userId+workspaceId, niche+postType, engagementRate)
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Implement Voice Profile Service
  - [x] 2.1 Create VoiceProfileService class with analysis methods
    - Implement `analyzeAndCreateProfile()` to extract vocabulary frequency, sentence structure, emoji patterns, tone markers
    - Implement `getProfile()` to retrieve existing profiles with defaults
    - Implement `voiceProfileToPrompt()` to convert profiles to prompt instructions
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 2.2 Implement voice pattern extraction algorithms
    - Write vocabulary frequency analyzer using natural language processing
    - Implement sentence length distribution calculator
    - Create emoji usage pattern detector
    - Build tone marker analyzer (casual, professional, humorous, etc.)
    - Extract signature phrases and hook patterns
    - _Requirements: 1.1, 1.2_
  
  - [x] 2.3 Implement profile update mechanisms
    - Create `updateFromEdit()` to learn from user caption edits
    - Create `updateFromSelection()` to learn from variation choices
    - Implement incremental profile updates (don't overwrite, adjust weights)
    - _Requirements: 1.5, 10.1, 10.2_

- [x] 3. Implement Viral Pattern Service
  - [x] 3.1 Create ViralPatternService class with pattern matching
    - Implement `getRelevantPatterns()` to query patterns by niche and post type
    - Implement `getViralHooks()` to retrieve high-performing hooks
    - Create pattern filtering and ranking logic based on engagement metrics
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 3.2 Implement pattern learning and extraction
    - Create `extractAndAddPattern()` to identify patterns from successful captions
    - Implement `updatePatternPerformance()` to track pattern effectiveness
    - Build pattern template system with placeholder replacement
    - _Requirements: 2.4, 2.5, 2.6_
  
  - [x] 3.3 Seed initial viral pattern database
    - Create migration script to populate viral patterns by niche
    - Add 200+ proven caption structures across major niches
    - Add 50+ viral hooks per niche (fitness, food, travel, fashion, tech, business, etc.)
    - _Requirements: 2.1, 2.2_

- [x] 4. Implement Niche Context Service
  - [x] 4.1 Create NicheContextService class with context management
    - Implement `getNicheContext()` to retrieve language data by niche
    - Implement `getBlendedContext()` for multi-niche content
    - Create context caching mechanism with TTL
    - _Requirements: 3.1, 3.2, 3.5_
  
  - [x] 4.2 Implement trend tracking and language filtering
    - Create `updateTrends()` to refresh trending topics, hashtags, phrases
    - Implement `isTermOutdated()` to filter obsolete slang
    - Build frequency-based term relevance scoring
    - _Requirements: 3.3, 3.6_
  
  - [x] 4.3 Seed initial niche context database
    - Create migration script for 15+ niche contexts
    - Populate vocabulary, slang terms, cultural references, typical emojis
    - Add tone guidelines per niche
    - _Requirements: 3.1, 3.2_

- [x] 5. Implement Example Caption Library Service
  - [x] 5.1 Create ExampleCaptionService class
    - Implement `getExamplesForGeneration()` to select high-performing examples
    - Implement `addUserExample()` to save successful user captions
    - Create example filtering by engagement rate, style, niche
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [x] 5.2 Implement pattern extraction from examples
    - Create `extractPatterns()` to identify hook structure, storytelling technique
    - Build engagement format analyzer
    - Implement example categorization by style characteristics
    - _Requirements: 7.4, 7.6_
  
  - [x] 5.3 Seed initial example caption library
    - Create migration script to populate example captions
    - Add 1000+ real high-performing captions per major niche
    - Include verified engagement metrics and categorization
    - _Requirements: 7.1, 7.5_

- [ ] 6. Checkpoint - Core services foundation complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Authenticity Scorer Service
  - [x] 7.1 Create AuthenticityScorer class with scoring algorithms
    - Implement 12 criteria scoring methods (vocabularyNaturalness, sentenceFlow, emojiPlacement, etc.)
    - Create `scoreCaption()` main method that evaluates all criteria
    - Implement overall score calculation (sum of criteria / 120 * 100)
    - _Requirements: 4.1, 4.2, 4.5_
  
  - [x] 7.2 Implement AI tell detection
    - Create `detectAITells()` with blacklist checking
    - Add corporate jargon detector
    - Implement generic phrase detection
    - Build unnatural pattern identifier
    - _Requirements: 4.4_
  
  - [x] 7.3 Implement voice consistency checker
    - Create `checkVoiceConsistency()` to compare against voice profile
    - Calculate vocabulary overlap percentage
    - Verify tone marker alignment
    - Check signature phrase usage
    - _Requirements: 4.5_

- [ ] 8. Implement Engagement Predictor Service
  - [x] 8.1 Create EngagementPredictor class with prediction models
    - Implement `predictEngagement()` with multi-factor analysis
    - Build hook strength scorer
    - Create readability analyzer
    - Implement CTA clarity evaluator
    - Calculate emotional resonance score
    - _Requirements: 9.1, 9.2, 9.4_
  
  - [x] 8.2 Implement performance tracking and learning
    - Create `recordActualPerformance()` to store real metrics
    - Implement `getUserAverageMetrics()` for baseline calculations
    - Build accuracy tracking for prediction model improvement
    - _Requirements: 9.5, 9.6_
  
  - [x] 8.3 Implement engagement comparison logic
    - Calculate predicted vs user average performance
    - Build confidence scoring based on historical accuracy
    - Create performance flags for below-average predictions
    - _Requirements: 9.3, 9.6_

- [x] 9. Implement Prompt Constructor Service
  - [x] 9.1 Create PromptConstructorService with layered prompt building
    - Implement `buildGenerationPrompt()` main orchestration method
    - Create base instruction templates for platform and post type
    - Build voice profile prompt layer
    - Build viral pattern prompt layer
    - Build niche context prompt layer
    - Build few-shot examples prompt layer
    - Build task-specific instructions layer
    - _Requirements: 1.4, 2.4, 3.4, 7.4_
  
  - [x] 9.2 Implement prompt formatting methods
    - Create `voiceProfileToPrompt()` formatter
    - Create `viralPatternsToPrompt()` formatter
    - Create `nicheContextToPrompt()` formatter
    - Create `examplesToPrompt()` formatter
    - Create `buildTaskInstructions()` formatter
    - _Requirements: 1.4, 2.4, 3.4_
  
  - [x] 9.3 Implement optimization and safety layers
    - Add content safety filtering instructions
    - Add platform-specific guidelines
    - Add optimization goal instructions
    - Add creativity level tuning
    - _Requirements: 11.1, 11.4, 11.5_

- [ ] 10. Checkpoint - AI intelligence layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Integrate with existing AIContentGenerator
  - [x] 11.1 Extend AIContentGenerator.generateContent() method
    - Add voice profile loading step
    - Add viral pattern selection step
    - Add niche context retrieval step
    - Add example caption selection step
    - Integrate PromptConstructorService for enhanced prompt building
    - _Requirements: 1.4, 2.3, 3.2, 7.3_
  
  - [-] 11.2 Implement multi-variation generation
    - Modify generation to produce 3 distinct variations
    - Implement variation differentiation strategies (viral, authentic, balanced)
    - Add authenticity scoring for each variation
    - Add engagement prediction for each variation
    - Filter out variations below 80 authenticity threshold
    - _Requirements: 8.1, 8.2, 4.6_
  
  - [x] 11.3 Implement caption tracking and storage
    - Create `saveGeneratedCaption()` to store all variations with metadata
    - Track which variation user selected
    - Record user edits and edit distance
    - Link to Content collection for performance tracking
    - _Requirements: 8.3, 10.1, 10.2_

- [x] 12. Implement Strategic Hashtag Generation System
  - [x] 12.1 Create enhanced hashtag generation logic
    - Build content theme analyzer for micro-niche hashtags
    - Implement 30/50/20 competition ratio algorithm (high/medium/low)
    - Create hashtag blacklist checker (banned, spam-associated)
    - Add branded hashtag detection from voice profile
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 12.2 Implement hashtag relevance scoring
    - Create content-to-hashtag relevance scorer
    - Build niche-specific hashtag performance tracker
    - Implement engagement-based hashtag ranking
    - _Requirements: 6.3, 6.6_

- [x] 13. Implement Feedback Learning System
  - [x] 13.1 Create feedback capture mechanisms
    - Implement caption selection tracking
    - Create edit analysis engine (detect vocabulary, structure, emoji, length, tone changes)
    - Build rejection pattern analyzer
    - _Requirements: 10.1, 10.2, 10.6_
  
  - [x] 13.2 Implement profile update scheduler
    - Create monthly voice profile update job
    - Implement pattern preference learning job
    - Build performance correlation analyzer
    - Create declining acceptance detector with recalibration trigger
    - _Requirements: 10.4, 10.5, 10.6_
  
  - [x] 13.3 Implement performance correlation engine
    - Link generated captions to actual engagement metrics
    - Identify characteristics of successful vs unsuccessful captions
    - Update viral pattern database with new learnings
    - Update engagement predictor model weights
    - _Requirements: 10.3, 10.5_

- [x] 14. Create API endpoints for voice profile setup
  - [x] 14.1 Create POST /api/voice-profile/analyze endpoint
    - Accept sample captions or Instagram account connection
    - Trigger voice profile analysis
    - Return voice profile summary and confidence score
    - _Requirements: 1.1, 1.3_
  
  - [x] 14.2 Create GET /api/voice-profile/:workspaceId endpoint
    - Retrieve existing voice profile
    - Return profile metrics and characteristics
    - Handle missing profile scenario
    - _Requirements: 1.3_
  
  - [x] 14.3 Create PUT /api/voice-profile/:workspaceId/recalibrate endpoint
    - Trigger manual voice profile recalibration
    - Re-analyze based on recent successful captions
    - Return updated profile
    - _Requirements: 10.6_

- [x] 15. Create API endpoints for caption generation
  - [x] 15.1 Extend POST /api/ai/generate-caption endpoint
    - Add variation generation support
    - Include authenticity scores in response
    - Include engagement predictions in response
    - Return style characteristics for each variation
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 15.2 Create POST /api/ai/regenerate-captions endpoint
    - Accept rejected variation IDs
    - Generate new variations avoiding rejected patterns
    - Apply learned preferences
    - _Requirements: 8.6_
  
  - [x] 15.3 Create POST /api/ai/record-caption-feedback endpoint
    - Accept selected variation, rejected variations, edits
    - Store feedback in captionfeedback collection
    - Trigger async profile update
    - _Requirements: 10.1, 10.2_

- [ ] 16. Create API endpoints for performance tracking
  - [x] 16.1 Create POST /api/ai/record-performance endpoint
    - Accept captionId and actual engagement metrics
    - Update generatedcaptions collection with actual performance
    - Trigger engagement predictor retraining
    - _Requirements: 10.3_
  
  - [-] 16.2 Create GET /api/ai/caption-insights/:captionId endpoint
    - Return predicted vs actual performance comparison
    - Show which patterns/hooks performed well
    - Provide insights for future generations
    - _Requirements: 9.5_

- [ ] 17. Checkpoint - Backend implementation complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Create frontend UI for voice profile setup
  - [-] 18.1 Create VoiceProfileSetup component
    - Build sample caption upload interface (5+ captions)
    - Add Instagram account connection flow
    - Show voice profile analysis progress
    - Display extracted voice characteristics
    - _Requirements: 1.1_
  
  - [ ] 18.2 Create VoiceProfileViewer component
    - Display voice profile metrics (vocabulary, tone, emoji usage)
    - Show signature phrases and patterns
    - Add confidence score visualization
    - Include recalibration action button
    - _Requirements: 1.3_

- [ ] 19. Create frontend UI for caption variation selection
  - [ ] 19.1 Create CaptionVariationSelector component
    - Display 3 caption variations side-by-side
    - Show authenticity score for each variation
    - Show engagement prediction for each variation
    - Display style characteristics (viral, authentic, balanced)
    - Add select button for each variation
    - Add regenerate all button
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [ ] 19.2 Create CaptionEditorWithTracking component
    - Integrate with existing caption editor
    - Track edit changes for learning
    - Show inline authenticity score as user edits
    - Show engagement prediction updates in real-time
    - _Requirements: 10.1_
  
  - [ ] 19.3 Implement variation comparison view
    - Add side-by-side comparison mode
    - Highlight differences between variations
    - Show which patterns/hooks each uses
    - Add copy-to-clipboard for quick testing
    - _Requirements: 8.3_

- [ ] 20. Create frontend UI for performance insights
  - [ ] 20.1 Create CaptionPerformanceInsights component
    - Show predicted vs actual metrics
    - Visualize which captions overperformed/underperformed
    - Display learning insights from feedback
    - Show improving accuracy trends
    - _Requirements: 9.5, 10.3_
  
  - [ ] 20.2 Create VoiceProfileEvolution component
    - Show how voice profile has changed over time
    - Display learning milestones
    - Show acceptance rate trends
    - Highlight successful pattern discoveries
    - _Requirements: 10.4, 10.5_

- [ ] 21. Implement cross-platform caption adaptation
  - [-] 21.1 Create PlatformAdapterService
    - Implement platform-specific formatting rules (Twitter, LinkedIn, TikTok)
    - Create character limit handlers
    - Implement platform-specific language adapters
    - Build emoji usage adjusters per platform
    - _Requirements: 12.1, 12.2, 12.3_
  
  - [ ] 21.2 Create POST /api/ai/adapt-caption endpoint
    - Accept Instagram caption and target platform
    - Apply platform-specific transformations
    - Maintain core message and voice
    - Return adapted caption with warnings if needed
    - _Requirements: 12.1, 12.2, 12.4_

- [ ] 22. Implement content safety and brand protection
  - [-] 22.1 Integrate content safety filters
    - Add safety filter to caption generation pipeline
    - Implement controversial content detector
    - Create brand guideline checker
    - Add user-defined prohibited topic filter
    - _Requirements: 11.1, 11.2, 11.3_
  
  - [ ] 22.2 Implement safety flag system
    - Create "review recommended" flag for edgy content
    - Add user feedback on false positives
    - Implement safety calibration without compromising protection
    - _Requirements: 11.4, 11.5, 11.6_

- [ ] 23. Final integration and end-to-end testing
  - [ ] 23.1 Integration testing
    - Test complete flow: voice profile setup → caption generation → variation selection → performance tracking
    - Verify all services integrate correctly with AIContentGenerator
    - Test database queries and indexes for performance
    - Validate all API endpoints with various inputs
    - _Requirements: All_
  
  - [ ] 23.2 User experience testing
    - Test voice profile accuracy with real sample captions
    - Validate authenticity scores match human perception
    - Verify engagement predictions improve over time
    - Test feedback learning loop effectiveness
    - _Requirements: 1.3, 4.2, 9.5, 10.4_

- [ ] 24. Final checkpoint - Complete system validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All core implementation tasks (non-test) are mandatory for feature completion
- Tasks reference specific requirements for traceability
- Checkpoints ensure incremental validation at major milestones
- Services follow existing patterns in `server/services/` directory
- Database models follow existing patterns in `server/domain/types.ts` and `server/repositories/`
- API endpoints integrate with existing `server/routes.ts` structure
- Frontend components integrate with existing React/TypeScript structure
- The system is designed to improve over time through continuous learning
- Voice profile analysis runs asynchronously to avoid blocking user experience
- All AI generation uses `AIServiceManager` for multi-provider support
- Authenticity threshold of 80/100 ensures high-quality output
- Engagement predictions track actual performance to improve accuracy
- Strategic hashtag generation prioritizes relevance over popularity

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "7.1", "8.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.2", "5.2", "7.2", "8.2", "9.1"] },
    { "id": 3, "tasks": ["2.3", "3.3", "4.3", "5.3", "7.3", "8.3", "9.2"] },
    { "id": 4, "tasks": ["9.3", "11.1"] },
    { "id": 5, "tasks": ["11.2", "12.1"] },
    { "id": 6, "tasks": ["11.3", "12.2", "13.1"] },
    { "id": 7, "tasks": ["13.2", "13.3", "14.1", "15.1"] },
    { "id": 8, "tasks": ["14.2", "14.3", "15.2", "15.3", "16.1"] },
    { "id": 9, "tasks": ["16.2", "18.1", "21.1", "22.1"] },
    { "id": 10, "tasks": ["18.2", "19.1", "21.2", "22.2"] },
    { "id": 11, "tasks": ["19.2", "19.3", "20.1"] },
    { "id": 12, "tasks": ["20.2", "23.1"] },
    { "id": 13, "tasks": ["23.2"] }
  ]
}
```
