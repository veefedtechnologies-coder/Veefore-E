import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Workspace from '../server/models/Workspace';

// Load environment variables
dotenv.config();

/**
 * Bug Condition Exploration Test
 * 
 * **CRITICAL**: This test MUST FAIL on UNFIXED code
 * 
 * **Property 1: Bug Condition** - AI Configuration Persistence Failure
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6 (Current Defect Behavior)**
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 (Expected Behavior after fix)**
 * 
 * **Purpose**: Surface counterexamples that demonstrate the bug BEFORE the fix is implemented
 * 
 * **Expected Outcome on UNFIXED code**: Tests FAIL 
 *   - workspace.aiConfiguration is undefined after update
 *   - Database document lacks aiConfiguration field
 *   - Persisted values are not retrievable
 * 
 * **Expected Outcome on FIXED code**: Tests PASS
 *   - workspace.aiConfiguration persists to database
 *   - All 15 AI config fields are stored and retrievable
 *   - API keys are securely persisted
 * 
 * **NOTE**: This test encodes the expected behavior - when it passes, the bug is fixed
 * 
 * **IMPORTANT**: To run these tests against real MongoDB:
 *   1. Ensure MongoDB is running and accessible
 *   2. Set MONGODB_URI environment variable
 *   3. Run: npm test -- tests/ai-config-bug-exploration.test.ts
 * 
 * These tests demonstrate the bug by attempting operations that SHOULD work but DON'T on unfixed code.
 */

describe('Bug Condition Exploration: AI Configuration Persistence', () => {
  let connection: typeof mongoose;
  let testWorkspace: any;

  beforeAll(async () => {
    // Connect to database with retry logic
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore-test';
    
    try {
      if (mongoose.connection.readyState === 0) {
        connection = await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 5000,
        });
        console.log('✅ Connected to MongoDB for bug exploration tests');
      }
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
      if (testWorkspace && testWorkspace._id) {
        await Workspace.findByIdAndDelete(testWorkspace._id);
      }
      await Workspace.deleteMany({ name: /^TEST_BUG_EXPLORATION/ });
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
    
    // Close connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  }, 60000);

  /**
   * Test Case 1: Single Field Save - AI Model Selection
   * 
   * **Bug Condition**: User selects "google-ai-studio" as AI model and saves
   * **Expected (after fix)**: workspace.aiConfiguration.aiModel stores "google-ai-studio"
   * **Actual (on unfixed code)**: Field is undefined or rejected because schema lacks aiConfiguration
   * 
   * **Validates: Requirements 1.2 (defect), 2.2 (expected)**
   */
  test('should persist aiModel when updating workspace', async () => {
    // Create a test workspace
    testWorkspace = await Workspace.create({
      workspaceId: `test-bug-${Date.now()}`,
      name: 'TEST_BUG_EXPLORATION_1',
      ownerId: 'test-user-1',
      members: ['test-user-1'],
      plan: 'free',
    });

    console.log('📝 Test Case 1: Attempting to save aiModel = "google-ai-studio"');

    // Update workspace with aiConfiguration.aiModel
    const updateData = {
      aiConfiguration: {
        aiModel: 'google-ai-studio'
      }
    };

    // Attempt to update
    const updated = await Workspace.findByIdAndUpdate(
      testWorkspace._id,
      { $set: updateData },
      { new: true }
    );

    console.log('Updated workspace aiConfiguration:', updated?.aiConfiguration);

    // ASSERTION: This should pass AFTER fix, but FAIL on unfixed code
    expect(updated).toBeDefined();
    
    // This is the KEY assertion that will FAIL on unfixed code
    // On unfixed code: updated.aiConfiguration will be undefined because schema doesn't have the field
    expect(updated!.aiConfiguration).toBeDefined();
    expect(updated!.aiConfiguration?.aiModel).toBe('google-ai-studio');

    // Retrieve the workspace to verify persistence
    const retrieved = await Workspace.findById(testWorkspace._id);
    console.log('Retrieved workspace aiConfiguration:', retrieved?.aiConfiguration);

    expect(retrieved).toBeDefined();
    expect(retrieved!.aiConfiguration).toBeDefined();
    expect(retrieved!.aiConfiguration?.aiModel).toBe('google-ai-studio');

    // Additional verification: Check raw MongoDB document
    const rawDoc = await mongoose.connection.collection('workspaces').findOne({ _id: testWorkspace._id });
    console.log('Raw MongoDB document aiConfiguration:', rawDoc?.aiConfiguration);
    
    expect(rawDoc).toBeDefined();
    expect(rawDoc!.aiConfiguration).toBeDefined();
    expect(rawDoc!.aiConfiguration?.aiModel).toBe('google-ai-studio');
  });

  /**
   * Test Case 2: Multiple Fields Save
   * 
   * **Bug Condition**: User configures aiModel, creativityLevel, and aiPersona simultaneously
   * **Expected (after fix)**: All three settings persist to workspace.aiConfiguration
   * **Actual (on unfixed code)**: None of the settings persist because aiConfiguration doesn't exist
   * 
   * **Validates: Requirements 1.5 (defect), 2.5 (expected)**
   */
  test('should persist multiple AI configuration fields (aiModel, creativityLevel, aiPersona)', async () => {
    // Create a test workspace
    const workspace = await Workspace.create({
      workspaceId: `test-bug-${Date.now()}`,
      name: 'TEST_BUG_EXPLORATION_2',
      ownerId: 'test-user-2',
      members: ['test-user-2'],
      plan: 'free',
    });

    console.log('📝 Test Case 2: Attempting to save multiple AI config fields');

    // Update workspace with multiple aiConfiguration fields
    const updateData = {
      aiConfiguration: {
        aiModel: 'google-ai-studio',
        creativityLevel: 0.8,
        aiPersona: 'Professional & Authoritative'
      }
    };

    const updated = await Workspace.findByIdAndUpdate(
      workspace._id,
      { $set: updateData },
      { new: true }
    );

    console.log('Updated workspace aiConfiguration:', updated?.aiConfiguration);

    // ASSERTION: This should pass AFTER fix, but FAIL on unfixed code
    expect(updated).toBeDefined();
    expect(updated!.aiConfiguration).toBeDefined();
    expect(updated!.aiConfiguration?.aiModel).toBe('google-ai-studio');
    expect(updated!.aiConfiguration?.creativityLevel).toBe(0.8);
    expect(updated!.aiConfiguration?.aiPersona).toBe('Professional & Authoritative');

    // Retrieve to verify persistence
    const retrieved = await Workspace.findById(workspace._id);

    expect(retrieved).toBeDefined();
    expect(retrieved!.aiConfiguration).toBeDefined();
    expect(retrieved!.aiConfiguration?.aiModel).toBe('google-ai-studio');
    expect(retrieved!.aiConfiguration?.creativityLevel).toBe(0.8);
    expect(retrieved!.aiConfiguration?.aiPersona).toBe('Professional & Authoritative');

    // Cleanup
    await Workspace.findByIdAndDelete(workspace._id);
  });

  /**
   * Test Case 3: API Key Storage
   * 
   * **Bug Condition**: User provides Google AI Studio API key through settings
   * **Expected (after fix)**: workspace.aiConfiguration.googleAiStudioKey securely stores the key
   * **Actual (on unfixed code)**: Key is not persisted because schema lacks the field
   * 
   * **Validates: Requirements 1.3 (defect), 2.3 (expected)**
   */
  test('should persist API keys (googleAiStudioKey, openAiKey)', async () => {
    // Create a test workspace
    const workspace = await Workspace.create({
      workspaceId: `test-bug-${Date.now()}`,
      name: 'TEST_BUG_EXPLORATION_3',
      ownerId: 'test-user-3',
      members: ['test-user-3'],
      plan: 'pro',
    });

    console.log('📝 Test Case 3: Attempting to save API keys');

    // Update workspace with API keys
    const updateData = {
      aiConfiguration: {
        googleAiStudioKey: 'AIzaSyTest123456789',
        openAiKey: 'sk-test-key-123456789'
      }
    };

    const updated = await Workspace.findByIdAndUpdate(
      workspace._id,
      { $set: updateData },
      { new: true }
    );

    console.log('Updated workspace aiConfiguration (keys masked):', {
      ...updated?.aiConfiguration,
      googleAiStudioKey: updated?.aiConfiguration?.googleAiStudioKey ? '***' : undefined,
      openAiKey: updated?.aiConfiguration?.openAiKey ? '***' : undefined
    });

    // ASSERTION: This should pass AFTER fix, but FAIL on unfixed code
    expect(updated).toBeDefined();
    expect(updated!.aiConfiguration).toBeDefined();
    expect(updated!.aiConfiguration?.googleAiStudioKey).toBe('AIzaSyTest123456789');
    expect(updated!.aiConfiguration?.openAiKey).toBe('sk-test-key-123456789');

    // Retrieve to verify persistence
    const retrieved = await Workspace.findById(workspace._id);

    expect(retrieved).toBeDefined();
    expect(retrieved!.aiConfiguration).toBeDefined();
    expect(retrieved!.aiConfiguration?.googleAiStudioKey).toBe('AIzaSyTest123456789');
    expect(retrieved!.aiConfiguration?.openAiKey).toBe('sk-test-key-123456789');

    // Cleanup
    await Workspace.findByIdAndDelete(workspace._id);
  });

  /**
   * Test Case 4: Full Configuration Save - All 15 Fields
   * 
   * **Bug Condition**: User configures all 15 AI settings at once
   * **Expected (after fix)**: All 15 settings persist to workspace.aiConfiguration
   * **Actual (on unfixed code)**: No fields persist because parent object doesn't exist
   * 
   * **Validates: Requirements 1.5 (defect), 2.5 (expected)**
   */
  test('should persist all 15 AI configuration fields', async () => {
    // Create a test workspace
    const workspace = await Workspace.create({
      workspaceId: `test-bug-${Date.now()}`,
      name: 'TEST_BUG_EXPLORATION_4',
      ownerId: 'test-user-4',
      members: ['test-user-4'],
      plan: 'enterprise',
    });

    console.log('📝 Test Case 4: Attempting to save all 15 AI config fields');

    // Update workspace with all 15 aiConfiguration fields
    const updateData = {
      aiConfiguration: {
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
        googleAiStudioKey: 'AIzaSyTest123456789',
        openAiKey: 'sk-test-key-123456789'
      }
    };

    const updated = await Workspace.findByIdAndUpdate(
      workspace._id,
      { $set: updateData },
      { new: true }
    );

    console.log('Updated workspace aiConfiguration field count:', 
      updated?.aiConfiguration ? Object.keys(updated.aiConfiguration).length : 0
    );

    // ASSERTION: This should pass AFTER fix, but FAIL on unfixed code
    expect(updated).toBeDefined();
    expect(updated!.aiConfiguration).toBeDefined();
    
    // Verify all 15 fields
    expect(updated!.aiConfiguration?.aiModel).toBe('google-ai-studio');
    expect(updated!.aiConfiguration?.creativityLevel).toBe(0.7);
    expect(updated!.aiConfiguration?.optimizationGoals).toBe('Engagement');
    expect(updated!.aiConfiguration?.aiPersona).toBe('Professional & Authoritative');
    expect(updated!.aiConfiguration?.captionStyle).toBe('Storytelling');
    expect(updated!.aiConfiguration?.responseLength).toBe('medium');
    expect(updated!.aiConfiguration?.multilingual).toBe('auto');
    expect(updated!.aiConfiguration?.videoEngine).toBe('cinematic');
    expect(updated!.aiConfiguration?.thumbnailStyle).toBe('realistic');
    expect(updated!.aiConfiguration?.autoHashtags).toBe(true);
    expect(updated!.aiConfiguration?.contentSafety).toBe('standard');
    expect(updated!.aiConfiguration?.aiMemory).toBe('long-term');
    expect(updated!.aiConfiguration?.autoLearning).toBe(true);
    expect(updated!.aiConfiguration?.googleAiStudioKey).toBe('AIzaSyTest123456789');
    expect(updated!.aiConfiguration?.openAiKey).toBe('sk-test-key-123456789');

    // Retrieve to verify persistence
    const retrieved = await Workspace.findById(workspace._id);

    expect(retrieved).toBeDefined();
    expect(retrieved!.aiConfiguration).toBeDefined();
    
    // Verify all 15 fields persisted
    expect(retrieved!.aiConfiguration?.aiModel).toBe('google-ai-studio');
    expect(retrieved!.aiConfiguration?.creativityLevel).toBe(0.7);
    expect(retrieved!.aiConfiguration?.optimizationGoals).toBe('Engagement');
    expect(retrieved!.aiConfiguration?.aiPersona).toBe('Professional & Authoritative');
    expect(retrieved!.aiConfiguration?.captionStyle).toBe('Storytelling');
    expect(retrieved!.aiConfiguration?.responseLength).toBe('medium');
    expect(retrieved!.aiConfiguration?.multilingual).toBe('auto');
    expect(retrieved!.aiConfiguration?.videoEngine).toBe('cinematic');
    expect(retrieved!.aiConfiguration?.thumbnailStyle).toBe('realistic');
    expect(retrieved!.aiConfiguration?.autoHashtags).toBe(true);
    expect(retrieved!.aiConfiguration?.contentSafety).toBe('standard');
    expect(retrieved!.aiConfiguration?.aiMemory).toBe('long-term');
    expect(retrieved!.aiConfiguration?.autoLearning).toBe(true);
    expect(retrieved!.aiConfiguration?.googleAiStudioKey).toBe('AIzaSyTest123456789');
    expect(retrieved!.aiConfiguration?.openAiKey).toBe('sk-test-key-123456789');

    // Cleanup
    await Workspace.findByIdAndDelete(workspace._id);
  });

  /**
   * Test Case 5: Retrieval After Save
   * 
   * **Bug Condition**: User saves config, then retrieves workspace
   * **Expected (after fix)**: Retrieved workspace contains persisted aiConfiguration
   * **Actual (on unfixed code)**: Retrieved config is undefined or empty
   * 
   * **Validates: Requirements 1.6 (defect), 2.6 (expected)**
   */
  test('should retrieve persisted AI configuration after save and page refresh', async () => {
    // Create a test workspace
    const workspace = await Workspace.create({
      workspaceId: `test-bug-${Date.now()}`,
      name: 'TEST_BUG_EXPLORATION_5',
      ownerId: 'test-user-5',
      members: ['test-user-5'],
      plan: 'basic',
    });

    console.log('📝 Test Case 5: Testing retrieval after save (simulating page refresh)');

    // Step 1: Save AI configuration
    await Workspace.findByIdAndUpdate(
      workspace._id,
      {
        $set: {
          aiConfiguration: {
            aiModel: 'openai',
            creativityLevel: 0.5,
            captionStyle: 'Professional'
          }
        }
      },
      { new: true }
    );

    // Step 2: Simulate page refresh by clearing Mongoose cache and re-querying
    // This is equivalent to a frontend page refresh
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure write completes

    // Step 3: Retrieve workspace (simulating user refreshing settings page)
    const refreshed = await Workspace.findById(workspace._id).lean();

    console.log('After "page refresh" - aiConfiguration:', refreshed?.aiConfiguration);

    // ASSERTION: This should pass AFTER fix, but FAIL on unfixed code
    // On unfixed code: aiConfiguration will be undefined (displays default values in frontend)
    // On fixed code: aiConfiguration will contain saved values
    expect(refreshed).toBeDefined();
    expect(refreshed!.aiConfiguration).toBeDefined();
    expect(refreshed!.aiConfiguration?.aiModel).toBe('openai');
    expect(refreshed!.aiConfiguration?.creativityLevel).toBe(0.5);
    expect(refreshed!.aiConfiguration?.captionStyle).toBe('Professional');

    // Cleanup
    await Workspace.findByIdAndDelete(workspace._id);
  });
});
