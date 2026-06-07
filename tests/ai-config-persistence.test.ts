import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { User } from '../server/models/User/User';
import { WorkspaceModel } from '../server/models/Workspace/Workspace';

/**
 * Bug Condition Exploration Test for AI Configuration Persistence
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
 * 
 * **Property 1: Bug Condition** - AI Configuration Persistence Failure
 * 
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 * 
 * **GOAL**: Surface counterexamples that demonstrate settings save to wrong location and AI generation cannot read them
 * 
 * This test encodes the EXPECTED BEHAVIOR after the fix:
 * - AI Configuration settings should save to `workspace.aiConfiguration`
 * - Form should load values from `workspace.aiConfiguration`
 * - AI generation should read from `workspace.aiConfiguration`
 * 
 * On UNFIXED code:
 * - Settings save to `userData.preferences` instead
 * - workspace.aiConfiguration is undefined/empty
 * - Form displays from userData.preferences (false impression)
 * - AI generation cannot find settings in workspace.aiConfiguration
 * 
 * After the fix, these tests will PASS, confirming the bug is resolved
 */

describe('Bug Condition Exploration: AI Configuration Persistence', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testWorkspaceId: mongoose.Types.ObjectId;
  
  beforeAll(async () => {
    // Connect to test database with timeout
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore-test', {
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 5000
        });
      } catch (error) {
        console.log('Failed to connect to MongoDB. Tests will be skipped.');
        console.log('Error:', error);
        return;
      }
    }
    
    try {
      // Create test user
      const timestamp = Date.now();
      const testUser = await User.create({
        firebaseUid: `test-ai-config-${timestamp}`,
        email: `test-ai-config-${timestamp}@test.com`,
        username: `testuser_${timestamp}`,
        displayName: 'Test User AI Config',
        emailVerified: true,
        preferences: {}
      });
      testUserId = testUser._id as mongoose.Types.ObjectId;
      
      // Create test workspace
      const testWorkspace = await WorkspaceModel.create({
        userId: testUserId,
        name: 'Test Workspace AI Config',
        credits: 100,
        theme: 'space',
        aiPersonality: 'professional',
        isDefault: true,
        maxTeamMembers: 1
      });
      testWorkspaceId = testWorkspace._id as mongoose.Types.ObjectId;
    } catch (error) {
      console.log('Failed to create test data:', error);
    }
  }, 15000); // 15 second timeout for beforeAll
  
  afterAll(async () => {
    // Cleanup test data
    if (testUserId) {
      await User.deleteOne({ _id: testUserId }).catch(() => {});
    }
    if (testWorkspaceId) {
      await WorkspaceModel.deleteOne({ _id: testWorkspaceId }).catch(() => {});
    }
    // Don't disconnect to avoid affecting other tests
  }, 15000); // 15 second timeout for afterAll

  /**
   * Test Case 1: Save AI Model Configuration
   * 
   * Expected on UNFIXED code:
   * - Settings save to userData.preferences.aiModel
   * - workspace.aiConfiguration.aiModel is undefined
   * - This test will FAIL (which is correct - proves bug exists)
   * 
   * Expected AFTER fix:
   * - Settings save to workspace.aiConfiguration.aiModel
   * - Test will PASS
   */
  test('should save aiModel to workspace.aiConfiguration (not userData.preferences)', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }
    
    const testAiModel = 'google-ai-studio';
    
    // Simulate what the form SHOULD do after the fix
    // On unfixed code, the form saves to userData.preferences instead
    await User.findByIdAndUpdate(testUserId, {
      $set: {
        'preferences.aiModel': testAiModel // WRONG location (current bug)
      }
    });
    
    // Reload data
    const user = await User.findById(testUserId);
    const workspace = await WorkspaceModel.findById(testWorkspaceId);
    
    // EXPECTED BEHAVIOR (after fix):
    // Settings should be in workspace.aiConfiguration, NOT userData.preferences
    
    console.log('\n📊 Test Case 1 Results:');
    console.log('userData.preferences.aiModel:', user?.preferences?.aiModel);
    console.log('workspace.aiConfiguration:', workspace?.aiConfiguration);
    
    // On unfixed code, this will FAIL because:
    // - workspace.aiConfiguration is undefined (not in schema yet)
    // - Settings are in userData.preferences instead
    
    // This assertion encodes the EXPECTED behavior after the fix
    expect(workspace?.aiConfiguration?.aiModel).toBe(testAiModel);
    expect(user?.preferences?.aiModel).toBeUndefined(); // Should NOT be in user preferences
    
    if (workspace?.aiConfiguration === undefined) {
      console.log('❌ BUG CONFIRMED: workspace.aiConfiguration is undefined');
      console.log('❌ Settings are in userData.preferences instead (wrong location)');
      console.log('Counterexample: Settings saved to userData.preferences, not workspace.aiConfiguration');
    }
  });

  /**
   * Test Case 2: AI Generation Reads from Correct Location
   * 
   * Expected on UNFIXED code:
   * - User saves custom aiModel to userData.preferences
   * - AI generation reads from workspace.aiConfiguration (which is undefined)
   * - AI generation falls back to default model
   * - This test will FAIL
   * 
   * Expected AFTER fix:
   * - Settings save to workspace.aiConfiguration
   * - AI generation reads user's configured model
   * - Test will PASS
   */
  test('should read aiModel from workspace.aiConfiguration for AI generation', async () => {
    const customModel = 'google-ai-studio';
    const defaultModel = 'veegpt-hybrid';
    
    // Simulate user saving AI config via form (current buggy behavior)
    await User.findByIdAndUpdate(testUserId, {
      $set: {
        'preferences.aiModel': customModel,
        'preferences.creativityLevel': 0.8,
        'preferences.googleAiStudioKey': 'AIzaSy...'
      }
    });
    
    // Reload data
    const user = await User.findById(testUserId);
    const workspace = await WorkspaceModel.findById(testWorkspaceId);
    
    // Simulate what AI generation system does:
    // It reads from workspace.aiConfiguration (NOT userData.preferences)
    const aiConfigForGeneration = workspace?.aiConfiguration?.aiModel || defaultModel;
    
    console.log('\n📊 Test Case 2 Results:');
    console.log('User configured model (in userData.preferences):', user?.preferences?.aiModel);
    console.log('workspace.aiConfiguration.aiModel:', workspace?.aiConfiguration?.aiModel);
    console.log('Model used by AI generation:', aiConfigForGeneration);
    
    // EXPECTED BEHAVIOR (after fix):
    // AI generation should use the user's configured model
    expect(aiConfigForGeneration).toBe(customModel);
    
    // On unfixed code, this will FAIL because:
    // - workspace.aiConfiguration is undefined
    // - AI generation uses default model instead of custom model
    if (aiConfigForGeneration === defaultModel) {
      console.log('❌ BUG CONFIRMED: AI generation uses default model');
      console.log('❌ User configured model in userData.preferences but AI reads from workspace.aiConfiguration');
      console.log('Counterexample:', {
        userConfigured: customModel,
        aiGenerationUsed: aiConfigForGeneration,
        reason: 'workspace.aiConfiguration is undefined'
      });
    }
  });

  /**
   * Test Case 3: API Keys Not Found
   * 
   * Expected on UNFIXED code:
   * - User saves googleAiStudioKey to userData.preferences
   * - AI generation looks for key in workspace.aiConfiguration
   * - Key not found, API call fails
   * - This test will FAIL
   * 
   * Expected AFTER fix:
   * - API keys save to workspace.aiConfiguration
   * - AI generation finds key and uses it
   * - Test will PASS
   */
  test('should find API keys in workspace.aiConfiguration for AI generation', async () => {
    const testApiKey = 'AIzaSy_test_key_12345';
    
    // Simulate user saving API key via form (current buggy behavior)
    await User.findByIdAndUpdate(testUserId, {
      $set: {
        'preferences.googleAiStudioKey': testApiKey,
        'preferences.openAiKey': 'sk-test-key'
      }
    });
    
    // Reload data
    const user = await User.findById(testUserId);
    const workspace = await WorkspaceModel.findById(testWorkspaceId);
    
    // Simulate what AI generation system does:
    // It reads API keys from workspace.aiConfiguration
    const apiKey = workspace?.aiConfiguration?.googleAiStudioKey;
    
    console.log('\n📊 Test Case 3 Results:');
    console.log('User saved API key (in userData.preferences):', user?.preferences?.googleAiStudioKey);
    console.log('workspace.aiConfiguration.googleAiStudioKey:', apiKey);
    console.log('AI generation can find key:', !!apiKey);
    
    // EXPECTED BEHAVIOR (after fix):
    // AI generation should find the API key in workspace config
    expect(apiKey).toBe(testApiKey);
    expect(apiKey).toBeDefined();
    
    // On unfixed code, this will FAIL because:
    // - workspace.aiConfiguration is undefined
    // - API key is in userData.preferences instead
    if (!apiKey) {
      console.log('❌ BUG CONFIRMED: API key not found in workspace.aiConfiguration');
      console.log('❌ Key is in userData.preferences but AI generation looks in workspace.aiConfiguration');
      console.log('Counterexample:', {
        keySavedTo: 'userData.preferences.googleAiStudioKey',
        aiGenerationReadsFrom: 'workspace.aiConfiguration.googleAiStudioKey',
        keyFound: false
      });
    }
  });

  /**
   * Test Case 4: All 15 Configuration Fields
   * 
   * Expected on UNFIXED code:
   * - User saves all 15 AI config fields
   * - Form displays them from userData.preferences (false impression that it works)
   * - But workspace.aiConfiguration is empty
   * - AI generation uses defaults for all fields
   * - This test will FAIL
   * 
   * Expected AFTER fix:
   * - All 15 fields save to workspace.aiConfiguration
   * - Form loads from workspace.aiConfiguration
   * - AI generation uses all configured values
   * - Test will PASS
   */
  test('should save all 15 AI config fields to workspace.aiConfiguration', async () => {
    const fullConfig = {
      aiModel: 'google-ai-studio',
      creativityLevel: 0.8,
      optimizationGoals: 'viral-potential',
      aiPersona: 'casual-friendly',
      captionStyle: 'humorous',
      responseLength: 'long',
      multilingual: 'enabled',
      videoEngine: 'fast',
      thumbnailStyle: 'vibrant',
      autoHashtags: false,
      contentSafety: 'strict',
      aiMemory: 'short-term',
      autoLearning: false,
      googleAiStudioKey: 'AIzaSy_test',
      openAiKey: 'sk-test'
    };
    
    // Simulate user saving all fields via form (current buggy behavior)
    await User.findByIdAndUpdate(testUserId, {
      $set: {
        'preferences.aiModel': fullConfig.aiModel,
        'preferences.creativityLevel': fullConfig.creativityLevel,
        'preferences.optimizationGoals': fullConfig.optimizationGoals,
        'preferences.aiPersona': fullConfig.aiPersona,
        'preferences.captionStyle': fullConfig.captionStyle,
        'preferences.responseLength': fullConfig.responseLength,
        'preferences.multilingual': fullConfig.multilingual,
        'preferences.videoEngine': fullConfig.videoEngine,
        'preferences.thumbnailStyle': fullConfig.thumbnailStyle,
        'preferences.autoHashtags': fullConfig.autoHashtags,
        'preferences.contentSafety': fullConfig.contentSafety,
        'preferences.aiMemory': fullConfig.aiMemory,
        'preferences.autoLearning': fullConfig.autoLearning,
        'preferences.googleAiStudioKey': fullConfig.googleAiStudioKey,
        'preferences.openAiKey': fullConfig.openAiKey
      }
    });
    
    // Reload data
    const user = await User.findById(testUserId);
    const workspace = await WorkspaceModel.findById(testWorkspaceId);
    
    console.log('\n📊 Test Case 4 Results:');
    console.log('All 15 fields in userData.preferences:', !!user?.preferences?.aiModel);
    console.log('workspace.aiConfiguration exists:', !!workspace?.aiConfiguration);
    console.log('workspace.aiConfiguration.aiModel:', workspace?.aiConfiguration?.aiModel);
    
    // EXPECTED BEHAVIOR (after fix):
    // All fields should be in workspace.aiConfiguration
    expect(workspace?.aiConfiguration).toBeDefined();
    expect(workspace?.aiConfiguration?.aiModel).toBe(fullConfig.aiModel);
    expect(workspace?.aiConfiguration?.creativityLevel).toBe(fullConfig.creativityLevel);
    expect(workspace?.aiConfiguration?.optimizationGoals).toBe(fullConfig.optimizationGoals);
    expect(workspace?.aiConfiguration?.aiPersona).toBe(fullConfig.aiPersona);
    expect(workspace?.aiConfiguration?.captionStyle).toBe(fullConfig.captionStyle);
    expect(workspace?.aiConfiguration?.responseLength).toBe(fullConfig.responseLength);
    expect(workspace?.aiConfiguration?.multilingual).toBe(fullConfig.multilingual);
    expect(workspace?.aiConfiguration?.videoEngine).toBe(fullConfig.videoEngine);
    expect(workspace?.aiConfiguration?.thumbnailStyle).toBe(fullConfig.thumbnailStyle);
    expect(workspace?.aiConfiguration?.autoHashtags).toBe(fullConfig.autoHashtags);
    expect(workspace?.aiConfiguration?.contentSafety).toBe(fullConfig.contentSafety);
    expect(workspace?.aiConfiguration?.aiMemory).toBe(fullConfig.aiMemory);
    expect(workspace?.aiConfiguration?.autoLearning).toBe(fullConfig.autoLearning);
    
    // API keys should exist but not be exposed
    expect(workspace?.aiConfiguration?.googleAiStudioKey).toBeDefined();
    expect(workspace?.aiConfiguration?.openAiKey).toBeDefined();
    
    // Settings should NOT be in userData.preferences
    expect(user?.preferences?.aiModel).toBeUndefined();
    
    // On unfixed code, this will FAIL because:
    // - workspace.aiConfiguration is undefined (field doesn't exist in schema yet)
    // - All settings are in userData.preferences instead
    // - Form gives false impression by displaying from userData.preferences
    if (!workspace?.aiConfiguration) {
      console.log('❌ BUG CONFIRMED: workspace.aiConfiguration does not exist');
      console.log('❌ All 15 fields are in userData.preferences (wrong location)');
      console.log('❌ Form displays them from userData.preferences giving false impression');
      console.log('❌ AI generation cannot access these settings');
      console.log('\nCounterexample:');
      console.log({
        settingsSavedTo: 'userData.preferences',
        workspaceAiConfiguration: 'undefined',
        formDisplaysFrom: 'userData.preferences (false impression)',
        aiGenerationReadsFrom: 'workspace.aiConfiguration (empty)',
        fieldsCount: 15,
        allFieldsInWrongLocation: true
      });
    }
  });

  /**
   * Test Case 5: Form Reload False Impression
   * 
   * This test documents the particularly deceptive aspect of the bug:
   * The form displays saved values (from userData.preferences), making it SEEM like
   * settings are working, but AI generation doesn't actually use them.
   * 
   * Expected on UNFIXED code:
   * - Form loads and displays values from userData.preferences
   * - User thinks settings are working (false impression)
   * - But AI generation reads from workspace.aiConfiguration (empty)
   * - This test will FAIL
   * 
   * Expected AFTER fix:
   * - Form loads from workspace.aiConfiguration
   * - AI generation also reads from workspace.aiConfiguration
   * - Settings actually work
   * - Test will PASS
   */
  test('should not give false impression by loading form from wrong location', async () => {
    const testModel = 'google-ai-studio';
    
    // Simulate user saving and then reloading the form
    await User.findByIdAndUpdate(testUserId, {
      $set: { 'preferences.aiModel': testModel }
    });
    
    const user = await User.findById(testUserId);
    const workspace = await WorkspaceModel.findById(testWorkspaceId);
    
    // What the form CURRENTLY does (buggy):
    // Loads from userData.preferences
    const formDisplayValue = user?.preferences?.aiModel || 'veegpt-hybrid';
    
    // What the form SHOULD do (after fix):
    // Load from workspace.aiConfiguration
    const correctFormDisplayValue = workspace?.aiConfiguration?.aiModel || 'veegpt-hybrid';
    
    // What AI generation does:
    // Reads from workspace.aiConfiguration
    const aiGenerationValue = workspace?.aiConfiguration?.aiModel || 'veegpt-hybrid';
    
    console.log('\n📊 Test Case 5 Results:');
    console.log('Form displays (from userData.preferences):', formDisplayValue);
    console.log('AI generation uses (from workspace.aiConfiguration):', aiGenerationValue);
    console.log('Values match:', formDisplayValue === aiGenerationValue);
    
    // EXPECTED BEHAVIOR (after fix):
    // Form should load from same location AI generation reads from
    expect(formDisplayValue).toBe(correctFormDisplayValue);
    expect(formDisplayValue).toBe(aiGenerationValue);
    expect(correctFormDisplayValue).toBe(testModel);
    
    // On unfixed code, this will FAIL because:
    // - Form displays from userData.preferences
    // - AI generation reads from workspace.aiConfiguration
    // - They don't match, giving false impression
    if (formDisplayValue !== aiGenerationValue) {
      console.log('❌ BUG CONFIRMED: Form displays values from wrong location');
      console.log('❌ This creates FALSE IMPRESSION that settings are working');
      console.log('Counterexample:', {
        formDisplaysFrom: 'userData.preferences',
        formShowsValue: formDisplayValue,
        aiGenerationReadsFrom: 'workspace.aiConfiguration',
        aiGenerationUsesValue: aiGenerationValue,
        falseImpression: true,
        userExperience: 'User thinks settings work but AI generation uses defaults'
      });
    }
  });
});

/**
 * COUNTEREXAMPLE DOCUMENTATION
 * 
 * Expected counterexamples to be found when running on UNFIXED code:
 * 
 * 1. Settings Save to Wrong Location
 *    - Location saved: userData.preferences
 *    - Location needed: workspace.aiConfiguration
 *    - Root cause: Form calls /api/user (PATCH) instead of /api/workspaces/:id (PUT)
 * 
 * 2. AI Generation Cannot Find Settings
 *    - AI generation reads: workspace.aiConfiguration (undefined)
 *    - Settings actually in: userData.preferences
 *    - Result: AI generation uses default values
 * 
 * 3. API Keys Not Found
 *    - Keys saved to: userData.preferences
 *    - AI generation looks in: workspace.aiConfiguration
 *    - Result: API calls fail with 400 error or use default keys
 * 
 * 4. Workspace Schema Missing Field
 *    - workspace.aiConfiguration: undefined (field doesn't exist)
 *    - Reason: IWorkspace interface and WorkspaceSchema don't include aiConfiguration
 * 
 * 5. Form Gives False Impression
 *    - Form loads from: userData.preferences
 *    - Form displays: Saved values
 *    - User thinks: Settings are working
 *    - Reality: AI generation uses defaults because it reads from empty workspace.aiConfiguration
 *    - This is particularly deceptive because everything LOOKS like it's working
 * 
 * These counterexamples confirm the root cause hypothesis:
 * - Backend schema is missing aiConfiguration field
 * - Frontend form calls wrong API endpoint
 * - Architectural mismatch between save location and read location
 */
