/**
 * Verify Example Caption Library
 * 
 * Quick verification script to check the seeded caption library meets requirements
 */

import mongoose from 'mongoose';
import { ExampleCaptionModel } from '../models/AI/ExampleCaption';
import * as dotenv from 'dotenv';

dotenv.config();

async function verifyExampleCaptions() {
  try {
    console.log('🔍 Verifying Example Caption Library...\n');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable not found');
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');
    
    // Total count check
    const totalCount = await ExampleCaptionModel.countDocuments();
    console.log(`📊 Total Captions: ${totalCount}`);
    console.log(`   ${totalCount >= 1000 ? '✅' : '❌'} Requirement: 1000+ captions\n`);
    
    // Verify all required fields are populated
    const missingFields = await ExampleCaptionModel.countDocuments({
      $or: [
        { caption: { $exists: false } },
        { niche: { $exists: false } },
        { postType: { $exists: false } },
        { engagementRate: { $exists: false } },
        { captionLength: { $exists: false } }
      ]
    });
    console.log(`🔢 Missing Required Fields: ${missingFields}`);
    console.log(`   ${missingFields === 0 ? '✅' : '❌'} All captions have required fields\n`);
    
    // Check niche distribution
    const nicheCount = await ExampleCaptionModel.distinct('niche');
    console.log(`🏷️  Unique Niches: ${nicheCount.length}`);
    console.log(`   ${nicheCount.length >= 10 ? '✅' : '❌'} Requirement: Multiple niches covered\n`);
    
    // Check verified captions
    const verifiedCount = await ExampleCaptionModel.countDocuments({ verified: true });
    console.log(`✓ Verified Captions: ${verifiedCount} (${((verifiedCount / totalCount) * 100).toFixed(1)}%)`);
    console.log(`   ${verifiedCount === totalCount ? '✅' : '⚠️'} All seeded captions should be verified\n`);
    
    // Check engagement rate range
    const engagementStats = await ExampleCaptionModel.aggregate([
      {
        $group: {
          _id: null,
          avgRate: { $avg: '$engagementRate' },
          minRate: { $min: '$engagementRate' },
          maxRate: { $max: '$engagementRate' }
        }
      }
    ]);
    
    if (engagementStats.length > 0) {
      const { avgRate, minRate, maxRate } = engagementStats[0];
      console.log(`📈 Engagement Rate Statistics:`);
      console.log(`   Average: ${avgRate.toFixed(2)}%`);
      console.log(`   Min: ${minRate.toFixed(2)}%`);
      console.log(`   Max: ${maxRate.toFixed(2)}%`);
      console.log(`   ${avgRate >= 5 && avgRate <= 10 ? '✅' : '⚠️'} Expected range: 5-10%\n`);
    }
    
    // Check post type distribution
    const postTypeStats = await ExampleCaptionModel.aggregate([
      { $group: { _id: '$postType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    console.log(`📱 Post Type Distribution:`);
    postTypeStats.forEach(stat => {
      const percentage = ((stat.count / totalCount) * 100).toFixed(1);
      console.log(`   ${stat._id}: ${stat.count} (${percentage}%)`);
    });
    console.log(`   ${postTypeStats.length === 3 ? '✅' : '⚠️'} All post types represented\n`);
    
    // Sample a few captions to verify quality
    const sampleCaptions = await ExampleCaptionModel.find({ verified: true })
      .limit(3)
      .select('caption niche postType engagementRate captionLength');
    
    console.log(`📝 Sample Captions (Quality Check):`);
    sampleCaptions.forEach((caption, idx) => {
      console.log(`\n   ${idx + 1}. Niche: ${caption.niche} | Type: ${caption.postType}`);
      console.log(`      Engagement: ${caption.engagementRate.toFixed(1)}% | Length: ${caption.captionLength} chars`);
      console.log(`      Caption: ${caption.caption.substring(0, 100)}...`);
    });
    
    console.log('\n\n🎉 Verification Complete!\n');
    
  } catch (error) {
    console.error('❌ Error verifying captions:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('👋 Database connection closed');
  }
}

verifyExampleCaptions()
  .then(() => {
    console.log('\n✅ Verification script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification script failed:', error);
    process.exit(1);
  });
