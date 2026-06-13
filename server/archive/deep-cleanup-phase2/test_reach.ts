import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function run() {
  let mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
  }
  await mongoose.connect(mongoUri);
  
  const metrics = await mongoose.connection.collection('metrics').find().sort({ date: -1 }).limit(5).toArray();
  for (const m of metrics) {
    console.log(m.date, 'reach:', m.reach, 'reachDay:', m.reachDay, 'reachWeek:', m.reachWeek, 'reachDays28:', m.reachDays28);
  }
  
  process.exit(0);
}
run();
