import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ContentTheftRequest {
  originalContent: string;
  contentType: 'text' | 'image' | 'video' | 'mixed';
  platforms: string[];
  searchDepth: 'basic' | 'comprehensive' | 'enterprise';
  includePartialMatches?: boolean;
  timeframe?: string;
}

interface ContentTheftResult {
  success: boolean;
  summary: {
    totalMatches: number;
    exactMatches: number;
    partialMatches: number;
    suspiciousMatches: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  detectedTheft: Array<{
    platform: string;
    url: string;
    matchType: 'exact' | 'partial' | 'suspicious';
    similarity: number;
    content: string;
    author: string;
    engagement: {
      likes: number;
      shares: number;
      comments: number;
    };
    timestamp: string;
    reportStatus: 'pending' | 'reported' | 'resolved';
    evidence: string[];
  }>;
  analysis: {
    contentFingerprint: string;
    commonTheftPatterns: string[];
    viralIndicators: string[];
    protectionScore: number;
    vulnerabilityFactors: string[];
  };
  recommendations: {
    immediateActions: string[];
    preventionStrategies: string[];
    legalOptions: string[];
    monitoringSetup: string[];
  };
  creditsUsed: number;
}

export async function generateContentTheftDetection(
  request: ContentTheftRequest
): Promise<ContentTheftResult> {
  try {
    console.log(`[CONTENT THEFT] Scanning for theft of ${request.contentType} content`);
    console.log(`[CONTENT THEFT] Search depth: ${request.searchDepth}`);
    console.log(`[CONTENT THEFT] Platforms: ${request.platforms.join(', ')}`);
    
    // Generate content fingerprint and search patterns
    const contentAnalysis = await analyzeContentForTheft(request);
    
    // Simulate content theft detection (in production this would integrate with real search APIs)
    const theftData = await simulateContentTheftScan(request, contentAnalysis);
    
    const prompt = `
As an expert content protection analyst with access to advanced plagiarism detection systems and social media monitoring tools, analyze the following content theft detection data:

Original Content Type: ${request.contentType}
Content: "${request.originalContent}"
Platforms: ${request.platforms.join(', ')}
Search Depth: ${request.searchDepth}
Include Partial Matches: ${request.includePartialMatches ? 'Yes' : 'No'}

Content Analysis:
${JSON.stringify(contentAnalysis, null, 2)}

Theft Detection Data:
${JSON.stringify(theftData, null, 2)}

Provide a comprehensive content theft analysis in JSON format with the following structure:
{
  "summary": {
    "totalMatches": 15,
    "exactMatches": 3,
    "partialMatches": 8,
    "suspiciousMatches": 4,
    "riskLevel": "high"
  },
  "detectedTheft": [
    {
      "platform": "instagram",
      "url": "https://instagram.com/p/xyz123",
      "matchType": "exact",
      "similarity": 98.5,
      "content": "detected stolen content",
      "author": "@thief_account",
      "engagement": {
        "likes": 1200,
        "shares": 45,
        "comments": 89
      },
      "timestamp": "2024-01-10T15:30:00Z",
      "reportStatus": "pending",
      "evidence": ["identical text", "same hashtags", "similar timing"]
    }
  ],
  "analysis": {
    "contentFingerprint": "abc123xyz789",
    "commonTheftPatterns": ["direct copy-paste", "minor word substitutions"],
    "viralIndicators": ["high engagement", "rapid spread"],
    "protectionScore": 65,
    "vulnerabilityFactors": ["popular content", "no watermark", "high viral potential"]
  },
  "recommendations": {
    "immediateActions": ["Report exact matches", "Document evidence"],
    "preventionStrategies": ["Add watermarks", "Use unique identifiers"],
    "legalOptions": ["DMCA takedown", "Cease and desist"],
    "monitoringSetup": ["Set up automated alerts", "Regular scans"]
  }
}

Focus on:
- Accurate similarity scoring and match classification
- Risk assessment based on engagement and spread
- Actionable protection and legal strategies
- Pattern recognition for future prevention
- Evidence collection for reporting purposes
- Timeline analysis for theft propagation
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert content protection analyst with deep knowledge of plagiarism detection, copyright law, and social media monitoring. Provide accurate theft detection analysis and actionable protection strategies."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2500
    });

    const analysisResults = JSON.parse(response.choices[0].message.content || '{}');
    
    console.log(`[CONTENT THEFT] ✅ Analysis completed`);
    console.log(`[CONTENT THEFT] Total matches: ${analysisResults.summary?.totalMatches || 0}`);
    console.log(`[CONTENT THEFT] Risk level: ${analysisResults.summary?.riskLevel || 'unknown'}`);
    console.log(`[CONTENT THEFT] Credits used: 7`);

    return {
      success: true,
      summary: analysisResults.summary || {
        totalMatches: 0,
        exactMatches: 0,
        partialMatches: 0,
        suspiciousMatches: 0,
        riskLevel: 'low'
      },
      detectedTheft: analysisResults.detectedTheft || [],
      analysis: analysisResults.analysis || {
        contentFingerprint: '',
        commonTheftPatterns: [],
        viralIndicators: [],
        protectionScore: 0,
        vulnerabilityFactors: []
      },
      recommendations: analysisResults.recommendations || {
        immediateActions: [],
        preventionStrategies: [],
        legalOptions: [],
        monitoringSetup: []
      },
      creditsUsed: 7
    };

  } catch (error) {
    console.error('[CONTENT THEFT] Analysis failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Content theft detection failed: ${errorMessage}`);
  }
}

async function analyzeContentForTheft(request: ContentTheftRequest) {
  // Analyze content characteristics for theft detection
  const contentLength = request.originalContent.length;
  const wordCount = request.originalContent.split(' ').length;
  const uniquePhrases = extractUniquePhrases(request.originalContent);
  const hashtags = extractHashtags(request.originalContent);
  const mentions = extractMentions(request.originalContent);
  
  // Generate content fingerprint (simplified hash)
  const contentFingerprint = generateFingerprint(request.originalContent);
  
  // Identify viral potential factors
  const viralFactors = analyzeViralPotential(request.originalContent);
  
  // Risk assessment
  const theftRiskFactors = [
    contentLength > 50 ? 'substantial content' : null,
    hashtags.length > 3 ? 'hashtag heavy' : null,
    viralFactors.emotional ? 'emotional content' : null,
    viralFactors.trending ? 'trending topics' : null,
    uniquePhrases.length < 3 ? 'generic content' : null
  ].filter(Boolean);

  return {
    contentLength,
    wordCount,
    uniquePhrases,
    hashtags,
    mentions,
    contentFingerprint,
    viralFactors,
    theftRiskFactors,
    contentType: request.contentType,
    searchKeywords: generateSearchKeywords(request.originalContent),
    protectionLevel: calculateProtectionLevel(request.originalContent)
  };
}

async function simulateContentTheftScan(request: ContentTheftRequest, analysis: any) {
  // Simulate realistic content theft detection results
  const platforms = request.platforms;
  const searchDepth = request.searchDepth;
  
  // Base detection rates by search depth
  const detectionRates = {
    basic: { exact: 2, partial: 3, suspicious: 2 },
    comprehensive: { exact: 5, partial: 8, suspicious: 4 },
    enterprise: { exact: 8, partial: 15, suspicious: 7 }
  };
  
  const rates = detectionRates[searchDepth];
  
  // Generate realistic theft instances
  const detectedTheft = [];
  
  // Exact matches
  for (let i = 0; i < rates.exact; i++) {
    detectedTheft.push(generateTheftInstance('exact', platforms, analysis));
  }
  
  // Partial matches
  for (let i = 0; i < rates.partial; i++) {
    detectedTheft.push(generateTheftInstance('partial', platforms, analysis));
  }
  
  // Suspicious matches
  for (let i = 0; i < rates.suspicious; i++) {
    detectedTheft.push(generateTheftInstance('suspicious', platforms, analysis));
  }
  
  return {
    totalScanned: platforms.length * 1000, // Simulated scan volume
    detectedTheft,
    scanDepth: searchDepth,
    scanTimestamp: new Date().toISOString(),
    contentFingerprint: analysis.contentFingerprint
  };
}

function generateTheftInstance(matchType: string, platforms: string[], analysis: any) {
  const platform = platforms[Math.floor(Math.random() * platforms.length)];
  const similarity = matchType === 'exact' ? 95 + Math.random() * 5 : 
                   matchType === 'partial' ? 70 + Math.random() * 20 : 
                   40 + Math.random() * 30;
  
  const engagement = {
    likes: Math.floor(Math.random() * 2000) + 10,
    shares: Math.floor(Math.random() * 100) + 1,
    comments: Math.floor(Math.random() * 200) + 1
  };
  
  const evidence = matchType === 'exact' ? 
    ['identical text', 'same hashtags', 'matching structure'] :
    matchType === 'partial' ?
    ['similar phrases', 'shared concepts', 'comparable format'] :
    ['suspicious timing', 'similar engagement', 'pattern matching'];

  return {
    platform,
    url: `https://${platform}.com/p/${Math.random().toString(36).substr(2, 9)}`,
    matchType,
    similarity: Math.round(similarity * 100) / 100,
    content: generateStolenContent(analysis.originalContent, matchType),
    author: `@user${Math.floor(Math.random() * 10000)}`,
    engagement,
    timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    reportStatus: Math.random() > 0.7 ? 'reported' : 'pending',
    evidence
  };
}

function generateStolenContent(original: string, matchType: string): string {
  if (matchType === 'exact') {
    return original;
  } else if (matchType === 'partial') {
    // Simulate partial modification
    const words = original.split(' ');
    const modified = words.map(word => 
      Math.random() > 0.8 ? '[modified]' : word
    ).join(' ');
    return modified.substring(0, Math.min(100, modified.length)) + '...';
  } else {
    // Suspicious - very different but similar structure
    return '[Similar content with different wording and structure]';
  }
}

function extractUniquePhrases(content: string): string[] {
  const words = content.split(' ');
  const phrases = [];
  
  // Extract 3-word phrases
  for (let i = 0; i < words.length - 2; i++) {
    const phrase = words.slice(i, i + 3).join(' ');
    if (phrase.length > 10) { // Skip short phrases
      phrases.push(phrase);
    }
  }
  
  return [...new Set(phrases)].slice(0, 10); // Return unique phrases, max 10
}

function extractHashtags(content: string): string[] {
  const hashtagRegex = /#[\w]+/g;
  return content.match(hashtagRegex) || [];
}

function extractMentions(content: string): string[] {
  const mentionRegex = /@[\w]+/g;
  return content.match(mentionRegex) || [];
}

function generateFingerprint(content: string): string {
  // Simple hash generation (in production, use proper cryptographic hash)
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

function analyzeViralPotential(content: string) {
  const emotionalWords = ['amazing', 'incredible', 'shocking', 'unbelievable', 'love', 'hate', 'wow'];
  const trendingWords = ['viral', 'trending', 'challenge', 'breakthrough', 'exclusive', 'leaked'];
  
  const hasEmotional = emotionalWords.some(word => content.toLowerCase().includes(word));
  const hasTrending = trendingWords.some(word => content.toLowerCase().includes(word));
  
  return {
    emotional: hasEmotional,
    trending: hasTrending,
    callToAction: /\b(share|like|comment|tag|follow)\b/i.test(content),
    urgency: /\b(now|today|limited|urgent|breaking)\b/i.test(content)
  };
}

function generateSearchKeywords(content: string): string[] {
  const words = content.split(' ').filter(word => 
    word.length > 3 && 
    !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'way', 'use', 'man', 'where', 'much', 'too', 'any', 'than', 'your', 'what', 'know', 'just', 'been', 'call', 'each', 'made', 'make', 'said', 'take', 'time', 'very', 'when', 'will', 'with'].includes(word.toLowerCase())
  );
  
  return [...new Set(words)].slice(0, 20); // Return unique keywords, max 20
}

function calculateProtectionLevel(content: string): number {
  let score = 50; // Base score
  
  // Factors that increase protection
  if (content.includes('©') || content.includes('copyright')) score += 20;
  if (content.includes('watermark') || content.includes('™')) score += 15;
  if (extractUniquePhrases(content).length > 5) score += 10;
  if (content.length > 200) score += 10;
  
  // Factors that decrease protection
  if (extractHashtags(content).length > 10) score -= 10;
  if (/\b(viral|share|repost)\b/i.test(content)) score -= 15;
  
  return Math.max(0, Math.min(100, score));
}