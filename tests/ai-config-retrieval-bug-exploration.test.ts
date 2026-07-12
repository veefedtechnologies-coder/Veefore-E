import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import WorkspaceModel from '../server/models/Workspace';
import { MongoStorage } from '../server/mongodb-storage';

// Load environment variables
dotenv.config();

/**
 * Bug Condition Exploration Test - AI Configuration Retrieval
 * 
 * **CRITICAL**: This test MUST FAIL on UNFIXED code
 * 
 * **Property 1: Bug Condition** - AI Configuration Field Missing After Conversion
 * 
 * **Validates: Requirements 1.1, 1.2**
 * 
 * **Purpose**: Surface counterexamples that demonstrate the bug BEFORE the fix is implemented
 * 
 * **Root Cause**: The `convertWorkspace` function in `server/storage/converters.ts` 
 * omits the `aiConfiguration` field during workspace data transformation.
 * When `storage.getWorkspace(workspaceId)` is called, the MongoDB document contains 
 * the `aiConfiguration` data, but the converter drops it, causing the returned 
 * workspace object to have `aiConfiguration` undefined.
 * 
 * **Expected Outcome on UNFIXED code**: Tests FAIL 
 *   - `storage.getWorkspace` returns workspace with `aiConfiguration: undefined`
 *   - All AI configuration data is lost during conversion from MongoDB document to domain object
 *   - Converter function omits `aiConfiguration` field in return statement
 * 
 * **Expected Outcome on FIXED code**: Tests PASS
 *   - `storage.getWorkspace` returns workspace with `aiConfiguration` field populated
 *   - All nested AI configuration fields are preserved correctly
 * 
 * **NOTE**: This test encodes the expected behavior - when it passes, the bug is fixed
 * 
 * **IMPORTANT**: To run these tests:
 *   1. Ensure MongoDB is running and accessible
 *   2. Set MONGODB_URI environment variable
 *   3. Run: npm test -- tests/ai-config-retrieval-bug-exploration.test.ts
 */

describe('Bug Condition Exploration: AI Configuration Retrieval', () => {
  let storage: MongoStorage;
  let testWorkspaceIds: string[] = [];

  beforeAll(async () => {
    // Connect to database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore-test';
    
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 5000,
        });
        console.log('✅ Connected to MongoDB for retrieval bug exploration tests');
      }
      
      // Initialize storage
      storage = new MongoStorage();
      await storage.connect();
    } catch (error) {
      console.warn('⚠️  Could not connect to MongoDB. These tests require a MongoDB connection.');
      console.warn('   To run these tests:');
      console.warn('   1. Ensure MongoDB is running');
      console.warn('   2. Set MONGODB_URI in .env');
      console.warn('   3. Run tests again');
      throw error;
    }
  }, 60000);

  afterAll(async () => {
    // Clean up test data
    try {
      for (const id of testWorkspaceIds) {
        await WorkspaceModel.findByIdAndDelete(id);
      }
      await WorkspaceModel.deleteMany({ name: /^TEST_RETRIEVAL_BUG/ });
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
    
    // Close connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  }, 60000);

  /**
   * Test Case 1: Single AI Config Field - Retrieval via storage.getWorkspace
   * 
   * **Bug Condition**: Workspace has `aiConfiguration.aiModel: 'google-ai-studio'` in MongoDB
   * **Expected (after fix)**: `storage.getWorkspace()` returns workspace with `aiConfiguration.aiModel === 'google-ai-studio'`
   * **Actual (on unfixed code)**: `storage.getWorkspace()` returns workspace with `aiConfiguration: undefined`
   * 
   * **Root Cause**: `convertWorkspace` function omits `aiConfiguration` field from return statement
   * 
   * **Validates: Requirements 1.1, 1.2**
   */
  test('should retrieve aiModel field when workspace has aiConfiguration in MongoDB', async () => {
    console.log('\n📝 Test Case 1: Single field retrieval (aiModel)');
    
    // Step 1: Create workspace directly in MongoDB with aiConfiguration
    const mongoWorkspace = await WorkspaceModel.create({
      workspaceId: `test-retrieval-${Date.now()}`,
      name: 'TEST_RETRIEVAL_BUG_1',
      ownerId: 'test-user-1',
      members: ['test-user-1'],
      plan: 'free',
      aiConfiguration: {
        aiModel: 'google-ai-studio',
        creativityLevel: 0.8
      }
    });
    
    testWorkspaceIds.push(mongoWorkspace._id.toString());
    
    // Step 2: Verify MongoDB has the data
    const directMongoDoc = await WorkspaceModel.findById(mongoWorkspace._id).lean();
    console.log('   MongoDB document aiConfiguration:', directMongoDoc?.aiConfiguration);
    
    expect(directMongoDoc).toBeDefined();
    expect(directMongoDoc!.aiConfiguration).toBeDefined();
    expect(directMongoDoc!.aiConfiguration?.aiModel).toBe('google-ai-studio');
    expect(directMongoDoc!.aiConfiguration?.creativityLevel).toBe(0.8);
    
    // Step 3: Retrieve via storage.getWorkspace (uses convertWorkspace)
    const retrievedWorkspace = await storage.getWorkspace(mongoWorkspace._id.toString());
    console.log('   Retrieved via storage.getWorkspace - aiConfiguration:', retrievedWorkspace?.aiConfiguration);
    
    // ASSERTION: This will FAIL on unfixed code because convertWorkspace omits aiConfiguration
    expect(retrievedWorkspace).toBeDefined();
    
    // This is the KEY assertion that demonstrates the bug
    // On unfixed code: retrievedWorkspace.aiConfiguration will be undefined
    // On fixed code: retrievedWorkspace.aiConfiguration will contain the saved values
    expect(retrievedWorkspace!.aiConfiguration).toBeDefined();
    expect(retrievedWorkspace!.aiConfiguration?.aiModel).toBe('google-ai-studio');
    expect(retrievedWorkspace!.aiConfiguration?.creativityLevel).toBe(0.8);
    
    console.log('   ✅ Test assertion passed - aiConfiguration field is present after retrieval');
  });

  /**
   * Test Case 2: Complete AI Configuration - All 15 Fields
   * 
   * **Bug Condition**: Workspace has all 15 AI configuration fields in MongoDB
   * **Expected (after fix)**: `storage.getWorkspace()` returns workspace with all 15 fields preserved
   * **Actual (on unfixed code)**: All 15 fields are lost during conversion
   * 
   * **Validates: Requirements 1.2**
   */
  test('should retrieve all 15 AI configuration fields via storage.getWorkspace', async () => {
    console.log('\n📝 Test Case 2: Complete AI configuration retrieval (all 15 fields)');
    
    // Step 1: Create workspace with all 15 AI configuration fields
    const completeAiConfig = {
      aiModel: 'google-ai-studio',
      creativityLevel: 0.7,
      optimizationGoals: 'Engagement',
      aiPersona: 'Professional & Authoritative',
      captionStyle: 'Storytelling',
      responseLength: 'medium',
      multilingual: 'auto',
      videoEngine: 'cinematic',
      thumbnailStyle: 'realistic',
      autoHashtags: true,
      contentSafety: 'standard',
      aiMemory: 'long-term',
      autoLearning: true,
      googleAiStudioKey: 'AI-zaSyTest123456789',
      openAiKey: 'sk-test-key-123456789'
    };
    
    const mongoWorkspace = await WorkspaceModel.create({
      workspaceId: `test-retrieval-${Date.now()}`,
      name: 'TEST_RETRIEVAL_BUG_2',
      ownerId: 'test-user-2',
      members: ['test-user-2'],
      plan: 'enterprise',
      aiConfiguration: completeAiConfig
    });
    
    testWorkspaceIds.push(mongoWorkspace._id.toString());
    
    // Step 2: Verify MongoDB has all 15 fields
    const directMongoDoc = await WorkspaceModel.findById(mongoWorkspace._id).lean();
    console.log('   MongoDB document has', directMongoDoc?.aiConfiguration ? Object.keys(directMongoDoc.aiConfiguration).length : 0, 'AI config fields');
    
    expect(directMongoDoc).toBeDefined();
    expect(directMongoDoc!.aiConfiguration).toBeDefined();
    
    // Step 3: Retrieve via storage.getWorkspace
    const retrievedWorkspace = await storage.getWorkspace(mongoWorkspace._id.toString());
    console.log('   Retrieved workspace has', retrievedWorkspace?.aiConfiguration ? Object.keys(retrievedWorkspace.aiConfiguration).length : 0, 'AI config fields');
    
    // ASSERTION: All 15 fields should be present
    expect(retrievedWorkspace).toBeDefined();
    expect(retrievedWorkspace!.aiConfiguration).toBeDefined();
    
    // Verify all 15 fields are preserved during conversion
    expect(retrievedWorkspace!.aiConfiguration?.aiModel).toBe('google-ai-studio');
    expect(retrievedWorkspace!.aiConfiguration?.creativityLevel).toBe(0.7);
    expect(retrievedWorkspace!.aiConfiguration?.optimizationGoals).toBe('Engagement');
    expect(retrievedWorkspace!.aiConfiguration?.aiPersona).toBe('Professional & Authoritative');
    expect(retrievedWorkspace!.aiConfiguration?.captionStyle).toBe('Storytelling');
    expect(retrievedWorkspace!.aiConfiguration?.responseLength).toBe('medium');
    expect(retrievedWorkspace!.aiConfiguration?.multilingual).toBe('auto');
    expect(retrievedWorkspace!.aiConfiguration?.videoEngine).toBe('cinematic');
    expect(retrievedWorkspace!.aiConfiguration?.thumbnailStyle).toBe('realistic');
    expect(retrievedWorkspace!.aiConfiguration?.autoHashtags).toBe(true);
    expect(retrievedWorkspace!.aiConfiguration?.contentSafety).toBe('standard');
    expect(retrievedWorkspace!.aiConfiguration?.aiMemory).toBe('long-term');
    expect(retrievedWorkspace!.aiConfiguration?.autoLearning).toBe(true);
    expect(retrievedWorkspace!.aiConfiguration?.googleAiStudioKey).toBe('AI-zaSyTest123456789');
    expect(retrievedWorkspace!.aiConfiguration?.openAiKey).toBe('sk-test-key-123456789');
    
    console.log('   ✅ All 15 AI configuration fields preserved during retrieval');
  });

  /**
   * Test Case 3: Affected Workspace ID - Real Production Case
   * 
   * **Bug Condition**: Workspace `684402c2fd2cd4eb6521b386` has aiConfiguration in MongoDB
   * **Expected (after fix)**: Can retrieve AI configuration successfully
   * **Actual (on unfixed code)**: AI configuration is lost during conversion
   * 
   * **Validates: Requirements 1.1**
   */
  test('should retrieve AI configuration for affected workspace ID 684402c2fd2cd4eb6521b386', async () => {
    console.log('\n📝 Test Case 3: Affected workspace ID retrieval');
    
    const affectedWorkspaceId = '684402c2fd2cd4eb6521b386';
    
    // Check if this workspace exists in the database
    let mongoWorkspace;
    try {
      mongoWorkspace = await WorkspaceModel.findById(affectedWorkspaceId).lean();
    } catch (error) {
      console.log('   ⚠️  Affected workspace not found in this database - creating test substitute');
      
      // Create a substitute workspace with the same structure
      const createdWorkspace = await WorkspaceModel.create({
        workspaceId: `test-retrieval-${Date.now()}`,
        name: 'TEST_RETRIEVAL_BUG_3_SUBSTITUTE',
        ownerId: '6844027426cae0200f88b5db',
        members: ['6844027426cae0200f88b5db'],
        plan: 'free',
        aiConfiguration: {
          aiModel: 'google-ai-studio',
          creativityLevel: 0.8
        }
      });
      
      testWorkspaceIds.push(createdWorkspace._id.toString());
      mongoWorkspace = createdWorkspace.toObject();
    }
    
    if (!mongoWorkspace) {
      console.log('   ⚠️  Skipping test - workspace not available');
      return;
    }
    
    console.log('   Testing workspace:', mongoWorkspace._id);
    console.log('   MongoDB document has aiConfiguration:', !!mongoWorkspace.aiConfiguration);
    
    // Retrieve via storage.getWorkspace
    const retrievedWorkspace = await storage.getWorkspace(mongoWorkspace._id.toString());
    
    console.log('   Retrieved workspace has aiConfiguration:', !!retrievedWorkspace?.aiConfiguration);
    
    // ASSERTION: If MongoDB has aiConfiguration, retrieved workspace should have it too
    if (mongoWorkspace.aiConfiguration) {
      expect(retrievedWorkspace).toBeDefined();
      expect(retrievedWorkspace!.aiConfiguration).toBeDefined();
      
      // Verify specific fields if they exist in MongoDB
      if (mongoWorkspace.aiConfiguration.aiModel) {
        expect(retrievedWorkspace!.aiConfiguration?.aiModel).toBe(mongoWorkspace.aiConfiguration.aiModel);
      }
      
      console.log('   ✅ AI configuration successfully retrieved for affected workspace');
    }
  });

  /**
   * Test Case 4: Direct MongoDB vs Storage Comparison
   * 
   * **Bug Condition**: MongoDB document has aiConfiguration but storage.getWorkspace returns undefined
   * **Purpose**: Isolate the converter as the source of data loss
   * **Expected**: Both should return the same aiConfiguration data
   * 
   * **Validates: Requirements 1.2**
   */
  test('should match MongoDB document and storage.getWorkspace results for aiConfiguration', async () => {
    console.log('\n📝 Test Case 4: Direct MongoDB vs Storage comparison');
    
    // Create workspace with aiConfiguration
    const mongoWorkspace = await WorkspaceModel.create({
      workspaceId: `test-retrieval-${Date.now()}`,
      name: 'TEST_RETRIEVAL_BUG_4',
      ownerId: 'test-user-4',
      members: ['test-user-4'],
      plan: 'basic',
      aiConfiguration: {
        aiModel: 'openai-gpt4o',
        creativityLevel: 0.5,
        captionStyle: 'Professional'
      }
    });
    
    testWorkspaceIds.push(mongoWorkspace._id.toString());
    
    // Fetch directly from MongoDB
    const directMongoDoc = await WorkspaceModel.findById(mongoWorkspace._id).lean();
    console.log('   Direct MongoDB query - aiConfiguration:', directMongoDoc?.aiConfiguration);
    
    // Fetch via storage (uses convertWorkspace)
    const viaStorage = await storage.getWorkspace(mongoWorkspace._id.toString());
    console.log('   Via storage.getWorkspace - aiConfiguration:', viaStorage?.aiConfiguration);
    
    // ASSERTION: Both should have the same aiConfiguration data
    expect(directMongoDoc).toBeDefined();
    expect(directMongoDoc!.aiConfiguration).toBeDefined();
    
    expect(viaStorage).toBeDefined();
    
    // This assertion will FAIL on unfixed code because convertWorkspace omits the field
    expect(viaStorage!.aiConfiguration).toBeDefined();
    expect(viaStorage!.aiConfiguration?.aiModel).toBe(directMongoDoc!.aiConfiguration?.aiModel);
    expect(viaStorage!.aiConfiguration?.creativityLevel).toBe(directMongoDoc!.aiConfiguration?.creativityLevel);
    expect(viaStorage!.aiConfiguration?.captionStyle).toBe(directMongoDoc!.aiConfiguration?.captionStyle);
    
    console.log('   ✅ MongoDB document and storage.getWorkspace return identical aiConfiguration');
  });

  /**
   * Test Case 5: Workspace List Retrieval - getWorkspacesByUserId
   * 
   * **Bug Condition**: Multiple workspaces have aiConfiguration in MongoDB
   * **Expected (after fix)**: getWorkspacesByUserId returns all workspaces with aiConfiguration preserved
   * **Actual (on unfixed code)**: All workspaces returned with aiConfiguration: undefined
   * 
   * **Validates: Requirements 1.2**
   */
  test('should retrieve aiConfiguration for all workspaces in getWorkspacesByUserId', async () => {
    console.log('\n📝 Test Case 5: Workspace list retrieval');
    
    const testUserId = 'test-user-5';
    
    // Create multiple workspaces with different AI configurations
    const workspace1 = await WorkspaceModel.create({
      workspaceId: `test-retrieval-${Date.now()}-1`,
      name: 'TEST_RETRIEVAL_BUG_5A',
      ownerId: testUserId,
      members: [testUserId],
      plan: 'free',
      aiConfiguration: {
        aiModel: 'google-ai-studio',
        creativityLevel: 0.8
      }
    });
    
    const workspace2 = await WorkspaceModel.create({
      workspaceId: `test-retrieval-${Date.now()}-2`,
      name: 'TEST_RETRIEVAL_BUG_5B',
      ownerId: testUserId,
      members: [testUserId],
      plan: 'pro',
      aiConfiguration: {
        aiModel: 'openai-gpt4o',
        creativityLevel: 0.6
      }
    });
    
    testWorkspaceIds.push(workspace1._id.toString(), workspace2._id.toString());
    
    // Retrieve workspaces via storage.getWorkspacesByUserId
    const workspaces = await storage.getWorkspacesByUserId(testUserId);
    
    console.log('   Retrieved', workspaces.length, 'workspaces');
    console.log('   Workspace 1 has aiConfiguration:', !!workspaces.find(w => w.id === workspace1._id.toString())?.aiConfiguration);
    console.log('   Workspace 2 has aiConfiguration:', !!workspaces.find(w => w.id === workspace2._id.toString())?.aiConfiguration);
    
    // Find our test workspaces
    const retrieved1 = workspaces.find(w => w.id === workspace1._id.toString());
    const retrieved2 = workspaces.find(w => w.id === workspace2._id.toString());
    
    // ASSERTION: Both workspaces should have aiConfiguration preserved
    expect(retrieved1).toBeDefined();
    expect(retrieved1!.aiConfiguration).toBeDefined();
    expect(retrieved1!.aiConfiguration?.aiModel).toBe('google-ai-studio');
    
    expect(retrieved2).toBeDefined();
    expect(retrieved2!.aiConfiguration).toBeDefined();
    expect(retrieved2!.aiConfiguration?.aiModel).toBe('openai-gpt4o');
    
    console.log('   ✅ All workspaces in list have aiConfiguration preserved');
  });
});
