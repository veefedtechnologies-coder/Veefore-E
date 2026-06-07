/**
 * Test to verify what the API endpoint returns for workspace
 */

import 'dotenv/config';
import axios from 'axios';

const WORKSPACE_ID = '684402c2fd2cd4eb6521b386';
const API_URL = process.env.BASE_URL || 'http://localhost:5000';

async function testAPIResponse() {
  console.log('\n🧪 Testing API Workspace Response\n');
  console.log('='.repeat(60));

  try {
    // Note: This test assumes you have a valid auth token
    // For now, we'll just show what needs to be checked
    
    console.log('\n📝 Manual Test Instructions:');
    console.log('=' .repeat(60));
    console.log('\n1. Open your browser and go to your app');
    console.log('2. Open Developer Tools (F12)');
    console.log('3. Go to Console tab');
    console.log('4. Run this code:\n');
    console.log(`fetch('/api/workspaces/${WORKSPACE_ID}', {
  headers: {
    'Content-Type': 'application/json',
    // Auth headers are automatically included
  }
})
.then(res => res.json())
.then(data => {
  console.log('✅ Full API Response:', data);
  console.log('\\n📋 aiConfiguration field:', data.aiConfiguration || data.data?.aiConfiguration);
  
  if (data.aiConfiguration || data.data?.aiConfiguration) {
    console.log('✅ aiConfiguration IS present in API response');
    console.log('   AI Model:', (data.aiConfiguration || data.data?.aiConfiguration).aiModel);
  } else {
    console.log('❌ aiConfiguration is MISSING from API response');
    console.log('   This means the API endpoint is not returning the field');
  }
})
.catch(err => console.error('Error:', err));`);

    console.log('\n\n📋 What to Check:');
    console.log('='.repeat(60));
    console.log('1. Does the response include `aiConfiguration` field?');
    console.log('2. If YES -> Frontend caching issue, need to refresh');
    console.log('3. If NO -> API endpoint issue, needs fix');
    
    console.log('\n\n🔍 Alternative: Check Network Tab');
    console.log('='.repeat(60));
    console.log('1. Open Developer Tools -> Network tab');
    console.log('2. Navigate to Settings -> AI Configuration');
    console.log('3. Look for request to `/api/workspaces/${WORKSPACE_ID}`');
    console.log('4. Check the Response preview/payload');
    console.log('5. Verify if `aiConfiguration` field is present');

    console.log('\n\n💡 Quick Test via curl (if server is running):');
    console.log('='.repeat(60));
    console.log('\nNote: You need a valid auth cookie/token');
    console.log(`curl -X GET '${API_URL}/api/workspaces/${WORKSPACE_ID}' \\
  -H 'Content-Type: application/json' \\
  -H 'Cookie: your-auth-cookie-here' | jq '.aiConfiguration'`);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }
}

testAPIResponse()
  .then(() => {
    console.log('\n✅ Test instructions displayed\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
