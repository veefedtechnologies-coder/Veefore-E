import dotenv from 'dotenv';
dotenv.config({path: '../.env'});
import mongoose from 'mongoose';
import { AutomationFunnelStateModel } from './models/Automation/AutomationFunnelState';

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'veeforedb' });
  
  // Delete corrupted documents
  const result = await AutomationFunnelStateModel.deleteMany({
    participantId: { $exists: false }
  });
  console.log(`Deleted ${result.deletedCount} corrupted documents.`);

  process.exit(0);
}
fix();
