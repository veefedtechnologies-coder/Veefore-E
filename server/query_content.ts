import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  let uri = process.env.MONGODB_URI || '';
  if (!uri.startsWith('mongodb')) {
    uri = `mongodb+srv://${uri}`;
  }
  await mongoose.connect(uri);
  console.log('Connected');
  
  const contents = await mongoose.connection.collection('contents').find({ status: 'published' }).toArray();
  console.log(`Total published: ${contents.length}`);
  
  const veeFore = contents.filter(c => c.isImported !== true && !c.contentData?.media_type);
  console.log(`VeeFore published: ${veeFore.length}`);
  
  const imported = contents.filter(c => c.isImported === true || c.contentData?.media_type);
  console.log(`Imported published: ${imported.length}`);
  
  process.exit(0);
}

run();
