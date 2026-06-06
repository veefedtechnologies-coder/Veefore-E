import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { RedditAdapter } from '../services/social-listening/adapters/RedditAdapter';
import { YouTubeAdapter } from '../services/social-listening/adapters/YouTubeAdapter';
import { TrendEngineService } from '../services/social-listening/trend-engine.service';
import { ListeningPostModel } from '../models/SocialListening/ListeningPost';
import { AIExtractionService } from '../services/social-listening/ai-extraction.service';
import { ListeningHookModel } from '../models/SocialListening/ListeningHook';
import { ListeningTrendModel } from '../models/SocialListening/ListeningTrend';
import { ListeningAggregationModel } from '../models/SocialListening/ListeningAggregation';

async function run() {
  try {
    // CONNECT TO THE CORRECT DATABASE!
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    console.log('✅ Connected to MongoDB (veeforedb)');

    const allWorkspaces = await mongoose.connection.collection('workspaces').find({}).toArray();
    const workspaces = allWorkspaces.filter(w => w._id.toString() === '684402c2fd2cd4eb6521b386');
    console.log(`Found ${workspaces.length} target workspaces in veeforedb.`);

    // 1. Fetch from Adapters ONE time
    console.log('🔄 Fetching from Reddit (Creator Burnout)...');
    const reddit = new RedditAdapter();
    const redditRes = await reddit.fetchLatest({ workspaceId: 'temp', platform: 'reddit', value: 'Creator Burnout', type: 'keyword' } as any);
    
    console.log('🔄 Fetching from YouTube (AI Automation)...');
    const yt = new YouTubeAdapter();
    const ytRes = await yt.fetchLatest({ workspaceId: 'temp', platform: 'youtube', value: 'AI Automation', type: 'keyword' } as any);
    
    const allPosts = [...redditRes.posts, ...ytRes.posts];

    // 2. Clear old data for THIS workspace to prevent confusion
    const targetId = '684402c2fd2cd4eb6521b386';
    await ListeningPostModel.deleteMany({ workspaceId: targetId });
    await ListeningHookModel.deleteMany({ workspaceId: targetId });
    await ListeningTrendModel.deleteMany({ workspaceId: targetId });
    await ListeningAggregationModel.deleteMany({ workspaceId: targetId });

    // 3. For EVERY workspace, save the posts and run the engine
    for (const ws of workspaces) {
      const wid = ws._id.toString();
      console.log(`🧠 Processing for workspace: ${wid}`);
      
      for (const post of allPosts.slice(0, 8)) { // 8 posts
        post.publishedAt = new Date();
        
        const savedPost = await ListeningPostModel.create({
          workspaceId: wid,
          sourceId: 'mock-source-id',
          ...post,
          externalId: post.externalId + '_' + wid // Make it unique per workspace
        });
        
        const insight = await AIExtractionService.analyzeContent(post.content || post.title, post.platform);
        
        if (insight) {
          await ListeningPostModel.updateOne(
            { _id: savedPost._id },
            { 
              $set: { 
                status: 'analyzed',
                aiMetadata: {
                  sentimentScore: insight.sentimentScore,
                  topics: insight.topics,
                  painPoints: insight.painPoints,
                  hooks: insight.opportunities
                }
              }
            }
          );

          for (const hookStr of insight.opportunities) {
            await ListeningHookModel.create({
              workspaceId: wid,
              postId: savedPost._id,
              sourcePostId: savedPost.externalId,
              platform: post.platform,
              type: 'hook',
              content: hookStr,
              score: Math.floor(Math.random() * 30) + 70,
              topics: insight.topics.slice(0, 2)
            });
          }
          for (const ppStr of insight.painPoints) {
            await ListeningHookModel.create({
              workspaceId: wid,
              postId: savedPost._id,
              sourcePostId: savedPost.externalId,
              platform: post.platform,
              type: 'pain_point',
              content: ppStr,
              score: Math.floor(Math.random() * 30) + 70,
              topics: insight.topics.slice(0, 2)
            });
          }
        }
      }

      console.log(`📈 Running Trend Engine for ${wid}...`);
      await TrendEngineService.calculateTrends(wid, 24);
    }

    console.log('🎉 Done! Refresh the dashboard.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
