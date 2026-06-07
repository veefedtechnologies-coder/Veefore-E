import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import * as fc from 'fast-check';
import { User } from '../server/models/User/User';
import { WorkspaceModel } from '../server/models/Workspace/Workspace';
import { convertWorkspace } from '../server/storage/converters';

/**
 * Preservation Property Tests for AI Configuration Retrieval Fix
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 * 
 * **Property 2: Preservation** - Non-AI-Configuration Fields and Null Cases
 * 
 * **IMPORTANT**: These tests run on UNFIXED code and MUST PASS
 * 
 * **GOAL**: Verify baseline behavior for non-buggy inputs BEFORE the fix.
 * These tests confirm that:
 * 1. Workspaces without AI configuration return aiConfiguration: undefined (fallback preserved)
 * 2. All non-AI-configuration fields convert correctly
 * 3. Workspace list operations work correctly
 * 
 * These tests MUST pass on unfixed code and continue to pass after fix (no regressions).
 */

describe('Preservation Property Tests: AI Configuration Retrieval Fix', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testWorkspaceId: mongoose.Types.ObjectId;
  
  beforeAll(async () => {
    // Connect to test database
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
        firebaseUid: `test-preservation-retrieval-${timestamp}`,
        email: `test-preservation-retrieval-${timestamp}@test.com`,
        username: `testuser_preservation_retrieval_${timestamp}`,
        displayName: 'Test User Preservation Retrieval',
        emailVerified: true,
        preferences: {}
      });
      testUserId = testUser._id as mongoose.Types.ObjectId;
      
      // Create test workspace WITHOUT aiConfiguration
      const testWorkspace = await WorkspaceModel.create({
        userId: testUserId,
        name: 'Test Workspace Preservation Retrieval',
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
  }, 15000);
  
  afterAll(async () => {
    // Cleanup test data
    if (testUserId) {
      await User.deleteOne({ _id: testUserId }).catch(() => {});
    }
    if (testWorkspaceId) {
      await WorkspaceModel.deleteOne({ _id: testWorkspaceId }).catch(() => {});
    }
  }, 15000);

  /**
   * Test Case 1: Workspace with aiConfiguration: null returns aiConfiguration: undefined
   * 
   * **Property**: For ALL workspaces where MongoDB `aiConfiguration` is null,
   * `convertWorkspace` SHALL return `aiConfiguration: undefined`
   * 
   * **EXPECTED**: This test PASSES on unfixed code (fallback behavior preserved)
   * 
   * This verifies that the fallback to 'veegpt-hybrid' continues to work correctly.
   */
  test('should return aiConfiguration: undefined when MongoDB aiConfiguration is null', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Create workspace with explicit aiConfiguration: null
    const timestamp = Date.now();
    const workspaceWithNull = await WorkspaceModel.create({
      userId: testUserId,
      name: `Test Workspace Null AI Config ${timestamp}`,
      credits: 50,
      theme: 'ocean',
      aiPersonality: 'casual',
      isDefault: false,
      maxTeamMembers: 1,
      aiConfiguration: null
    });

    // Fetch and convert workspace
    const mongoDoc = await WorkspaceModel.findById(workspaceWithNull._id).lean();
    const convertedWorkspace = convertWorkspace(mongoDoc);

    // EXPECTED BEHAVIOR (on unfixed code):
    // aiConfiguration: null in MongoDB should convert to aiConfiguration: undefined
    expect(convertedWorkspace.aiConfiguration).toBeUndefined();

    // Cleanup
    await WorkspaceModel.deleteOne({ _id: workspaceWithNull._id });

    console.log('✅ Test Case 1 Passed: aiConfiguration: null converts to undefined (fallback preserved)');
  });

  /**
   * Test Case 2: New workspace without aiConfiguration field returns aiConfiguration: undefined
   * 
   * **Property**: For ALL workspaces where MongoDB `aiConfiguration` field is not present,
   * `convertWorkspace` SHALL return `aiConfiguration: undefined`
   * 
   * **EXPECTED**: This test PASSES on unfixed code (fallback behavior preserved)
   */
  test('should return aiConfiguration: undefined when MongoDB document has no aiConfiguration field', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Fetch workspace created without aiConfiguration field
    const mongoDoc = await WorkspaceModel.findById(testWorkspaceId).lean();
    const convertedWorkspace = convertWorkspace(mongoDoc);

    // EXPECTED BEHAVIOR (on unfixed code):
    // Missing aiConfiguration field should result in aiConfiguration: undefined
    expect(convertedWorkspace.aiConfiguration).toBeUndefined();

    console.log('✅ Test Case 2 Passed: Missing aiConfiguration field converts to undefined (fallback preserved)');
  });

  /**
   * Test Case 3: All non-AI-configuration fields are converted correctly
   * 
   * **Property**: For ALL workspaces, non-AI-configuration fields (id, userId, name, description,
   * avatar, credits, theme, aiPersonality, isDefault, maxTeamMembers, inviteCode, createdAt, updatedAt)
   * SHALL be converted identically whether or not `aiConfiguration` is present
   * 
   * **EXPECTED**: This test PASSES on unfixed code (field conversion preserved)
   * 
   * Uses property-based testing to generate many workspace configurations
   */
  test('should convert all non-AI-configuration fields correctly', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Property-based test: Generate random workspace configurations
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          description: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
          avatar: fc.option(fc.webUrl(), { nil: null }),
          credits: fc.integer({ min: 0, max: 10000 }),
          theme: fc.constantFrom('space', 'ocean', 'forest', 'sunset', 'neon'),
          aiPersonality: fc.constantFrom('professional', 'casual', 'creative', 'technical', 'friendly'),
          isDefault: fc.boolean(),
          maxTeamMembers: fc.integer({ min: 1, max: 100 }),
          inviteCode: fc.option(fc.string({ minLength: 6, maxLength: 12 }), { nil: null })
        }),
        async (workspaceData) => {
          const timestamp = Date.now() + Math.random();
          
          // Create workspace with generated data
          const workspace = await WorkspaceModel.create({
            userId: testUserId,
            name: `${workspaceData.name}_${timestamp}`,
            description: workspaceData.description,
            avatar: workspaceData.avatar,
            credits: workspaceData.credits,
            theme: workspaceData.theme,
            aiPersonality: workspaceData.aiPersonality,
            isDefault: workspaceData.isDefault,
            maxTeamMembers: workspaceData.maxTeamMembers,
            inviteCode: workspaceData.inviteCode
          });

          // Fetch and convert workspace
          const mongoDoc = await WorkspaceModel.findById(workspace._id).lean();
          const convertedWorkspace = convertWorkspace(mongoDoc);

          // EXPECTED BEHAVIOR (on unfixed code):
          // All non-AI-configuration fields must be converted correctly
          expect(convertedWorkspace.id).toBe(workspace._id.toString());
          expect(convertedWorkspace.userId).toBe(workspace.userId);
          expect(convertedWorkspace.name).toBe(workspace.name);
          expect(convertedWorkspace.description).toBe(workspaceData.description);
          expect(convertedWorkspace.avatar).toBe(workspaceData.avatar);
          expect(convertedWorkspace.credits).toBe(workspaceData.credits);
          expect(convertedWorkspace.theme).toBe(workspaceData.theme);
          expect(convertedWorkspace.aiPersonality).toBe(workspaceData.aiPersonality);
          expect(convertedWorkspace.isDefault).toBe(workspaceData.isDefault);
          expect(convertedWorkspace.maxTeamMembers).toBe(workspaceData.maxTeamMembers);
          expect(convertedWorkspace.inviteCode).toBe(workspaceData.inviteCode);
          expect(convertedWorkspace.createdAt).toBeDefined();
          expect(convertedWorkspace.updatedAt).toBeDefined();

          // Cleanup
          await WorkspaceModel.deleteOne({ _id: workspace._id });
        }
      ),
      { numRuns: 10 } // Run 10 random test cases
    );

    console.log('✅ Test Case 3 Passed: All non-AI-configuration fields convert correctly (10 random cases tested)');
  });

  /**
   * Test Case 4: Non-AI-configuration fields convert identically with or without AI configuration
   * 
   * **Property**: For ALL workspaces, non-AI-configuration fields SHALL produce
   * identical conversion results regardless of whether `aiConfiguration` is present
   * 
   * **EXPECTED**: This test PASSES on unfixed code (conversion independence preserved)
   */
  test('should convert non-AI fields identically with and without aiConfiguration present', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    const timestamp = Date.now();
    
    // Create two workspaces with identical non-AI fields
    const workspaceDataWithoutAI = {
      userId: testUserId,
      name: `Test Workspace Without AI ${timestamp}`,
      description: 'Test description',
      credits: 200,
      theme: 'sunset' as const,
      aiPersonality: 'technical' as const,
      isDefault: false,
      maxTeamMembers: 5
    };

    const workspaceDataWithAI = {
      ...workspaceDataWithoutAI,
      name: `Test Workspace With AI ${timestamp}`,
      aiConfiguration: null // Will be null in unfixed code scenarios
    };

    const workspaceWithoutAI = await WorkspaceModel.create(workspaceDataWithoutAI);
    const workspaceWithAI = await WorkspaceModel.create(workspaceDataWithAI);

    // Fetch and convert both workspaces
    const mongoDocWithoutAI = await WorkspaceModel.findById(workspaceWithoutAI._id).lean();
    const mongoDocWithAI = await WorkspaceModel.findById(workspaceWithAI._id).lean();
    
    const convertedWithoutAI = convertWorkspace(mongoDocWithoutAI);
    const convertedWithAI = convertWorkspace(mongoDocWithAI);

    // EXPECTED BEHAVIOR (on unfixed code):
    // All non-AI fields should be identical in both converted workspaces
    expect(convertedWithoutAI.userId).toBe(convertedWithAI.userId);
    expect(convertedWithoutAI.description).toBe(convertedWithAI.description);
    expect(convertedWithoutAI.credits).toBe(convertedWithAI.credits);
    expect(convertedWithoutAI.theme).toBe(convertedWithAI.theme);
    expect(convertedWithoutAI.aiPersonality).toBe(convertedWithAI.aiPersonality);
    expect(convertedWithoutAI.isDefault).toBe(convertedWithAI.isDefault);
    expect(convertedWithoutAI.maxTeamMembers).toBe(convertedWithAI.maxTeamMembers);

    // Both should have aiConfiguration: undefined on unfixed code
    expect(convertedWithoutAI.aiConfiguration).toBeUndefined();
    expect(convertedWithAI.aiConfiguration).toBeUndefined();

    // Cleanup
    await WorkspaceModel.deleteOne({ _id: workspaceWithoutAI._id });
    await WorkspaceModel.deleteOne({ _id: workspaceWithAI._id });

    console.log('✅ Test Case 4 Passed: Non-AI fields convert identically regardless of AI config presence');
  });

  /**
   * Test Case 5: Workspace list operations preserve ordering and field conversion
   * 
   * **Property**: For ALL workspace list operations (`getWorkspacesByUserId`),
   * ordering and field conversion SHALL be preserved correctly
   * 
   * **EXPECTED**: This test PASSES on unfixed code (list operations preserved)
   */
  test('should preserve ordering and field conversion in workspace list operations', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    const timestamp = Date.now();
    
    // Create multiple workspaces for the user
    const workspace1 = await WorkspaceModel.create({
      userId: testUserId,
      name: `List Test Workspace 1 ${timestamp}`,
      credits: 100,
      theme: 'space',
      aiPersonality: 'professional',
      isDefault: false,
      maxTeamMembers: 1,
      createdAt: new Date(timestamp)
    });

    const workspace2 = await WorkspaceModel.create({
      userId: testUserId,
      name: `List Test Workspace 2 ${timestamp}`,
      credits: 200,
      theme: 'ocean',
      aiPersonality: 'casual',
      isDefault: false,
      maxTeamMembers: 2,
      createdAt: new Date(timestamp + 1000)
    });

    // Fetch all workspaces for user
    const mongoDocs = await WorkspaceModel.find({ userId: testUserId }).sort({ createdAt: 1 }).lean();
    const convertedWorkspaces = mongoDocs.map(doc => convertWorkspace(doc));

    // EXPECTED BEHAVIOR (on unfixed code):
    // 1. All workspaces are returned
    expect(convertedWorkspaces.length).toBeGreaterThanOrEqual(3); // At least our 3 test workspaces

    // 2. Ordering is preserved (sorted by createdAt)
    const workspace1Index = convertedWorkspaces.findIndex(w => w.id === workspace1._id.toString());
    const workspace2Index = convertedWorkspaces.findIndex(w => w.id === workspace2._id.toString());
    expect(workspace1Index).toBeLessThan(workspace2Index);

    // 3. All fields are converted correctly for each workspace
    const convertedWorkspace1 = convertedWorkspaces.find(w => w.id === workspace1._id.toString());
    const convertedWorkspace2 = convertedWorkspaces.find(w => w.id === workspace2._id.toString());

    expect(convertedWorkspace1?.name).toBe(workspace1.name);
    expect(convertedWorkspace1?.credits).toBe(workspace1.credits);
    expect(convertedWorkspace1?.theme).toBe(workspace1.theme);
    expect(convertedWorkspace1?.aiConfiguration).toBeUndefined();

    expect(convertedWorkspace2?.name).toBe(workspace2.name);
    expect(convertedWorkspace2?.credits).toBe(workspace2.credits);
    expect(convertedWorkspace2?.theme).toBe(workspace2.theme);
    expect(convertedWorkspace2?.aiConfiguration).toBeUndefined();

    // Cleanup
    await WorkspaceModel.deleteOne({ _id: workspace1._id });
    await WorkspaceModel.deleteOne({ _id: workspace2._id });

    console.log('✅ Test Case 5 Passed: Workspace list operations preserve ordering and field conversion');
  });

  /**
   * Test Case 6: Property-based test for field conversion consistency
   * 
   * **Property**: For ALL randomly generated workspace configurations,
   * field conversion SHALL be consistent and correct
   * 
   * **EXPECTED**: This test PASSES on unfixed code (conversion consistency preserved)
   * 
   * This is a comprehensive property-based test that generates many diverse workspace
   * configurations and verifies consistent field conversion behavior.
   */
  test('should maintain field conversion consistency across diverse workspace configurations', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Property-based test: Generate diverse workspace configurations
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }),
          description: fc.option(fc.string({ maxLength: 500 }), { nil: null }),
          avatar: fc.option(fc.webUrl(), { nil: null }),
          credits: fc.integer({ min: 0, max: 100000 }),
          theme: fc.constantFrom('space', 'ocean', 'forest', 'sunset', 'neon', 'midnight', 'aurora'),
          aiPersonality: fc.constantFrom('professional', 'casual', 'creative', 'technical', 'friendly', 'humorous'),
          isDefault: fc.boolean(),
          maxTeamMembers: fc.integer({ min: 1, max: 1000 }),
          inviteCode: fc.option(fc.hexaString({ minLength: 8, maxLength: 16 }), { nil: null })
        }),
        async (config) => {
          const timestamp = Date.now() + Math.random() * 1000;
          
          // Create workspace
          const workspace = await WorkspaceModel.create({
            userId: testUserId,
            name: `PBT ${config.name} ${timestamp}`,
            description: config.description,
            avatar: config.avatar,
            credits: config.credits,
            theme: config.theme,
            aiPersonality: config.aiPersonality,
            isDefault: config.isDefault,
            maxTeamMembers: config.maxTeamMembers,
            inviteCode: config.inviteCode
          });

          // Fetch and convert
          const mongoDoc = await WorkspaceModel.findById(workspace._id).lean();
          const converted = convertWorkspace(mongoDoc);

          // EXPECTED BEHAVIOR (on unfixed code):
          // All fields must be converted correctly and consistently
          expect(converted.id).toBe(workspace._id.toString());
          expect(converted.userId).toBe(workspace.userId);
          expect(converted.name).toBe(workspace.name);
          expect(converted.description).toBe(config.description);
          expect(converted.avatar).toBe(config.avatar);
          expect(converted.credits).toBe(config.credits);
          expect(converted.theme).toBe(config.theme);
          expect(converted.aiPersonality).toBe(config.aiPersonality);
          expect(converted.isDefault).toBe(config.isDefault);
          expect(converted.maxTeamMembers).toBe(config.maxTeamMembers);
          expect(converted.inviteCode).toBe(config.inviteCode);
          expect(converted.aiConfiguration).toBeUndefined();

          // Type safety checks
          expect(typeof converted.id).toBe('string');
          expect(typeof converted.credits).toBe('number');
          expect(typeof converted.isDefault).toBe('boolean');

          // Cleanup
          await WorkspaceModel.deleteOne({ _id: workspace._id });
        }
      ),
      { numRuns: 20 } // Run 20 diverse test cases
    );

    console.log('✅ Test Case 6 Passed: Field conversion consistency maintained (20 diverse configurations tested)');
  });
});

/**
 * PRESERVATION GUARANTEES DOCUMENTATION
 * 
 * These tests verify baseline behavior on UNFIXED code for non-buggy inputs.
 * All tests MUST PASS on unfixed code and continue to PASS after fix.
 * 
 * Preserved Behaviors:
 * 
 * 1. aiConfiguration: null → aiConfiguration: undefined
 *    - Workspaces with explicit null value return undefined
 *    - Fallback to 'veegpt-hybrid' is preserved
 * 
 * 2. Missing aiConfiguration field → aiConfiguration: undefined
 *    - New workspaces without the field return undefined
 *    - Fallback behavior is preserved
 * 
 * 3. All Non-AI-Configuration Fields Convert Correctly
 *    - id, userId, name, description, avatar
 *    - credits, theme, aiPersonality, isDefault
 *    - maxTeamMembers, inviteCode, createdAt, updatedAt
 *    - All fields convert correctly regardless of AI config presence
 * 
 * 4. Field Conversion Independence
 *    - Non-AI fields convert identically with or without AI configuration
 *    - No interference between AI and non-AI field conversion
 * 
 * 5. Workspace List Operations
 *    - Ordering is preserved
 *    - All fields convert correctly in list operations
 *    - Multiple workspaces handled correctly
 * 
 * 6. Conversion Consistency
 *    - 20 diverse workspace configurations tested
 *    - Consistent conversion behavior across all configurations
 *    - Type safety maintained
 * 
 * Total Test Coverage:
 * - 6 test cases
 * - 30+ property-based test runs (10 + 20)
 * - Multiple workspace scenarios
 * - Comprehensive field coverage
 * 
 * **EXPECTED OUTCOME**: All tests PASS on unfixed code (baseline preserved)
 * and continue to PASS after fix (no regressions)
 */
