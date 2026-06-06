import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  await mongoose.connection.db.collection('listening_posts').updateOne(
    { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { $set: { url: "https://www.youtube.com/watch?v=zSkv2ydB54M" } }
  );
  console.log("Fixed youtube URL!");
  await mongoose.disconnect();
}
fix().catch(console.error);
