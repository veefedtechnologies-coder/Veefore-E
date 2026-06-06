import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ListeningAggregationModel } from './server/models/SocialListening/ListeningAggregation';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to:', mongoose.connection.name);
  
  const agg = await ListeningAggregationModel.findOne({ workspaceId: '6841a7d5d70118ce230574f8' });
  console.log('Result:', !!agg, agg?.metrics);
  
  await mongoose.disconnect();
}
check().catch(console.error);
