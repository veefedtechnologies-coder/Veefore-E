// Debug script to specifically test shares/saves data flow
import fetch from 'node-fetch';

async function debugSharesSaves() {
    try {
        console.log('=== DEBUGGING SHARES/SAVES DATA FLOW ===\n');
        
        // Create a test user first
        console.log('1. Creating test user...');
        const userResponse = await fetch('http://localhost:5000/api/debug/create-test-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });
        
        if (userResponse.ok) {
            const userData = await userResponse.json();
            console.log('✅ User created successfully');
        } else {
            console.log('⚠️ User creation failed (may already exist)');
        }
        
        // Trigger Instagram sync
        console.log('\n2. Triggering Instagram sync...');
        const syncResponse = await fetch('http://localhost:5000/api/instagram/sync-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });
        
        if (syncResponse.ok) {
            const syncData = await syncResponse.json();
            console.log('✅ Instagram sync completed');
            console.log('Workspace ID:', syncData.workspaceId);
            
            if (syncData.instagramAccount) {
                console.log('Instagram Account Data:');
                console.log('- Username:', syncData.instagramAccount.username);
                console.log('- Followers:', syncData.instagramAccount.followers);
                console.log('- Posts:', syncData.instagramAccount.posts);
                console.log('- Engagement:', syncData.instagramAccount.engagement);
                console.log('- Reach:', syncData.instagramAccount.reach);
                console.log('- Last Sync:', syncData.instagramAccount.lastSync);
            } else {
                console.log('⚠️ No Instagram account data returned');
            }
            
            // Now fetch the account data directly to check shares/saves
            console.log('\n3. Fetching account data to check shares/saves...');
            const accountResponse = await fetch(`http://localhost:5000/api/debug/instagram-accounts`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (accountResponse.ok) {
                const accountData = await accountResponse.json();
                console.log('✅ Account data fetched');
                console.log('Total Instagram accounts:', accountData.totalAccounts);
                
                // Find the account for our workspace
                const instagramAccount = accountData.accounts.find(acc => acc.workspaceId === syncData.workspaceId);
                if (instagramAccount) {
                    console.log('\n=== SHARES/SAVES DEBUG RESULTS ===');
                    console.log('Account ID:', instagramAccount.id);
                    console.log('Username:', instagramAccount.username);
                    console.log('Workspace ID:', instagramAccount.workspaceId);
                    console.log('Followers Count:', instagramAccount.followersCount || 'undefined');
                    console.log('Media Count:', instagramAccount.mediaCount || 'undefined');
                    console.log('Last Sync:', instagramAccount.lastSyncAt || 'undefined');
                    console.log('Has Access Token:', instagramAccount.hasAccessToken || 'undefined');
                    console.log('Is Active:', instagramAccount.isActive || 'undefined');
                    
                    // Note: The debug endpoint doesn't include shares/saves data
                    console.log('\n⚠️ DEBUG ENDPOINT LIMITATION: This endpoint doesn\'t include shares/saves data');
                    console.log('Need to check the full account data or database directly');
                } else {
                    console.log('❌ No Instagram account found for workspace:', syncData.workspaceId);
                    console.log('Available workspaces:', accountData.accounts.map(acc => acc.workspaceId));
                }
            } else {
                console.log('❌ Failed to fetch account data');
            }
            
        } else {
            const errorData = await syncResponse.json();
            console.log('❌ Instagram sync failed:', errorData);
        }
        
    } catch (error) {
        console.error('❌ Debug script failed:', error);
    }
}

debugSharesSaves();