import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { AutomationFunnelStateModel } from './models/Automation/AutomationFunnelState';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const states = await AutomationFunnelStateModel.find().sort({ createdAt: -1 }).limit(3).lean();
  console.log("Latest states:");
  console.dir(states, { depth: null });
  process.exit(0);
}
check();
