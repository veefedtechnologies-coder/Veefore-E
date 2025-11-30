const axios = require('axios');

// Debug script to test Instagram story shares API calls
async function debugStoryShares() {
  console.log('🔍 Starting Instagram Story Shares Debug...\n');
  
  try {
    // Test the diagnostics endpoint with POST method using a real workspace ID
    const response = await axios.post('http://localhost:5000/api/diagnostics/instagram', {
      useStoredToken: true,
      workspaceId: '686d98d34888852d5d7beb6c', // Using the correct workspace ID for arpit9996363
      limit: 10
    }, {
      timeout: 30000
    });
    
    console.log('📊 Diagnostics Response Status:', response.status);
    console.log('📊 Response Data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.diagnostics) {
      console.log('\n🔍 Analyzing diagnostics data...');
      
      const stories = response.data.diagnostics.filter(item => item.type === 'STORY');
      console.log(`📖 Found ${stories.length} stories`);
      
      if (stories.length > 0) {
        console.log('\n📖 Story Details:');
        stories.forEach((story, index) => {
          console.log(`  Story ${index + 1}:`);
          console.log(`    ID: ${story.id}`);
          console.log(`    Type: ${story.type}`);
          console.log(`    Shares: ${story.insights?.shares || 'null'}`);
          console.log(`    Saves: ${story.insights?.saved || 'null'}`);
          console.log(`    Replies: ${story.insights?.replies || 'null'}`);
          console.log(`    Reach: ${story.insights?.reach || 'null'}`);
          console.log(`    Error: ${story.error || 'none'}`);
          console.log('');
        });
      }
      
      console.log('\n📊 Total Shares Calculation:');
      console.log(`  Total Shares: ${response.data.totalShares || 0}`);
      console.log(`  Total Saves: ${response.data.totalSaves || 0}`);
      console.log(`  Posts Analyzed: ${response.data.postsAnalyzed || 0}`);
      
      // Check if any items have shares
      const itemsWithShares = response.data.diagnostics.filter(item => 
        item.insights?.shares && item.insights.shares > 0
      );
      console.log(`  Items with shares: ${itemsWithShares.length}`);
      
      if (itemsWithShares.length > 0) {
        console.log('  Items with shares details:');
        itemsWithShares.forEach(item => {
          console.log(`    ${item.type} ${item.id}: ${item.insights.shares} shares`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error testing diagnostics:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the debug
debugStoryShares().catch(console.error);