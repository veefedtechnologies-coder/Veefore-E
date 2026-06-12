import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load firebase-admin using CommonJS require
const firebaseAdmin = require('firebase-admin');

let firebaseApp: typeof firebaseAdmin.app.App | null = null;

export function getFirebaseAdmin(): typeof firebaseAdmin.app.App {
  if (firebaseApp) return firebaseApp;
  
  // Check if Firebase app already initialized
  const apps = firebaseAdmin.apps || [];
  if (apps.length > 0) {
    firebaseApp = apps[0];
    return firebaseApp;
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    let serviceAccount;
    try {
      const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      serviceAccount = JSON.parse(rawKey);
      if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
        throw new Error('Service account missing required fields');
      }
    } catch (parseError) {
      console.error('[FIREBASE ADMIN] JSON parsing error:', parseError);
      throw parseError;
    }
    
    try {
      firebaseApp = firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
      console.log('[FIREBASE ADMIN] Initialized with service account for project:', serviceAccount.project_id);
    } catch (initError: any) {
      console.error('[FIREBASE ADMIN] Initialization failed:', initError.message);
      throw initError;
    }
  } else {
    try {
      firebaseApp = firebaseAdmin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID
      });
      console.log('[FIREBASE ADMIN] Initialized using default application credentials');
    } catch (fallbackError: any) {
      console.error('[FIREBASE ADMIN] No service account key found and default init failed:', fallbackError.message);
      throw fallbackError;
    }
  }
  
  if (!firebaseApp) throw new Error('Failed to initialize Firebase Admin');
  return firebaseApp;
}

export { firebaseAdmin as admin };
