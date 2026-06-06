import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function run() {
  let mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
  }
  await mongoose.connect(mongoUri, { dbName: 'veeforedb' });
  const records = await mongoose.connection.collection('analytics')
      .find({ workspaceId: '684402c2fd2cd4eb6521b386' })
      .sort({ date: -1 })
      .limit(3)
      .toArray();
      
  console.log('Analytics for rahulc1020:');
  records.forEach(r => console.log(r.date, "reach:", r.reach, "reachDay:", r.reachDay, "reachWeek:", r.reachWeek, "reachDays28:", r.reachDays28));
  
  process.exit(0);
}
run();
