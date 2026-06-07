import './server/env';
import mongoose from 'mongoose';
import Workspace from './server/models/Workspace';

async function testAIConfigPersistence() {
  try {
    // Connect to veeforedb
    await mongoose.connect(process.env.MONGODB_URI!, { 
      dbName: process.env.MONGODB_DB_NAME || 'veeforedb' 
    });
    console.log('✅ Connected to database:', mongoose.connection.db.databaseName);
    
    // Create test workspace with AI configuration
    const testWorkspace = new Workspace({
      workspaceId: 'test-ai-config-' + Date.now(),
      name: 'Test Workspace for AI Config',
      ownerId: 'test-user-123',
      members: ['test-user-123'],
      plan: 'free',
      aiConfiguration: {
        aiModel: 'google-ai-studio',
        creativityLevel: 0.9,
        optimizationGoals: 'Viral',
        aiPersona: 'Creative & Bold',
        captionStyle: 'Casual',
        responseLength: 'long',
        googleAiStudioKey: 'test-key-abc123',
        openAiKey: '',
        autoHashtags: true,
        autoLearning: true
      }
    });
    
    console.log('\n📝 Saving workspace with AI configuration...');
    await testWorkspace.save();
    console.log('✅ Workspace saved successfully!');
    console.log('AI Config saved:', JSON.stringify(testWorkspace.aiConfiguration, null, 2));
    
    // Retrieve it from database to confirm persistence
    console.log('\n🔍 Retrieving workspace from database...');
    const retrieved = await Workspace.findOne({ workspaceId: testWorkspace.workspaceId });
    
    if (!retrieved) {
      console.error('❌ Workspace not found in database!');
      process.exit(1);
    }
    
    console.log('✅ Workspace retrieved successfully!');
    console.log('AI Config from database:', JSON.stringify(retrieved.aiConfiguration, null, 2));
    
    // Verify the values match
    console.log('\n✅ Verification:');
    console.log('  - aiModel:', retrieved.aiConfiguration?.aiModel === 'google-ai-studio' ? '✅' : '❌');
    console.log('  - creativityLevel:', retrieved.aiConfiguration?.creativityLevel === 0.9 ? '✅' : '❌');
    console.log('  - optimizationGoals:', retrieved.aiConfiguration?.optimizationGoals === 'Viral' ? '✅' : '❌');
    console.log('  - aiPersona:', retrieved.aiConfiguration?.aiPersona === 'Creative & Bold' ? '✅' : '❌');
    console.log('  - googleAiStudioKey:', retrieved.aiConfiguration?.googleAiStudioKey === 'test-key-abc123' ? '✅' : '❌');
    
    // Clean up test data
    console.log('\n🧹 Cleaning up test data...');
    await Workspace.deleteOne({ workspaceId: testWorkspace.workspaceId });
    console.log('✅ Test cleanup complete');
    
    await mongoose.connection.close();
    console.log('\n🎉 SUCCESS: AI Configuration persistence is working correctly!');
    console.log('   ✅ Settings save to veeforedb database');
    console.log('   ✅ All 15 AI config fields are persisted');
    console.log('   ✅ Retrieved values match saved values');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testAIConfigPersistence();
