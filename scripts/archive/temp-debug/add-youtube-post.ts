import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const newPost = {
    sourceId: "yt-channel-123",
    workspaceId: "684402c2fd2cd4eb6521b386",
    platform: "youtube",
    externalId: "yt-vid-001",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    content: "My Top 5 Secrets to Automating YouTube Shorts with AI! In this video I show you how to generate viral hooks...",
    title: "AI Automation Secrets",
    author: {
      username: "AI_Creator_Pro",
      profileUrl: "https://youtube.com/@AI_Creator_Pro"
    },
    metrics: {
      likes: 15420,
      comments: 1042,
      shares: 500,
      views: 120000
    },
    publishedAt: new Date(),
    aiMetadata: {
      sentiment: "positive",
      sentimentScore: 0.9,
      topics: ["AI Automation", "Growth"],
      analyzedAt: new Date()
    }
  };
  await mongoose.connection.db.collection('listening_posts').insertOne(newPost);
  console.log("Added YouTube post!");
  await mongoose.disconnect();
}
check().catch(console.error);
