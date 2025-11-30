// Simple test script to trigger Instagram sync and observe debug logs
import fetch from 'node-fetch';

async function testInstagramSync() {
    try {
        console.log('Creating test user...');
        const userResponse = await fetch('http://localhost:5000/api/debug/create-test-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });
        
        const userData = await userResponse.json();
        console.log('User created:', userData);
        
        console.log('\nTesting Instagram sync...');
        const syncResponse = await fetch('http://localhost:5000/api/instagram/sync-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });
        
        if (syncResponse.ok) {
            const syncData = await syncResponse.json();
            console.log('Sync successful:', syncData);
        } else {
            const errorData = await syncResponse.json();
            console.log('Sync failed:', errorData);
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testInstagramSync();