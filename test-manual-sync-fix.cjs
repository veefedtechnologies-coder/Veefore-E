const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testManualSync() {
  try {
    console.log("🔍 First, checking available Instagram accounts...");
    
    // First check what accounts exist
    const dbResponse = await fetch("http://localhost:5000/api/debug/instagram-accounts");
    const dbData = await dbResponse.json();
    
    console.log("📊 Available Instagram accounts:");
    if (dbData.accounts && dbData.accounts.length > 0) {
      dbData.accounts.forEach(acc => {
        console.log(`  - ${acc.username} (ID: ${acc.accountId}, Workspace: ${acc.workspaceId})`);
        console.log(`    Shares: ${acc.totalShares || 0}, Saves: ${acc.totalSaves || 0}`);
      });
      
      // Find the arpit.10 account
      const arpitAccount = dbData.accounts.find(acc => acc.username === "arpit.10");
      if (arpitAccount) {
        console.log("\n🔄 Testing manual sync for @arpit.10 account...");
        
        const response = await fetch("http://localhost:5000/api/instagram/immediate-sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            workspaceId: arpitAccount.workspaceId
          })
        });
        
        const result = await response.json();
        console.log("✅ Sync response:", result);
        
        // Wait a moment then check the database again
        console.log("⏳ Waiting 5 seconds then checking updated values...");
        setTimeout(async () => {
          try {
            const updatedResponse = await fetch("http://localhost:5000/api/debug/instagram-accounts");
            const updatedData = await updatedResponse.json();
            
            console.log("\n📊 Updated account data:");
            const updatedAccount = updatedData.accounts.find(acc => acc.username === "arpit.10");
            if (updatedAccount) {
              console.log(`  - ${updatedAccount.username}: Shares: ${updatedAccount.totalShares || 0}, Saves: ${updatedAccount.totalSaves || 0}`);
              console.log(`    Previous: Shares: ${arpitAccount.totalShares || 0}, Saves: ${arpitAccount.totalSaves || 0}`);
            }
          } catch (error) {
            console.error("❌ Database check error:", error.message);
          }
        }, 5000);
      } else {
        console.log("❌ @arpit.10 account not found in database");
      }
    } else {
      console.log("❌ No Instagram accounts found in database");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testManualSync();