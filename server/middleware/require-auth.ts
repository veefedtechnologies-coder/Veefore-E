import { Request, Response, NextFunction } from 'express';
import { storage } from '../mongodb-storage';
import { getFirebaseAdmin } from '../firebase-admin';
import { checkSessionRevoked } from '../lib/session-revocation';
import { recordAuthEventFromRequest } from '../lib/auth-audit';
import { checkSessionLifetime } from '../lib/session-lifetime';

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

/**
 * SSR instant-load fallback: resolve the authenticated user from the verified
 * Firebase `__session` cookie (set by /api/auth/session-login). Used only when a
 * request carries no Authorization header — i.e. the client Firebase session is
 * still restoring. Returns null on anything unexpected (caller then 401s).
 */
async function resolveSessionCookieUser(req: Request): Promise<any | null> {
  try {
    const session = (req as any).cookies?.__session;
    if (!session || typeof session !== 'string') return null;

    const adminApp = getFirebaseAdmin();
    if (!adminApp) return null;

    const decoded: any = await withTimeout(adminApp.auth().verifySessionCookie(session, false), 4000);
    const uid = decoded?.uid;
    if (!uid) return null;

    // REVOCATION ENFORCEMENT (spec: production-security-hardening, Req 6).
    // Without this, a `__session` cookie captured outside the browser kept
    // authorizing requests for up to 14 days after logout or a global
    // invalidation, because `sessionVersion` was only checked on the
    // session-maintenance endpoints and `checkRevoked` is false here.
    const verdict = await checkSessionRevoked(String(uid), decoded?.sessionVersion);
    if (verdict.revoked) {
      console.warn('[AUTH] Rejected revoked session cookie:', { uid, reason: verdict.reason });
      // Requirement 6.8: record the revocation rejection.
      recordAuthEventFromRequest(req, {
        type: 'session_revoked', userId: String(uid), reason: verdict.reason,
      });
      return null;
    }

    // SESSION LIFETIME (Req 7): idle + absolute limits. The absolute age comes from
    // the token's signed auth_time/iat claim, so activity cannot extend it.
    const lifetime = await checkSessionLifetime(String(uid), decoded?.auth_time ?? decoded?.iat);
    if (lifetime.expired) {
      console.warn('[AUTH] Rejected expired session cookie:', { uid, reason: lifetime.reason });
      recordAuthEventFromRequest(req, {
        type: 'session_expired', userId: String(uid), reason: lifetime.reason,
      });
      return null;
    }

    // For our users the Firebase uid equals the Mongo _id (sign-in mints custom
    // tokens with uid = String(user._id)); fall back to firebaseUid lookup.
    let user = await withTimeout(storage.getUser(uid), 6000).catch(() => null);
    if (!user) {
      user = await withTimeout(storage.getUserByFirebaseUid(uid), 6000).catch(() => null);
    }
    return user || null;
  } catch {
    return null;
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      // SSR instant-load: when there's no Bearer token yet (the client Firebase
      // session is still restoring), fall back to the verified `__session`
      // cookie so the dashboard's first data fetches succeed immediately.
      // Additive — Bearer requests are unaffected.
      const sessionUser = await resolveSessionCookieUser(req);
      if (sessionUser) {
        req.user = sessionUser;
        return next();
      }
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
    if (!adminApp) {
      // Fail CLOSED: never authenticate when we can't verify tokens.
      console.error('[AUTH] Firebase Admin unavailable — refusing to authenticate');
      return res.status(503).json({ error: 'Authentication temporarily unavailable' });
    }

    // SECURITY (P0): authenticate ONLY from a cryptographically VERIFIED ID token.
    // Previously, if verifyIdToken threw we fell back to decoding the JWT payload
    // WITHOUT verifying its signature and trusted `user_id`/`sub` — which let a
    // forged/unsigned Bearer token authenticate as ANY uid. That unverified
    // fallback is removed: verification failure → 401, and the client refreshes
    // its token and retries via its existing 401 handler.
    let decoded: any;
    try {
      decoded = await withTimeout(adminApp.auth().verifyIdToken(cleanToken), 4000);
    } catch (e: any) {
      console.warn('[AUTH] ID token verification failed:', e?.message);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    firebaseUid = decoded?.uid;
    if (!firebaseUid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // REVOCATION ENFORCEMENT (spec: production-security-hardening, Req 6).
    // A verified signature only proves the token was issued by us — not that it
    // is still valid. Reject tokens whose sessionVersion is behind the user's
    // current version (logout / global invalidation / password change).
    const bearerVerdict = await checkSessionRevoked(String(firebaseUid), decoded?.sessionVersion);
    if (bearerVerdict.revoked) {
      console.warn('[AUTH] Rejected revoked bearer token:', {
        uid: firebaseUid,
        reason: bearerVerdict.reason,
      });
      recordAuthEventFromRequest(req, {
        type: 'session_revoked', userId: String(firebaseUid), reason: bearerVerdict.reason,
      });
      return res.status(401).json({
        error: 'Unauthorized',
        code: bearerVerdict.reason,
        requiresReauth: true,
      });
    }

    // SESSION LIFETIME (Req 7) for the Bearer path.
    const bearerLifetime = await checkSessionLifetime(
      String(firebaseUid),
      (decoded as any)?.auth_time ?? (decoded as any)?.iat
    );
    if (bearerLifetime.expired) {
      console.warn('[AUTH] Rejected expired bearer token:', {
        uid: firebaseUid, reason: bearerLifetime.reason,
      });
      recordAuthEventFromRequest(req, {
        type: 'session_expired', userId: String(firebaseUid), reason: bearerLifetime.reason,
      });
      return res.status(401).json({
        error: 'Unauthorized',
        code: bearerLifetime.reason,
        requiresReauth: true,
      });
    }

    let user: any;
    // Identity claims come ONLY from the verified token — never an unverified decode.
    const payload: any = decoded;
    const userEmail = decoded.email;

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
      const email = (decoded?.email as string | undefined) || user?.email;
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

    // console.log(`[AUTH-TRACE] Request: ${req.method} ${req.path} | FirebaseUID: ${firebaseUid} | UserID: ${user.id} | Email: ${user.email}`);
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
