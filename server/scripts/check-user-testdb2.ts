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
    const members = await mongoose.connection.collection('workspacemembers').find({ userId: user?._id }).toArray();
    console.log('Memberships in test db:', members);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
