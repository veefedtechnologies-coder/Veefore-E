/**
 * Diagnostic script: AI Configuration save/reload diagnosis
 * 
 * This script traces the full round-trip flow:
 * 1. GET /api/workspaces → check if aiConfiguration is present
 * 2. PUT /api/workspaces/:id with test aiConfiguration
 * 3. GET /api/workspaces again → verify aiConfiguration persisted
 * 
 * Run: npx tsx scripts/diag-ai-config.ts
 */

import { storage } from '../server/mongodb-storage';

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('AI CONFIGURATION SAVE/RELOAD DIAGNOSIS');
    console.log('='.repeat(80));
    console.log();

    // Get all workspaces to find one to test with
    const userId = process.argv[2];
    if (!userId) {
      console.error('❌ ERROR: Please provide a userId as the first argument');
      console.log('Usage: npx tsx scripts/diag-ai-config.ts <userId>');
      process.exit(1);
    }

    console.log(`📋 Fetching workspaces for user: ${userId}`);
    const workspaces = await storage.getWorkspacesByUserId(userId);
    
    if (!Array.isArray(workspaces) || workspaces.length === 0) {
      console.error(`❌ No workspaces found for user ${userId}`);
      process.exit(1);
    }

    const workspace = workspaces[0];
    const workspaceId = (workspace as any).id || (workspace as any)._id;
    
    console.log(`✅ Found ${workspaces.length} workspace(s)`);
    console.log(`   Testing with workspace: ${(workspace as any).name} (${workspaceId})`);
    console.log();

    // STEP 1: Read current state
    console.log('STEP 1: Read current aiConfiguration');
    console.log('-'.repeat(80));
    const before = await storage.getWorkspace(workspaceId);
    console.log('Current workspace data:');
    console.log('  - id:', (before as any).id || (before as any)._id);
    console.log('  - name:', (before as any).name);
    console.log('  - userId:', (before as any).userId);
    console.log('  - aiConfiguration:', JSON.stringify((before as any).aiConfiguration, null, 2));
    console.log();

    // STEP 2: Update with test aiConfiguration
    console.log('STEP 2: Save test aiConfiguration');
    console.log('-'.repeat(80));
    const testConfig = {
      aiModel: 'gemini-2.0-flash-exp',
      creativityLevel: 0.85,
      captionStyle: 'Punchy & Short',
      aiPersona: 'Friendly & Conversational',
      responseLength: 'short',
      multilingual: 'enabled',
      videoEngine: 'realistic',
      thumbnailStyle: 'abstract',
      autoHashtags: false,
      contentSafety: 'strict',
      aiMemory: 'contextual',
      autoLearning: false,
      optimizationGoals: 'Virality'
    };
    console.log('Test config:', JSON.stringify(testConfig, null, 2));
    
    const updated = await storage.updateWorkspace(workspaceId, { aiConfiguration: testConfig } as any);
    console.log('✅ Save completed');
    console.log('   Returned aiConfiguration:', JSON.stringify((updated as any)?.aiConfiguration, null, 2));
    console.log();

    // STEP 3: Re-read to verify persistence
    console.log('STEP 3: Re-read to verify persistence');
    console.log('-'.repeat(80));
    const after = await storage.getWorkspace(workspaceId);
    console.log('Re-fetched workspace data:');
    console.log('  - aiConfiguration:', JSON.stringify((after as any).aiConfiguration, null, 2));
    console.log();

    // STEP 4: Validate
    console.log('STEP 4: Validation');
    console.log('-'.repeat(80));
    const afterConfig = (after as any).aiConfiguration;
    if (!afterConfig) {
      console.error('❌ FAILED: aiConfiguration is null/undefined after save+refetch');
      process.exit(1);
    }

    let allMatch = true;
    for (const [key, value] of Object.entries(testConfig)) {
      if (afterConfig[key] !== value) {
        console.error(`❌ Mismatch on "${key}": expected ${JSON.stringify(value)}, got ${JSON.stringify(afterConfig[key])}`);
        allMatch = false;
      }
    }

    if (allMatch) {
      console.log('✅ SUCCESS: All fields match! Server-side persistence is working correctly.');
      console.log();
      console.log('CONCLUSION:');
      console.log('  Server save + DB persistence + GET round-trip all work correctly.');
      console.log('  If the client form still reverts on reload, the issue is client-side:');
      console.log('    1. React Query cache not refetching after save (check refetchQueries call)');
      console.log('    2. Form useEffect not reacting to refreshed workspace data');
      console.log('    3. Client HMR lag (requires hard refresh to pick up cache fix)');
      console.log();
      console.log('NEXT STEPS:');
      console.log('  1. Check browser DevTools Network tab after clicking Save');
      console.log('  2. Look for GET /api/workspaces request after PUT 200');
      console.log('  3. Verify the GET response includes aiConfiguration with saved values');
      console.log('  4. If GET response is correct but form reverts, check useEffect logs');
      console.log('  5. Try hard refresh (Cmd+Shift+R) to rule out HMR lag');
    } else {
      console.log('❌ FAILED: Server-side persistence issue detected.');
      console.log('   The save completed but re-fetching returned different values.');
      console.log('   This indicates a server-side storage or retrieval bug.');
    }
    console.log();

  } catch (error) {
    console.error('❌ Script error:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
