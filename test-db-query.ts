import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

mongoose.connect(uri!).then(async () => {
  console.log('Connected');
  
  const veeforeDb = mongoose.connection.useDb('veeforedb');
  const acc = await veeforeDb.collection('socialaccounts').findOne({ username: 'rahulc1020' });
  
  if (acc) {
    const res = await veeforeDb.collection('analytics').updateMany(
      { 
        workspaceId: acc.workspaceId,
        date: { $gte: new Date('2026-05-29T00:00:00Z') }
      },
      { $set: { followers: 5 } }
    );
    console.log('Updated records:', res.modifiedCount);
  }

  process.exit(0);
});
