// Simple test to trigger Instagram sync and see console output
const fetch = require('node-fetch');

async function testSync() {
  console.log('🔄 Triggering Instagram sync...\n');
  
  try {
    // You need to be logged in, so we'll just show the curl command
    console.log('Run this command in your browser console while logged in:');
    console.log('\n');
    console.log('fetch("http://localhost:5000/api/instagram/force-sync", {');
    console.log('  method: "POST",');
    console.log('  headers: { "Content-Type": "application/json" },');
    console.log('  credentials: "include"');
    console.log('}).then(r => r.json()).then(console.log)');
    console.log('\n');
    console.log('Or click the "Smart Sync" button on your dashboard.');
    console.log('\nThen check your server console logs for:');
    console.log('- [INSTAGRAM DIRECT] messages showing what data was fetched');
    console.log('- Look for "followers_count" in the API response');
    console.log('- Check if updateAccountDirect is being called with correct data');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSync();

