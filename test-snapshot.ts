import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const { analyticsService } = await import('./server/services');
  console.log('Running daily snapshot...');
  await analyticsService.generateDailySnapshot('684402c2fd2cd4eb6521b386');
  console.log('Done!');
  process.exit(0);
}
run().catch(console.error);
