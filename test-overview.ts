import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const ListeningTrendModel = mongoose.model('ListeningTrend', new mongoose.Schema({
    workspaceId: String,
    status: String
  }, { collection: 'listening_trends' }));

  const activeTrends = await ListeningTrendModel.countDocuments({
    workspaceId: "684402c2fd2cd4eb6521b386",
    status: { $ne: 'Declining' }
  });
  console.log("ACTIVE TRENDS VIA MONGOOSE:", activeTrends);
  
  await mongoose.disconnect();
}
check().catch(console.error);
