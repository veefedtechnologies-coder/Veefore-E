import { Request, Response, NextFunction } from 'express';
import { storage } from '../mongodb-storage';
import { getFirebaseAdmin } from '../firebase-admin';
import { safeParseJWTPayload } from './unsafe-json-replacements';

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let token;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      token = authHeader;
    }

    if (!token || token.trim() === '') {
      console.error('[AUTH] No token found in authorization header:', authHeader.substring(0, 20) + '...');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    token = token.trim();

    let firebaseUid;
    let cleanToken = token;

    cleanToken = cleanToken.replace(/\s+/g, '');

    const tokenParts = cleanToken.split('.');
    if (tokenParts.length > 3) {
      cleanToken = tokenParts.slice(0, 3).join('.');
      console.log('[AUTH] Reconstructed JWT from', tokenParts.length, 'parts to 3 parts');
    } else if (tokenParts.length < 3) {
      console.error('[AUTH] Invalid JWT structure - expected 3 parts, got:', tokenParts.length);
      console.error('[AUTH] Token received:', token.substring(0, 100) + '...');
      return res.status(401).json({ error: 'Invalid token format' });
    }

    const adminApp = getFirebaseAdmin();
    if (adminApp) {
      try {
        const decoded = await withTimeout(adminApp.auth().verifyIdToken(cleanToken), 4000);
        firebaseUid = decoded?.uid;
      } catch (e: any) {
        console.warn('[AUTH] Admin verification skipped:', e?.message);
      }
    }

    if (!firebaseUid) {
      try {
        const finalParts = cleanToken.split('.');
        const payloadResult = safeParseJWTPayload(finalParts[1]);
        if (!payloadResult.success) {
          console.error('[JWT SECURITY] Invalid token payload:', payloadResult.error);
          return res.status(401).json({ error: 'Invalid token format' });
        }
        const payload = payloadResult.data;
        firebaseUid = payload.user_id || payload.sub;
        if (!firebaseUid) {
          console.error('[AUTH] No Firebase UID in token payload:', Object.keys(payload));
          return res.status(401).json({ error: 'Invalid token payload' });
        }
      } catch (error: any) {
        console.error('[AUTH] Token parsing error:', error.message);
        console.error('[AUTH] Problematic token length:', token.length);
        console.error('[AUTH] Token preview:', token.substring(0, 50) + '...');
        return res.status(401).json({ error: 'Invalid token format' });
      }
    }

    let user: any;
    const parts = cleanToken.split('.');
    const payloadResult = parts.length === 3 ? safeParseJWTPayload(parts[1]) : ({ success: false } as any);
    const payload: any = payloadResult.success ? payloadResult.data : {};
    const userEmail = payload.email;

    const uidPromise = withTimeout(storage.getUserByFirebaseUid(firebaseUid), 8000);
    const emailPromise = userEmail ? withTimeout(storage.getUserByEmail(userEmail), 8000) : Promise.reject(new Error('noemail'));
    const results = await Promise.allSettled([uidPromise, emailPromise]);
    const uidUser = results[0].status === 'fulfilled' ? results[0].value as any : undefined;
    const emailUser = results[1].status === 'fulfilled' ? results[1].value as any : undefined;

    if (uidUser && emailUser && uidUser.id !== emailUser.id) {
      const [aRes, bRes] = await Promise.allSettled([
        withTimeout(storage.getWorkspacesByUserId(uidUser.id), 1000),
        withTimeout(storage.getWorkspacesByUserId(emailUser.id), 1000)
      ]);
      const aCount = aRes.status === 'fulfilled' ? (aRes.value as any[]).length : 0;
      const bCount = bRes.status === 'fulfilled' ? (bRes.value as any[]).length : 0;
      user = bCount >= aCount ? emailUser : uidUser;
    } else {
      user = uidUser || emailUser;
    }

    if (!user) {
      const email = userEmail || `user_${firebaseUid}@example.com`;
      try {
        user = await withTimeout(storage.createUser({
          firebaseUid,
          email,
          username: email.split('@')[0],
          displayName: payload.name || undefined,
          avatar: payload.picture || undefined,
          referredBy: undefined
        }), 8000);
      } catch (err: any) {
        // If creation failed (e.g. duplicate key due to race condition), try fetching one last time
        try {
          user = await withTimeout(storage.getUserByFirebaseUid(firebaseUid), 4000);
        } catch {
          // Ignore
        }
        
        if (!user) {
          user = {
            id: firebaseUid,
            firebaseUid,
            email,
            username: email.split('@')[0],
            displayName: payload.name || null,
            avatar: payload.picture || null,
            isOnboarded: false,
            isEmailVerified: true,
            plan: 'free',
            credits: 0
          } as any;
        }
      }
    }

    if (!user.firebaseUid) {
      try { await withTimeout(storage.updateUser(user.id, { firebaseUid }), 1500); } catch { }
    }

    try {
      const parts = cleanToken.split('.');
      const payloadResult = parts.length === 3 ? safeParseJWTPayload(parts[1]) : { success: false } as any;
      const payload: any = payloadResult.success ? payloadResult.data : {};
      const email = payload.email || user?.email;
      if (email) {
        const emailUser = await withTimeout(storage.getUserByEmail(email), 6000).catch(() => undefined as any);
        if (emailUser && emailUser.id !== user.id) {
          const a = await withTimeout(storage.getWorkspacesByUserId(user.id), 4000).catch(() => []);
          const b = await withTimeout(storage.getWorkspacesByUserId(emailUser.id), 4000).catch(() => []);
          if (b.length >= a.length) {
            try { await withTimeout(storage.updateUser(emailUser.id, { firebaseUid }), 6000); } catch { }
            user = emailUser;
          }
        }
      }
    } catch { }

    console.log(`[AUTH-TRACE] Request: ${req.method} ${req.path} | FirebaseUID: ${firebaseUid} | UserID: ${user.id} | Email: ${user.email}`);
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication failed:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return next();
    }

    await requireAuth(req, res, next);
  } catch {
    next();
  }
};

export default requireAuth;
