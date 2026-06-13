import { readFileSync, writeFileSync } from 'fs';
import dotenv from 'dotenv';

// Read the service account JSON file
const serviceAccount = JSON.parse(
  readFileSync('veefore-8433-firebase-adminsdk-fbsvc-1ac498b2b4.json', 'utf8')
);

// Convert to single-line JSON string
const serviceAccountString = JSON.stringify(serviceAccount);

// Read the current .env file
const envContent = readFileSync('.env', 'utf8');

// Replace the FIREBASE_SERVICE_ACCOUNT_KEY line
const updatedEnv = envContent.replace(
  /FIREBASE_SERVICE_ACCOUNT_KEY=.*/,
  `FIREBASE_SERVICE_ACCOUNT_KEY=${serviceAccountString}`
);

// Write back to .env
writeFileSync('.env', updatedEnv);

console.log('✅ Updated FIREBASE_SERVICE_ACCOUNT_KEY in .env');
console.log('✅ Project ID:', serviceAccount.project_id);
console.log('\n📝 Next steps:');
console.log('   1. Restart your backend server');
console.log('   2. Clear browser cookies');
console.log('   3. Try Google OAuth again');
