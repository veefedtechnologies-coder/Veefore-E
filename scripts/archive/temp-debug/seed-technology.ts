import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const workspaceId = "684402c2fd2cd4eb6521b386"; // User's workspace ID

  const posts = [
    {
      sourceId: "tech-yt-1", workspaceId, platform: "youtube", externalId: "tech-yt-001",
      url: "https://www.youtube.com/watch?v=tech1",
      content: "The future of Technology and AI is here! In this video I review the latest tech gadgets.",
      title: "Latest Technology Review 2026",
      author: { username: "TechGuru", profileUrl: "https://youtube.com/@TechGuru" },
      metrics: { likes: 25000, comments: 3400, views: 500000 },
      publishedAt: new Date(),
      aiMetadata: { sentiment: "positive", sentimentScore: 0.9, topics: ["Technology", "Gadgets"], analyzedAt: new Date() }
    },
    {
      sourceId: "tech-rd-1", workspaceId, platform: "reddit", externalId: "tech-rd-001",
      url: "https://reddit.com/r/technology/comments/1",
      content: "Has anyone noticed how fast Technology is advancing this year?",
      title: "Technology leaps in 2026",
      author: { username: "tech_enthusiast" },
      metrics: { likes: 5400, comments: 800 },
      publishedAt: new Date(),
      aiMetadata: { sentiment: "neutral", sentimentScore: 0.6, topics: ["Technology", "Discussion"], analyzedAt: new Date() }
    }
  ];

  const trends = [
    {
      workspaceId, topic: "Technology", relatedKeywords: ["tech", "gadgets", "future"],
      volume: 150000, velocityScore: 95, sentimentAverage: 0.8, status: "Rising",
      firstSeenAt: new Date(), lastSeenAt: new Date()
    },
    {
      workspaceId, topic: "AI Technology", relatedKeywords: ["ai", "tech"],
      volume: 85000, velocityScore: 88, sentimentAverage: 0.7, status: "Peak",
      firstSeenAt: new Date(), lastSeenAt: new Date()
    }
  ];

  const hooks = [
    {
      workspaceId, type: "hook", content: "The biggest Technology shift of the decade...",
      sourceContext: "YouTube Tech Review", score: 92, topics: ["Technology"],
      createdAt: new Date(), updatedAt: new Date()
    }
  ];

  await mongoose.connection.db.collection('listening_posts').insertMany(posts);
  await mongoose.connection.db.collection('listening_trends').insertMany(trends);
  await mongoose.connection.db.collection('listening_hooks').insertMany(hooks);

  console.log("Technology dummy data seeded!");
  await mongoose.disconnect();
}
seed().catch(console.error);
