import mongoose from 'mongoose';
import 'dotenv/config';
import { MainAppUserSchema } from '../models/MainAppUser';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkUserFields() {
  try {
    console.log('🔍 Checking actual user fields in veeforedb database...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const User = mongoose.model('User', MainAppUserSchema, 'users');
    
    // Get a sample user to see what fields exist
    const sampleUser = await User.findOne({}).lean();
    
    if (!sampleUser) {
      console.log('❌ No users found in database');
      return;
    }
    
    console.log('\n📊 SAMPLE USER FIELDS:');
    console.log('========================');
    console.log('User ID:', sampleUser._id);
    console.log('Email:', sampleUser.email);
    console.log('Username:', sampleUser.username);
    console.log('Display Name:', sampleUser.displayName);
    
    console.log('\n🔍 AVAILABLE FIELDS:');
    console.log('====================');
    const fields = Object.keys(sampleUser);
    fields.forEach(field => {
      const value = sampleUser[field];
      const type = Array.isArray(value) ? 'array' : typeof value;
      console.log(`${field}: ${type} = ${JSON.stringify(value).substring(0, 100)}${JSON.stringify(value).length > 100 ? '...' : ''}`);
    });
    
    console.log('\n🔍 ANALYTICS FIELDS CHECK:');
    console.log('===========================');
    console.log('socialPlatforms:', sampleUser.socialPlatforms ? 'EXISTS' : 'MISSING');
    console.log('aiUsage:', sampleUser.aiUsage ? 'EXISTS' : 'MISSING');
    console.log('contentStats:', sampleUser.contentStats ? 'EXISTS' : 'MISSING');
    console.log('growthStats:', sampleUser.growthStats ? 'EXISTS' : 'MISSING');
    console.log('revenueStats:', sampleUser.revenueStats ? 'EXISTS' : 'MISSING');
    console.log('activityStats:', sampleUser.activityStats ? 'EXISTS' : 'MISSING');
    console.log('workspaceCount:', sampleUser.workspaceCount ? 'EXISTS' : 'MISSING');
    console.log('workspaceIds:', sampleUser.workspaceIds ? 'EXISTS' : 'MISSING');
    console.log('notes:', sampleUser.notes ? 'EXISTS' : 'MISSING');
    console.log('accountStatus:', sampleUser.accountStatus ? 'EXISTS' : 'MISSING');
    
    // Check if we have the fields we added
    if (sampleUser.aiUsage) {
      console.log('\n🤖 AI USAGE FIELDS:');
      console.log('===================');
      Object.keys(sampleUser.aiUsage).forEach(field => {
        console.log(`  ${field}: ${JSON.stringify(sampleUser.aiUsage[field])}`);
      });
    }
    
    if (sampleUser.contentStats) {
      console.log('\n📝 CONTENT STATS FIELDS:');
      console.log('=========================');
      Object.keys(sampleUser.contentStats).forEach(field => {
        console.log(`  ${field}: ${JSON.stringify(sampleUser.contentStats[field])}`);
      });
    }

  } catch (error) {
    console.error('❌ Error checking user fields:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkUserFields();
