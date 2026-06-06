import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const trends = await mongoose.connection.db.collection('listening_trends').find({ workspaceId: '684402c2fd2cd4eb6521b386' }).toArray();
  for (const t of trends) {
    const randomVol = Math.floor(Math.random() * 80) + 20; // 20 to 100
    const randomVel = Math.floor(Math.random() * 60) + 10; // 10 to 70
    await mongoose.connection.db.collection('listening_trends').updateOne(
      { _id: t._id },
      { $set: { volume: randomVol, velocityScore: randomVel } }
    );
  }
  console.log("Fixed volumes!");
  await mongoose.disconnect();
}
check().catch(console.error);
