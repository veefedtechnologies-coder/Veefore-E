import axios from 'axios';

const BASE_URL = 'http://localhost:8080';

async function triggerSync() {
    try {
        console.log('🔄 Triggering Instagram sync via API...\n');

        // First, get the user's social accounts to find the Instagram account ID
        const accountsRes = await axios.get(`${BASE_URL}/api/v1/social-accounts`, {
            headers: {
                'Cookie': 'session_id=test' // You'll need to get actual auth
            }
        });

        const instagramAccount = accountsRes.data.find((acc: any) =>
            acc.platform === 'instagram' && acc.username === 'arpit.10'
        );

        if (!instagramAccount) {
            console.error('❌ Instagram account not found in API response');
            console.log('Available accounts:', accountsRes.data.map((a: any) => `${a.platform}:${a.username}`));
            return;
        }

        console.log(`📱 Found account: ${instagramAccount.username} (ID: ${instagramAccount.id})\n`);

        // Trigger sync
        console.log('🔄 Calling sync endpoint (check server logs for online_followers error details)...\n');

        const syncRes = await axios.post(`${BASE_URL}/api/v1/social-accounts/${instagramAccount.id}/sync`, {}, {
            headers: {
                'Cookie': 'session_id=test'
            }
        });

        console.log('✅ Sync completed!');
        console.log('Response:', syncRes.data);

    } catch (error: any) {
        if (error.response) {
            console.error('❌ API Error:', error.response.status, error.response.data);
        } else {
            console.error('❌ Error:', error.message);
        }
    }
}

triggerSync();
