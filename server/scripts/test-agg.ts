import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });
import { ListeningPostModel } from '../models/SocialListening/ListeningPost';

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Just pick the first workspace ID we see in posts
    const post = await ListeningPostModel.findOne({});
    const wid = post?.workspaceId;
    console.log('Testing with workspaceId:', wid);

    const matchQuery = { workspaceId: wid, publishedAt: { $gte: today } };
    console.log('Match query:', matchQuery);
    
    const count = await ListeningPostModel.countDocuments(matchQuery);
    console.log('Count matches:', count);

    const dailyStats = await ListeningPostModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalPosts: { $sum: 1 },
          totalComments: { $sum: "$metrics.comments" },
          totalEngagement: { $sum: { $add: ["$metrics.likes", "$metrics.comments"] } },
          avgSentiment: { $avg: "$aiMetadata.sentimentScore" },
          positiveMentions: { $sum: { $cond: [{ $gt: ["$aiMetadata.sentimentScore", 0.3] }, 1, 0] } },
          negativeMentions: { $sum: { $cond: [{ $lt: ["$aiMetadata.sentimentScore", -0.3] }, 1, 0] } },
          neutralMentions: { $sum: { $cond: [{ $and: [{ $lte: ["$aiMetadata.sentimentScore", 0.3] }, { $gte: ["$aiMetadata.sentimentScore", -0.3] }] }, 1, 0] } }
        }
      }
    ]);
    console.log('Result:', JSON.stringify(dailyStats, null, 2));

    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
