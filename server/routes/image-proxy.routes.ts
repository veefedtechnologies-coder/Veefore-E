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
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
// Point fluent-ffmpeg at the bundled ffmpeg/ffprobe binaries (side effect).
import '../config/ffmpeg-paths';
import ffmpeg from 'fluent-ffmpeg';

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
// ─── Route 3: Post thumbnail (re-fetch a FRESH media URL via Graph API) ────────
//
// Stored Instagram `media_url`/`thumbnail_url` and Facebook `full_picture` are
// short-lived SIGNED CDN links that expire and then 403 for everyone. Given a
// content id we look up the post id + the right token, ask Graph for a FRESH
// URL, and stream the bytes from the server IP (so the CDN request succeeds).
/**
 * Stream the already-cached permanent copy of a post's media (if present).
 * Returns true when it served a response, false when there's no usable cache
 * (so the caller falls through to a fresh Graph fetch + re-cache).
 */
async function servePostMediaFromCache(content: any, res: Response): Promise<boolean> {
  const key = content?.cachedMediaKey;
  if (!key) return false;
  try {
    const { getStorageService } = await import('../features/storage/services/storage.service');
    const file = await getStorageService().downloadFile(key);
    res.setHeader('Content-Type', content.cachedMediaContentType || file.contentType || 'image/jpeg');
    // Cached bytes are permanent — allow long browser/CDN caching.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(file.buffer);
    return true;
  } catch (err: any) {
    // Cache key went missing (deleted/rotated) — fall back to a fresh fetch.
    console.warn('[image-proxy/post-media] cache read miss:', err?.message);
    return false;
  }
}

// Stored Instagram `media_url`/`thumbnail_url` and Facebook `full_picture` are
// short-lived SIGNED CDN links that expire and then 403 for everyone. Given a
// content id we (1) serve a permanent cached copy if we have one, else (2) ask
// Graph for a FRESH URL, stream the bytes from the server IP (so the CDN
// request succeeds), and PERSIST them to our own storage so the media never
// breaks again — future requests are served from the permanent cache.
async function servePostMedia(req: Request, res: Response) {
  const { contentId } = req.query as { contentId?: string };
  if (!contentId) return res.status(400).json({ error: 'contentId required' });

  try {
    const { ContentModel } = await import('../models/Content');
    const { SocialAccountModel } = await import('../models/Social/SocialAccount');

    const content = await ContentModel.findById(contentId).lean() as any;
    if (!content) return res.status(404).json({ error: 'Content not found' });

    const cd = content.contentData || {};

    // 1) Fast path: serve the permanent cached copy (never expires).
    if (await servePostMediaFromCache(content, res)) return;

    const mediaId = cd.id; // IG media id, or FB "<pageId>_<postId>"
    const platform = String(content.platform || cd.platform || 'instagram').toLowerCase();
    if (!mediaId) return res.status(422).json({ error: 'No media id on content' });

    let freshUrl: string | null = null;

    if (platform === 'facebook') {
      // FB: page id is the prefix of the post id and equals the account's accountId.
      const pageId = String(mediaId).split('_')[0];
      let acct = await SocialAccountModel.findOne({ platform: 'facebook', accountId: pageId }).lean() as any;
      if (!acct?.accessToken) {
        acct = await SocialAccountModel.findOne({ workspaceId: content.workspaceId, platform: 'facebook' }).lean() as any;
      }
      const token = acct?.accessToken;
      if (!token) return res.status(422).json({ error: 'No FB token' });
      const g = await httpsGet(`https://graph.facebook.com/v19.0/${mediaId}?fields=full_picture&access_token=${token}`);
      if (g.status !== 200) return res.status(g.status || 502).end();
      try { freshUrl = JSON.parse(g.body.toString('utf8'))?.full_picture ?? null; } catch { /* ignore */ }
    } else {
      // Instagram: media id doesn't embed the account, so find the workspace's
      // IG account token (fall back to any active IG account).
      let acct = await SocialAccountModel.findOne({
        workspaceId: content.workspaceId, platform: 'instagram', accessToken: { $exists: true, $ne: null },
      }).lean() as any;
      if (!acct?.accessToken) {
        acct = await SocialAccountModel.findOne({ platform: 'instagram', accessToken: { $exists: true, $ne: null } }).lean() as any;
      }
      const token = acct?.accessToken;
      if (!token) return res.status(422).json({ error: 'No IG token' });
      const g = await httpsGet(`https://graph.facebook.com/v19.0/${mediaId}?fields=media_url,thumbnail_url,media_type&access_token=${token}`);
      if (g.status !== 200) return res.status(g.status || 502).end();
      try {
        const j = JSON.parse(g.body.toString('utf8'));
        freshUrl = j?.thumbnail_url || j?.media_url || null; // thumbnail for videos, media_url for images
      } catch { /* ignore */ }
    }

    if (!freshUrl) return res.status(404).json({ error: 'No fresh media URL from Graph' });

    const imgResult = await httpsGet(freshUrl);
    if (imgResult.status !== 200) return res.status(imgResult.status || 502).end();

    const contentType = imgResult.headers['content-type'] || 'image/jpeg';

    // 2) Persist a permanent copy so this media never breaks again. Best-effort:
    // a caching failure must not block serving the bytes we already have.
    void cachePostMedia(contentId, mediaId, imgResult.body, contentType);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(imgResult.body);
  } catch (err: any) {
    console.warn('[image-proxy/post-media] Error:', err.message);
    if (!res.headersSent) res.status(502).end();
  }
}

/**
 * Download-and-store a post's media bytes to our permanent storage, then record
 * the storage key on the content doc so subsequent loads are served from cache
 * and never depend on the expiring Instagram/Facebook CDN URL again.
 */
async function cachePostMedia(contentId: string, mediaId: string, buffer: Buffer, contentType: string): Promise<void> {
  try {
    const [{ getStorageService }, { ContentModel }] = await Promise.all([
      import('../features/storage/services/storage.service'),
      import('../models/Content'),
    ]);
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const uploaded = await getStorageService().uploadFile({
      buffer,
      originalName: `${String(mediaId).replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`,
      mimetype: contentType.startsWith('image/') ? contentType : 'image/jpeg',
      folder: 'post-media-cache',
    });
    await ContentModel.updateOne(
      { _id: contentId },
      {
        $set: {
          cachedMediaKey: uploaded.key,
          cachedMediaUrl: uploaded.url,
          cachedMediaContentType: contentType,
          cachedMediaAt: new Date(),
        },
      },
    );
    console.log(`[image-proxy/post-media] cached media for content ${contentId} → ${uploaded.key}`);
  } catch (err: any) {
    console.warn('[image-proxy/post-media] cache write failed:', err?.message);
  }
}

router.get('/post-media', servePostMedia);
router.get('/fb-post', servePostMedia); // backwards-compatible alias

// ─── Route 4: Video poster frame (extract a thumbnail from a video via ffmpeg) ─
//
// Scheduled/draft posts whose media is a video (.mp4 etc.) have no still image.
// Given the video URL, we extract the first frame with ffmpeg, cache it on disk,
// and stream the JPEG so the app can show a real thumbnail.
const VIDEO_THUMB_DIR = path.join(process.cwd(), 'uploads', 'temp', 'videothumbs');

function extractFrame(src: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const cmd = ffmpeg(src)
      .on('end', () => { if (!done) { done = true; resolve(); } })
      .on('error', (e: any) => { if (!done) { done = true; reject(e); } })
      .screenshots({
        timestamps: ['00:00:01'],
        filename: path.basename(outPath),
        folder: path.dirname(outPath),
        size: '640x?',
      });
    // Safety timeout so a stalled ffmpeg can't hang the request.
    setTimeout(() => {
      if (done) return;
      done = true;
      try { cmd.kill('SIGKILL'); } catch { /* ignore */ }
      reject(new Error('ffmpeg timeout'));
    }, 20000);
  });
}

router.get('/video-thumb', async (req: Request, res: Response) => {
  const rawSrc = req.query.src as string;
  if (!rawSrc) return res.status(400).json({ error: 'src required' });

  let src: string;
  try { src = decodeURIComponent(rawSrc); } catch { return res.status(400).json({ error: 'bad src' }); }
  if (!/^https?:\/\//.test(src)) return res.status(400).json({ error: 'src must be http(s)' });

  try {
    if (!fs.existsSync(VIDEO_THUMB_DIR)) fs.mkdirSync(VIDEO_THUMB_DIR, { recursive: true });
    const hash = crypto.createHash('md5').update(src).digest('hex');
    const outPath = path.join(VIDEO_THUMB_DIR, `${hash}.jpg`);

    // Serve from cache if we already extracted this frame.
    if (!fs.existsSync(outPath)) {
      await extractFrame(src, outPath);
    }
    if (!fs.existsSync(outPath)) return res.status(502).json({ error: 'thumb generation failed' });

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    fs.createReadStream(outPath).pipe(res);
  } catch (err: any) {
    console.warn('[image-proxy/video-thumb] Error:', err.message);
    if (!res.headersSent) res.status(502).end();
  }
});

export default router;
