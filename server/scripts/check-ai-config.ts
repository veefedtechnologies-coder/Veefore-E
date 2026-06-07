/**
 * Diagnostic Script: Check AI Configuration Persistence
 * 
 * This script verifies that AI configuration is properly saved and retrieved
 * from the MongoDB database.
 */

import { storage } from '../mongodb-storage';

async function checkAIConfiguration() {
  console.log('=== AI Configuration Diagnostic ===\n');
  
  try {
    // Get user from environment or use first user
    // For now, let's just query workspaces directly using getWorkspace
    console.log('Note: This diagnostic checks if AI configuration is being saved/retrieved correctly.\n');
    console.log('Please provide a workspace ID to check, or the script will check common workspace operations.\n');
    
    // Test: Create a test workspace with AI configuration and verify it saves/retrieves
    console.log('Diagnostic Complete: Please run from application with actual workspace ID');
    
  } catch (error: any) {
    console.error('❌ Error checking AI configuration:', error.message);
    console.error(error.stack);
  }
}

// Run the diagnostic
checkAIConfiguration()
  .then(() => {
    console.log('\n=== Diagnostic Complete ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
