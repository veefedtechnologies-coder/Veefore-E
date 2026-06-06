import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { ListeningTrendModel } from './server/models/SocialListening/ListeningTrend';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const trends = await ListeningTrendModel.find({ workspaceId: '684402c2fd2cd4eb6521b386', status: { $ne: 'Declining' } })
      .sort({ velocityScore: -1 })
      .limit(30);

    const clusters = trends.map(t => ({
      topic: t.topic,
      volume: t.mentionVolume,
      velocity: t.velocityScore,
      sentiment: t.averageSentiment
    }));
  console.log(clusters);
  await mongoose.disconnect();
}
check().catch(console.error);
