import fs from 'fs';
import path from 'path';

const apiPath = path.join(process.cwd(), 'server', 'services', 'instagramApi.ts');
let code = fs.readFileSync(apiPath, 'utf-8');

const mockStr = `
    // --- MOCK DATA FOR DEMO PURPOSES ---
    // Prevent the background worker from resetting our dense realistic analytics to 0
    account.followers_count = 805; // Slightly higher than 800 baseline
    aggregated.totalLikes = 1520; // Slightly higher than 1500 baseline
    aggregated.totalImpressions = 17300; // Slightly higher than 15000 baseline
    aggregated.totalReach = 12132; // Slightly higher than 12000 baseline
    insights.reach = 12132;
    // -----------------------------------
`;

code = code.replace(mockStr, '');

fs.writeFileSync(apiPath, code);
console.log("Reverted instagramApi.ts");
