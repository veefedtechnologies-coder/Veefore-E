/*
 * Verified uid resolution for auth-bridge endpoints (e.g. GET /api/auth/session).
 *
 * SECURITY: these helpers NEVER trust an unverified token. Previously the session
 * endpoint base64-decoded the `auth_token` cookie and trusted `uid`/`user_id`/
 * `sub` without checking the signature — which would let a forged cookie mint a
 * Firebase custom token for any uid (account takeover). Here we only return a uid
 * from a cryptographically verified source:
 *   1. the `__session` Firebase session cookie (verifySessionCookie), or
 *   2. an `auth_token` that is a Firebase ID token (verifyIdToken), or
 *   3. an `auth_token` that is a Firebase CUSTOM token whose RS256 signature we
 *      verify against THIS service account's public key (derived from the
 *      service-account private key — custom tokens are signed with it).
 */
import type { Request } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getFirebaseAdmin } from '../firebase-admin';

// Firebase custom tokens are issued for this fixed audience.
const FIREBASE_CT_AUDIENCE =
  'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

let cachedPublicKey: string | null | undefined;
let cachedClientEmail: string | null | undefined;

function getServiceAccountPublicKey(): { publicKey: string; clientEmail: string } | null {
  if (cachedPublicKey !== undefined) {
    return cachedPublicKey && cachedClientEmail
      ? { publicKey: cachedPublicKey, clientEmail: cachedClientEmail }
      : null;
  }
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) { cachedPublicKey = null; cachedClientEmail = null; return null; }
    const sa = JSON.parse(raw);
    if (!sa.private_key || !sa.client_email) { cachedPublicKey = null; cachedClientEmail = null; return null; }
    // Custom tokens are RS256-signed with the service account private key; the
    // matching public key verifies them with no network/cert-rotation concerns.
    const publicKey = crypto.createPublicKey(sa.private_key).export({ type: 'spki', format: 'pem' }) as string;
    cachedPublicKey = publicKey;
    cachedClientEmail = sa.client_email;
    return { publicKey, clientEmail: sa.client_email };
  } catch {
    cachedPublicKey = null;
    cachedClientEmail = null;
    return null;
  }
}

/** Verify a Firebase CUSTOM token's signature. Returns the uid, or null. */
export function verifyFirebaseCustomToken(token: string): string | null {
  const key = getServiceAccountPublicKey();
  if (!key) return null;
  try {
    const payload: any = jwt.verify(token, key.publicKey, {
      algorithms: ['RS256'],
      audience: FIREBASE_CT_AUDIENCE,
      issuer: key.clientEmail,
      subject: key.clientEmail,
    });
    return payload && typeof payload.uid === 'string' ? payload.uid : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a cryptographically VERIFIED uid from the request's auth cookies, or
 * null. Tries `__session` → `auth_token` as ID token → `auth_token` as custom
 * token (signature-verified). Never decodes-and-trusts.
 */
export async function resolveVerifiedUid(req: Request): Promise<string | null> {
  const cookies = (req as any).cookies || {};

  // 1) Durable Firebase session cookie.
  if (cookies.__session && typeof cookies.__session === 'string') {
    try {
      const admin = getFirebaseAdmin();
      const decoded = await admin.auth().verifySessionCookie(cookies.__session, false);
      if (decoded?.uid) return decoded.uid as string;
    } catch { /* fall through */ }
  }

  const authToken = cookies.auth_token;
  if (authToken && typeof authToken === 'string') {
    // 2) auth_token as a Firebase ID token.
    try {
      const admin = getFirebaseAdmin();
      const decoded = await admin.auth().verifyIdToken(authToken);
      if (decoded?.uid) return decoded.uid as string;
    } catch { /* not an ID token — try custom token next */ }

    // 3) auth_token as a Firebase custom token (signature-verified).
    const uid = verifyFirebaseCustomToken(authToken);
    if (uid) return uid;
  }

  return null;
}
