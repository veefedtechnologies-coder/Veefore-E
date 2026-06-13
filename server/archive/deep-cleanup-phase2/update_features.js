const fs = require('fs');
const path = require('path');

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
  
  // 1. Ensure preferences is added to generateJSON
  content = content.replace(/aiServiceManager\.generateJSON\(([^,]+),\s*\{\}\)/g, 'aiServiceManager.generateJSON($1, preferences)');
  
  // 2. We need to add `preferences: any = {}` to the main function signatures of these files.
  // This is tricky using regex, let's just log what functions need updates.
  console.log(`Updated generateJSON calls in ${f}. Please check function signatures.`);
  fs.writeFileSync(filepath, content);
}
