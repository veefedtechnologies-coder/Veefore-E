/**
 * Publishable media URL resolution for third-party publishers (Instagram, etc).
 *
 * User-uploaded media now lives in a PRIVATE S3 bucket and is served to the
 * browser only through the authenticated proxy (`/api/chat/attachment/<key>`)
 * or CloudFront signed URLs. But Instagram's Graph API fetches the media URL
 * *server-side* with no session cookie — it can't hit our auth-gated proxy.
 *
 * This module converts a stored media reference (proxy URL, raw S3 URL, or a
 * bare storage key) into a short-lived, PUBLICLY-FETCHABLE URL:
 *   1. CloudFront signed URL (preferred — CDN edge, cheapest egress), else
 *   2. S3 pre-signed URL (fallback).
 * Both are time-boxed and require no auth, so Instagram can fetch them while the
 * bucket stays PRIVATE. Anything that isn't ours (already-public http(s), or a
 * local `/uploads/…` path in dev) is returned unchanged.
 */

import { getSignedUrl as getCloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer';
import { cloudFrontConfig, cloudFrontUrlForKey } from './veegpt-image.config';
import { getStorageService } from '../features/storage/services/storage.service';

/**
 * TTL for publish URLs. Instagram downloads the media synchronously when it
 * creates the container, but video processing / retries can lag, so we give a
 * generous window (6h) while still keeping the URL short-lived.
 */
export const PUBLISH_URL_TTL_SECONDS = 6 * 3600;

/**
 * Extract an S3 storage key from a media URL/reference that points at OUR
 * storage. Returns null when the URL isn't one of ours (already-public http,
 * data:, local `/uploads/…`, etc), so the caller leaves it unchanged.
 */
export function storageKeyFromMediaUrl(mediaUrl: string): string | null {
  const u = String(mediaUrl || '').trim();
  if (!u) return null;

  // Authenticated attachment proxy: (…)/api/chat/attachment/<key…>
  let m = u.match(/\/api\/chat\/attachment\/(.+)$/i);
  if (m) return decodeURIComponent(m[1].split('?')[0].split('#')[0]);

  // Raw S3 virtual-hosted URL: https://<bucket>.s3[.-]<region>.amazonaws.com/<key>
  m = u.match(/^https?:\/\/[^/]+\.s3[.-][^/]*\.amazonaws\.com\/(.+)$/i);
  if (m) return decodeURIComponent(m[1].split('?')[0].split('#')[0]);

  // CloudFront / custom-domain URL for a known storage prefix.
  m = u.match(/^https?:\/\/[^/]+\/((?:chat-attachments|ai-images|video-images|general)\/.+)$/i);
  if (m) return decodeURIComponent(m[1].split('?')[0].split('#')[0]);

  // A bare storage key (no scheme, no leading slash) under a known prefix.
  if (/^(chat-attachments|ai-images|video-images|general)\//.test(u)) {
    return u.split('?')[0].split('#')[0];
  }

  return null;
}

/**
 * Extract the AI-image assetId from an image-proxy URL
 * (`(…)/api/chat/image/<assetId>`). Returns null when the URL isn't an image
 * proxy reference. The assetId is resolved to a storage key via AiImageAsset.
 */
export function assetIdFromImageProxyUrl(mediaUrl: string): string | null {
  const u = String(mediaUrl || '').trim();
  if (!u) return null;
  const m = u.match(/\/api\/chat\/image\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Resolve a media URL to a PUBLICLY-FETCHABLE URL for third-party publishers.
 * See module docblock. On any signing failure the original URL is returned so
 * the publish attempt can still proceed (and surface a clearer downstream error).
 */
export async function resolvePublishableMediaUrl(mediaUrl: string): Promise<string> {
  let key = storageKeyFromMediaUrl(mediaUrl);

  // AI-generated/edited images are referenced by assetId via the image proxy
  // (`/api/chat/image/<assetId>`), which is auth-gated and NOT resolvable to a
  // storage key by string alone. Look the asset up to recover its storage key so
  // an AI image bound to a schedule is publishable (Instagram fetches the URL).
  if (!key) {
    const assetId = assetIdFromImageProxyUrl(mediaUrl);
    if (assetId) {
      try {
        const { AiImageAsset } = await import('../models/AiImageAsset');
        const asset = await AiImageAsset.findOne({ assetId }).lean();
        if (asset?.storageKey) key = asset.storageKey;
        else if ((asset as any)?.storageUrl) return (asset as any).storageUrl;
      } catch {
        /* best-effort asset lookup */
      }
    }
  }

  if (!key) return mediaUrl;

  // 1) CloudFront signed URL (preferred).
  const cfg = cloudFrontConfig();
  if (cfg) {
    try {
      return getCloudFrontSignedUrl({
        url: cloudFrontUrlForKey(cfg.domain, key),
        keyPairId: cfg.keyPairId,
        privateKey: cfg.privateKey,
        dateLessThan: new Date(Date.now() + PUBLISH_URL_TTL_SECONDS * 1000).toISOString(),
      });
    } catch (err: any) {
      console.warn(
        '[PUBLISH-MEDIA] CloudFront signing failed, falling back to S3 presign:',
        String(err?.message || '').slice(0, 200)
      );
    }
  }

  // 2) S3 pre-signed URL (fallback).
  try {
    const signed = await getStorageService().getSignedUrl(key, { expiresIn: PUBLISH_URL_TTL_SECONDS });
    if (/^https?:\/\//i.test(signed.url)) return signed.url;
  } catch (err: any) {
    console.warn(
      '[PUBLISH-MEDIA] S3 presign failed:',
      String(err?.message || '').slice(0, 200)
    );
  }

  // Local storage / unresolved → return unchanged (dev path).
  return mediaUrl;
}
