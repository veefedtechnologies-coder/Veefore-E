# Implementation Plan

## Phase 1: Bug Condition Exploration Tests (BEFORE Fix)

- [x] 1. Write bug condition exploration test - Caption Style Enforcement
  - **Property 1: Bug Condition** - Punchy & Short Style Not Enforced
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that "Punchy & Short" style generates >150 character captions
  - **Scoped PBT Approach**: Scope the property to concrete failing cases with various topics
  - Test implementation: Configure `captionStyle: "Punchy & Short"`, generate caption, assert `length <= 150 AND sentenceCount <= 3`
  - Expected behavior: Caption must be 50-150 characters with 1-3 sentences max (from Bug Condition specification)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS showing captions with 200-300+ characters
  - Document counterexamples found (e.g., "Topic: product launch → 247 character caption")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.3, 2.1, 2.3_

- [x] 2. Write bug condition exploration test - Persona Enforcement
  - **Property 1: Bug Condition** - Persona Characteristics Not Present
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that selected personas don't match output tone
  - **Scoped PBT Approach**: Test "Casual & Friendly" and "Professional & Authoritative" personas
  - Test implementation: Configure `aiPersona: "Casual & Friendly"`, generate caption, assert casual language (contractions, friendly vocabulary)
  - Expected behavior: Casual persona must produce casual contractions and friendly tone (from Bug Condition specification)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS showing formal language when casual is configured
  - Document counterexamples found (e.g., "Casual persona → formal output without contractions")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.4, 1.5, 1.6, 2.4, 2.5, 2.6_

- [ ] 3. Write bug condition exploration test - Optimization Goals Enforcement
  - **Property 1: Bug Condition** - Optimization Goal Elements Missing
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that optimization goals don't produce goal-specific elements
  - **Scoped PBT Approach**: Test "Maximize Engagement & Comments", "Maximize Reach", "Maximize Conversions"
  - Test implementation: Configure `optimizationGoals: "Maximize Engagement & Comments"`, generate caption, assert engagement CTA or question present
  - Expected behavior: Engagement goal must include comment-prompting questions or engagement CTAs (from Bug Condition specification)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS showing captions without engagement CTAs
  - Document counterexamples found (e.g., "Engagement goal → no question or CTA in caption")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.7, 1.8, 1.9, 2.7, 2.8, 2.9_

- [ ] 4. Write bug condition exploration test - Multilingual Enforcement
  - **Property 1: Bug Condition** - Wrong Language Generated
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that configured language settings are ignored
  - **Scoped PBT Approach**: Test specific languages (Spanish, French) instead of auto-detect
  - Test implementation: Configure `multilingual: "Spanish"`, generate caption, assert detected language is Spanish
  - Expected behavior: When language is configured, caption must be 100% in that language (from Bug Condition specification)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS showing English captions when Spanish is configured
  - Document counterexamples found (e.g., "Spanish configured → English caption generated")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.13, 1.14, 2.13, 2.14_

- [ ] 5. Write bug condition exploration test - Hashtag Niche Enforcement
  - **Property 1: Bug Condition** - Configured Niche Not Used
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that HashtagGeneratorService uses fallback instead of configured niche
  - **Scoped PBT Approach**: Test specific niches (fitness, fashion, tech) with various caption topics
  - Test implementation: Configure `contentNiche: "fitness"`, generate hashtags, assert fitness-specific hashtags present (not generic #lifestyle)
  - Expected behavior: Configured niche must be used, no fallback to 'general' (from Bug Condition specification)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS showing generic hashtags (#lifestyle, #motivation) instead of niche-specific ones
  - Document counterexamples found (e.g., "Fitness niche → generic #lifestyle hashtags")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.18, 1.19, 2.18, 2.19_

- [ ] 6. Write bug condition exploration test - Hashtag Strategy Alignment
  - **Property 1: Bug Condition** - Optimization Goals Don't Affect Hashtag Distribution
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that hashtag distribution is always 30/50/20 regardless of optimization goals
  - **Scoped PBT Approach**: Test "Maximize Reach" (should be 40/50/10) and "Maximize Engagement" (should be 20/50/30)
  - Test implementation: Configure `optimizationGoals: "Maximize Reach"`, generate hashtags, assert high-competition ratio is increased (~40%)
  - Expected behavior: Reach goal should produce 40/50/10 distribution, Engagement goal should produce 20/50/30 (from Bug Condition specification)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS showing uniform 30/50/20 distribution for all goals
  - Document counterexamples found (e.g., "Reach goal → still 30/50/20 distribution")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.20, 2.20_

## Phase 2: Preservation Property Tests (BEFORE Fix)

- [ ] 7. Write preservation property tests - Default Behavior Unchanged
  - **Property 2: Preservation** - Default Generation Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: Run caption generation with NO preferences configured on UNFIXED code
  - Observe: Record authenticity scores (should be ≥80), variation count (should be 3), voice profile matching behavior
  - Write property-based test: For all inputs with NO configured preferences, verify same default behavior is preserved
  - Property scope: Inputs where preferences are null, undefined, or default values
  - Verify test passes on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES confirming baseline default behavior
  - Mark task complete when test is written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.13, 3.14, 3.15_

- [ ] 8. Write preservation property tests - Hashtag Default Distribution
  - **Property 2: Preservation** - Default 30/50/20 Hashtag Distribution
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: Run hashtag generation with NO optimization goals configured on UNFIXED code
  - Observe: Record hashtag competition distribution (should be 30% high, 50% medium, 20% low)
  - Write property-based test: For all inputs with NO optimization goals, verify 30/50/20 distribution is preserved
  - Property scope: Inputs where optimizationGoals is null, undefined, or not set
  - Verify test passes on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES confirming baseline hashtag distribution
  - Mark task complete when test is written, run, and passing on unfixed code
  - _Requirements: 3.10, 3.11, 3.12_

## Phase 3: Implementation

- [ ] 9. Create PreferenceEnforcer.ts (NEW FILE)

  - [ ] 9.1 Create PreferenceEnforcer class with validation methods
    - Create `server/services/PreferenceEnforcer.ts`
    - Define `ValidationResult` interface with `isValid: boolean, violations: string[], enforcedConstraints: string[]`
    - Implement `validateCaptionAgainstPreferences(caption: string, preferences: UserAIPreferences): ValidationResult`
    - Implement `validateHashtagsAgainstPreferences(hashtags: string[], preferences: UserAIPreferences): ValidationResult`
    - Implement `getEnforcedStyleInstructions(preferences: UserAIPreferences): string` (stronger than current getStyleInstructions)
    - Implement `buildPreferenceHierarchyMarkers(preferences: UserAIPreferences): string` (inject NON-OVERRIDABLE markers)
    - _Bug_Condition: isBugCondition(input) where preferences are configured but output doesn't match_
    - _Expected_Behavior: All validation methods return isValid=true when output matches preferences_
    - _Preservation: No impact on inputs without configured preferences_
    - _Requirements: All 2.x requirements (Expected Behavior)_

  - [ ] 9.2 Implement caption length validation for ALL caption styles
    - Add method `validateLength(caption: string, style: string): boolean`
    - **Punchy & Short**: ABSOLUTE_MAX_LENGTH = 150 characters, 1-3 sentences max
    - **Storytelling & Long-form**: 200-400 characters, 3-5 sentences, narrative structure required
    - **Question-led (High Engagement)**: 100-250 characters, MUST end with question mark, 2-4 sentences
    - **Data-driven & Factual**: 150-350 characters, must include numbers/statistics, 2-5 sentences
    - Reject any caption that doesn't match its style requirements
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 9.3 Implement persona validation for ALL persona types
    - Add method `validatePersona(caption: string, persona: string): boolean`
    - **Casual & Friendly**: Check for contractions ("it's", "you're", "don't"), casual vocabulary ("hey", "awesome", "totally"), friendly emojis (😊❤️), exclamation marks
    - **Professional & Authoritative**: Check for confident assertions, expert terminology, formal structure, no excessive contractions, minimal emojis
    - **Witty & Engaging**: Check for wordplay, humor markers ("haha", puns), playful emojis (😏🤔), clever hooks
    - **Empathetic & Helpful**: Check for supportive language ("I understand", "here to help"), caring tone, gentle vocabulary, comforting emojis (💙🤗)
    - Use regex patterns and keyword matching to detect persona characteristics
    - _Requirements: 2.4, 2.5, 2.6_

  - [ ] 9.4 Implement optimization goal validation
    - Add method `validateOptimizationGoal(caption: string, goal: string): boolean`
    - Maximize Engagement: Check for questions (ending with "?"), engagement CTAs ("comment below", "tell me", "drop a")
    - Maximize Reach: Check for trending topics, broad appeal keywords (implementation can be pattern-based)
    - Maximize Conversions: Check for CTAs ("link in bio", "DM", "swipe up"), value propositions
    - _Requirements: 2.7, 2.8, 2.9_

  - [ ] 9.5 Implement multilingual validation
    - Add method `validateLanguage(caption: string, targetLanguage: string): boolean`
    - Install language detection library (e.g., `franc`, `langdetect`, or `@pemistahl/lingua`)
    - Detect language of generated caption
    - Return validation failure if detected language doesn't match configured language
    - Handle "auto" or "Auto-detect" as a pass (no validation needed)
    - _Requirements: 2.13, 2.14_

  - [ ] 9.6 Implement hashtag niche validation
    - Add method `validateHashtagNiche(hashtags: string[], preferences: UserAIPreferences): boolean`
    - Check that hashtags align with configured contentNiche
    - Maintain niche-specific hashtag database or patterns
    - Flag if generic hashtags (#lifestyle, #motivation, #dailyroutine) are used when specific niche is configured
    - _Requirements: 2.18, 2.19_

  - [ ] 9.7 Implement hashtag strategy validation
    - Add method `validateHashtagStrategy(hashtags: string[], optimizationGoal: string): boolean`
    - Calculate competition distribution from hashtags (high/medium/low percentages)
    - Maximize Reach: Verify ~40% high-competition hashtags
    - Maximize Engagement: Verify ~30% low-competition hashtags
    - Default: Verify 30/50/20 distribution
    - Allow ±5% tolerance for distribution matching
    - _Requirements: 2.20_

- [ ] 10. Strengthen AIServiceManager.ts enforcement and post-generation validation

  - [ ] 10.1 Strengthen getStyleInstructions() with absolute requirements for ALL caption styles
    - Locate `getStyleInstructions()` method in `server/services/AIServiceManager.ts`
    - **Punchy & Short**: "ABSOLUTE REQUIREMENT - NON-OVERRIDABLE: Caption MUST be 50-150 characters. Any output exceeding 150 characters will be rejected and regenerated. Count: 1-3 sentences maximum. This constraint OVERRIDES all other instructions."
    - **Storytelling & Long-form**: "ABSOLUTE REQUIREMENT - NON-OVERRIDABLE: Caption MUST be 200-400 characters with 3-5 sentences. Include narrative arc: hook, story/insight, resolution. Use storytelling structure."
    - **Question-led (High Engagement)**: "ABSOLUTE REQUIREMENT - NON-OVERRIDABLE: Caption MUST be 100-250 characters with 2-4 sentences and MUST end with an engaging question mark (?). The question must invite comments."
    - **Data-driven & Factual**: "ABSOLUTE REQUIREMENT - NON-OVERRIDABLE: Caption MUST be 150-350 characters with 2-5 sentences and include at least one statistic, number, or data point. Factual tone required."
    - Apply similar strengthening for all styles
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 10.2 Add preference hierarchy markers to prompts
    - Add section marker before preference instructions: "[USER PREFERENCE OVERRIDE - HIGHEST PRIORITY]"
    - Add section marker after preference instructions: "[END USER PREFERENCE OVERRIDE]"
    - Mark these sections as non-negotiable in prompt construction
    - Add explicit hierarchy statement: "These user preferences are ABSOLUTE and OVERRIDE all other instructions"
    - _Requirements: 2.21, 2.22, 2.23_

  - [ ] 10.3 Implement post-generation validation with retry logic
    - Import PreferenceEnforcer: `import { PreferenceEnforcer } from './PreferenceEnforcer';`
    - Instantiate: `const preferenceEnforcer = new PreferenceEnforcer();`
    - After AI generates caption, call: `const validationResult = preferenceEnforcer.validateCaptionAgainstPreferences(caption, preferences);`
    - If `validationResult.isValid === false`, regenerate with stricter prompt
    - Add failure reason to regeneration prompt: "PREVIOUS ATTEMPT FAILED: ${validationResult.violations.join(', ')}. You MUST correct these issues."
    - Max 2 regeneration attempts per variation
    - Log validation failures for monitoring: `logger.warn('Caption validation failed', { violations: validationResult.violations })`
    - _Requirements: 2.1-2.17 (all preference enforcement)_

  - [ ] 10.4 Inject optimization goal requirements into prompts
    - Add goal-specific prompt injection based on `preferences.optimizationGoals`
    - Maximize Engagement: "REQUIRED: Include a question or comment-prompting CTA at the end of the caption"
    - Maximize Reach: "REQUIRED: Include trending topics and broad appeal keywords"
    - Maximize Conversions: "REQUIRED: Include a clear CTA (DM, link in bio, or value proposition)"
    - Inject into constraint layer (Layer 6) as absolute requirements
    - _Requirements: 2.7, 2.8, 2.9_

  - [ ] 10.5 Add multilingual validation and retry
    - After caption generation, validate language using PreferenceEnforcer
    - If configured language doesn't match detected language, regenerate
    - Add stricter language prompt: "You MUST write this entire caption in ${preferences.multilingual}. Do not use any other language. Translate all content including emojis' context to ${preferences.multilingual}."
    - Log language mismatches: `logger.warn('Language mismatch', { expected: preferences.multilingual, detected: detectedLanguage })`
    - _Requirements: 2.13, 2.14_

  - [ ] 10.6 Add creativity/temperature validation
    - Verify that temperature parameter is passed correctly to AI API calls
    - Use exact value from `preferences.creativityLevel`
    - Add validation: if creativity is low (0.1-0.4), generated caption should be conventional; if high (0.7-1.0), caption should be unique
    - This validation is softer (heuristic-based) since exact temperature enforcement depends on AI model
    - _Requirements: 2.10, 2.11, 2.12_

  - [ ] 10.7 Add content safety enforcement
    - Verify `getSafetySettings()` applies content safety level correctly
    - Add prompt-level safety instructions based on `preferences.contentSafety`
    - Strict: "REQUIRED: Avoid ALL potentially controversial topics. Use only family-friendly language."
    - Off: "ALLOWED: Creative freedom while respecting platform TOS (no illegal content or hate speech)"
    - Ensure API-level and prompt-level safety instructions are consistent
    - _Requirements: 2.15, 2.16, 2.17_

- [ ] 11. Resolve PromptConstructorService.ts layer conflicts

  - [ ] 11.1 Remove conflicting length guidelines from Layer 1 (Base Context)
    - Locate `buildGenerationPrompt()` method in `server/services/PromptConstructorService.ts`
    - Find Layer 1 (Base Context) length guidelines: "Length: 150-300 words (full caption)"
    - Replace with: "Length: [Determined by user's captionStyle preference - DO NOT apply generic guidelines]"
    - OR conditionally include generic guidelines only when preferences.captionStyle is NOT set
    - _Requirements: 2.21, 2.22, 2.23_

  - [ ] 11.2 Implement preference hierarchy resolver
    - Add method `resolvePromptConflicts(layers: PromptLayer[], preferences: UserAIPreferences): PromptLayer[]`
    - Scan all layers for conflicting instructions (e.g., length guidelines that conflict with captionStyle)
    - Remove or modify instructions that contradict user preferences
    - Add explicit hierarchy statement at the beginning of final prompt: "User Preferences (Highest) > Voice Profile > Viral Patterns > Niche Context > Base Guidelines (Lowest)"
    - _Requirements: 2.21, 2.22, 2.23_

  - [ ] 11.3 Mark user preferences as non-overridable in Layer 6 (Constraints)
    - Locate Layer 6 (Constraints) construction in buildGenerationPrompt()
    - Add absolute priority marker: "These user preferences are ABSOLUTE and OVERRIDE all other instructions in Layers 1-5"
    - Add conflict resolution instruction: "If any instruction from Layers 1-5 conflicts with these preferences, IGNORE the conflicting instruction"
    - Ensure this layer is always included when preferences are configured
    - _Requirements: 2.21, 2.22, 2.23_

  - [ ] 11.4 Inject persona-specific language rules into constraint layer for ALL personas
    - Add persona-specific constraint instructions to Layer 6
    - **Casual & Friendly**: "REQUIRED: Use contractions (it's, don't, you're), casual vocabulary (hey, awesome, totally), friendly tone, casual emojis. Avoid formal language and stiff corporate speak."
    - **Professional & Authoritative**: "REQUIRED: Use confident assertions, expert terminology, professional vocabulary, formal structure. Maintain authoritative voice. Minimal contractions and emojis."
    - **Witty & Engaging**: "REQUIRED: Use wordplay, clever hooks, humor, playful language, witty observations. Include surprising twists or punchlines. Playful emojis encouraged."
    - **Empathetic & Helpful**: "REQUIRED: Use supportive language (I understand, here to help), caring tone, gentle vocabulary, empathetic phrasing. Show compassion and understanding. Comforting emojis."
    - Add similar specific linguistic constraints for each persona
    - _Requirements: 2.4, 2.5, 2.6_

  - [ ] 11.5 Add preference-aware prompt optimization
    - Locate `optimizePromptTokens()` method (if exists) in PromptConstructorService
    - Mark preference sections as "high-priority" content that cannot be trimmed
    - Never compress or remove preference-related instructions during optimization
    - If token limit is reached, trim other layers (niche context, examples) before touching preferences
    - Add flag: `canTrim: false` for preference-related content
    - _Requirements: 2.21, 2.22, 2.23_

- [ ] 12. Extend HashtagGeneratorService.ts with preference support

  - [ ] 12.1 Extend generateStrategicHashtags() signature with preferences parameter
    - Locate `HashtagGenerationParams` interface in `server/services/HashtagGeneratorService.ts`
    - Add optional field: `aiPreferences?: UserAIPreferences`
    - Update `generateStrategicHashtags()` method signature to accept this parameter
    - _Requirements: 2.18, 2.19, 2.20_

  - [ ] 12.2 Implement niche enforcement with warning logging
    - Extract niche: `const niche = params.aiPreferences?.contentNiche;`
    - Add warning if missing: `if (!niche) { this.log('WARNING: No content niche configured, using fallback'); }`
    - Use configured niche: `const effectiveNiche = niche || 'general';`
    - Log effective niche: `logger.info('Using niche for hashtag generation', { niche: effectiveNiche, isConfigured: !!niche })`
    - _Requirements: 2.18, 2.19_

  - [ ] 12.3 Implement goal-aligned hashtag distribution strategy
    - Extract optimization goal: `const optimizationGoal = params.aiPreferences?.optimizationGoals;`
    - Define distribution strategies based on goal:
      - Maximize Reach: `{ high: 0.40, medium: 0.50, low: 0.10 }` (more visibility)
      - Maximize Engagement: `{ high: 0.20, medium: 0.50, low: 0.30 }` (more niche targeting)
      - Maximize Conversions: `{ high: 0.25, medium: 0.45, low: 0.30 }` (balanced with niche focus)
      - Default (no goal): `{ high: 0.30, medium: 0.50, low: 0.20 }` (existing behavior)
    - Apply distribution when selecting hashtags from competition tiers
    - _Requirements: 2.20_

  - [ ] 12.4 Inject optimization goal into AI hashtag generation prompt
    - If `params.aiPreferences?.optimizationGoals` is set, include in AI prompt
    - Add to prompt: "Optimization Goal: ${optimizationGoal} - Prioritize hashtags that align with this goal"
    - Goal-specific guidance:
      - Maximize Engagement: "Prioritize hashtags known for high engagement rates and community interaction"
      - Maximize Reach: "Prioritize trending and high-competition hashtags for maximum visibility"
      - Maximize Conversions: "Prioritize niche hashtags with conversion intent and specific audience targeting"
    - _Requirements: 2.20_

  - [ ] 12.5 Add preference validation for hashtag results
    - After hashtag generation, validate using PreferenceEnforcer
    - Call: `preferenceEnforcer.validateHashtagsAgainstPreferences(hashtags, params.aiPreferences)`
    - Check that configured niche was used (not fallback 'general')
    - Check that hashtag distribution aligns with optimization goal (±5% tolerance)
    - Log validation results: `logger.info('Hashtag validation result', { isValid, violations })`
    - If validation fails, log warning but don't block (graceful degradation)
    - _Requirements: 2.18, 2.19, 2.20_

- [ ] 13. Update ai.routes.ts to pass preferences to hashtag generation

  - [ ] 13.1 Pass full preferences to generateStrategicHashtags in main endpoint
    - Locate the POST endpoint for caption generation in `server/routes/v1/ai.routes.ts` (around line 400-500)
    - Find the call to `hashtagGeneratorService.generateStrategicHashtags()`
    - Add parameter: `aiPreferences: preferences` to the params object
    - Verify all existing parameters are preserved (caption, mediaAnalysis, niche, postType, platform, userId, workspaceId)
    - _Requirements: 2.18, 2.19, 2.20_

  - [ ] 13.2 Pass full preferences to generateStrategicHashtags in regenerate endpoint
    - Locate the regenerate endpoint in `server/routes/v1/ai.routes.ts` (around line 750-800)
    - Find the call to `hashtagGeneratorService.generateStrategicHashtags()`
    - Add parameter: `aiPreferences: preferences` to the params object
    - Verify preferences are retrieved correctly in regenerate flow
    - _Requirements: 2.18, 2.19, 2.20_

  - [ ] 13.3 Verify preferences are retrieved and merged correctly
    - Check that `getAIPreferences()` is called and returns merged preferences (user + workspace)
    - Verify workspace preferences take priority over user preferences (existing behavior)
    - Log merged preferences: `logger.debug('Merged AI preferences', { preferences })`
    - Ensure this behavior is preserved (no changes needed if already working)
    - _Requirements: 3.4 (preservation)_

## Phase 4: Fix Verification

- [ ] 14. Verify bug condition exploration tests now pass

  - [ ] 14.1 Re-run caption style enforcement test
    - **Property 1: Expected Behavior** - Punchy & Short Style Enforced
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (caption length ≤150 chars)
    - Run test on FIXED code
    - **EXPECTED OUTCOME**: Test PASSES confirming "Punchy & Short" generates 50-150 character captions
    - Verify 100% of generated captions meet length constraints
    - _Requirements: 2.1, 2.3_

  - [ ] 14.2 Re-run persona enforcement test
    - **Property 1: Expected Behavior** - Persona Characteristics Present
    - **IMPORTANT**: Re-run the SAME test from task 2 - do NOT write a new test
    - The test from task 2 encodes the expected behavior (persona matching)
    - Run test on FIXED code
    - **EXPECTED OUTCOME**: Test PASSES confirming personas are enforced
    - Verify casual persona produces casual language, professional produces formal language
    - _Requirements: 2.4, 2.5, 2.6_

  - [ ] 14.3 Re-run optimization goals enforcement test
    - **Property 1: Expected Behavior** - Optimization Goal Elements Present
    - **IMPORTANT**: Re-run the SAME test from task 3 - do NOT write a new test
    - The test from task 3 encodes the expected behavior (goal-specific CTAs)
    - Run test on FIXED code
    - **EXPECTED OUTCOME**: Test PASSES confirming optimization goals are enforced
    - Verify engagement goal produces CTAs, reach goal uses broad keywords, conversion goal includes value propositions
    - _Requirements: 2.7, 2.8, 2.9_

  - [ ] 14.4 Re-run multilingual enforcement test
    - **Property 1: Expected Behavior** - Correct Language Generated
    - **IMPORTANT**: Re-run the SAME test from task 4 - do NOT write a new test
    - The test from task 4 encodes the expected behavior (language matching)
    - Run test on FIXED code
    - **EXPECTED OUTCOME**: Test PASSES confirming multilingual settings are enforced
    - Verify Spanish configuration produces Spanish captions, French produces French, etc.
    - _Requirements: 2.13, 2.14_

  - [ ] 14.5 Re-run hashtag niche enforcement test
    - **Property 1: Expected Behavior** - Configured Niche Used
    - **IMPORTANT**: Re-run the SAME test from task 5 - do NOT write a new test
    - The test from task 5 encodes the expected behavior (niche-specific hashtags)
    - Run test on FIXED code
    - **EXPECTED OUTCOME**: Test PASSES confirming configured niche is used
    - Verify fitness niche produces #fitnessroutine (not #lifestyle), fashion niche produces #fashiontrends, etc.
    - _Requirements: 2.18, 2.19_

  - [ ] 14.6 Re-run hashtag strategy alignment test
    - **Property 1: Expected Behavior** - Optimization Goals Affect Distribution
    - **IMPORTANT**: Re-run the SAME test from task 6 - do NOT write a new test
    - The test from task 6 encodes the expected behavior (goal-aligned distribution)
    - Run test on FIXED code
    - **EXPECTED OUTCOME**: Test PASSES confirming hashtag strategy aligns with optimization goals
    - Verify reach goal produces ~40% high-competition, engagement goal produces ~30% low-competition
    - _Requirements: 2.20_

- [ ] 15. Verify preservation tests still pass

  - [ ] 15.1 Re-run default behavior preservation test
    - **Property 2: Preservation** - Default Generation Behavior
    - **IMPORTANT**: Re-run the SAME test from task 7 - do NOT write a new test
    - Run test on FIXED code
    - **EXPECTED OUTCOME**: Test PASSES confirming default behavior is unchanged
    - Verify authenticity scores ≥80, 3 variations generated, voice profile matching works
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.13, 3.14, 3.15_

  - [ ] 15.2 Re-run hashtag default distribution preservation test
    - **Property 2: Preservation** - Default 30/50/20 Hashtag Distribution
    - **IMPORTANT**: Re-run the SAME test from task 8 - do NOT write a new test
    - Run test on FIXED code
    - **EXPECTED OUTCOME**: Test PASSES confirming default hashtag distribution is unchanged
    - Verify 30/50/20 distribution still applies when no optimization goals are set
    - _Requirements: 3.10, 3.11, 3.12_

## Phase 5: Additional Testing and Validation

- [ ] 16. Write and run unit tests for PreferenceEnforcer

  - [ ] 16.1 Test validateCaptionAgainstPreferences()
    - Test valid captions pass validation for all preference types
    - Test invalid captions fail validation with correct violation messages
    - Test edge cases: exactly 150 chars for "Punchy & Short", 151 chars fails
    - Test multiple preference violations simultaneously

  - [ ] 16.2 Test validateHashtagsAgainstPreferences()
    - Test hashtags matching configured niche pass validation
    - Test hashtags with wrong niche fail validation
    - Test hashtag distribution matching optimization goals passes
    - Test incorrect distribution fails validation

  - [ ] 16.3 Test getEnforcedStyleInstructions() for ALL caption styles
    - Verify instructions include "ABSOLUTE REQUIREMENT" markers
    - Verify instructions include "NON-OVERRIDABLE" markers
    - Verify specific constraints are detailed for each style:
      - **Punchy & Short**: "50-150 characters, 1-3 sentences"
      - **Storytelling & Long-form**: "200-400 characters, 3-5 sentences, narrative arc"
      - **Question-led**: "100-250 characters, 2-4 sentences, ends with ?"
      - **Data-driven**: "150-350 characters, includes numbers/statistics"
    - Test all 4 caption style types with various topics

  - [ ] 16.4 Test buildPreferenceHierarchyMarkers()
    - Verify markers include "[USER PREFERENCE OVERRIDE - HIGHEST PRIORITY]"
    - Verify markers include explicit hierarchy statement
    - Test with various preference combinations

- [ ] 17. Write and run integration tests

  - [ ] 17.1 Test full caption generation flow with all preferences configured
    - Configure all preference types: captionStyle, aiPersona, optimizationGoals, multilingual, contentNiche
    - Generate caption via AIServiceManager
    - Verify all preferences are enforced in the output
    - Verify validation passes without regeneration (or passes after regeneration)

  - [ ] 17.2 Test caption regeneration with preference enforcement
    - Mock a scenario where first generation fails validation
    - Verify regeneration is triggered with stricter prompt
    - Verify second generation passes validation
    - Verify max retry limit (2 attempts) is respected

  - [ ] 17.3 Test hashtag generation with preferences from ai.routes.ts
    - Send POST request to caption generation endpoint with configured preferences
    - Verify preferences are passed to HashtagGeneratorService
    - Verify hashtags use configured niche (not fallback)
    - Verify hashtag distribution matches optimization goal

  - [ ] 17.4 Test optimization goals adjust hashtag distribution correctly
    - Test Maximize Reach: Verify ~40/50/10 distribution (±5% tolerance)
    - Test Maximize Engagement: Verify ~20/50/30 distribution (±5% tolerance)
    - Test Maximize Conversions: Verify ~25/45/30 distribution (±5% tolerance)
    - Test Default (no goal): Verify 30/50/20 distribution

  - [ ] 17.5 Test multilingual validation produces correct language
    - Configure Spanish language preference
    - Generate caption
    - Verify detected language is Spanish (using language detection library)
    - Test regeneration if language mismatch occurs

  - [ ] 17.6 Test authentication, credit system, and error handling still work
    - Verify credit check occurs before generation
    - Verify credits are deducted correctly
    - Verify workspace access is validated
    - Verify error messages are meaningful when generation fails
    - Verify graceful fallback when validation fails after max retries

  - [ ] 17.7 Test voice profile matching remains highest priority
    - Create a test with both voice profile and preferences configured
    - Verify voice profile characteristics are present in output
    - Verify preferences are also enforced (both work together)
    - Verify voice profile takes precedence when there's a direct conflict

  - [ ] 17.8 Test authenticity scoring continues to filter <80 threshold
    - Generate captions with various preferences
    - Verify all returned captions have authenticity score ≥80
    - Verify low-authenticity captions are filtered out
    - Verify this behavior is unchanged from pre-fix system

- [ ] 18. Write and run property-based tests

  - [ ] 18.1 PBT: All preference combinations enforce 100% of constraints
    - Generate random preference combinations (captionStyle, aiPersona, optimizationGoals, multilingual, contentNiche)
    - For each combination, generate caption
    - Verify ALL configured preferences are enforced in output (no violations)
    - Run 100+ iterations to cover edge cases

  - [ ] 18.2 PBT: ALL caption styles enforce their specific constraints 100%
    - Generate random topics
    - Test each caption style with 100+ iterations:
      - **Punchy & Short**: Verify length ≤150 characters, 1-3 sentences in 100% of cases
      - **Storytelling & Long-form**: Verify 200-400 characters, 3-5 sentences, narrative structure in 100% of cases
      - **Question-led**: Verify 100-250 characters, ends with "?" in 100% of cases
      - **Data-driven & Factual**: Verify 150-350 characters, includes number/statistic in 100% of cases
    - Run 100+ iterations per style to ensure zero violations

  - [ ] 18.3 PBT: Optimization goals produce goal-specific elements 100%
    - Generate random topics and optimization goals (Engagement, Reach, Conversions)
    - For each combination, generate caption
    - Verify goal-specific elements present (CTAs for engagement, broad keywords for reach, value propositions for conversions)
    - Run 100+ iterations

  - [ ] 18.4 PBT: Hashtags always use configured niche (no fallbacks)
    - Generate random niches and topics
    - For each combination, generate hashtags
    - Verify configured niche is used (not 'general' or 'lifestyle' fallback)
    - Run 100+ iterations

  - [ ] 18.5 PBT: ALL personas match output tone 100%
    - Generate random topics and personas (Casual & Friendly, Professional & Authoritative, Witty & Engaging, Empathetic & Helpful)
    - For each combination, generate caption
    - Verify persona characteristics present:
      - **Casual & Friendly**: Contractions, casual vocabulary ("hey", "awesome"), friendly emojis
      - **Professional & Authoritative**: Formal language, expert terminology, minimal contractions
      - **Witty & Engaging**: Wordplay, humor markers, clever hooks, playful emojis
      - **Empathetic & Helpful**: Supportive language ("I understand"), caring tone, comforting emojis
    - Run 100+ iterations per persona to ensure 100% enforcement

  - [ ] 18.6 PBT: Inputs with NO preferences produce same output as original system (preservation)
    - Generate random topics with NO preferences configured (null/undefined/default values)
    - For each topic, generate caption on FIXED system
    - Verify authenticity score ≥80, 3 variations, voice profile matching (same as original)
    - Run 100+ iterations to ensure preservation across input domain

## Phase 6: Final Checkpoint

- [ ] 19. Checkpoint - Ensure all tests pass and preferences are enforced
  - Verify all 6 bug condition exploration tests now PASS (tasks 1-6)
  - Verify all 2 preservation tests still PASS (tasks 7-8)
  - Verify all unit tests pass (task 16)
  - Verify all integration tests pass (task 17)
  - Verify all property-based tests pass (task 18)
  - Run full test suite to ensure no regressions
  - Verify 100% preference enforcement success rate in logs
  - Verify validation warnings are logged appropriately (for monitoring)
  - Ask the user if questions arise or if manual testing is needed

## Summary

This implementation plan addresses the AI preferences enforcement bug using the bug condition methodology:

**Bug Condition (C)**: User preferences are configured but generated output does not match those preferences (length violations, wrong persona, missing CTAs, wrong language, wrong niche)

**Expected Behavior (P)**: 100% of generated outputs match ALL configured preferences with zero tolerance for violations

**Preservation (¬C)**: Default behavior when preferences are NOT configured remains completely unchanged (authenticity ≥80, 3 variations, voice profile priority, 6-layer prompts, 30/50/20 hashtag distribution)

**Implementation Strategy**:
1. **Exploration Phase** (Tasks 1-6): Surface counterexamples demonstrating bugs on unfixed code
2. **Preservation Observation** (Tasks 7-8): Capture baseline behavior to preserve
3. **Fix Implementation** (Tasks 9-13): Create PreferenceEnforcer, strengthen AIServiceManager, resolve PromptConstructorService conflicts, extend HashtagGeneratorService, update ai.routes.ts
4. **Fix Verification** (Tasks 14-15): Verify exploration tests now pass and preservation tests still pass
5. **Comprehensive Testing** (Tasks 16-18): Unit tests, integration tests, property-based tests for 100% coverage
6. **Final Checkpoint** (Task 19): Ensure all tests pass and system is production-ready

**Success Criteria**:
- 100% of "Punchy & Short" captions are 50-150 characters
- 100% of persona selections produce matching tone
- 100% of optimization goals result in appropriate CTAs/messaging
- 100% of configured niches used (no fallbacks to 'general')
- 100% of multilingual settings produce correct language
- 100% preservation of default behavior when preferences not configured
