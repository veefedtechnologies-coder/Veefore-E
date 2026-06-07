/**
 * Test script for Task 12.2: Hashtag Relevance Scoring
 * 
 * Tests:
 * 1. Enhanced scoreHashtagRelevance with performance data
 * 2. Hashtag performance tracking
 * 3. Performance-based recommendations
 * 4. Niche-specific insights
 */

import mongoose from 'mongoose';
import { hashtagGeneratorService } from './server/services/HashtagGeneratorService';
import { hashtagPerformanceRepository } from './server/repositories/HashtagPerformanceRepository';

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/';
  await mongoose.connect(mongoUri);
}

async function testHashtagRelevanceScoring() {
  console.log('🚀 Testing Hashtag Relevance Scoring (Task 12.2)\n');

  try {
    // Connect to database
    console.log('📦 Connecting to database...');
    await connectDB();
    console.log('✅ Database connected\n');

    // Test 1: Track some hashtag performance
    console.log('📊 Test 1: Tracking Hashtag Performance');
    console.log('='.repeat(50));
    
    const testHashtags = ['fitness', 'workout', 'gymlife', 'fitnessmotivation', 'healthylifestyle'];
    const testPerformance = {
      likes: 150,
      comments: 12,
      saves: 25,
      shares: 5,
      impressions: 2500,
      reach: 2000
    };

    console.log(`Tracking ${testHashtags.length} hashtags with performance:`);
    console.log(`  Impressions: ${testPerformance.impressions}`);
    console.log(`  Engagement: ${testPerformance.likes + testPerformance.comments + testPerformance.saves + testPerformance.shares}`);
    console.log(`  Engagement Rate: ${((testPerformance.likes + testPerformance.comments + testPerformance.saves + testPerformance.shares) / testPerformance.impressions * 100).toFixed(2)}%`);
    
    await hashtagGeneratorService.trackHashtagPerformance(
      testHashtags,
      testPerformance,
      'fitness',
      'test_post_1',
      'post'
    );
    
    console.log('✅ Performance tracking completed\n');

    // Test 2: Track another post with different performance
    console.log('📊 Test 2: Tracking Second Post Performance');
    console.log('='.repeat(50));
    
    const testHashtags2 = ['fitness', 'gym', 'fitfam', 'gains', 'bodybuilding'];
    const testPerformance2 = {
      likes: 200,
      comments: 18,
      saves: 35,
      shares: 8,
      impressions: 3000,
      reach: 2500
    };

    await hashtagGeneratorService.trackHashtagPerformance(
      testHashtags2,
      testPerformance2,
      'fitness',
      'test_post_2',
      'post'
    );
    
    console.log('✅ Second post tracking completed\n');

    // Test 3: Get performance-based recommendations
    console.log('🎯 Test 3: Performance-Based Recommendations');
    console.log('='.repeat(50));
    
    const themes = ['workout', 'training', 'muscle'];
    
    console.log(`Requesting recommendations for themes: ${themes.join(', ')}`);
    
    const highRecs = await hashtagGeneratorService.getPerformanceBasedRecommendations(
      'fitness',
      themes,
      'high',
      5
    );
    
    const mediumRecs = await hashtagGeneratorService.getPerformanceBasedRecommendations(
      'fitness',
      themes,
      'medium',
      5
    );
    
    const lowRecs = await hashtagGeneratorService.getPerformanceBasedRecommendations(
      'fitness',
      themes,
      'low',
      5
    );

    console.log('\nHigh Competition Recommendations:');
    highRecs.forEach((rec, i) => {
      console.log(`  ${i + 1}. #${rec.hashtag} (${rec.avgEngagementRate.toFixed(2)}% engagement, used ${rec.usageCount}x)`);
    });
    
    console.log('\nMedium Competition Recommendations:');
    mediumRecs.forEach((rec, i) => {
      console.log(`  ${i + 1}. #${rec.hashtag} (${rec.avgEngagementRate.toFixed(2)}% engagement, used ${rec.usageCount}x)`);
    });
    
    console.log('\nLow Competition Recommendations:');
    lowRecs.forEach((rec, i) => {
      console.log(`  ${i + 1}. #${rec.hashtag} (${rec.avgEngagementRate.toFixed(2)}% engagement, used ${rec.usageCount}x)`);
    });

    console.log('\n✅ Performance-based recommendations generated\n');

    // Test 4: Get niche insights
    console.log('📈 Test 4: Niche Hashtag Insights');
    console.log('='.repeat(50));
    
    const insights = await hashtagGeneratorService.getNicheHashtagInsights('fitness');
    
    console.log(`Total Tracked Hashtags: ${insights.totalTrackedHashtags}`);
    console.log(`Average Engagement Rate: ${insights.avgEngagementRate.toFixed(2)}%`);
    
    console.log('\nTop Performing Hashtags:');
    insights.topPerformers.slice(0, 5).forEach((perf, i) => {
      console.log(`  ${i + 1}. #${perf.hashtag} (${perf.engagementRate.toFixed(2)}%)`);
    });
    
    console.log('\nPerformance by Competition:');
    console.log(`  High: ${insights.performanceByCompetition.high.count} hashtags, ${insights.performanceByCompetition.high.avgEngagement.toFixed(2)}% avg`);
    console.log(`  Medium: ${insights.performanceByCompetition.medium.count} hashtags, ${insights.performanceByCompetition.medium.avgEngagement.toFixed(2)}% avg`);
    console.log(`  Low: ${insights.performanceByCompetition.low.count} hashtags, ${insights.performanceByCompetition.low.avgEngagement.toFixed(2)}% avg`);

    console.log('\n✅ Niche insights retrieved\n');

    // Test 5: Generate hashtags with performance-based scoring
    console.log('🏷️  Test 5: Generate Hashtags with Enhanced Scoring');
    console.log('='.repeat(50));
    
    const result = await hashtagGeneratorService.generateStrategicHashtags({
      caption: 'Amazing workout session today! Feeling stronger every day. Time to build those gains! 💪',
      mediaAnalysis: 'Person doing deadlifts in gym with weights',
      niche: 'fitness',
      platform: 'instagram',
      postType: 'post',
      targetCount: 20
    });

    console.log(`Generated ${result.hashtags.length} hashtags`);
    console.log('\nBreakdown:');
    console.log(`  High Competition: ${result.breakdown.high.length}`);
    console.log(`  Medium Competition: ${result.breakdown.medium.length}`);
    console.log(`  Low Competition: ${result.breakdown.low.length}`);
    console.log(`  Branded: ${result.breakdown.branded.length}`);
    
    console.log('\nPerformance Estimate:');
    console.log(`  Discoverability: ${result.performanceEstimate.discoverabilityScore}/100`);
    console.log(`  Ranking Potential: ${result.performanceEstimate.rankingPotential}/100`);
    console.log(`  Overall Score: ${result.performanceEstimate.overall}/100`);

    console.log('\nSample Hashtags:');
    result.hashtags.slice(0, 10).forEach((tag, i) => {
      console.log(`  ${i + 1}. #${tag}`);
    });

    console.log('\n✅ Enhanced hashtag generation completed\n');

    // Summary
    console.log('=' .repeat(50));
    console.log('✨ All Task 12.2 Tests Completed Successfully!');
    console.log('=' .repeat(50));
    console.log('\nImplemented Features:');
    console.log('  ✅ Enhanced content-to-hashtag relevance scorer');
    console.log('  ✅ Niche-specific hashtag performance tracker');
    console.log('  ✅ Engagement-based hashtag ranking');
    console.log('  ✅ Performance-based recommendations');
    console.log('  ✅ Niche-specific insights and analytics');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testHashtagRelevanceScoring();
