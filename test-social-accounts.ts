import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const account = await mongoose.connection.db.collection('socialaccounts').findOne({ workspaceId: "684402c2fd2cd4eb6521b386", platform: "instagram" });
  console.log(account);
  process.exit(0);
}
run().catch(console.error);
