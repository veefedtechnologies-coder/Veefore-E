import dotenv from 'dotenv';
dotenv.config();
import { getFirebaseAdmin } from './server/firebase-admin';
try {
  getFirebaseAdmin();
  console.log("Firebase initialized successfully");
} catch(e) {
  console.error("Firebase init failed:", e);
}
