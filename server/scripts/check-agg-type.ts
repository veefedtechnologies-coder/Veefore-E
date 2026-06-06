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
    const agg = await mongoose.connection.collection('listeningaggregations').findOne({});
    console.log('workspaceId value:', agg?.workspaceId);
    console.log('workspaceId type:', typeof agg?.workspaceId, agg?.workspaceId instanceof mongoose.Types.ObjectId);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
