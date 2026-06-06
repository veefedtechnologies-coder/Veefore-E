import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function debug() {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 20000 });
  console.log('Connected');

  const db = mongoose.connection.db;
  const analytics = await db?.collection('analytics').find({ workspaceId: '69f9c2996c1a882c06ec05eb' }).toArray();
  
  console.log(`Found ${analytics?.length} analytics records for workspace 69f9c2996c1a882c06ec05eb`);
  if (analytics && analytics.length > 0) {
    console.log('Latest record:', JSON.stringify(analytics[analytics.length - 1], null, 2));
  }

  const socialAccounts = await db?.collection('socialaccounts').find({ workspaceId: '69f9c2996c1a882c06ec05eb' }).toArray();
  console.log(`Found ${socialAccounts?.length} social accounts for workspace 69f9c2996c1a882c06ec05eb`);
  for (const acc of (socialAccounts || [])) {
    console.log(` - ${acc.username} (ID: ${acc._id}, platform: ${acc.platform})`);
  }

  process.exit(0);
}

debug().catch(console.error);
