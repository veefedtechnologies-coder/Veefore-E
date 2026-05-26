import { getOpenAIClient, isOpenAIAvailable } from './openai-client';

export interface ABTestInput {
  title: string;
  description: string;
  platform: string;
  audience: string;
  contentType: string;
  objective: string;
  currentPerformance?: {
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    conversionRate: number;
  };
  brandGuidelines?: string;
  testDuration: string;
  budget?: number;
}

export interface ABTestVariant {
  id: string;
  name: string;
  description: string;
  changes: string[];
  expectedImpact: string;
  riskLevel: 'low' | 'medium' | 'high';
  implementation: string[];
  estimatedLift: {
    metric: string;
    percentage: number;
    confidence: number;
  };
}

export interface ABTestStrategy {
  testName: string;
  hypothesis: string;
  primaryMetric: string;
  secondaryMetrics: string[];
  variants: ABTestVariant[];
  testSetup: {
    trafficSplit: Record<string, number>;
    sampleSize: number;
    duration: string;
    successCriteria: string[];
    statisticalSignificance: number;
  };
  implementation: {
    trackingSetup: string[];
    technicalRequirements: string[];
    timeline: string[];
  };
  analysis: {
    keyInsights: string[];
    optimizationRecommendations: string[];
    nextTestSuggestions: string[];
  };
  risks: string[];
  expectedOutcomes: {
    bestCase: string;
    worstCase: string;
    mostLikely: string;
  };
}

export interface ABTestResult {
  strategy: ABTestStrategy;
  remainingCredits?: number;
}

export class ABTestingAI {
  async generateABTestStrategy(input: ABTestInput): Promise<ABTestStrategy> {
    const prompt = this.buildABTestPrompt(input);

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert A/B testing strategist and conversion optimization specialist with deep knowledge of statistical analysis, user psychology, and digital marketing across all major platforms (Instagram, YouTube, TikTok, Facebook, LinkedIn, Twitter).

Your expertise includes:
- Statistical test design and sample size calculations
- Hypothesis formation and metric selection
- User behavior analysis and conversion optimization
- Platform-specific testing best practices
- Risk assessment and implementation planning
- Performance analysis and iteration strategies

Always provide actionable, data-driven A/B testing strategies with clear implementation steps and statistical rigor.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000
      });

      const result = JSON.parse(completion.choices[0].message.content || '{}');
      return this.formatABTestStrategy(result, input);
    } catch (error) {
      console.error('[A/B TESTING AI] Error:', error);
      throw new Error(`Failed to generate A/B testing strategy: ${error}`);
    }
  }

  private buildABTestPrompt(input: ABTestInput): string {
    return `Create a comprehensive A/B testing strategy for this content optimization project:

CONTENT DETAILS:
- Title/Campaign: ${input.title}
- Description: ${input.description}
- Platform: ${input.platform}
- Content Type: ${input.contentType}
- Target Audience: ${input.audience}
- Primary Objective: ${input.objective}
- Test Duration: ${input.testDuration}
${input.budget ? `- Budget: $${input.budget}` : ''}

CURRENT PERFORMANCE:
${input.currentPerformance ? `
- Impressions: ${input.currentPerformance.impressions.toLocaleString()}
- Clicks: ${input.currentPerformance.clicks.toLocaleString()}
- Conversions: ${input.currentPerformance.conversions.toLocaleString()}
- CTR: ${input.currentPerformance.ctr}%
- Conversion Rate: ${input.currentPerformance.conversionRate}%
` : 'No baseline data provided'}

BRAND GUIDELINES:
${input.brandGuidelines || 'No specific brand guidelines provided'}

Please provide a comprehensive A/B testing strategy in JSON format with this structure:
{
  "testName": "descriptive test name",
  "hypothesis": "clear, testable hypothesis statement",
  "primaryMetric": "main success metric",
  "secondaryMetrics": ["list", "of", "secondary", "metrics"],
  "variants": [
    {
      "id": "control",
      "name": "Control (Original)",
      "description": "baseline version description",
      "changes": ["no changes - original version"],
      "expectedImpact": "baseline performance",
      "riskLevel": "low",
      "implementation": ["steps to implement"],
      "estimatedLift": {
        "metric": "primary metric name",
        "percentage": 0,
        "confidence": 95
      }
    },
    {
      "id": "variant_a",
      "name": "Variant A Name",
      "description": "variant description",
      "changes": ["specific changes made"],
      "expectedImpact": "expected performance impact",
      "riskLevel": "low|medium|high",
      "implementation": ["implementation steps"],
      "estimatedLift": {
        "metric": "primary metric name",
        "percentage": 15,
        "confidence": 80
      }
    }
  ],
  "testSetup": {
    "trafficSplit": {"control": 50, "variant_a": 50},
    "sampleSize": 1000,
    "duration": "duration in days",
    "successCriteria": ["criteria for success"],
    "statisticalSignificance": 95
  },
  "implementation": {
    "trackingSetup": ["tracking requirements"],
    "technicalRequirements": ["technical needs"],
    "timeline": ["implementation timeline"]
  },
  "analysis": {
    "keyInsights": ["insights about the test design"],
    "optimizationRecommendations": ["recommendations for optimization"],
    "nextTestSuggestions": ["suggestions for follow-up tests"]
  },
  "risks": ["potential risks and mitigation strategies"],
  "expectedOutcomes": {
    "bestCase": "best case scenario description",
    "worstCase": "worst case scenario description",
    "mostLikely": "most likely outcome description"
  }
}

Focus on:
1. Statistical rigor and proper test design
2. Platform-specific optimization opportunities
3. User psychology and behavior insights
4. Clear implementation guidelines
5. Risk assessment and mitigation
6. Actionable next steps and iteration plans`;
  }

  private formatABTestStrategy(result: any, input: ABTestInput): ABTestStrategy {
    return {
      testName: result.testName || `${input.title} A/B Test`,
      hypothesis: result.hypothesis || `Testing variations of ${input.title} will improve ${input.objective}`,
      primaryMetric: result.primaryMetric || this.getPrimaryMetricForObjective(input.objective),
      secondaryMetrics: result.secondaryMetrics || this.getSecondaryMetrics(input.objective),
      variants: (result.variants || []).map((variant: any, index: number) => ({
        id: variant.id || `variant_${index}`,
        name: variant.name || `Variant ${String.fromCharCode(65 + index)}`,
        description: variant.description || `Test variant ${index + 1}`,
        changes: variant.changes || [`Changes for variant ${index + 1}`],
        expectedImpact: variant.expectedImpact || `Expected improvement in ${input.objective}`,
        riskLevel: variant.riskLevel || 'medium',
        implementation: variant.implementation || ['Implementation steps to be defined'],
        estimatedLift: {
          metric: variant.estimatedLift?.metric || result.primaryMetric || 'engagement',
          percentage: variant.estimatedLift?.percentage || (index === 0 ? 0 : 10 + index * 5),
          confidence: variant.estimatedLift?.confidence || 80
        }
      })),
      testSetup: {
        trafficSplit: result.testSetup?.trafficSplit || { control: 50, variant_a: 50 },
        sampleSize: result.testSetup?.sampleSize || this.calculateSampleSize(input),
        duration: result.testSetup?.duration || input.testDuration,
        successCriteria: result.testSetup?.successCriteria || [`Achieve statistical significance at 95% confidence level`],
        statisticalSignificance: result.testSetup?.statisticalSignificance || 95
      },
      implementation: {
        trackingSetup: result.implementation?.trackingSetup || ['Set up analytics tracking', 'Configure conversion events'],
        technicalRequirements: result.implementation?.technicalRequirements || ['A/B testing platform setup', 'Content variation deployment'],
        timeline: result.implementation?.timeline || ['Setup: 1-2 days', `Testing: ${input.testDuration}`, 'Analysis: 2-3 days']
      },
      analysis: {
        keyInsights: result.analysis?.keyInsights || ['Test designed for statistical significance', 'Focus on primary metric optimization'],
        optimizationRecommendations: result.analysis?.optimizationRecommendations || ['Monitor performance daily', 'Prepare iteration based on results'],
        nextTestSuggestions: result.analysis?.nextTestSuggestions || ['Test additional variations based on winning variant', 'Explore related optimization opportunities']
      },
      risks: result.risks || ['Potential temporary decrease in performance', 'Risk of inconclusive results with insufficient sample size'],
      expectedOutcomes: {
        bestCase: result.expectedOutcomes?.bestCase || `Significant improvement in ${input.objective} with clear winning variant`,
        worstCase: result.expectedOutcomes?.worstCase || 'No significant difference between variants',
        mostLikely: result.expectedOutcomes?.mostLikely || `Moderate improvement with actionable insights for future optimization`
      }
    };
  }

  private getPrimaryMetricForObjective(objective: string): string {
    const lowerObjective = objective.toLowerCase();
    if (lowerObjective.includes('engagement')) return 'engagement_rate';
    if (lowerObjective.includes('click')) return 'click_through_rate';
    if (lowerObjective.includes('conversion')) return 'conversion_rate';
    if (lowerObjective.includes('view')) return 'view_rate';
    if (lowerObjective.includes('share')) return 'share_rate';
    if (lowerObjective.includes('follow')) return 'follow_rate';
    return 'engagement_rate';
  }

  private getSecondaryMetrics(objective: string): string[] {
    return [
      'cost_per_acquisition',
      'time_on_content',
      'bounce_rate',
      'social_shares',
      'comment_sentiment'
    ];
  }

  private calculateSampleSize(input: ABTestInput): number {
    // Basic sample size calculation based on expected traffic and test duration
    const baseSize = 1000;
    const platformMultiplier = this.getPlatformMultiplier(input.platform);
    const durationDays = parseInt(input.testDuration.replace(/\D/g, '')) || 14;
    
    return Math.max(baseSize, Math.round(baseSize * platformMultiplier * (durationDays / 14)));
  }

  private getPlatformMultiplier(platform: string): number {
    const platformMap: Record<string, number> = {
      'instagram': 1.2,
      'youtube': 1.5,
      'tiktok': 1.0,
      'facebook': 1.3,
      'linkedin': 1.4,
      'twitter': 1.1
    };
    return platformMap[platform.toLowerCase()] || 1.0;
  }
}

export const abTestingAI = new ABTestingAI();