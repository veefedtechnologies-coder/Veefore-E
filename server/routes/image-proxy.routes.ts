/**
 * image-proxy.routes.ts
 *
 * Two modes:
 *
 * 1. /api/image-proxy/social?accountId=<id>&platform=<fb|ig>
 *    Fetches a FRESH profile picture URL via the Graph API (using the stored
 *    access token), then streams the image from Facebook CDN.
 *    Facebook CDN URLs are IP-locked — they only work from the same IP that
 *    requested them. We must always get a fresh URL from the Graph API using
 *    our server's IP so the CDN request also comes from the same IP.
 *
 * 2. /api/image-proxy?url=<encoded-url>  (legacy, for non-Meta URLs)
 *    Direct proxy for non-IP-locked images.
 *
 * No auth required (profile pictures are semi-public display data).
 */

import { Router, Request, Response } from 'express';
import https from 'https';

const router = Router();

// ─── helpers ──────────────────────────────────────────────────────────────────

function httpsGet(url: string, extraHeaders: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Veefore/1.0)',
          'Referer': 'https://www.facebook.com/',
          'Accept': 'image/*,*/*;q=0.8',
          ...extraHeaders,
        },
        timeout: 8000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string>,
            body: Buffer.concat(chunks),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

/** Fetch a fresh FB Page picture URL via Graph API redirect=false */
async function getFreshFacebookPictureUrl(pageId: string, accessToken: string): Promise<string | null> {
  try {
    const apiUrl = `https://graph.facebook.com/v19.0/${pageId}/picture?type=normal&redirect=false&access_token=${accessToken}`;
    const result = await httpsGet(apiUrl);
    if (result.status !== 200) return null;
    const json = JSON.parse(result.body.toString('utf8'));
    return json?.data?.url ?? null;
  } catch {
    return null;
  }
}

/** Fetch a fresh IG profile picture URL via Graph API */
async function getFreshInstagramPictureUrl(igUserId: string, accessToken: string): Promise<string | null> {
  try {
    const apiUrl = `https://graph.facebook.com/v19.0/${igUserId}?fields=profile_picture_url&access_token=${accessToken}`;
    const result = await httpsGet(apiUrl);
    if (result.status !== 200) return null;
    const json = JSON.parse(result.body.toString('utf8'));
    return json?.profile_picture_url ?? null;
  } catch {
    return null;
  }
}

// ─── Route 1: Social account profile picture (preferred, uses Graph API) ──────

router.get('/social', async (req: Request, res: Response) => {
  const { accountId, platform } = req.query as { accountId?: string; platform?: string };

  if (!accountId || !platform) {
    return res.status(400).json({ error: 'accountId and platform required' });
  }

  try {
    const { SocialAccountModel } = await import('../models/Social/SocialAccount');
    const account = await SocialAccountModel.findOne({ accountId }).lean() as any;

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const token = account.accessToken;
    if (!token) {
      return res.status(422).json({ error: 'No access token stored' });
    }

    // Get a fresh, server-IP-bound picture URL from Graph API
    const plat = (platform as string).toLowerCase();
    let freshUrl: string | null = null;

    if (plat === 'facebook') {
      freshUrl = await getFreshFacebookPictureUrl(accountId as string, token);
    } else if (plat === 'instagram') {
      freshUrl = await getFreshInstagramPictureUrl(accountId as string, token);
      // IG fallback: try the FB page picture if IG doesn't return one
      if (!freshUrl && account.platformMetadata?.linkedFacebookPageId) {
        const fbAccount = await SocialAccountModel.findOne({
          platform: 'facebook',
          accountId: account.platformMetadata.linkedFacebookPageId,
        }).lean() as any;
        if (fbAccount?.accessToken) {
          freshUrl = await getFreshFacebookPictureUrl(fbAccount.accountId, fbAccount.accessToken);
        }
      }
    }

    if (!freshUrl) {
      return res.status(404).json({ error: 'Could not fetch fresh picture URL' });
    }

    // Now fetch the image from the CDN using the fresh URL (same server IP = works)
    const imgResult = await httpsGet(freshUrl);

    if (imgResult.status !== 200) {
      return res.status(imgResult.status || 502).end();
    }

    const contentType = imgResult.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(imgResult.body);

    // Opportunistically update the stored URL in the background
    SocialAccountModel.updateOne(
      { accountId },
      { $set: { profilePictureUrl: freshUrl, updatedAt: new Date() } }
    ).catch(() => {});

  } catch (err: any) {
    console.warn('[image-proxy/social] Error:', err.message);
    if (!res.headersSent) res.status(502).end();
  }
});

// ─── Route 2: Legacy direct proxy (non-Meta URLs) ─────────────────────────────

const ALLOWED_DOMAINS = [
  'fbcdn.net',
  'cdninstagram.com',
  'fbsbx.com',
  'lookaside.fbsbx.com',
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_DOMAINS.some(d => parsed.hostname.endsWith(d));
  } catch {
    return false;
  }
}

router.get('/', async (req: Request, res: Response) => {
  const rawUrl = req.query.url as string;
  if (!rawUrl) return res.status(400).json({ error: 'Missing url parameter' });

  let decodedUrl: string;
  try {
    decodedUrl = decodeURIComponent(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid url encoding' });
  }

  if (!isAllowedUrl(decodedUrl)) {
    return res.status(403).json({ error: 'URL not allowed' });
  }

  try {
    const result = await httpsGet(decodedUrl);
    if (result.status !== 200) return res.status(result.status || 502).end();
    const contentType = result.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(result.body);
  } catch (err: any) {
    console.warn('[image-proxy] Error:', err.message);
    if (!res.headersSent) res.status(502).end();
  }
});

export default router;
