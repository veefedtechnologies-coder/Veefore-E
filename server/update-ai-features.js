import fs from 'fs';
import path from 'path';

const features = [
  'roi-calculator-ai.ts',
  'trend-intelligence-ai.ts',
  'competitor-analysis-ai.ts',
  'emotion-analysis-ai.ts',
  'ai-growth-insights.ts',
  'creative-brief-ai.ts',
  'trending-topics-api.ts',
  'content-repurpose-ai.ts',
  'smart-legal-ai.ts',
  'social-listening-ai.ts',
  'content-theft-ai.ts',
  'viral-predictor-ai.ts'
];

for (const f of features) {
  const filepath = path.join('/Users/arpitchoudhary/Downloads/Veefore_v3/Veefore-E/server', f);
  if (!fs.existsSync(filepath)) continue;
  
  let content = fs.readFileSync(filepath, 'utf8');
  
  // Replace generateJSON(prompt, {}) with generateJSON(prompt, preferences)
  content = content.replace(/generateJSON\(([^,]+),\s*\{\}\)/g, 'generateJSON($1, preferences)');
  content = content.replace(/generateText\(([^,]+),\s*\{\}\)/g, 'generateText($1, preferences)');
  
  // Inject preferences into the main exported function/method signatures
  // For trending-topics-api.ts: async getTrendingTopics(category: string = 'Business and Finance') -> async getTrendingTopics(category: string = 'Business and Finance', preferences: any = {})
  content = content.replace(/getTrendingTopics\((category:[^)]+)\)/g, 'getTrendingTopics($1, preferences: any = {})');
  
  // For others exported functions
  // Exported functions usually look like: export async function generateX(req, ...) or export async function analyzeX(data, ...)
  // We can just add preferences parameter manually to those that need it. Let's do a basic global search and replace for the signatures.
  
  fs.writeFileSync(filepath, content);
}

console.log('Features updated');
