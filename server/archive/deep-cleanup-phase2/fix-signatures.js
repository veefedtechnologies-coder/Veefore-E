import fs from 'fs';
import path from 'path';

const fixes = {
  'content-theft-ai.ts': [{ find: 'export async function analyzeContentTheft(mediaBuffer: Buffer, description: string = \'\') {', replace: 'export async function analyzeContentTheft(mediaBuffer: Buffer, description: string = \'\', preferences: any = {}) {' }],
  'emotion-analysis-ai.ts': [{ find: 'export async function analyzeEmotionAndSentiment(content: string, mediaBuffer?: Buffer) {', replace: 'export async function analyzeEmotionAndSentiment(content: string, mediaBuffer?: Buffer, preferences: any = {}) {' }],
  'roi-calculator-ai.ts': [{ find: 'export async function calculateCampaignROI(campaignData: any) {', replace: 'export async function calculateCampaignROI(campaignData: any, preferences: any = {}) {' }],
  'smart-legal-ai.ts': [
    { find: 'export async function checkCopyrightCompliance(content: string, mediaBuffer?: Buffer) {', replace: 'export async function checkCopyrightCompliance(content: string, mediaBuffer?: Buffer, preferences: any = {}) {' },
    { find: 'export async function generateDisclaimers(content: string, platform: string, industry: string) {', replace: 'export async function generateDisclaimers(content: string, platform: string, industry: string, preferences: any = {}) {' }
  ],
  'social-listening-ai.ts': [{ find: 'export async function generateSocialListeningInsights(brandMentions: any[], industryKeywords: any[]) {', replace: 'export async function generateSocialListeningInsights(brandMentions: any[], industryKeywords: any[], preferences: any = {}) {' }],
  'trend-intelligence-ai.ts': [{ find: 'export async function generateTrendIntelligence(niche: string, targetAudience: string) {', replace: 'export async function generateTrendIntelligence(niche: string, targetAudience: string, preferences: any = {}) {' }],
  'trending-topics-api.ts': [{ find: 'async getTrendingTopics(category: string = \'Business and Finance\')', replace: 'async getTrendingTopics(category: string = \'Business and Finance\', preferences: any = {})' }],
  'viral-predictor-ai.ts': [{ find: 'export async function predictViralPotential(postData: any, mediaBuffer?: Buffer) {', replace: 'export async function predictViralPotential(postData: any, mediaBuffer?: Buffer, preferences: any = {}) {' }],
  'creative-brief-ai.ts': [{ find: 'export async function generateCreativeBrief(campaignContext: any) {', replace: 'export async function generateCreativeBrief(campaignContext: any, preferences: any = {}) {' }],
  'ai-growth-insights.ts': [{ find: 'export async function generateAIGrowthInsights(data: any) {', replace: 'export async function generateAIGrowthInsights(data: any, preferences: any = {}) {' }],
  'content-repurpose-ai.ts': [{ find: 'export async function repurposeContent(content: string, sourcePlatform: string, targetPlatforms: string[]) {', replace: 'export async function repurposeContent(content: string, sourcePlatform: string, targetPlatforms: string[], preferences: any = {}) {' }],
  'competitor-analysis-ai.ts': [{ find: 'export async function generateCompetitorAnalysis(request: CompetitorAnalysisRequest) {', replace: 'export async function generateCompetitorAnalysis(request: CompetitorAnalysisRequest, preferences: any = {}) {' }]
};

for (const [f, replacements] of Object.entries(fixes)) {
  const filepath = path.join('/Users/arpitchoudhary/Downloads/Veefore_v3/Veefore-E/server', f);
  if (!fs.existsSync(filepath)) continue;
  
  let content = fs.readFileSync(filepath, 'utf8');
  for (const { find, replace } of replacements) {
    content = content.replace(find, replace);
  }
  fs.writeFileSync(filepath, content);
}
console.log('Fixed signatures');
