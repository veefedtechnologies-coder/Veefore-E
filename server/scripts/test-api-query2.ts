import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });
import { ListeningAggregationModel } from '../models/SocialListening/ListeningAggregation';
import { ListeningTrendModel } from '../models/SocialListening/ListeningTrend';

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    const workspaceId = '684404b60a64792f6161c721';
    console.log('Querying for workspace:', workspaceId);

    const latestAgg = await ListeningAggregationModel.findOne({ workspaceId }).sort({ date: -1 });
    console.log('latestAgg:', latestAgg);
    
    const activeTrends = await ListeningTrendModel.countDocuments({ workspaceId, status: { $in: ['Emerging', 'Viral', 'Growing', 'analyzed'] } });
    console.log('activeTrends:', activeTrends);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
