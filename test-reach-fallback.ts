import { SocialAccountService } from './server/services/SocialAccountService';
import InstagramApiService from './server/services/instagramApi';
import { socialAccountRepository } from './server/repositories/SocialAccountRepository';
import { analyticsService } from './server/services/AnalyticsService';

// Mocking dependencies
jest.mock('./server/services/instagramApi');
jest.mock('./server/repositories/SocialAccountRepository');
jest.mock('./server/services/AnalyticsService');

describe('Reach Fallback Logic', () => {
    let service: SocialAccountService;

    beforeEach(() => {
        service = new SocialAccountService();
        jest.clearAllMocks();
    });

    it('should apply fallback when Instagram API returns 0 reach', async () => {
        const mockAccount = {
            _id: '123',
            workspaceId: 'ws1',
            platform: 'instagram',
            username: 'testuser',
            accountId: 'ig123',
            accessToken: 'token',
            isActive: true,
        };

        (socialAccountRepository.findById as jest.Mock).mockResolvedValue(mockAccount);

        // Mock API returning 0 reach
        (InstagramApiService.getComprehensiveMetrics as jest.Mock).mockResolvedValue({
            account: { followers_count: 1000, follows_count: 50, media_count: 10, id: 'ig123', username: 'testuser' },
            insights: { reach: 0 },
            recentMedia: [],
            aggregated: { totalReach: 0, totalLikes: 100, totalComments: 20, totalShares: 5, totalSaves: 2, averageEngagementRate: 5 }
        });

        await service.syncAccount('123');

        // Verify fallback reach: 1000 * 1.2 = 1200
        expect(socialAccountRepository.updateMetrics).toHaveBeenCalledWith('123', expect.objectContaining({
            totalReach: 1200
        }));

        expect(analyticsService.recordMetrics).toHaveBeenCalledWith(expect.objectContaining({
            reach: 1200
        }));
    });
});
