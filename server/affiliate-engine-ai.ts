import { getOpenAIClient, isOpenAIAvailable } from './openai-client';

interface AffiliateDiscoveryRequest {
  niche: string;
  audience: string;
  contentType: string;
  followerCount: number;
  previousExperience: string;
  preferredCommission: string;
  contentStyle: string;
}

interface AffiliateOpportunity {
  id: string;
  brand: string;
  program: string;
  commission: string;
  cookieDuration: number;
  category: string;
  rating: number;
  requirements: string[];
  description: string;
  joinUrl: string;
  estimatedEarnings: {
    monthly: number;
    perSale: number;
    conversionRate: number;
  };
  contentSuggestions: string[];
  pros: string[];
  cons: string[];
  applicationTips: string[];
  bestPractices: string[];
}

interface AffiliateDiscoveryResult {
  success: boolean;
  opportunities: AffiliateOpportunity[];
  marketAnalysis: {
    competitiveness: number;
    averageCommission: string;
    topPerformingTypes: string[];
    seasonalTrends: string[];
    growthPotential: number;
  };
  recommendations: {
    priorityPrograms: string[];
    contentStrategy: string[];
    monetizationTips: string[];
    audienceBuilding: string[];
  };
  creditsUsed: number;
}

export async function discoverAffiliateOpportunities(
  request: AffiliateDiscoveryRequest
): Promise<AffiliateDiscoveryResult> {
  try {
    console.log(`[AFFILIATE ENGINE] Discovering opportunities for niche: ${request.niche}`);
    
    // Analyze user profile for better matching
    const userProfile = analyzeUserProfile(request);
    
    const prompt = `
As an expert affiliate marketing strategist with deep knowledge of affiliate networks, commission structures, and content monetization, analyze the following creator profile and provide personalized affiliate program recommendations:

Creator Profile:
- Niche: ${request.niche}
- Target Audience: ${request.audience}
- Content Type: ${request.contentType}
- Follower Count: ${request.followerCount}
- Previous Experience: ${request.previousExperience}
- Preferred Commission: ${request.preferredCommission}
- Content Style: ${request.contentStyle}

User Profile Analysis:
${JSON.stringify(userProfile, null, 2)}

Provide a comprehensive affiliate marketing analysis in JSON format with the following structure:
{
  "opportunities": [
    {
      "id": "unique-id-1",
      "brand": "Brand Name",
      "program": "Program Name",
      "commission": "8-12% or $50-200",
      "cookieDuration": 30,
      "category": "fitness/tech/beauty/finance/lifestyle",
      "rating": 4.8,
      "requirements": ["specific follower count", "niche alignment", "content quality"],
      "description": "Detailed program description with value proposition",
      "joinUrl": "https://example.com/affiliate",
      "estimatedEarnings": {
        "monthly": 1500,
        "perSale": 75,
        "conversionRate": 2.5
      },
      "contentSuggestions": [
        "Specific content ideas that work well for this program",
        "Video concepts that drive conversions",
        "Post formats that perform best"
      ],
      "pros": [
        "High commission rates",
        "Quality products",
        "Good brand reputation"
      ],
      "cons": [
        "Competitive market",
        "Strict approval process"
      ],
      "applicationTips": [
        "Specific tips for getting approved",
        "What to highlight in application"
      ],
      "bestPractices": [
        "How to promote effectively",
        "Compliance requirements"
      ]
    }
  ],
  "marketAnalysis": {
    "competitiveness": 7.5,
    "averageCommission": "5-15%",
    "topPerformingTypes": ["product reviews", "tutorials", "comparisons"],
    "seasonalTrends": ["Black Friday peaks", "New Year fitness surge"],
    "growthPotential": 8.2
  },
  "recommendations": {
    "priorityPrograms": ["Program names to focus on first"],
    "contentStrategy": ["Content strategies for maximum conversion"],
    "monetizationTips": ["Advanced tips for scaling affiliate revenue"],
    "audienceBuilding": ["Tips for growing engaged audience"]
  }
}

Focus on:
1. Real, established affiliate programs that match the creator's profile
2. Accurate commission structures and requirements
3. Realistic earning projections based on audience size and engagement
4. Actionable content strategies for each program
5. Market insights specific to the creator's niche
6. Compliance and best practices for affiliate marketing

Provide 5-8 high-quality, diverse affiliate opportunities that offer genuine value and earning potential.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert affiliate marketing strategist with comprehensive knowledge of affiliate networks, commission structures, and content monetization. Provide detailed, actionable recommendations based on creator profiles."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 3000
    });

    const analysisResults = JSON.parse(response.choices[0].message.content || '{}');
    
    // Validate and enhance the results
    const opportunities = (analysisResults.opportunities || []).map((opp: any, index: number) => ({
      ...opp,
      id: opp.id || `aff_${Date.now()}_${index}`,
      rating: Math.min(Math.max(opp.rating || 4.0, 1.0), 5.0),
      estimatedEarnings: {
        monthly: Math.max(opp.estimatedEarnings?.monthly || 0, 0),
        perSale: Math.max(opp.estimatedEarnings?.perSale || 0, 0),
        conversionRate: Math.min(Math.max(opp.estimatedEarnings?.conversionRate || 1.0, 0.1), 10.0)
      }
    }));

    console.log(`[AFFILIATE ENGINE] ✅ Discovery completed`);
    console.log(`[AFFILIATE ENGINE] Found ${opportunities.length} opportunities`);
    console.log(`[AFFILIATE ENGINE] Market competitiveness: ${analysisResults.marketAnalysis?.competitiveness || 'N/A'}`);
    console.log(`[AFFILIATE ENGINE] Credits used: 4`);

    return {
      success: true,
      opportunities,
      marketAnalysis: analysisResults.marketAnalysis || {
        competitiveness: 5.0,
        averageCommission: "5-15%",
        topPerformingTypes: ["product reviews", "tutorials"],
        seasonalTrends: ["seasonal variations"],
        growthPotential: 6.0
      },
      recommendations: analysisResults.recommendations || {
        priorityPrograms: [],
        contentStrategy: [],
        monetizationTips: [],
        audienceBuilding: []
      },
      creditsUsed: 4
    };

  } catch (error) {
    console.error('[AFFILIATE ENGINE] Discovery failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Affiliate opportunity discovery failed: ${errorMessage}`);
  }
}

function analyzeUserProfile(request: AffiliateDiscoveryRequest) {
  // Analyze follower count tier
  const followerTier = getFollowerTier(request.followerCount);
  
  // Analyze niche competitiveness
  const nicheCompetitiveness = getNicheCompetitiveness(request.niche);
  
  // Analyze content type effectiveness
  const contentEffectiveness = getContentTypeEffectiveness(request.contentType);
  
  // Analyze experience level
  const experienceLevel = getExperienceLevel(request.previousExperience);
  
  return {
    followerTier,
    nicheCompetitiveness,
    contentEffectiveness,
    experienceLevel,
    recommendedPrograms: getRecommendedProgramTypes(request),
    monetizationPotential: calculateMonetizationPotential(request)
  };
}

function getFollowerTier(count: number): string {
  if (count < 1000) return 'micro';
  if (count < 10000) return 'small';
  if (count < 100000) return 'medium';
  if (count < 1000000) return 'large';
  return 'mega';
}

function getNicheCompetitiveness(niche: string): number {
  const competitiveNiches = ['fitness', 'beauty', 'tech', 'finance'];
  const moderateNiches = ['lifestyle', 'food', 'travel', 'fashion'];
  
  if (competitiveNiches.some(n => niche.toLowerCase().includes(n))) return 8;
  if (moderateNiches.some(n => niche.toLowerCase().includes(n))) return 6;
  return 4;
}

function getContentTypeEffectiveness(type: string): number {
  const highEffectiveness = ['video', 'reel', 'tutorial', 'review'];
  const moderateEffectiveness = ['post', 'story', 'carousel'];
  
  if (highEffectiveness.some(t => type.toLowerCase().includes(t))) return 8;
  if (moderateEffectiveness.some(t => type.toLowerCase().includes(t))) return 6;
  return 4;
}

function getExperienceLevel(experience: string): string {
  if (experience.toLowerCase().includes('beginner') || experience.toLowerCase().includes('new')) return 'beginner';
  if (experience.toLowerCase().includes('intermediate') || experience.toLowerCase().includes('some')) return 'intermediate';
  return 'advanced';
}

function getRecommendedProgramTypes(request: AffiliateDiscoveryRequest): string[] {
  const types = [];
  
  // Based on niche
  if (request.niche.toLowerCase().includes('fitness')) {
    types.push('fitness-equipment', 'supplements', 'workout-apps');
  }
  if (request.niche.toLowerCase().includes('tech')) {
    types.push('software', 'gadgets', 'online-courses');
  }
  if (request.niche.toLowerCase().includes('beauty')) {
    types.push('cosmetics', 'skincare', 'beauty-tools');
  }
  
  // Based on audience
  if (request.audience.toLowerCase().includes('young')) {
    types.push('fashion', 'entertainment', 'education');
  }
  if (request.audience.toLowerCase().includes('professional')) {
    types.push('business-tools', 'productivity', 'courses');
  }
  
  return types.length > 0 ? types : ['general-retail', 'digital-products'];
}

function calculateMonetizationPotential(request: AffiliateDiscoveryRequest): number {
  let score = 5; // Base score
  
  // Follower count impact
  if (request.followerCount > 10000) score += 2;
  else if (request.followerCount > 1000) score += 1;
  
  // Content type impact
  if (request.contentType.toLowerCase().includes('video')) score += 1;
  if (request.contentType.toLowerCase().includes('review')) score += 1;
  
  // Experience impact
  if (request.previousExperience.toLowerCase().includes('experienced')) score += 1;
  
  return Math.min(score, 10);
}