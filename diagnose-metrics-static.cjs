const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

// Connect to DB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';

async function diagnose() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const Content = mongoose.model('Content', new mongoose.Schema({}, { strict: false }), 'contents');
  const Analytics = mongoose.model('Analytics', new mongoose.Schema({}, { strict: false }), 'analytics');

  // get the latest workspace
  const latestAnalytics = await Analytics.findOne().sort({ date: -1 });
  if (!latestAnalytics) {
    console.log('No analytics found');
    return;
  }

  const workspaceId = latestAnalytics.workspaceId;
  console.log('Diagnosing Workspace:', workspaceId);

  // 1. Check Analytics records
  const allAnalytics = await Analytics.find({ workspaceId }).sort({ date: -1 }).limit(10);
  console.log('\n--- Analytics Records (Last 10) ---');
  allAnalytics.forEach(a => {
    console.log(`Date: ${a.date.toISOString()} | Reach: ${a.reach} | Day: ${a.reachDay} | Week: ${a.reachWeek} | 28D: ${a.reachDays28} | Followers: ${a.followers}`);
  });

  // 2. Check Content counts
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const total = await Content.countDocuments({ workspaceId });
  const publishedCount = await Content.countDocuments({ workspaceId, status: 'published' });
  const PUBLISHEDCount = await Content.countDocuments({ workspaceId, status: 'PUBLISHED' });
  
  const dailyPosts = await Content.countDocuments({ 
    workspaceId, 
    status: /published/i,
    publishedAt: { $gte: dayAgo } 
  });
  const weeklyPosts = await Content.countDocuments({ 
    workspaceId, 
    status: /published/i,
    publishedAt: { $gte: weekAgo } 
  });

  console.log('\n--- Content Counts ---');
  console.log(`Total Documents: ${total}`);
  console.log(`Status 'published' (lower): ${publishedCount}`);
  console.log(`Status 'PUBLISHED' (upper): ${PUBLISHEDCount}`);
  console.log(`Daily Posts (last 24h, case-insensitive): ${dailyPosts}`);
  console.log(`Weekly Posts (last 7d, case-insensitive): ${weeklyPosts}`);

  // Check one content item
  const oneContent = await Content.findOne({ workspaceId, status: /published/i });
  if (oneContent) {
    console.log('\n--- Sample Content Item ---');
    console.log('ID:', oneContent._id);
    console.log('Status:', oneContent.status);
    console.log('PublishedAt:', oneContent.publishedAt);
  }

  process.exit(0);
}

diagnose().catch(err => {
  console.error(err);
  process.exit(1);
});
