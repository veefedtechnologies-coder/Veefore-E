import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    const user = await mongoose.connection.collection('users').findOne({ email: 'brandboost09@gmail.com' });
    if (!user) {
      console.log('User brandboost09@gmail.com not found.');
      // find any user named Arpit Choudhary
      const arpit = await mongoose.connection.collection('users').findOne({ $or: [{ name: /Arpit/i }, { email: /arpit/i }] });
      console.log('Found Arpit:', arpit?.email, arpit?._id);
    } else {
      console.log('User brandboost09@gmail.com:', user._id);
    }

    const workspaces = await mongoose.connection.collection('workspaces').find({ name: 'My VeeFore Workspace' }).sort({ _id: -1 }).limit(10).toArray();
    console.log('Last 10 My VeeFore Workspaces:');
    workspaces.forEach(w => console.log(w._id, w.ownerId || w.userId));
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
