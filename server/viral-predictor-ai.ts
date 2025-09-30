import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ViralPredictorRequest {
  contentType: string;
  platform: string;
  content: string;
  hashtags?: string[];
  targetAudience?: string;
  scheduledTime?: string;
}

interface ViralPredictorResult {
  success: boolean;
  viralScore: number;
  confidence: number;
  factors: {
    contentQuality: number;
    timingOptimal: number;
    hashtagRelevance: number;
    audienceAlignment: number;
    platformFit: number;
    trendAlignment: number;
  };
  predictions: {
    estimatedReach: number;
    estimatedEngagement: number;
    peakTime: string;
    viralProbability: number;
    expectedLifespan: string;
  };
  optimizationTips: Array<{
    category: string;
    suggestion: string;
    impact: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  estimatedReach: number;
  creditsUsed: number;
}

export async function generateViralPrediction(
  request: ViralPredictorRequest
): Promise<ViralPredictorResult> {
  try {
    console.log(`[VIRAL PREDICTOR] Analyzing content for platform: ${request.platform}`);
    
    // Analyze content characteristics
    const contentAnalysis = await analyzeContentCharacteristics(request);
    
    const prompt = `
As an expert viral content analyst with extensive knowledge of social media algorithms and user behavior patterns, analyze the following content for viral potential:

Content Type: ${request.contentType}
Platform: ${request.platform}
Content: "${request.content}"
Hashtags: ${request.hashtags?.join(', ') || 'None'}
Target Audience: ${request.targetAudience || 'General'}
Scheduled Time: ${request.scheduledTime || 'Not specified'}

Content Analysis Data:
${JSON.stringify(contentAnalysis, null, 2)}

Provide a comprehensive viral potential analysis in JSON format with the following structure:
{
  "viralScore": 85,
  "confidence": 0.78,
  "factors": {
    "contentQuality": 92,
    "timingOptimal": 85,
    "hashtagRelevance": 78,
    "audienceAlignment": 88,
    "platformFit": 95,
    "trendAlignment": 82
  },
  "predictions": {
    "estimatedReach": 15000,
    "estimatedEngagement": 1200,
    "peakTime": "6-8 hours after posting",
    "viralProbability": 0.73,
    "expectedLifespan": "3-5 days"
  },
  "optimizationTips": [
    {
      "category": "Content",
      "suggestion": "Add more emotional hooks in first 3 seconds",
      "impact": "Could increase engagement by 25%",
      "priority": "high"
    }
  ]
}

Consider these key viral factors:
- Emotional resonance and shareability
- Algorithm compatibility for the specific platform
- Timing optimization for maximum visibility
- Hashtag strategy and trending topics alignment
- Audience behavior patterns and preferences
- Content format optimization (video length, image ratios, etc.)
- Engagement triggers and call-to-action effectiveness
- Cross-platform amplification potential

Provide actionable insights for maximizing viral potential.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert viral content analyst with deep understanding of social media algorithms, user psychology, and viral content patterns. Provide data-driven predictions and optimization strategies."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2000
    });

    const analysisResults = JSON.parse(response.choices[0].message.content || '{}');
    
    // Calculate final metrics
    const viralScore = Math.min(Math.max(analysisResults.viralScore || 50, 0), 100);
    const confidence = Math.min(Math.max(analysisResults.confidence || 0.5, 0), 1);
    const estimatedReach = calculateEstimatedReach(viralScore, request.platform, contentAnalysis);

    console.log(`[VIRAL PREDICTOR] ✅ Analysis completed`);
    console.log(`[VIRAL PREDICTOR] Viral score: ${viralScore}/100`);
    console.log(`[VIRAL PREDICTOR] Confidence: ${Math.round(confidence * 100)}%`);
    console.log(`[VIRAL PREDICTOR] Estimated reach: ${estimatedReach.toLocaleString()}`);
    console.log(`[VIRAL PREDICTOR] Credits used: 5`);

    return {
      success: true,
      viralScore,
      confidence,
      factors: analysisResults.factors || {
        contentQuality: 50,
        timingOptimal: 50,
        hashtagRelevance: 50,
        audienceAlignment: 50,
        platformFit: 50,
        trendAlignment: 50
      },
      predictions: {
        ...analysisResults.predictions,
        estimatedReach
      },
      optimizationTips: analysisResults.optimizationTips || [],
      estimatedReach,
      creditsUsed: 5
    };

  } catch (error) {
    console.error('[VIRAL PREDICTOR] Analysis failed:', error);
    throw new Error(`Viral prediction analysis failed: ${error.message}`);
  }
}

async function analyzeContentCharacteristics(request: ViralPredictorRequest) {
  // Analyze content patterns and characteristics
  const contentLength = request.content.length;
  const wordCount = request.content.split(' ').length;
  // Use a simpler emoji detection that works well with bundlers
  const emojiRegex = new RegExp('[\uD83C-\uDBFF\uDC00-\uDFFF]+', 'g');
  const hasEmojis = emojiRegex.test(request.content);
  const hasQuestions = request.content.includes('?');
  const hasCallToAction = /\b(like|share|comment|follow|subscribe|tag|dm|check out|link in bio)\b/i.test(request.content);
  const hasHashtags = (request.hashtags?.length || 0) > 0;
  
  // Platform-specific characteristics
  const platformOptimization = {
    instagram: {
      idealLength: contentLength <= 2200,
      hashtagCount: (request.hashtags?.length || 0) <= 30,
      visualFocus: true
    },
    tiktok: {
      idealLength: contentLength <= 150,
      hashtagCount: (request.hashtags?.length || 0) <= 5,
      trendFocus: true
    },
    youtube: {
      idealLength: contentLength >= 100,
      hashtagCount: (request.hashtags?.length || 0) <= 15,
      searchOptimized: true
    },
    twitter: {
      idealLength: contentLength <= 280,
      hashtagCount: (request.hashtags?.length || 0) <= 2,
      timely: true
    }
  };

  // Content sentiment analysis (simplified)
  const positiveWords = ['amazing', 'awesome', 'incredible', 'love', 'beautiful', 'stunning', 'perfect', 'best'];
  const negativeWords = ['hate', 'terrible', 'awful', 'worst', 'bad', 'horrible', 'disgusting'];
  const emotionalWords = ['excited', 'thrilled', 'shocked', 'surprised', 'confused', 'frustrated'];
  
  const sentiment = analyzeSimpleSentiment(request.content, positiveWords, negativeWords, emotionalWords);
  
  return {
    contentLength,
    wordCount,
    hasEmojis,
    hasQuestions,
    hasCallToAction,
    hasHashtags,
    platformOptimization: platformOptimization[request.platform.toLowerCase()] || platformOptimization.instagram,
    sentiment,
    urgencyWords: /\b(now|today|limited|exclusive|urgent|breaking|live)\b/i.test(request.content),
    personalTouch: /\b(I|my|me|personal|story|experience)\b/i.test(request.content),
    hashtagAnalysis: analyzeHashtags(request.hashtags || []),
    contentType: request.contentType,
    platform: request.platform
  };
}

function analyzeSimpleSentiment(content: string, positive: string[], negative: string[], emotional: string[]) {
  const lowerContent = content.toLowerCase();
  const positiveCount = positive.filter(word => lowerContent.includes(word)).length;
  const negativeCount = negative.filter(word => lowerContent.includes(word)).length;
  const emotionalCount = emotional.filter(word => lowerContent.includes(word)).length;
  
  return {
    positive: positiveCount,
    negative: negativeCount,
    emotional: emotionalCount,
    overall: positiveCount > negativeCount ? 'positive' : negativeCount > positiveCount ? 'negative' : 'neutral',
    intensity: Math.max(positiveCount, negativeCount, emotionalCount)
  };
}

function analyzeHashtags(hashtags: string[]) {
  const trendingPatterns = [
    'fyp', 'viral', 'trending', 'challenge', 'duet', 'transformation', 
    'beforeandafter', 'aesthetic', 'mood', 'vibe', 'tutorial', 'tips'
  ];
  
  const nicheSpecific = hashtags.filter(tag => 
    !trendingPatterns.some(pattern => tag.toLowerCase().includes(pattern))
  );
  
  return {
    total: hashtags.length,
    trending: hashtags.filter(tag => 
      trendingPatterns.some(pattern => tag.toLowerCase().includes(pattern))
    ).length,
    niche: nicheSpecific.length,
    branded: hashtags.filter(tag => 
      tag.toLowerCase().includes('brand') || 
      tag.toLowerCase().includes('sponsored') ||
      tag.toLowerCase().includes('ad')
    ).length
  };
}

function calculateEstimatedReach(viralScore: number, platform: string, contentAnalysis: any): number {
  const basereachMultipliers = {
    instagram: 1000,
    tiktok: 1500,
    youtube: 800,
    twitter: 600,
    linkedin: 400,
    facebook: 500
  };
  
  const baseReach = basereachMultipliers[platform.toLowerCase()] || 1000;
  const scoreMultiplier = viralScore / 100;
  const contentBonus = contentAnalysis.hasCallToAction ? 1.2 : 1.0;
  const hashtagBonus = contentAnalysis.hashtagAnalysis.trending > 0 ? 1.3 : 1.0;
  const sentimentBonus = contentAnalysis.sentiment.overall === 'positive' ? 1.1 : 1.0;
  
  const estimatedReach = Math.round(
    baseReach * scoreMultiplier * contentBonus * hashtagBonus * sentimentBonus
  );
  
  return Math.max(estimatedReach, 100); // Minimum reach of 100
}