import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const workspaces = await mongoose.connection.collection('workspaces').find({}).toArray();
    console.log('Workspaces:');
    workspaces.forEach(w => console.log(w._id.toString(), w.name));
    
    const aggregations = await mongoose.connection.collection('listening_aggregations').find({}).toArray();
    console.log('Aggregations have workspaceIds:');
    aggregations.forEach(a => console.log(a.workspaceId));
    
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
