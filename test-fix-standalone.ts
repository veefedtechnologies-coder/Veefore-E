
import { InstagramApiService } from './server/services/instagramApi';
import axios from 'axios';
import assert from 'assert';

// Simple mock for axios.get
const originalGet = axios.get;
(axios as any).get = (url: string) => {
    console.log('🔍 APICall:', url);

    if (url.includes('/me?fields=')) {
        return Promise.resolve({
            data: {
                id: '12345',
                username: 'test_user',
                account_type: 'BUSINESS',
                followers_count: 3
            }
        });
    }

    if (url.includes('/insights') && url.includes('period=days_28')) {
        // Verify filtering
        if (url.includes('profile_views') || url.includes('website_clicks')) {
            console.log('❌ FAIL: Request contains invalid metrics for days_28');
            return Promise.reject(new Error('400 - Invalid metric for period days_28'));
        }

        console.log('✅ PASS: Request for days_28 is correctly filtered');
        return Promise.resolve({
            data: {
                data: [
                    {
                        name: 'reach',
                        period: 'days_28',
                        values: [{ value: 1547, end_time: '2026-02-08T00:00:00+0000' }]
                    }
                ]
            }
        });
    }

    if (url.includes('/media?')) {
        return Promise.resolve({ data: { data: [] } });
    }

    return Promise.reject(new Error('Unhandled URL'));
};

async function testFix() {
    try {
        const result = await InstagramApiService.getComprehensiveMetrics('mock-token', '12345');
        console.log('--- TEST RESULT ---');
        console.log('Reach:', result.insights.reach);
        console.log('Aggregated Reach:', result.aggregated.totalReach);

        assert.strictEqual(result.insights.reach, 1547, 'Reach should be 1547');
        console.log('🎉 SUCCESS: Reach correctly captured from 28-day insights even with no media!');
    } catch (err: any) {
        console.error('❌ TEST FAILED:', err.message);
    } finally {
        (axios as any).get = originalGet;
        process.exit(0);
    }
}

testFix();
