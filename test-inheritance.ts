import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function testInheritance() {
  try {
    const { analyticsService } = await import('./server/services/AnalyticsService.ts');
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    
    const workspaceId = '684402c2fd2cd4eb6521b386';
    
    // Test date: Tomorrow
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 1);

    console.log('Testing recordMetrics for new date:', testDate);
    const result = await analyticsService.recordMetrics({
      workspaceId,
      platform: 'instagram',
      date: testDate,
      followers: 460, // Some random live value
      likes: 10,
      comments: 5,
      shares: 0,
      views: 100,
      reach: 200,
      engagement: 2.5
    });

    console.log('New Record followers (should inherit from today!):', result.followers);
    console.log('New Record posts (should inherit from today!):', result.posts);
    console.log('New Record reach (should inherit from today!):', result.reach);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

testInheritance();
