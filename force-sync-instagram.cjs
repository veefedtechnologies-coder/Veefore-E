// One-time script to force sync Instagram data from API to database
const fetch = require('node-fetch');

async function forceSyncInstagram() {
  console.log('🔄 Force syncing Instagram data...\n');
  
  // This needs to be called from browser console while logged in
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 COPY AND PASTE THIS IN YOUR BROWSER CONSOLE:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('fetch("http://localhost:5000/api/instagram/force-sync", {');
  console.log('  method: "POST",');
  console.log('  headers: {');
  console.log('    "Content-Type": "application/json"');
  console.log('  },');
  console.log('  credentials: "include"');
  console.log('})');
  console.log('.then(r => r.json())');
  console.log('.then(data => {');
  console.log('  console.log("✅ Sync complete!", data);');
  console.log('  window.location.reload(); // Refresh page');
  console.log('})');
  console.log('.catch(err => console.error("❌ Sync failed:", err));');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('OR just click the "Smart Sync" button on your dashboard!');
  console.log('');
  console.log('After running, check server console for these logs:');
  console.log('  [INSTAGRAM DIRECT] 🔍 followers_count from API: ???');
  console.log('  [INSTAGRAM DIRECT] 🔍 UPDATE PAYLOAD: { ... }');
  console.log('  [INSTAGRAM DIRECT] 🔍 Final update fields being written to DB: { ... }');
  console.log('');
}

forceSyncInstagram();

