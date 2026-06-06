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
    const user = await mongoose.connection.collection('users').findOne({ email: 'brandboost09@gmail.com' });
    console.log('brandboost in test db:', user?._id);
    const workspaces = await mongoose.connection.collection('workspaces').find({ ownerId: user?._id }).toArray();
    console.log('Workspaces for brandboost in test db:', workspaces.map(w => w._id));
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
