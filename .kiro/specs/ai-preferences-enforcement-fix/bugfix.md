# Bugfix Requirements Document

## Introduction

This bugfix addresses a critical issue where user-configured AI preferences in workspace settings are not being strongly enforced during caption and hashtag generation. Users configure specific preferences such as "Punchy & Short" caption style, "Casual & Friendly" persona, and "Maximize Engagement & Comments" optimization goals, but the generated output does not consistently match these selections. While preferences are successfully retrieved from the database and passed to the AI services, they are not being aggressively enforced in the prompt construction and generation logic, resulting in outputs that contradict user expectations.

**Impact**: Users receive long captions when they requested short ones, generic tones when they specified personas, and inconsistent hashtag strategies that don't align with their optimization goals. This undermines user trust and reduces the effectiveness of the AI generation system.

**Affected Services**:
- `AIServiceManager.ts` - Caption generation with preference enforcement
- `PromptConstructorService.ts` - Base prompt construction with potentially conflicting instructions
- `HashtagGeneratorService.ts` - Hashtag generation preference enforcement
- `ai.routes.ts` - Preference retrieval and passing (currently working, but verification needed)

---

## Bug Analysis

### Current Behavior (Defect)

**Caption Style Enforcement:**

1.1 WHEN a user selects "Punchy & Short" caption style THEN the system generates captions that are 200-300+ characters long instead of the required 50-150 characters

1.2 WHEN a user selects "Storytelling" caption style THEN the system may generate short captions that lack narrative structure and detail

1.3 WHEN caption style preferences are set THEN the `getStyleInstructions()` method adds weak guidance that is easily overridden by base prompt instructions

**Persona and Voice Enforcement:**

1.4 WHEN a user selects "Casual & Friendly" persona THEN the system may generate captions using professional or formal language instead of casual tone

1.5 WHEN a user selects "Professional & Authoritative" persona THEN the system may generate captions that are too casual or lack authority

1.6 WHEN AI persona preferences are configured THEN the base prompt's "corporate jargon avoidance" may conflict with professional persona requirements

**Optimization Goals Enforcement:**

1.7 WHEN a user selects "Maximize Engagement & Comments" optimization goal THEN the system generates captions without engagement-driving CTAs or comment-prompting questions

1.8 WHEN a user selects "Maximize Reach" optimization goal THEN the system does not prioritize trending topics or broad appeal language

1.9 WHEN a user selects "Maximize Conversions" optimization goal THEN the system generates captions without clear CTAs or value propositions

**Creativity and Temperature Enforcement:**

1.10 WHEN a user sets creativity level to 0.3 (low) THEN the system may still produce highly creative and unpredictable outputs

1.11 WHEN a user sets creativity level to 0.9 (high) THEN the system may produce conservative and predictable outputs

1.12 WHEN creativity level is configured THEN it is passed as `temperature` parameter but AI models may not respect the exact value

**Multilingual Settings Enforcement:**

1.13 WHEN a user sets multilingual output to a specific language (e.g., "Spanish") THEN the system generates captions in English

1.14 WHEN a user sets multilingual output to "Auto-detect (Match User)" THEN the system does not analyze the input topic language

**Content Safety Enforcement:**

1.15 WHEN a user sets content safety to "Strict" THEN the system may generate captions with edgy humor or controversial topics

1.16 WHEN a user sets content safety to "Off" THEN the system still applies standard safety filters

1.17 WHEN content safety level is configured THEN `getSafetySettings()` applies it correctly to API calls, but prompt-level safety instructions may be inconsistent

**Hashtag Generation Preference Enforcement:**

1.18 WHEN a user has configured content niche and optimization goals THEN `HashtagGeneratorService` does not receive or respect these preferences

1.19 WHEN hashtag generation occurs THEN it uses a generic niche fallback ('general' or 'lifestyle') instead of the user's configured content niche

1.20 WHEN hashtag strategy should align with optimization goals THEN the 30/50/20 distribution is applied uniformly without considering whether user wants reach vs. engagement vs. conversion

**Prompt Construction Conflicts:**

1.21 WHEN `PromptConstructorService.buildGenerationPrompt()` is called THEN it includes general length guidelines (150-300 words for posts) that conflict with specific style preferences

1.22 WHEN `getStyleInstructions()` adds CRITICAL length constraints THEN they are not strong enough to override base prompt instructions

1.23 WHEN multiple preference layers are combined THEN there are redundant or contradictory instructions in the final prompt

### Expected Behavior (Correct)

**Caption Style Enforcement:**

2.1 WHEN a user selects "Punchy & Short" caption style THEN the system SHALL generate ALL captions between 50-150 characters (1-3 sentences max) with zero tolerance for exceeding this limit

2.2 WHEN a user selects "Storytelling" caption style THEN the system SHALL generate captions with 3-5 sentences that include narrative elements and story progression

2.3 WHEN caption style preferences are set THEN the system SHALL enforce these constraints as ABSOLUTE REQUIREMENTS with highest priority in prompt construction

**Persona and Voice Enforcement:**

2.4 WHEN a user selects "Casual & Friendly" persona THEN the system SHALL generate captions using casual contractions, friendly language, and conversational tone in 100% of outputs

2.5 WHEN a user selects "Professional & Authoritative" persona THEN the system SHALL generate captions with confident assertions, expert terminology, and authoritative voice

2.6 WHEN AI persona preferences are configured THEN the system SHALL adapt "AI vocabulary avoidance" rules to allow persona-appropriate language (e.g., professional personas can use formal language)

**Optimization Goals Enforcement:**

2.7 WHEN a user selects "Maximize Engagement & Comments" optimization goal THEN the system SHALL include engagement-driving questions or CTAs in 100% of generated captions

2.8 WHEN a user selects "Maximize Reach" optimization goal THEN the system SHALL prioritize trending topics, broad appeal language, and high-competition hashtags

2.9 WHEN a user selects "Maximize Conversions" optimization goal THEN the system SHALL include clear CTAs and value propositions in all generated captions

**Creativity and Temperature Enforcement:**

2.10 WHEN a user sets creativity level THEN the system SHALL pass the exact value as temperature to AI API calls and validate that model responses match the expected creativity range

2.11 WHEN creativity level is low (0.1-0.4) THEN the system SHALL generate predictable, safe captions with conventional structures

2.12 WHEN creativity level is high (0.7-1.0) THEN the system SHALL generate unique, experimental captions with unconventional hooks and patterns

**Multilingual Settings Enforcement:**

2.13 WHEN a user sets multilingual output to a specific language THEN the system SHALL generate 100% of captions in that language with a validation check

2.14 WHEN a user sets multilingual output to "Auto-detect (Match User)" THEN the system SHALL analyze the input topic language and generate captions in the same language

**Content Safety Enforcement:**

2.15 WHEN a user sets content safety to "Strict" THEN the system SHALL avoid ALL potentially controversial topics and use only family-friendly language

2.16 WHEN a user sets content safety to "Off" THEN the system SHALL allow creative freedom while respecting platform TOS (no illegal content or hate speech)

2.17 WHEN content safety level is configured THEN the system SHALL apply consistent safety instructions at both API-level and prompt-level

**Hashtag Generation Preference Enforcement:**

2.18 WHEN a user has configured content niche and optimization goals THEN `HashtagGeneratorService.generateStrategicHashtags()` SHALL receive and respect these preferences in hashtag selection

2.19 WHEN hashtag generation occurs THEN the system SHALL use the user's configured content niche (not a fallback) and log a warning if niche is missing

2.20 WHEN hashtag strategy should align with optimization goals THEN the system SHALL adjust hashtag competition distribution (e.g., more high-competition for reach, more low-competition for engagement)

**Prompt Construction Conflicts Resolution:**

2.21 WHEN `PromptConstructorService.buildGenerationPrompt()` is called THEN it SHALL NOT include generic length guidelines that conflict with user's caption style preferences

2.22 WHEN `getStyleInstructions()` adds length constraints THEN they SHALL be marked as ABSOLUTE REQUIREMENTS that cannot be overridden by any other prompt layer

2.23 WHEN multiple preference layers are combined THEN the system SHALL remove redundant instructions and resolve contradictions with a clear preference hierarchy

### Unchanged Behavior (Regression Prevention)

**Core Functionality Preservation:**

3.1 WHEN preferences are not configured or use default values THEN the system SHALL CONTINUE TO generate high-quality captions using default behavior

3.2 WHEN voice profile matching is active THEN the system SHALL CONTINUE TO prioritize voice profile alignment while respecting explicit style preferences

3.3 WHEN authenticity scoring is applied THEN the system SHALL CONTINUE TO filter captions below 80 authenticity threshold

**Service Integration Preservation:**

3.4 WHEN `getAIPreferences()` retrieves preferences from user and workspace THEN the system SHALL CONTINUE TO merge them correctly with workspace preferences taking priority

3.5 WHEN `AIServiceManager.generateInstagramCaptions()` is called THEN the system SHALL CONTINUE TO generate 3 variations (viral, authentic, balanced) with authenticity and engagement scoring

3.6 WHEN safety filtering is applied THEN the system SHALL CONTINUE TO use `ContentSafetyService` to validate captions before scoring

**Prompt Architecture Preservation:**

3.7 WHEN the 6-layer prompt architecture is used THEN the system SHALL CONTINUE TO include all layers (Base Context, Voice Layer, Viral Patterns, Niche Context, Examples, Constraints)

3.8 WHEN viral patterns and hooks are incorporated THEN the system SHALL CONTINUE TO adapt them to user's voice (not copy verbatim)

3.9 WHEN niche context is loaded THEN the system SHALL CONTINUE TO provide industry-specific language and trending topics

**Hashtag Generation Preservation:**

3.10 WHEN strategic hashtags are generated THEN the system SHALL CONTINUE TO apply 30/50/20 competition distribution as the default strategy

3.11 WHEN hashtag relevance scoring occurs THEN the system SHALL CONTINUE TO use content theme matching, caption keyword matching, and niche relevance

3.12 WHEN branded hashtags are detected THEN the system SHALL CONTINUE TO include them in the final hashtag set

**Credit System and Error Handling Preservation:**

3.13 WHEN AI generation is requested THEN the system SHALL CONTINUE TO check and deduct credits appropriately

3.14 WHEN generation fails THEN the system SHALL CONTINUE TO provide meaningful error messages and fall back gracefully

3.15 WHEN workspace access is validated THEN the system SHALL CONTINUE TO enforce proper authorization checks

---

## Bug Condition Derivation

### Bug Condition Function

The bug condition identifies inputs where user preferences are set but the generated output does not match those preferences.

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type GenerationRequest {
    userPreferences: UserAIPreferences,
    generatedOutput: GeneratedCaption | GeneratedHashtags
  }
  OUTPUT: boolean
  
  // Returns true when preferences are configured but not enforced
  
  // Caption Style Bug Condition
  IF X.userPreferences.captionStyle = "Punchy & Short" AND 
     length(X.generatedOutput.caption) > 150 THEN
    RETURN true
  END IF
  
  // Persona Bug Condition
  IF X.userPreferences.aiPersona = "Casual & Friendly" AND
     NOT matchesCasualTone(X.generatedOutput.caption) THEN
    RETURN true
  END IF
  
  // Optimization Goal Bug Condition
  IF X.userPreferences.optimizationGoals = "Maximize Engagement & Comments" AND
     NOT hasEngagementCTA(X.generatedOutput.caption) THEN
    RETURN true
  END IF
  
  // Multilingual Bug Condition
  IF X.userPreferences.multilingual ≠ "auto" AND
     language(X.generatedOutput.caption) ≠ X.userPreferences.multilingual THEN
    RETURN true
  END IF
  
  // Hashtag Niche Bug Condition
  IF X.userPreferences.contentNiche IS SET AND
     NOT usedConfiguredNiche(X.generatedOutput.hashtags, X.userPreferences.contentNiche) THEN
    RETURN true
  END IF
  
  // Creativity Level Bug Condition
  IF X.userPreferences.creativityLevel IS SET AND
     NOT matchesCreativityLevel(X.generatedOutput, X.userPreferences.creativityLevel) THEN
    RETURN true
  END IF
  
  RETURN false
END FUNCTION
```

### Property Specification - Fix Checking

For all generation requests where preferences are configured, the fixed system must produce output that matches those preferences.

```pascal
// Property: Caption Style Fix Checking
FOR ALL X WHERE X.userPreferences.captionStyle = "Punchy & Short" DO
  result ← generateInstagramCaptions'(X)
  ASSERT length(result.caption) ≤ 150 AND
         sentenceCount(result.caption) ≤ 3 AND
         isPunchy(result.caption)
END FOR

// Property: Persona Fix Checking
FOR ALL X WHERE X.userPreferences.aiPersona IS SET DO
  result ← generateInstagramCaptions'(X)
  ASSERT matchesPersona(result.caption, X.userPreferences.aiPersona)
END FOR

// Property: Optimization Goal Fix Checking
FOR ALL X WHERE X.userPreferences.optimizationGoals = "Maximize Engagement & Comments" DO
  result ← generateInstagramCaptions'(X)
  ASSERT hasEngagementCTA(result.caption) OR
         hasCommentPrompt(result.caption)
END FOR

// Property: Multilingual Fix Checking
FOR ALL X WHERE X.userPreferences.multilingual ≠ "auto" DO
  result ← generateInstagramCaptions'(X)
  ASSERT language(result.caption) = X.userPreferences.multilingual
END FOR

// Property: Hashtag Niche Fix Checking
FOR ALL X WHERE X.userPreferences.contentNiche IS SET DO
  result ← generateStrategicHashtags'(X)
  ASSERT usedConfiguredNiche(result.hashtags, X.userPreferences.contentNiche) AND
         NOT usedFallbackNiche(result.hashtags)
END FOR

// Property: Creativity Level Fix Checking
FOR ALL X WHERE X.userPreferences.creativityLevel IS SET DO
  result ← generateText'(X)
  ASSERT usedTemperature(result, X.userPreferences.creativityLevel)
END FOR
```

### Preservation Goal

The fixed system must preserve existing behavior for all requests where preferences are not configured or where default values are used.

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  resultOriginal ← F(X)  // Original generation function
  resultFixed ← F'(X)     // Fixed generation function
  
  // Core functionality must remain unchanged
  ASSERT authenticityScore(resultFixed) ≥ authenticityScore(resultOriginal)
  ASSERT hasAllVariations(resultFixed) = hasAllVariations(resultOriginal)
  ASSERT usesVoiceProfile(resultFixed) = usesVoiceProfile(resultOriginal)
  ASSERT uses6LayerPrompt(resultFixed) = uses6LayerPrompt(resultOriginal)
  ASSERT applies30_50_20Distribution(resultFixed) = applies30_50_20Distribution(resultOriginal)
END FOR
```

### Counterexamples

**Example 1: Caption Style Not Enforced**
```
Input:
  preferences.captionStyle = "Punchy & Short"
  preferences.captionStyleExpectation = "50-150 characters, 1-3 sentences"
  topic = "New product launch"

Current Output (Bug):
  caption = "We're so excited to announce our newest product launch! This has been months in the making and we can't wait for you to experience all the amazing features we've packed into this incredible release. Swipe to see what's coming your way! 💫✨🚀"
  length = 247 characters
  VIOLATES expectation (should be ≤150)

Expected Output (Fixed):
  caption = "New drop alert! 🚀 You're going to love this. DM for early access!"
  length = 73 characters
  MEETS expectation (≤150, punchy, direct)
```

**Example 2: Optimization Goal Not Enforced**
```
Input:
  preferences.optimizationGoals = "Maximize Engagement & Comments"
  topic = "Fitness transformation"

Current Output (Bug):
  caption = "My 90-day transformation journey. Sweat, dedication, results. 💪"
  hasEngagementCTA = false
  hasCommentPrompt = false
  VIOLATES expectation (should drive comments)

Expected Output (Fixed):
  caption = "90 days of pure grind. Which photo shows the most change? Drop a number below! 👇💪"
  hasCommentPrompt = true
  MEETS expectation (asks for specific comment response)
```

**Example 3: Hashtag Niche Not Enforced**
```
Input:
  preferences.contentNiche = "fitness"
  caption = "Morning workout routine"

Current Output (Bug):
  hashtagGeneratorService.generateStrategicHashtags({
    niche: preferences.contentNiche || 'general'  // Falls back to 'general'
  })
  Used niche: 'general'
  hashtags = ['#lifestyle', '#motivation', '#dailyroutine']
  VIOLATES expectation (should use fitness niche)

Expected Output (Fixed):
  Used niche: 'fitness'
  hashtags = ['#fitnessroutine', '#morningworkout', '#fitnessmotivation']
  MEETS expectation (uses configured fitness niche)
```

---

## Root Cause Summary

**Primary Issue**: Weak preference enforcement in prompt construction
- `getStyleInstructions()` adds "CRITICAL" markers but they're not truly critical
- Base prompt from `PromptConstructorService` includes conflicting general guidelines
- No validation that generated output matches preference requirements

**Secondary Issue**: Incomplete preference propagation
- `HashtagGeneratorService` does not receive user preferences in `ai.routes.ts`
- Niche defaults to 'general' or 'lifestyle' instead of configured value
- Optimization goals are not passed to hashtag generation

**Tertiary Issue**: Lack of output validation
- No post-generation check that caption length matches style requirements
- No verification that persona characteristics are present in output
- No confirmation that multilingual settings were applied

**Quaternary Issue**: Prompt architecture conflicts
- Layer 1 (Base Context) provides general guidelines that may conflict with Layer 6 (Constraints)
- No clear hierarchy when preferences contradict base instructions
- Optimization could remove preference-enforcement instructions
