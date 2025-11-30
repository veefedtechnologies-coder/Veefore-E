
// Add this to your server startup or cron job
async function monitorInstagramTokens() {
  const accounts = await socialAccountsCollection.find({
    platform: 'instagram',
    encryptedAccessToken: { $exists: true }
  }).toArray();

  for (const account of accounts) {
    if (account.encryptedAccessToken && !account.accessToken) {
      console.log(`⚠️  Account ${account.username} has encrypted token but no decrypted version available`);
      // Alert or auto-fix logic here
    }
  }
}

// Run every hour
setInterval(monitorInstagramTokens, 60 * 60 * 1000);
