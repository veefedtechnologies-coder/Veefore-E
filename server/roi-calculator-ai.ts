import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ROICalculatorRequest {
  campaignId?: string;
  investment: number;
  revenue?: number;
  costs: {
    adSpend: number;
    contentCreation: number;
    toolsAndSoftware: number;
    personnel: number;
    other: number;
  };
  metrics: {
    impressions: number;
    clicks: number;
    conversions: number;
    engagementRate: number;
    reachRate: number;
  };
  timeframe: string;
  industry: string;
  platform: string;
}

interface ROICalculatorResult {
  success: boolean;
  roiPercentage: number;
  totalInvestment: number;
  totalRevenue: number;
  netProfit: number;
  projections: {
    nextMonth: {
      estimatedRevenue: number;
      projectedROI: number;
      confidenceLevel: number;
    };
    nextQuarter: {
      estimatedRevenue: number;
      projectedROI: number;
      confidenceLevel: number;
    };
    nextYear: {
      estimatedRevenue: number;
      projectedROI: number;
      confidenceLevel: number;
    };
  };
  breakdownAnalysis: {
    costPerClick: number;
    costPerConversion: number;
    conversionRate: number;
    customerLifetimeValue: number;
    paybackPeriod: string;
  };
  recommendations: string;
  riskFactors: string[];
  optimizationOpportunities: Array<{
    area: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
    priority: 'high' | 'medium' | 'low';
  }>;
  creditsUsed: number;
}

export async function generateROICalculation(
  request: ROICalculatorRequest
): Promise<ROICalculatorResult> {
  try {
    console.log(`[ROI CALCULATOR] Analyzing campaign ROI for ${request.platform} campaign`);
    
    // Calculate base metrics
    const baseCalculations = calculateBaseMetrics(request);
    
    // Generate industry-specific analysis
    const industryBenchmarks = await generateIndustryBenchmarks(request.industry, request.platform);
    
    const prompt = `
As an expert digital marketing ROI analyst with extensive knowledge of campaign performance across industries, analyze the following campaign data and provide comprehensive ROI insights:

Campaign Data:
- Investment: $${request.investment}
- Revenue: $${request.revenue || 'TBD'}
- Platform: ${request.platform}
- Industry: ${request.industry}
- Timeframe: ${request.timeframe}

Cost Breakdown:
${JSON.stringify(request.costs, null, 2)}

Performance Metrics:
${JSON.stringify(request.metrics, null, 2)}

Base Calculations:
${JSON.stringify(baseCalculations, null, 2)}

Industry Benchmarks:
${JSON.stringify(industryBenchmarks, null, 2)}

Provide a comprehensive ROI analysis in JSON format with the following structure:
{
  "roiPercentage": 150.5,
  "projections": {
    "nextMonth": {
      "estimatedRevenue": 25000,
      "projectedROI": 165.3,
      "confidenceLevel": 85
    },
    "nextQuarter": {
      "estimatedRevenue": 75000,
      "projectedROI": 180.2,
      "confidenceLevel": 78
    },
    "nextYear": {
      "estimatedRevenue": 300000,
      "projectedROI": 220.5,
      "confidenceLevel": 65
    }
  },
  "breakdownAnalysis": {
    "costPerClick": 2.50,
    "costPerConversion": 45.00,
    "conversionRate": 2.8,
    "customerLifetimeValue": 350.00,
    "paybackPeriod": "4.2 months"
  },
  "recommendations": "Detailed strategic recommendations for improving ROI",
  "riskFactors": ["market saturation", "seasonal fluctuations"],
  "optimizationOpportunities": [
    {
      "area": "Conversion Rate Optimization",
      "impact": "Could increase ROI by 25-35%",
      "effort": "medium",
      "priority": "high"
    }
  ]
}

Focus on:
- Accurate ROI calculations based on industry standards
- Realistic projections with confidence intervals
- Actionable optimization strategies
- Risk assessment and mitigation strategies
- Cost efficiency analysis and recommendations
- Benchmark comparisons for context
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert digital marketing ROI analyst with deep understanding of campaign performance, customer lifetime value, and strategic optimization across all major platforms and industries."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2000
    });

    const analysisResults = JSON.parse(response.choices[0].message.content || '{}');
    
    // Calculate final metrics
    const totalInvestment = Object.values(request.costs).reduce((sum, cost) => sum + cost, 0) + request.investment;
    const totalRevenue = request.revenue || (analysisResults.projections?.nextMonth?.estimatedRevenue || 0);
    const netProfit = totalRevenue - totalInvestment;
    const roiPercentage = totalInvestment > 0 ? ((netProfit / totalInvestment) * 100) : 0;

    console.log(`[ROI CALCULATOR] ✅ Analysis completed`);
    console.log(`[ROI CALCULATOR] ROI: ${roiPercentage.toFixed(2)}%`);
    console.log(`[ROI CALCULATOR] Net profit: $${netProfit.toLocaleString()}`);
    console.log(`[ROI CALCULATOR] Credits used: 3`);

    return {
      success: true,
      roiPercentage: Math.round(roiPercentage * 100) / 100,
      totalInvestment,
      totalRevenue,
      netProfit,
      projections: analysisResults.projections || {
        nextMonth: { estimatedRevenue: 0, projectedROI: 0, confidenceLevel: 0 },
        nextQuarter: { estimatedRevenue: 0, projectedROI: 0, confidenceLevel: 0 },
        nextYear: { estimatedRevenue: 0, projectedROI: 0, confidenceLevel: 0 }
      },
      breakdownAnalysis: analysisResults.breakdownAnalysis || {
        costPerClick: 0,
        costPerConversion: 0,
        conversionRate: 0,
        customerLifetimeValue: 0,
        paybackPeriod: "Unknown"
      },
      recommendations: analysisResults.recommendations || "No specific recommendations available.",
      riskFactors: analysisResults.riskFactors || [],
      optimizationOpportunities: analysisResults.optimizationOpportunities || [],
      creditsUsed: 3
    };

  } catch (error) {
    console.error('[ROI CALCULATOR] Analysis failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`ROI calculation failed: ${errorMessage}`);
  }
}

function calculateBaseMetrics(request: ROICalculatorRequest) {
  const { metrics, costs } = request;
  
  const totalCosts = Object.values(costs).reduce((sum, cost) => sum + cost, 0);
  const costPerClick = metrics.clicks > 0 ? totalCosts / metrics.clicks : 0;
  const costPerConversion = metrics.conversions > 0 ? totalCosts / metrics.conversions : 0;
  const conversionRate = metrics.clicks > 0 ? (metrics.conversions / metrics.clicks) * 100 : 0;
  const clickThroughRate = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;
  const costPerThousandImpressions = metrics.impressions > 0 ? (totalCosts / metrics.impressions) * 1000 : 0;
  
  return {
    totalCosts,
    costPerClick: Math.round(costPerClick * 100) / 100,
    costPerConversion: Math.round(costPerConversion * 100) / 100,
    conversionRate: Math.round(conversionRate * 100) / 100,
    clickThroughRate: Math.round(clickThroughRate * 100) / 100,
    costPerThousandImpressions: Math.round(costPerThousandImpressions * 100) / 100,
    engagementRate: metrics.engagementRate,
    reachRate: metrics.reachRate
  };
}

async function generateIndustryBenchmarks(industry: string, platform: string) {
  // Industry-specific benchmarks (in production, this would come from real data APIs)
  const benchmarks = {
    'e-commerce': {
      avgConversionRate: 2.86,
      avgCostPerClick: 1.16,
      avgROI: 420,
      avgCustomerLifetimeValue: 168
    },
    'saas': {
      avgConversionRate: 3.2,
      avgCostPerClick: 2.41,
      avgROI: 300,
      avgCustomerLifetimeValue: 1200
    },
    'healthcare': {
      avgConversionRate: 4.23,
      avgCostPerClick: 2.62,
      avgROI: 380,
      avgCustomerLifetimeValue: 890
    },
    'education': {
      avgConversionRate: 2.64,
      avgCostPerClick: 1.55,
      avgROI: 250,
      avgCustomerLifetimeValue: 540
    },
    'finance': {
      avgConversionRate: 1.96,
      avgCostPerClick: 3.77,
      avgROI: 480,
      avgCustomerLifetimeValue: 2100
    },
    'real-estate': {
      avgConversionRate: 1.84,
      avgCostPerClick: 2.37,
      avgROI: 320,
      avgCustomerLifetimeValue: 15000
    }
  };

  const platformModifiers = {
    'google': 1.0,
    'facebook': 0.85,
    'instagram': 0.92,
    'linkedin': 1.15,
    'twitter': 0.78,
    'tiktok': 0.65,
    'youtube': 1.08
  };

  const industryKey = industry.toLowerCase().replace(/\s+/g, '-');
  const baseBenchmark = benchmarks[industryKey] || benchmarks['e-commerce'];
  const platformMultiplier = platformModifiers[platform.toLowerCase()] || 1.0;

  return {
    industry: industryKey,
    platform: platform.toLowerCase(),
    benchmarks: {
      avgConversionRate: Math.round(baseBenchmark.avgConversionRate * platformMultiplier * 100) / 100,
      avgCostPerClick: Math.round(baseBenchmark.avgCostPerClick * platformMultiplier * 100) / 100,
      avgROI: Math.round(baseBenchmark.avgROI * platformMultiplier),
      avgCustomerLifetimeValue: Math.round(baseBenchmark.avgCustomerLifetimeValue * platformMultiplier)
    },
    platformMultiplier,
    competitivePosition: 'Data needed for comparison'
  };
}