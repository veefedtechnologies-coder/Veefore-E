import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function run() {
  let mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
  }
  await mongoose.connect(mongoUri, { dbName: 'veeforedb' });
  const metrics = await mongoose.connection.collection('metrics')
      .find({ workspaceId: '684402c2fd2cd4eb6521b386' })
      .sort({ createdAt: -1 })
      .toArray();
      
  console.log('Metrics for rahulc1020 workspace:', metrics.map(m => ({ 
    period: m.period, 
    date: m.date,
    reach: m.reach, 
    reachDay: m.reachDay,
    reachWeek: m.reachWeek,
    reachDays28: m.reachDays28,
    createdAt: m.createdAt
  })));
  
  process.exit(0);
}
run();
