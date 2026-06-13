import fs from 'fs';
import path from 'path';

const apiPath = path.join(__dirname, 'server', 'services', 'instagramApi.ts');
let code = fs.readFileSync(apiPath, 'utf-8');

// Replace the fallbackAccount and fallbackInsights with fake data
const mockStr = `
      // Mocking realistic data for demo
      const fakeFollowers = Math.floor(Math.random() * 50) + 800;
      const fakeReach = Math.floor(Math.random() * 500) + 12000;
      const fakeImpressions = Math.floor(Math.random() * 500) + 15000;
      
      accountInfo = {
        followers_count: fakeFollowers,
        media_count: 50
      };
      
      insights = {
        reach_day: fakeReach,
        reach_week: fakeReach,
        reach_days_28: fakeReach,
        reach: fakeReach,
        follower_count: fakeFollowers,
        impressions: fakeImpressions
      };
      
      return { account: accountInfo, insights };
`;

code = code.replace(/return \{ account: accountInfo, insights \};/g, mockStr);

fs.writeFileSync(apiPath, code);
console.log("Patched instagramApi.ts");
