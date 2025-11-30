import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface EmotionAnalysisRequest {
  content: string;
  contentType: 'text' | 'image' | 'video' | 'mixed';
  platform: string;
  analysisDepth: 'basic' | 'detailed' | 'comprehensive';
  includeAudience?: boolean;
  targetDemographic?: string;
}

interface EmotionAnalysisResult {
  success: boolean;
  primaryEmotion: {
    emotion: string;
    intensity: number;
    confidence: number;
  };
  emotionBreakdown: {
    joy: number;
    sadness: number;
    anger: number;
    fear: number;
    surprise: number;
    disgust: number;
    trust: number;
    anticipation: number;
  };
  sentimentAnalysis: {
    polarity: number; // -1 to 1
    subjectivity: number; // 0 to 1
    classification: 'positive' | 'negative' | 'neutral';
    confidence: number;
  };
  psychologicalInsights: {
    personalityTraits: Array<{
      trait: string;
      score: number;
      description: string;
    }>;
    motivationalFactors: string[];
    cognitiveAppeals: string[];
    emotionalTriggers: string[];
  };
  audienceResponse: {
    predictedEngagement: number;
    emotionalResonance: number;
    shareability: number;
    targetAudienceMatch: number;
    viralPotential: number;
  };
  recommendations: {
    contentOptimization: string[];
    emotionalEnhancement: string[];
    audienceAlignment: string[];
    platformSpecific: string[];
  };
  creditsUsed: number;
}

export async function generateEmotionAnalysis(
  request: EmotionAnalysisRequest
): Promise<EmotionAnalysisResult> {
  try {
    console.log(`[EMOTION ANALYSIS] Analyzing ${request.contentType} content for ${request.platform}`);
    console.log(`[EMOTION ANALYSIS] Analysis depth: ${request.analysisDepth}`);
    
    // Pre-analyze content for context
    const contentContext = await analyzeContentContext(request);
    
    const prompt = `
As an expert emotional intelligence analyst with deep knowledge of psychology, neuroscience, and social media behavior patterns, analyze the following content for emotional impact and audience response:

Content Type: ${request.contentType}
Platform: ${request.platform}
Analysis Depth: ${request.analysisDepth}
Target Demographic: ${request.targetDemographic || 'General audience'}
Include Audience Analysis: ${request.includeAudience ? 'Yes' : 'No'}

Content to Analyze: "${request.content}"

Content Context Analysis:
${JSON.stringify(contentContext, null, 2)}

Provide a comprehensive emotion analysis in JSON format with the following structure:
{
  "primaryEmotion": {
    "emotion": "joy",
    "intensity": 85,
    "confidence": 92
  },
  "emotionBreakdown": {
    "joy": 45,
    "sadness": 5,
    "anger": 8,
    "fear": 3,
    "surprise": 25,
    "disgust": 2,
    "trust": 30,
    "anticipation": 20
  },
  "sentimentAnalysis": {
    "polarity": 0.75,
    "subjectivity": 0.65,
    "classification": "positive",
    "confidence": 88
  },
  "psychologicalInsights": {
    "personalityTraits": [
      {
        "trait": "Openness",
        "score": 78,
        "description": "Content shows creative and imaginative thinking"
      }
    ],
    "motivationalFactors": ["Achievement", "Social connection", "Self-expression"],
    "cognitiveAppeals": ["Visual appeal", "Novelty", "Social proof"],
    "emotionalTriggers": ["FOMO", "Aspiration", "Belonging"]
  },
  "audienceResponse": {
    "predictedEngagement": 82,
    "emotionalResonance": 76,
    "shareability": 85,
    "targetAudienceMatch": 78,
    "viralPotential": 73
  },
  "recommendations": {
    "contentOptimization": ["Enhance emotional hooks", "Add personal storytelling"],
    "emotionalEnhancement": ["Increase urgency", "Add social proof"],
    "audienceAlignment": ["Adjust tone for target demo", "Include relevant references"],
    "platformSpecific": ["Optimize for platform algorithm", "Use platform-native features"]
  }
}

Focus on:
- Accurate emotion recognition using Plutchik's Wheel of Emotions
- Psychological profiling based on content choices and language patterns
- Platform-specific emotional optimization strategies
- Audience psychology and engagement prediction
- Cultural and demographic sensitivity in analysis
- Actionable recommendations for emotional impact enhancement
- Viral content psychology and shareability factors
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert emotional intelligence analyst with advanced knowledge of psychology, neuroscience, and social media behavior. Provide scientifically-grounded emotional analysis with actionable insights for content optimization."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2500
    });

    const analysisResults = JSON.parse(response.choices[0].message.content || '{}');
    
    console.log(`[EMOTION ANALYSIS] ✅ Analysis completed`);
    console.log(`[EMOTION ANALYSIS] Primary emotion: ${analysisResults.primaryEmotion?.emotion || 'unknown'} (${analysisResults.primaryEmotion?.intensity || 0}%)`);
    console.log(`[EMOTION ANALYSIS] Sentiment: ${analysisResults.sentimentAnalysis?.classification || 'unknown'} (${Math.round((analysisResults.sentimentAnalysis?.polarity || 0) * 100)}%)`);
    console.log(`[EMOTION ANALYSIS] Credits used: 5`);

    return {
      success: true,
      primaryEmotion: analysisResults.primaryEmotion || {
        emotion: 'neutral',
        intensity: 50,
        confidence: 50
      },
      emotionBreakdown: analysisResults.emotionBreakdown || {
        joy: 0, sadness: 0, anger: 0, fear: 0,
        surprise: 0, disgust: 0, trust: 0, anticipation: 0
      },
      sentimentAnalysis: analysisResults.sentimentAnalysis || {
        polarity: 0,
        subjectivity: 0,
        classification: 'neutral',
        confidence: 50
      },
      psychologicalInsights: analysisResults.psychologicalInsights || {
        personalityTraits: [],
        motivationalFactors: [],
        cognitiveAppeals: [],
        emotionalTriggers: []
      },
      audienceResponse: analysisResults.audienceResponse || {
        predictedEngagement: 50,
        emotionalResonance: 50,
        shareability: 50,
        targetAudienceMatch: 50,
        viralPotential: 50
      },
      recommendations: analysisResults.recommendations || {
        contentOptimization: [],
        emotionalEnhancement: [],
        audienceAlignment: [],
        platformSpecific: []
      },
      creditsUsed: 5
    };

  } catch (error) {
    console.error('[EMOTION ANALYSIS] Analysis failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Emotion analysis failed: ${errorMessage}`);
  }
}

async function analyzeContentContext(request: EmotionAnalysisRequest) {
  const content = request.content;
  const contentLength = content.length;
  const wordCount = content.split(' ').length;
  
  // Linguistic analysis
  const linguisticFeatures = analyzeLinguisticFeatures(content);
  
  // Emotional indicators
  const emotionalMarkers = identifyEmotionalMarkers(content);
  
  // Platform context
  const platformContext = getPlatformContext(request.platform);
  
  // Content structure analysis
  const structureAnalysis = analyzeContentStructure(content, request.contentType);
  
  return {
    contentLength,
    wordCount,
    linguisticFeatures,
    emotionalMarkers,
    platformContext,
    structureAnalysis,
    contentType: request.contentType,
    analysisDepth: request.analysisDepth
  };
}

function analyzeLinguisticFeatures(content: string) {
  const words = content.toLowerCase().split(/\s+/);
  
  // Emotional word categories
  const positiveWords = ['amazing', 'incredible', 'love', 'beautiful', 'perfect', 'awesome', 'fantastic', 'wonderful', 'excellent', 'brilliant'];
  const negativeWords = ['hate', 'terrible', 'awful', 'horrible', 'disgusting', 'worst', 'pathetic', 'useless', 'failed', 'disaster'];
  const powerWords = ['breakthrough', 'revolutionary', 'exclusive', 'secret', 'proven', 'guaranteed', 'ultimate', 'premium', 'limited', 'urgent'];
  const emotionWords = ['excited', 'thrilled', 'devastated', 'shocked', 'surprised', 'confused', 'inspired', 'motivated', 'scared', 'worried'];
  
  // Calculate word frequencies
  const positiveCount = words.filter(word => positiveWords.includes(word)).length;
  const negativeCount = words.filter(word => negativeWords.includes(word)).length;
  const powerCount = words.filter(word => powerWords.includes(word)).length;
  const emotionCount = words.filter(word => emotionWords.includes(word)).length;
  
  // Sentence structure analysis
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;
  const exclamationCount = (content.match(/!/g) || []).length;
  const questionCount = (content.match(/\?/g) || []).length;
  
  // Capitalization patterns
  const capsCount = (content.match(/[A-Z]/g) || []).length;
  const allCapsWords = words.filter(word => word === word.toUpperCase() && word.length > 1).length;
  
  return {
    positiveWordRatio: positiveCount / words.length,
    negativeWordRatio: negativeCount / words.length,
    powerWordRatio: powerCount / words.length,
    emotionWordRatio: emotionCount / words.length,
    avgSentenceLength,
    exclamationRatio: exclamationCount / Math.max(sentences.length, 1),
    questionRatio: questionCount / Math.max(sentences.length, 1),
    capitalizationRatio: capsCount / content.length,
    allCapsRatio: allCapsWords / words.length
  };
}

function identifyEmotionalMarkers(content: string) {
  // Emotion-specific patterns
  const patterns = {
    joy: ['😊', '😄', '🎉', '❤️', 'happy', 'excited', 'love', 'amazing', 'wonderful'],
    sadness: ['😢', '😭', '💔', 'sad', 'crying', 'heartbroken', 'disappointed', 'depressed'],
    anger: ['😠', '😡', '🤬', 'angry', 'furious', 'mad', 'rage', 'hate', 'frustrated'],
    fear: ['😨', '😰', '😱', 'scared', 'afraid', 'terrified', 'nervous', 'worried', 'anxious'],
    surprise: ['😮', '😲', '🤯', 'wow', 'omg', 'shocked', 'surprised', 'unbelievable', 'amazing'],
    disgust: ['🤢', '🤮', '😷', 'gross', 'disgusting', 'sick', 'revolting', 'nasty'],
    trust: ['🤝', '💪', 'trust', 'reliable', 'honest', 'authentic', 'genuine', 'loyal'],
    anticipation: ['⏰', '🔜', 'soon', 'waiting', 'excited', 'looking forward', 'can\'t wait', 'coming']
  };
  
  const emotionScores = {};
  
  Object.keys(patterns).forEach(emotion => {
    const markers = patterns[emotion];
    const count = markers.reduce((total, marker) => {
      return total + (content.toLowerCase().includes(marker.toLowerCase()) ? 1 : 0);
    }, 0);
    emotionScores[emotion] = count;
  });
  
  return emotionScores;
}

function getPlatformContext(platform: string) {
  const platformCharacteristics = {
    instagram: {
      visualFocus: true,
      hashtagCulture: true,
      storytelling: true,
      aspirational: true,
      avgEngagementRate: 1.22
    },
    tiktok: {
      entertainment: true,
      trending: true,
      youth: true,
      viral: true,
      avgEngagementRate: 5.96
    },
    youtube: {
      educational: true,
      longForm: true,
      subscriber: true,
      searchOptimized: true,
      avgEngagementRate: 1.63
    },
    twitter: {
      news: true,
      realTime: true,
      conversations: true,
      brevity: true,
      avgEngagementRate: 0.045
    },
    linkedin: {
      professional: true,
      business: true,
      networking: true,
      thought: true,
      avgEngagementRate: 0.54
    }
  };
  
  return platformCharacteristics[platform.toLowerCase()] || {
    general: true,
    avgEngagementRate: 1.0
  };
}

function analyzeContentStructure(content: string, contentType: string) {
  const structure = {
    hasHook: false,
    hasCallToAction: false,
    hasPersonalStory: false,
    hasData: false,
    hasQuestions: false,
    hasHashtags: false,
    hasMentions: false,
    hasEmojis: false
  };
  
  const lowerContent = content.toLowerCase();
  
  // Hook detection (first 20% of content)
  const hookSection = content.substring(0, Math.floor(content.length * 0.2));
  structure.hasHook = /\b(imagine|what if|did you know|secret|shocking|amazing)\b/i.test(hookSection);
  
  // Call to action detection
  structure.hasCallToAction = /\b(like|share|comment|follow|subscribe|click|visit|try|buy|download)\b/i.test(lowerContent);
  
  // Personal story indicators
  structure.hasPersonalStory = /\b(i|my|me|personal|experience|story|journey)\b/i.test(lowerContent);
  
  // Data/statistics indicators
  structure.hasData = /\b(\d+%|\d+ percent|statistics|study|research|data shows)\b/i.test(content);
  
  // Questions
  structure.hasQuestions = content.includes('?');
  
  // Social media elements
  structure.hasHashtags = /#\w+/g.test(content);
  structure.hasMentions = /@\w+/g.test(content);
  // Use a simpler emoji detection that works well with bundlers
  const emojiRegex = new RegExp('[\uD83C-\uDBFF\uDC00-\uDFFF]+', 'g');
  structure.hasEmojis = emojiRegex.test(content);
  
  return structure;
}