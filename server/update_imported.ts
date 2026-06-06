import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI || '');

const run = async () => {
  const db = mongoose.connection;
  await db.collection('contents').updateMany(
    { "contentData.id": { $exists: true }, "contentData.media_type": { $exists: true } },
    { $set: { isImported: true } }
  );
  console.log("Migration complete");
  process.exit(0);
};

run().catch(console.error);
