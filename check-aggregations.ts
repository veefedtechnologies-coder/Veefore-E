import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkAggregations() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  
  const workspacesCount = await mongoose.connection.db.collection('workspaces').countDocuments();
  console.log(`Total workspaces in DB: ${workspacesCount}`);

  const recentWorkspaces = await mongoose.connection.db.collection('workspaces').find().sort({_id: -1}).limit(10).toArray();
  console.log('Recent Workspaces:');
  recentWorkspaces.forEach(w => console.log(`- _id: ${w._id}, name: ${w.name}, ownerId: ${w.ownerId}`));

  await mongoose.disconnect();
}

checkAggregations().catch(console.error);
