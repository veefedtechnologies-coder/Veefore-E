import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function run() {
  let mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
  }
  await mongoose.connect(mongoUri);
  
  const platforms = await mongoose.connection.collection('workspace_platforms').find({}).toArray();
  console.log('Platforms:', platforms);
  
  const metrics = await mongoose.connection.collection('metrics').find().sort({ date: -1 }).limit(10).toArray();
  console.log('Recent Metrics:', metrics.map(m => ({ date: m.date, workspaceId: m.workspaceId, reach: m.reach, reachDay: m.reachDay })));
  
  process.exit(0);
}
run();
