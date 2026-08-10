const apiKey = 'REPLACED_DUMMY_KEY_FOR_SECURITY_REASONS';
const fetch = require('node-fetch');

async function test() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Origin': 'https://app.veefore.com',
      'Referer': 'https://app.veefore.com/'
    },
    body: JSON.stringify({
      token: 'fake-token-just-to-test-api-key',
      returnSecureToken: true
    })
  });
  
  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Body:', JSON.stringify(data, null, 2));
}
test();
