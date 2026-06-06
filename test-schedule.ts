import mongoose from 'mongoose';
import { MongoStorage } from './server/mongodb-storage.js';

async function test() {
  console.log("Connecting...");
  const storage = new MongoStorage();
  await storage.connect();
  
  console.log("Creating dummy content...");
  const { ContentModel } = await import('./server/models/Content.js');
  const content = await ContentModel.create({
    workspaceId: 'test_ws_123',
    type: 'post',
    title: 'test',
    status: 'draft',
    platform: 'instagram'
  });
  
  console.log("Scheduling...");
  const { contentService } = await import('./server/services/ContentService.js');
  
  const future = new Date(Date.now() + 1000 * 60 * 60); // 1 hr future
  
  try {
    const res = await contentService.scheduleContent(content._id.toString(), {
      scheduledAt: future,
      platform: 'instagram'
    });
    console.log("Success:", res.status);
  } catch (err) {
    console.error("Error:", err);
  }
  
  process.exit(0);
}
test();
