import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function run() {
  let mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
  }
  await mongoose.connect(mongoUri);
  
  const WorkspacePlatform = mongoose.connection.collection('workspace_platforms');
  const platforms = await WorkspacePlatform.find({}).toArray();
  console.log('Platforms:', platforms.map(p => ({ platform: p.platform, isActive: p.isActive, accountId: p.accountId })));
  
  process.exit(0);
}
run();
