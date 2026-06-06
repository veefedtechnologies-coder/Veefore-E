import fs from 'fs';
const path = './server/services/SocialAccountService.ts';
let code = fs.readFileSync(path, 'utf8');

// 1. Fix totalViews from artificially growing
code = code.replace(
  /totalViews:\s*fetchInsights\s*\?\s*\(account\.totalViews\s*\|\|\s*0\)\s*\+\s*\(data\.insights\.impressions\s*\|\|\s*0\)\s*:\s*account\.totalViews,/g,
  'totalViews: fetchInsights ? Math.max(account.totalViews || 0, data.insights.impressions_days_28 || data.insights.impressions || 0) : account.totalViews,'
);

// 2. Fix totalLikes overwriting lifetime likes with recent media likes
// Wait, actually, let's just use data.aggregated.totalLikes but add it to a baseline if we want, 
// OR just rely on delta calculated from the previous data.aggregated.totalLikes.
// Let's check how totalLikes is computed.
