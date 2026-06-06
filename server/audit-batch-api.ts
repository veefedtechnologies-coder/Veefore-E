
import axios from 'axios';
import InstagramApiService from './services/instagramApi';
import dotenv from 'dotenv';

dotenv.config({ path: 'server/.env' });

async function runAudit() {
    const token = process.env.TEST_INSTAGRAM_TOKEN;
    const accountId = process.env.TEST_INSTAGRAM_ACCOUNT_ID;

    if (!token || !accountId) {
        console.log('❌ Skipping audit: Missing TEST_INSTAGRAM_TOKEN or TEST_INSTAGRAM_ACCOUNT_ID in .env');
        return;
    }

    console.log('\n🚀 Starting Instagram API Batch Audit\n');

    let apiCallCount = 0;
    const originalPost = axios.post;
    const originalGet = axios.get;

    // Intercept Axios calls
    (axios as any).post = async (...args: any[]) => {
        apiCallCount++;
        console.log(`[API AUDIT] POST Request #${apiCallCount}: ${args[0]}`);
        return (originalPost as any).apply(axios, args);
    };

    (axios as any).get = async (...args: any[]) => {
        apiCallCount++;
        console.log(`[API AUDIT] GET Request #${apiCallCount}: ${args[0]}`);
        return (originalGet as any).apply(axios, args);
    };

    try {
        console.log('Executing getComprehensiveMetrics (Batch Optimized)...');
        const start = Date.now();
        const result = await InstagramApiService.getComprehensiveMetrics(token, accountId);
        const duration = Date.now() - start;

        console.log('\n📊 AUDIT RESULTS:');
        console.log('----------------------------------------');
        console.log(`Total API Requests (External): ${apiCallCount}`);
        console.log(`Execution Duration: ${duration}ms`);
        console.log(`Account: @${result.account.username}`);
        console.log(`Posts Analyzed: ${result.recentMedia.length}`);
        console.log(`Total Reach (90D Aggregated): ${result.aggregated.totalReach}`);
        console.log(`Account Reach (28D Insight): ${result.insights.reach || 0}`);
        console.log('----------------------------------------\n');

        if (apiCallCount <= 3) {
            console.log('✅ SUCCESS: Batch API optimization confirmed (<= 3 calls for all data).');
        } else {
            console.log('⚠️ WARNING: More than 3 API calls detected. Verification needed.');
        }

    } catch (error: any) {
        console.error('❌ Audit Failed:', error.message);
    } finally {
        // Restore Axios
        axios.post = originalPost;
        axios.get = originalGet;
    }
}

runAudit();
