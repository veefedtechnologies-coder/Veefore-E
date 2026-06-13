import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const db = mongoose.connection.db!;
  const collection = db.collection('analytics');
  
  await collection.updateOne(
    { _id: new mongoose.Types.ObjectId('6a12a75865a6b87f2cf43ad2') },
    { $set: { followers: 456 } }
  );
  
  await collection.updateOne(
    { _id: new mongoose.Types.ObjectId('6a12a2129c12b7f53a85fb3b') },
    { $set: { followers: 455 } }
  );
  
  console.log('Restored: Yesterday 456, Today 455');
  process.exit(0);
}
run().catch(console.error);
