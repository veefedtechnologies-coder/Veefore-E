require('dotenv').config({ path: '../.env' });
const admin = require('firebase-admin');

async function test() {
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const serviceAccount = JSON.parse(rawKey);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  try {
    const uid = 'test-uid-12345';
    console.log('Generating custom token...');
    const customToken = await admin.auth().createCustomToken(uid);
    console.log('Token generated successfully.');
    
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    console.log('Calling Identity Toolkit API with API Key:', apiKey.substring(0, 10) + '...');
    
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true
      })
    });
    
    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
