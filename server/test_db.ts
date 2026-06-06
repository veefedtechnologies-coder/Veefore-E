import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function run() {
  let mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
  }
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const total = await mongoose.connection.collection('contents').countDocuments();
  const veefore = await mongoose.connection.collection('contents').countDocuments({ isImported: { $ne: true }, 'contentData.media_type': { $exists: false } });
  const importedNew = await mongoose.connection.collection('contents').countDocuments({ isImported: true });
  const importedOld = await mongoose.connection.collection('contents').countDocuments({ 'contentData.media_type': { $exists: true } });
  const veeforeNoLegacy = await mongoose.connection.collection('contents').countDocuments({ isImported: { $ne: true } });
  
  console.log({ total, veefore, importedNew, importedOld, veeforeNoLegacy });
  
  process.exit(0);
}
run();
