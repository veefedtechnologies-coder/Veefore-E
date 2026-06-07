#!/usr/bin/env ts-node
/**
 * Verify viral patterns and hooks were seeded correctly
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { ViralPatternModel } from '../models/AI/ViralPattern.js';
import { ViralHookModel } from '../models/AI/ViralHook.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function verify() {
  try {
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, { dbName: DB_NAME });
    console.log('✅ Connected\n');

    // Verify patterns
    const patternCount = await ViralPatternModel.countDocuments();
    console.log(`📊 Total Patterns: ${patternCount}`);

    const patternsByCategory = await ViralPatternModel.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log('\n📈 Patterns by Category:');
    patternsByCategory.forEach(({ _id, count }) => {
      console.log(`   ${_id}: ${count}`);
    });

    // Sample patterns
    const samplePatterns = await ViralPatternModel.find().limit(3);
    console.log('\n📄 Sample Patterns:');
    samplePatterns.forEach((p: any) => {
      console.log(`   - ${p.name} (${p.category})`);
      console.log(`     Niches: ${p.niches.join(', ')}`);
      console.log(`     Engagement: ${p.avgEngagementRate.toFixed(1)}%\n`);
    });

    // Verify hooks
    const hookCount = await ViralHookModel.countDocuments();
    console.log(`🎣 Total Hooks: ${hookCount}`);

    const hooksByNiche = await ViralHookModel.aggregate([
      { $group: { _id: '$niche', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log('\n📈 Hooks by Niche:');
    hooksByNiche.forEach(({ _id, count }) => {
      console.log(`   ${_id}: ${count}`);
    });

    // Sample hooks for fitness niche
    const fitnessHooks = await ViralHookModel.find({ niche: 'fitness' }).limit(5);
    console.log('\n📄 Sample Fitness Hooks:');
    fitnessHooks.forEach((h: any) => {
      console.log(`   - "${h.hookText}" (+${h.avgEngagementBoost.toFixed(1)}% boost)`);
    });

    // Verify requirements met
    console.log('\n✅ Requirements Check:');
    console.log(`   ✓ Total patterns: ${patternCount} (required: 200+) - ${patternCount >= 200 ? 'PASS' : 'FAIL'}`);
    
    const minHooksPerNiche = Math.min(...hooksByNiche.map((h: any) => h.count));
    console.log(`   ✓ Min hooks per niche: ${minHooksPerNiche} (required: 50+) - ${minHooksPerNiche >= 50 ? 'PASS' : 'FAIL'}`);
    
    const nicheCount = hooksByNiche.length;
    console.log(`   ✓ Niches covered: ${nicheCount} (required: 6+ major niches) - ${nicheCount >= 6 ? 'PASS' : 'FAIL'}`);

    await mongoose.connection.close();
    console.log('\n📡 Connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verify();
