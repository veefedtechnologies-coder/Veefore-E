import axios from 'axios';
import mongoose from 'mongoose';

async function testApi() {
  console.log('Connecting to Mongo...');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore');
  
  // Find a user and workspace
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const Workspace = mongoose.model('Workspace', new mongoose.Schema({}, { strict: false }));
  
  const user = await User.findOne();
  if (!user) return console.log('No user');
  
  const workspace = await Workspace.findOne({ users: user._id });
  if (!workspace) return console.log('No workspace');
  
  // Create an auth token (mocking the session is hard, so maybe we bypass or test internal service)
  
  console.log('User ID:', user._id);
  console.log('Workspace ID:', workspace._id);
  
  process.exit(0);
}

testApi();
