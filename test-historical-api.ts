import express from 'express';
import * as dotenv from 'dotenv';
dotenv.config();

async function testApi() {
  try {
    const { analyticsService } = await import('./server/services/AnalyticsService.ts');
    
    // Fake req/res to test the controller logic directly
    const workspaceId = '684402c2fd2cd4eb6521b386';
    const days = 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analytics = await analyticsService.getAnalyticsByDateRange({
      workspaceId,
      startDate,
      endDate
    });

    const historicalData = analytics.map((a: any) => ({
      date: a.date || a.createdAt,
      followers: a.followers || 0,
      likes: a.likes || 0,
      comments: a.comments || 0,
      shares: a.shares || 0,
      reach: a.reach || 0,
      engagement: a.engagement || 0,
      views: a.views || 0,
      metrics: {
        posts: a.customMetrics?.posts || 0,
        contentScore: { score: a.engagement || 5 }
      }
    }));

    console.log('API Response length:', historicalData.length);
    if (historicalData.length > 0) {
      console.log('First record date:', historicalData[0].date, 'followers:', historicalData[0].followers);
      console.log('Last record date:', historicalData[historicalData.length-1].date, 'followers:', historicalData[historicalData.length-1].followers);
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
testApi();
