import dotenv from 'dotenv';
dotenv.config();

async function test() {
  console.log("REDIS_URL:", process.env.REDIS_URL);
  console.log("Connecting storage...");
  const { MongoStorage } = await import('./server/mongodb-storage.js');
  const storage = new MongoStorage();
  await storage.connect();
  
  console.log("Getting scheduler...");
  const { getSchedulerService, startSchedulerService } = await import('./server/scheduler-service.js');
  
  // start it
  startSchedulerService(storage as any);
  const scheduler = getSchedulerService();
  
  console.log("Scheduling mock item...");
  try {
    const result = await scheduler!.scheduleWithQueue({
      id: 'mock_content_123',
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60),
      workspaceId: 'workspace_123',
      platform: 'instagram',
      title: 'Mock post'
    });
    console.log("Result:", result);
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}
test();
