import { PostWorker } from './server/workers/postWorker.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  console.log("Starting test");
  const p = PostWorker.start({});
  
  let resolved = false;
  p.then(() => { resolved = true; });
  
  await new Promise(r => setTimeout(r, 2000));
  console.log("Resolved:", resolved);
  process.exit(0);
}
test();
