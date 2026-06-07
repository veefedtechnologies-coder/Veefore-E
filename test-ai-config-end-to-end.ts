/**
 * End-to-End Diagnostic Test for AI Configuration Retrieval
 * 
 * This test verifies the complete flow:
 * 1. Check if AI configuration exists in MongoDB for workspace 684402c2fd2cd4eb6521b386
 * 2. Test storage.getWorkspace() retrieval
 * 3. Test convertWorkspace() function directly
 * 4. Simulate AI content generation flow
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { WorkspaceModel } from './server/models/Workspace/Workspace';
import { storage } from './server/mongodb-storage';
import { convertWorkspace } from './server/storage/converters';

const WORKSPACE_ID = '684402c2fd2cd4eb6521b386';
const USER_ID = '6844027426cae0200f88b5db';

async function runDiagnostics() {
  console.log('\n🔍 AI Configuration Retrieval Diagnostics\n');
  console.log('=' .repeat(60));
  
  try {
    // Connect to MongoDB using the same method as the server
    console.log('\n📡 Connecting to MongoDB via MongoStorage');
    const dbName = process.env.MONGODB_DB_NAME || 'veeforedb';
    console.log('   Database:', dbName);
    
    await storage.connect();
    console.log('✅ Connected to MongoDB');


    // Test 1: Check raw MongoDB document
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST 1: Raw MongoDB Document');
    console.log('='.repeat(60));
    
    const rawDoc = await WorkspaceModel.findById(WORKSPACE_ID).lean();
    
    if (!rawDoc) {
      console.log('❌ Workspace not found in database!');
      console.log('   Workspace ID:', WORKSPACE_ID);
      return;
    }
    
    console.log('✅ Workspace found:', rawDoc.name);
    console.log('   User ID:', rawDoc.userId);
    console.log('   Created:', rawDoc.createdAt);
    
    if (rawDoc.aiConfiguration) {
      console.log('✅ MongoDB has aiConfiguration field');
      console.log('   Raw aiConfiguration:', JSON.stringify(rawDoc.aiConfiguration, null, 2));
      console.log('   AI Model:', rawDoc.aiConfiguration.aiModel || 'NOT SET');
      console.log('   Creativity Level:', rawDoc.aiConfiguration.creativityLevel || 'NOT SET');
      console.log('   Optimization Goals:', rawDoc.aiConfiguration.optimizationGoals || 'NOT SET');
    } else {
      console.log('⚠️  MongoDB document has NO aiConfiguration field');
      console.log('   This means AI configuration was never saved to this workspace');
      console.log('   Action: Save AI configuration via workspace settings first');
    }

    // Test 2: Test convertWorkspace function directly
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST 2: Converter Function Test');
    console.log('='.repeat(60));
    
    const converted = convertWorkspace(rawDoc);
    
    console.log('Converted workspace type:', typeof converted);
    console.log('Has aiConfiguration field:', 'aiConfiguration' in converted);
    
    if (converted.aiConfiguration) {
      console.log('✅ Converter preserves aiConfiguration');
      console.log('   Converted aiConfiguration:', JSON.stringify(converted.aiConfiguration, null, 2));
      console.log('   AI Model:', converted.aiConfiguration.aiModel || 'NOT SET');
    } else {
      console.log('❌ Converter DROPS aiConfiguration!');
      console.log('   This means the converter fix is NOT applied');
      console.log('   Action: Server restart required to load fixed code');
    }

    // Test 3: Test storage.getWorkspace
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST 3: Storage Layer Test');
    console.log('='.repeat(60));
    
    const retrieved = await storage.getWorkspace(WORKSPACE_ID);
    
    if (!retrieved) {
      console.log('❌ storage.getWorkspace returned null!');
      return;
    }
    
    console.log('✅ storage.getWorkspace returned workspace');
    console.log('   Workspace name:', retrieved.name);
    
    if (retrieved.aiConfiguration) {
      console.log('✅ Storage layer preserves aiConfiguration');
      console.log('   Retrieved aiConfiguration:', JSON.stringify(retrieved.aiConfiguration, null, 2));
      console.log('   AI Model:', retrieved.aiConfiguration.aiModel || 'NOT SET');
    } else {
      console.log('❌ Storage layer returns workspace WITHOUT aiConfiguration');
      console.log('   This should not happen if converter is fixed');
    }

    // Test 4: Simulate AI content generation flow
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST 4: AI Content Generation Flow Simulation');
    console.log('='.repeat(60));
    
    const workspace = await storage.getWorkspace(WORKSPACE_ID);
    
    if (!workspace) {
      console.log('❌ Cannot simulate - workspace not found');
      return;
    }
    
    // This simulates what ai-content-generator.ts does
    const insights: any = {};
    
    if (workspace.aiConfiguration) {
      insights.workspaceAI = workspace.aiConfiguration;
      console.log('✅ Workspace AI configuration loaded into insights');
    } else {
      console.log('⚠️  No workspace AI configuration - will use defaults');
    }
    
    const aiConfig = insights.workspaceAI || {};
    const finalAiModel = aiConfig.aiModel || 'veegpt-hybrid';
    
    console.log('\n📊 Final AI Model Selection:');
    console.log('   aiConfig:', aiConfig);
    console.log('   aiConfig.aiModel:', aiConfig.aiModel || 'undefined');
    console.log('   Final model used:', finalAiModel);
    
    if (finalAiModel === 'veegpt-hybrid') {
      console.log('\n⚠️  FALLBACK TO DEFAULT MODEL!');
      if (!rawDoc.aiConfiguration) {
        console.log('   Reason: No AI configuration saved in database');
        console.log('   Solution: Save AI configuration via workspace settings');
      } else if (!converted.aiConfiguration) {
        console.log('   Reason: Converter drops aiConfiguration');
        console.log('   Solution: Restart server to load fixed converter');
      } else {
        console.log('   Reason: Unknown - needs investigation');
      }
    } else {
      console.log('\n✅ USING USER-CONFIGURED MODEL!');
      console.log('   Success: AI configuration flow is working correctly');
    }

    // Test 5: Check all workspaces for this user
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST 5: All Workspaces for User');
    console.log('='.repeat(60));
    
    const allWorkspaces = await storage.getWorkspacesByUserId(USER_ID);
    console.log('Total workspaces:', allWorkspaces.length);
    
    for (const ws of allWorkspaces) {
      console.log(`\n   Workspace: ${ws.name} (${ws.id})`);
      console.log(`   Has aiConfiguration: ${!!ws.aiConfiguration}`);
      if (ws.aiConfiguration) {
        console.log(`   AI Model: ${ws.aiConfiguration.aiModel || 'NOT SET'}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 DIAGNOSTIC SUMMARY');
    console.log('='.repeat(60));
    
    const dbHasConfig = !!rawDoc.aiConfiguration;
    const converterPreservesConfig = !!converted.aiConfiguration;
    const storageReturnsConfig = !!retrieved.aiConfiguration;
    
    console.log('Database has AI config:', dbHasConfig ? '✅' : '❌');
    console.log('Converter preserves config:', converterPreservesConfig ? '✅' : '❌');
    console.log('Storage returns config:', storageReturnsConfig ? '✅' : '❌');
    
    if (!dbHasConfig) {
      console.log('\n🔧 ACTION REQUIRED: Save AI configuration via workspace settings');
      console.log('   1. Open workspace settings in the app');
      console.log('   2. Go to AI Settings tab');
      console.log('   3. Select your preferred AI model (e.g., Google AI Studio)');
      console.log('   4. Click Save');
    } else if (!converterPreservesConfig) {
      console.log('\n🔧 ACTION REQUIRED: Restart the development server');
      console.log('   The converter fix is in the code but not loaded in memory');
      console.log('   Stop and restart your development server');
    } else if (!storageReturnsConfig) {
      console.log('\n⚠️  UNEXPECTED: Storage layer issue');
      console.log('   Converter works but storage layer fails');
      console.log('   This needs further investigation');
    } else {
      console.log('\n✅ ALL SYSTEMS WORKING!');
      console.log('   AI configuration should be working correctly');
    }
    
  } catch (error) {
    console.error('\n❌ Diagnostic test failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run diagnostics
runDiagnostics()
  .then(() => {
    console.log('\n✅ Diagnostics complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Diagnostics failed:', error);
    process.exit(1);
  });
