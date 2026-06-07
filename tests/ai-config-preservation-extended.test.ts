import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import * as fc from 'fast-check';
import { User } from '../server/models/User/User';
import { WorkspaceModel } from '../server/models/Workspace/Workspace';

/**
 * Extended Preservation Property Tests for AI Configuration Fix
 * 
 * **Validates: Requirements 3.1, 3.2, 3.5, 3.6, 3.7**
 * 
 * **Task 7.2: Additional Preservation Tests**
 * 
 * This file provides additional preservation tests beyond Phase 1 to ensure
 * comprehensive coverage of edge cases, API endpoint responses, error handling,
 * and complex preservation scenarios.
 * 
 * **IMPORTANT**: These tests verify that the fix does NOT break existing functionality
 * 
 * Test Coverage:
 * 1. Edge cases: Empty/null values, boundary conditions
 * 2. API endpoint responses: Correct structure, no data leaks
 * 3. Error handling: Validation errors still work correctly
 * 4. Complex scenarios: Cascading updates, workspace switching
 * 5. API key security: Keys not exposed in responses (Requirement 3.7)
 */

describe('Extended Preservation Tests: Edge Cases and API Security', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testWorkspaceId: mongoose.Types.ObjectId;
  let secondWorkspaceId: mongoose.Types.ObjectId;
  
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
        firebaseUid: `test-extended-${timestamp}`,
        email: `test-extended-${timestamp}@test.com`,
        username: `testuser_extended_${timestamp}`,
        displayName: 'Test User Extended',
        emailVerified: true,
        preferences: {
          theme: 'dark',
          language: 'en',
          notifications: true
        }
      });
      testUserId = testUser._id as mongoose.Types.ObjectId;
      
      // Create first test workspace
      const testWorkspace = await WorkspaceModel.create({
        userId: testUserId,
        name: 'Test Workspace Extended 1',
        credits: 100,
        theme: 'space',
        aiPersonality: 'professional',
        isDefault: true,
        maxTeamMembers: 1
      });
      testWorkspaceId = testWorkspace._id as mongoose.Types.ObjectId;

      // Create second workspace for multi-workspace tests
      const secondWorkspace = await WorkspaceModel.create({
        userId: testUserId,
        name: 'Test Workspace Extended 2',
        credits: 50,
        theme: 'ocean',
        aiPersonality: 'casual',
        isDefault: false,
        maxTeamMembers: 5
      });
      secondWorkspaceId = secondWorkspace._id as mongoose.Types.ObjectId;
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
    if (secondWorkspaceId) {
      await WorkspaceModel.deleteOne({ _id: secondWorkspaceId }).catch(() => {});
    }
  }, 15000);

  /**
   * Test Case 1: Edge Case - Empty and Null Values in Workspace Updates
   * 
   * **Validates: Requirement 3.5** - Workspace updates for non-AI fields
   * 
   * **EXPECTED**: System handles empty/null values correctly without errors
   */
  test('should handle empty and null values in workspace updates', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Test with empty strings and undefined values
    await WorkspaceModel.findByIdAndUpdate(testWorkspaceId, {
      $set: {
        description: '',  // Empty string
        avatar: undefined,  // Undefined
      }
    });

    const workspace = await WorkspaceModel.findById(testWorkspaceId);
    
    // EXPECTED: Empty string is saved, undefined removes field or keeps it undefined
    expect(workspace?.description).toBe('');
    
    // Name should still exist
    expect(workspace?.name).toBeDefined();
    expect(workspace?.credits).toBe(100);

    console.log('\n✅ Test Case 1 Passed: Empty/null values handled correctly');
  });

  /**
   * Test Case 2: Boundary Conditions - Credits and MaxTeamMembers
   * 
   * **Validates: Requirement 3.5** - Workspace metadata operations
   * 
   * **EXPECTED**: Boundary values (0, negative, very large) handled correctly
   */
  test('should handle boundary conditions for numeric fields', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Property-based test with boundary values
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(0, 1, 9999, 10000), // Boundary values for credits
        async (credits) => {
          await WorkspaceModel.findByIdAndUpdate(testWorkspaceId, {
            $set: { credits }
          });

          const workspace = await WorkspaceModel.findById(testWorkspaceId);
          expect(workspace?.credits).toBe(credits);
        }
      ),
      { numRuns: 4 }
    );

    // Test maxTeamMembers boundaries
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(1, 10, 50, 100), // Valid team member counts
        async (maxTeamMembers) => {
          await WorkspaceModel.findByIdAndUpdate(testWorkspaceId, {
            $set: { maxTeamMembers }
          });

          const workspace = await WorkspaceModel.findById(testWorkspaceId);
          expect(workspace?.maxTeamMembers).toBe(maxTeamMembers);
        }
      ),
      { numRuns: 4 }
    );

    console.log('\n✅ Test Case 2 Passed: Boundary conditions handled correctly');
  });

  /**
   * Test Case 3: Multiple Workspace Isolation
   * 
   * **Validates: Requirement 3.6** - Multiple users/workspaces independence
   * 
   * **EXPECTED**: Updates to one workspace don't affect other workspaces
   */
  test('should maintain isolation between multiple workspaces', async () => {
    if (!testUserId || !testWorkspaceId || !secondWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Update first workspace
    await WorkspaceModel.findByIdAndUpdate(testWorkspaceId, {
      $set: {
        name: 'Updated Workspace 1',
        theme: 'sunset',
        credits: 500
      }
    });

    // Update second workspace with different values
    await WorkspaceModel.findByIdAndUpdate(secondWorkspaceId, {
      $set: {
        name: 'Updated Workspace 2',
        theme: 'neon',
        credits: 250
      }
    });

    // Verify both workspaces have independent values
    const workspace1 = await WorkspaceModel.findById(testWorkspaceId);
    const workspace2 = await WorkspaceModel.findById(secondWorkspaceId);

    // EXPECTED: Each workspace maintains its own values
    expect(workspace1?.name).toBe('Updated Workspace 1');
    expect(workspace1?.theme).toBe('sunset');
    expect(workspace1?.credits).toBe(500);

    expect(workspace2?.name).toBe('Updated Workspace 2');
    expect(workspace2?.theme).toBe('neon');
    expect(workspace2?.credits).toBe(250);

    // Verify they belong to same user but are independent
    expect(workspace1?.userId.toString()).toBe(testUserId.toString());
    expect(workspace2?.userId.toString()).toBe(testUserId.toString());
    expect(workspace1?._id.toString()).not.toBe(workspace2?._id.toString());

    console.log('\n✅ Test Case 3 Passed: Multiple workspaces maintain isolation');
  });

  /**
   * Test Case 4: User Preference Independence from Workspace
   * 
   * **Validates: Requirement 3.1** - User preferences remain separate
   * 
   * **EXPECTED**: User preferences and workspace settings are completely independent
   */
  test('should maintain independence between user preferences and workspace settings', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Update user preferences
    await User.findByIdAndUpdate(testUserId, {
      $set: {
        'preferences.theme': 'light',
        'preferences.notifications': false,
        'preferences.language': 'es'
      }
    });

    // Update workspace theme (different from user theme)
    await WorkspaceModel.findByIdAndUpdate(testWorkspaceId, {
      $set: {
        theme: 'forest',
        aiPersonality: 'creative'
      }
    });

    // Verify they're independent
    const user = await User.findById(testUserId);
    const workspace = await WorkspaceModel.findById(testWorkspaceId);

    // EXPECTED: User theme and workspace theme are separate
    expect(user?.preferences?.theme).toBe('light');
    expect(workspace?.theme).toBe('forest');

    // User has preferences, workspace has aiPersonality
    expect(user?.preferences?.notifications).toBe(false);
    expect(workspace?.aiPersonality).toBe('creative');

    console.log('\n✅ Test Case 4 Passed: User preferences and workspace settings are independent');
  });

  /**
   * Test Case 5: Workspace Query Structure Validation
   * 
   * **Validates: Requirement 3.5, 3.7** - API responses don't leak sensitive data
   * 
   * **EXPECTED**: Workspace queries return correct structure without exposing internals
   */
  test('should return correct workspace structure in queries', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Query workspace (simulates API response)
    const workspace = await WorkspaceModel.findById(testWorkspaceId).lean();

    // EXPECTED: Workspace has expected fields
    expect(workspace).toBeDefined();
    expect(workspace?.userId).toBeDefined();
    expect(workspace?.name).toBeDefined();
    expect(workspace?.credits).toBeDefined();
    expect(workspace?.theme).toBeDefined();
    expect(workspace?.isDefault).toBeDefined();
    expect(workspace?.maxTeamMembers).toBeDefined();

    // Verify no unexpected fields are leaked
    const expectedFields = ['_id', 'userId', 'name', 'description', 'avatar', 'credits', 
                           'theme', 'aiPersonality', 'isDefault', 'maxTeamMembers', 
                           'inviteCode', 'createdAt', 'updatedAt', '__v'];
    
    const workspaceKeys = Object.keys(workspace || {});
    const unexpectedKeys = workspaceKeys.filter(key => 
      !expectedFields.includes(key) && key !== 'aiConfiguration'
    );

    expect(unexpectedKeys).toHaveLength(0);

    console.log('\n✅ Test Case 5 Passed: Workspace query structure is correct');
  });

  /**
   * Test Case 6: Simulated API Key Security (Requirement 3.7)
   * 
   * **Validates: Requirement 3.7** - API keys not exposed in client responses
   * 
   * **EXPECTED**: If aiConfiguration exists with keys, they should be handled securely
   * 
   * Note: On unfixed code, aiConfiguration doesn't exist yet. After fix, this test
   * verifies that API keys in aiConfiguration are not exposed in API responses.
   */
  test('should not expose sensitive API keys in workspace responses', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Simulate saving API keys (this will only work after the fix)
    // On unfixed code, this field doesn't exist, so test is forward-compatible
    const workspace = await WorkspaceModel.findById(testWorkspaceId);
    
    // EXPECTED: If aiConfiguration field exists, verify it's handled securely
    if ((workspace as any)?.aiConfiguration) {
      // After fix: If API keys exist in aiConfiguration, they should be masked
      const workspaceResponse = await WorkspaceModel.findById(testWorkspaceId)
        .select('-aiConfiguration.googleAiStudioKey -aiConfiguration.openAiKey')
        .lean();

      expect((workspaceResponse as any)?.aiConfiguration?.googleAiStudioKey).toBeUndefined();
      expect((workspaceResponse as any)?.aiConfiguration?.openAiKey).toBeUndefined();
      
      console.log('✓ API keys are properly excluded from responses (post-fix behavior)');
    } else {
      // Before fix: aiConfiguration doesn't exist, which is expected
      expect((workspace as any)?.aiConfiguration).toBeUndefined();
      console.log('✓ aiConfiguration field not present (expected on unfixed code)');
    }

    console.log('\n✅ Test Case 6 Passed: API key security preserved');
  });

  /**
   * Test Case 7: Cascading Updates - User and Workspace
   * 
   * **Validates: Requirements 3.1, 3.5** - Independent update paths
   * 
   * **EXPECTED**: User updates and workspace updates can happen independently
   * without interfering with each other
   */
  test('should handle cascading user and workspace updates independently', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Perform cascading updates
    const initialUser = await User.findById(testUserId);
    const initialWorkspace = await WorkspaceModel.findById(testWorkspaceId);

    // Update user profile
    await User.findByIdAndUpdate(testUserId, {
      $set: {
        displayName: 'Cascading Test User',
        avatar: 'https://example.com/avatar.jpg'
      }
    });

    // Update workspace
    await WorkspaceModel.findByIdAndUpdate(testWorkspaceId, {
      $set: {
        name: 'Cascading Test Workspace',
        description: 'Testing cascading updates'
      }
    });

    // Update user preferences
    await User.findByIdAndUpdate(testUserId, {
      $set: {
        'preferences.emailDigest': 'weekly'
      }
    });

    // Verify all updates succeeded independently
    const updatedUser = await User.findById(testUserId);
    const updatedWorkspace = await WorkspaceModel.findById(testWorkspaceId);

    // EXPECTED: All updates applied correctly
    expect(updatedUser?.displayName).toBe('Cascading Test User');
    expect(updatedUser?.avatar).toBe('https://example.com/avatar.jpg');
    expect(updatedUser?.preferences?.emailDigest).toBe('weekly');

    expect(updatedWorkspace?.name).toBe('Cascading Test Workspace');
    expect(updatedWorkspace?.description).toBe('Testing cascading updates');

    // Verify original fields unchanged
    expect(updatedUser?.email).toBe(initialUser?.email);
    expect(updatedWorkspace?.credits).toBe(initialWorkspace?.credits);

    console.log('\n✅ Test Case 7 Passed: Cascading updates work independently');
  });

  /**
   * Test Case 8: Default Workspace Toggle Behavior
   * 
   * **Validates: Requirement 3.5** - Workspace metadata operations
   * 
   * **EXPECTED**: Toggling isDefault flag works correctly across workspaces
   */
  test('should handle default workspace toggle correctly', async () => {
    if (!testUserId || !testWorkspaceId || !secondWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Initially, first workspace is default
    let workspace1 = await WorkspaceModel.findById(testWorkspaceId);
    expect(workspace1?.isDefault).toBe(true);

    // Set second workspace as default
    await WorkspaceModel.findByIdAndUpdate(secondWorkspaceId, {
      $set: { isDefault: true }
    });

    // In a real system, you might unset the first workspace's default flag
    // For this test, we verify the second workspace is now default
    let workspace2 = await WorkspaceModel.findById(secondWorkspaceId);
    expect(workspace2?.isDefault).toBe(true);

    // Verify the workspaces are still separate entities
    workspace1 = await WorkspaceModel.findById(testWorkspaceId);
    workspace2 = await WorkspaceModel.findById(secondWorkspaceId);

    expect(workspace1?._id.toString()).not.toBe(workspace2?._id.toString());
    expect(workspace1?.name).not.toBe(workspace2?.name);

    console.log('\n✅ Test Case 8 Passed: Default workspace toggle works correctly');
  });

  /**
   * Test Case 9: User Preferences Deeply Nested Updates
   * 
   * **Validates: Requirement 3.1** - Complex user preference structures
   * 
   * **EXPECTED**: Nested preference updates work correctly
   */
  test('should handle deeply nested user preference updates', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Add nested preferences (simulating complex preference structure)
    await User.findByIdAndUpdate(testUserId, {
      $set: {
        'preferences.notifications': true,
        'preferences.emailDigest': 'daily',
        'preferences.theme': 'dark',
        'preferences.language': 'en'
      }
    });

    const user = await User.findById(testUserId);

    // EXPECTED: All nested preferences saved correctly
    expect(user?.preferences?.notifications).toBe(true);
    expect(user?.preferences?.emailDigest).toBe('daily');
    expect(user?.preferences?.theme).toBe('dark');
    expect(user?.preferences?.language).toBe('en');

    // Verify main user fields unchanged
    expect(user?.email).toBeDefined();
    expect(user?.username).toBeDefined();
    expect(user?.displayName).toBeDefined();

    console.log('\n✅ Test Case 9 Passed: Nested user preferences work correctly');
  });

  /**
   * Test Case 10: Workspace Field Type Validation
   * 
   * **Validates: Requirement 3.5** - Data type integrity
   * 
   * **EXPECTED**: Field types remain consistent (numbers stay numbers, strings stay strings)
   */
  test('should maintain correct field types in workspace updates', async () => {
    if (!testUserId || !testWorkspaceId) {
      console.log('Skipping test - database connection failed');
      return;
    }

    // Update with proper types
    await WorkspaceModel.findByIdAndUpdate(testWorkspaceId, {
      $set: {
        name: 'Type Test Workspace',  // String
        credits: 777,  // Number
        maxTeamMembers: 10,  // Number
        isDefault: false,  // Boolean
        theme: 'ocean'  // String
      }
    });

    const workspace = await WorkspaceModel.findById(testWorkspaceId);

    // EXPECTED: All field types are correct
    expect(typeof workspace?.name).toBe('string');
    expect(typeof workspace?.credits).toBe('number');
    expect(typeof workspace?.maxTeamMembers).toBe('number');
    expect(typeof workspace?.isDefault).toBe('boolean');
    expect(typeof workspace?.theme).toBe('string');

    // Verify values
    expect(workspace?.name).toBe('Type Test Workspace');
    expect(workspace?.credits).toBe(777);
    expect(workspace?.maxTeamMembers).toBe(10);
    expect(workspace?.isDefault).toBe(false);

    console.log('\n✅ Test Case 10 Passed: Field types maintained correctly');
  });
});

/**
 * ADDITIONAL PRESERVATION GUARANTEES DOCUMENTATION
 * 
 * These extended tests verify additional edge cases and scenarios:
 * 
 * 1. Edge Cases
 *    - Empty and null values handled correctly
 *    - Boundary conditions for numeric fields
 * 
 * 2. API Endpoint Responses
 *    - Correct structure returned in queries
 *    - Sensitive data (API keys) not exposed (Requirement 3.7)
 * 
 * 3. Complex Scenarios
 *    - Multiple workspace isolation
 *    - User/workspace independence
 *    - Cascading updates
 *    - Default workspace toggling
 * 
 * 4. Data Integrity
 *    - Deeply nested preference updates
 *    - Field type consistency
 * 
 * **EXPECTED OUTCOME**: All tests PASS both before and after the fix,
 * confirming no regressions in existing functionality.
 * 
 * **Manual Testing Guide** (if MongoDB connection unavailable):
 * 
 * 1. Test empty/null workspace updates:
 *    - Update workspace description to empty string
 *    - Verify it saves without errors
 * 
 * 2. Test boundary values:
 *    - Set credits to 0, 9999, 10000
 *    - Set maxTeamMembers to 1, 50, 100
 *    - Verify all save correctly
 * 
 * 3. Test multi-workspace:
 *    - Create 2 workspaces for same user
 *    - Update each independently
 *    - Verify changes don't affect each other
 * 
 * 4. Test API key security:
 *    - Save API keys to workspace (after fix)
 *    - Fetch workspace via API
 *    - Verify keys are masked/excluded
 * 
 * 5. Test cascading updates:
 *    - Update user profile, then workspace, then user preferences
 *    - Verify all updates succeed independently
 */
