#!/usr/bin/env ts-node
/**
 * Script to drop problematic indexes from viralpatterns collection
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function dropIndexes() {
  try {
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, { dbName: DB_NAME });
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }

    const collection = db.collection('viralpatterns');

    // Get all indexes
    console.log('📋 Current indexes:');
    const indexes = await collection.indexes();
    indexes.forEach((index) => {
      console.log(`  - ${JSON.stringify(index.key)} (${index.name})`);
    });
    console.log('');

    // Drop all indexes except _id
    console.log('🗑️  Dropping indexes...');
    await collection.dropIndexes();
    console.log('✅ Indexes dropped\n');

    console.log('📋 Remaining indexes:');
    const remainingIndexes = await collection.indexes();
    remainingIndexes.forEach((index) => {
      console.log(`  - ${JSON.stringify(index.key)} (${index.name})`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Done');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

dropIndexes();
