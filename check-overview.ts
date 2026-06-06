import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const trendNicheQuery = {
    workspaceId: "684402c2fd2cd4eb6521b386",
    status: { $ne: 'Declining' }
  };
  const count = await mongoose.connection.db.collection('listening_trends').countDocuments(trendNicheQuery);
  console.log("ACTIVE TRENDS COUNT:", count);
  
  await mongoose.disconnect();
}
check().catch(console.error);
