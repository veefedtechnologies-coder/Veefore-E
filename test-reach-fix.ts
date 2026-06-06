
import { InstagramApi } from './server/services/instagramApi';
import axios from 'axios';
import assert from 'assert';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

async function testFetch28DayReach() {
    console.log('🧪 Testing 28-day reach fetch logic...');

    const mockToken = 'EAAC_MOCK_TOKEN';
    const mockAccountId = '12345';

    // 1. Mock Account Info
    mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('/me?fields=')) {
            return Promise.resolve({
                data: {
                    id: mockAccountId,
                    username: 'test_user',
                    account_type: 'BUSINESS',
                    followers_count: 100
                }
            });
        }

        // 2. Mock Insights (28-day)
        if (url.includes('/insights') && url.includes('period=days_28')) {
            // Verify that profile_views and website_clicks are NOT present in the URL
            if (url.includes('profile_views') || url.includes('website_clicks')) {
                return Promise.reject(new Error('API Error: 400 - Invalid metric for period days_28'));
            }

            return Promise.resolve({
                data: {
                    data: [
                        {
                            name: 'reach',
                            period: 'days_28',
                            values: [{ value: 1500, end_time: '2026-02-08T00:00:00+0000' }]
                        },
                        {
                            name: 'impressions',
                            period: 'days_28',
                            values: [{ value: 5000, end_time: '2026-02-08T00:00:00+0000' }]
                        }
                    ]
                }
            });
        }

        // 3. Mock Media
        if (url.includes('/media?')) {
            return Promise.resolve({ data: { data: [] } });
        }

        return Promise.reject(new Error('Unhandled URL: ' + url));
    });

    try {
        const result = await InstagramApi.getComprehensiveMetrics(mockToken, mockAccountId, 7);

        console.log('✅ Result Reach:', result.insights.reach);
        assert.strictEqual(result.insights.reach, 1500, 'Reach should be 1500 from 28-day insights');
        console.log('✅ Reach correctly captured from 28-day insights');

    } catch (err: any) {
        console.error('❌ Test Failed:', err.message);
        process.exit(1);
    }
}

testFetch28DayReach();
