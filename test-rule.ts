import mongoose from 'mongoose';

async function run() {
  await mongoose.connect('mongodb://localhost:27017/veefore');
  const rule = await mongoose.connection.db!.collection('automationrules').find({}).sort({createdAt: -1}).limit(1).toArray();
  console.log('Rule:', JSON.stringify(rule[0], null, 2));
  process.exit(0);
}
run();
