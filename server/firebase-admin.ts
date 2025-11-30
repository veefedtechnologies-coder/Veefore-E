import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
let firebaseAdmin: admin.app.App | null = null;

try {
  // Check if Firebase Admin is already initialized
  if (!admin.apps || admin.apps.length === 0) {
    // Use service account key from environment
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      let serviceAccount;
      try {
        // Handle both raw JSON string and escaped JSON string
        const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        serviceAccount = JSON.parse(rawKey);
        
        // Validate required fields
        if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
          throw new Error('Service account missing required fields');
        }
        
        console.log('[FIREBASE ADMIN] Service account parsed successfully');
        console.log('[FIREBASE ADMIN] Project ID:', serviceAccount.project_id);
        console.log('[FIREBASE ADMIN] Client Email:', serviceAccount.client_email);
        
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error occurred';
        console.error('[FIREBASE ADMIN] JSON parsing error:', errorMessage);
        console.error('[FIREBASE ADMIN] First 100 chars of key:', process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.substring(0, 100));
        throw parseError;
      }
      
      try {
        firebaseAdmin = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id, // Use project_id from service account
        });

        console.log('[FIREBASE ADMIN] Initialized with service account for project:', serviceAccount.project_id);
      } catch (initError: any) {
        console.error('[FIREBASE ADMIN] Initialization failed:', initError.message);
        console.error('[FIREBASE ADMIN] Stack trace:', initError.stack);
        throw initError;
      }
    } else {
      console.log('[FIREBASE ADMIN] No service account key found, skipping Firebase initialization');
      firebaseAdmin = null;
    }
  } else {
    firebaseAdmin = admin.app();
    console.log('[FIREBASE ADMIN] Using existing instance');
  }
} catch (error: any) {
  console.error('[FIREBASE ADMIN] Initialization failed:', error.message);
  if (error.stack) {
    console.error('[FIREBASE ADMIN] Stack trace:', error.stack);
  }
  firebaseAdmin = null;
}

export { firebaseAdmin, admin };