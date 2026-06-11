/**
 * Delete User Script
 * 
 * This script deletes a user from MongoDB to allow fresh OAuth sign-in
 * with the new Firebase project credentials.
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const email = 'choudharyarpit977@gmail.com';
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('❌ MONGODB_URI not found in .env file');
  process.exit(1);
}

async function deleteUser() {
  const client = new MongoClient(mongoUri);
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db(); // Uses default database from connection string
    const usersCollection = db.collection('users');
    
    console.log(`\n🔍 Looking for user: ${email}`);
    
    // First, check if user exists
    const existingUser = await usersCollection.findOne({ email });
    
    if (!existingUser) {
      console.log('ℹ️  User not found in database');
      console.log('   This is fine - the user may have already been deleted');
      return;
    }
    
    console.log('📋 User found:');
    console.log(`   - ID: ${existingUser._id}`);
    console.log(`   - Email: ${existingUser.email}`);
    console.log(`   - Display Name: ${existingUser.displayName || 'N/A'}`);
    console.log(`   - Google ID: ${existingUser.googleId || 'N/A'}`);
    console.log(`   - Created: ${existingUser.createdAt || 'N/A'}`);
    
    // Delete the user
    console.log('\n🗑️  Deleting user...');
    const result = await usersCollection.deleteOne({ email });
    
    if (result.deletedCount === 1) {
      console.log('✅ User deleted successfully!');
      console.log('\n📝 Next steps:');
      console.log('   1. Restart your backend server (npm run dev)');
      console.log('   2. Clear browser cookies and localStorage');
      console.log('   3. Sign in again with Google OAuth');
      console.log('   4. A fresh user record will be created with new Firebase project');
    } else {
      console.log('⚠️  User not deleted (may have been deleted already)');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('   Could not connect to MongoDB - check your connection string');
    }
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

deleteUser();
