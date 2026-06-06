import { MongoStorage } from './server/mongodb-storage';

async function run() {
  const storage = new MongoStorage();
  await storage.connect();
  
  // Use the raw model
  const { ContentModel } = await import('./server/models/Content/Content');
  
  const contents = await ContentModel.find({}).limit(10);
  console.log(`Found ${contents.length} contents`);
  
  for (const c of contents) {
    console.log(`Title: ${c.title || c.contentData?.text}, mediaUrls: ${JSON.stringify(c.contentData?.mediaUrls)}`);
  }
  process.exit(0);
}

run().catch(console.error);
