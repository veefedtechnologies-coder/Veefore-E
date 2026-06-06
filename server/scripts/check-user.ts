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
    const users = await mongoose.connection.collection('users').find({}).toArray();
    console.log('Users:');
    for (const u of users) {
       console.log('User:', u.email, u._id);
       const memberships = await mongoose.connection.collection('workspacemembers').find({ userId: u._id }).toArray();
       console.log('  Workspaces:', memberships.map(m => m.workspaceId));
    }
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
