/**
 * Unit tests for publishable media URL resolution (server/config/publish-media-url).
 *
 * User media lives in a PRIVATE S3 bucket served via an auth-gated proxy, but
 * Instagram/Facebook fetch the URL server-side with no cookie. These tests guard
 * the pure key-extraction logic (which storage references we recognise) and the
 * "leave non-storage URLs unchanged" contract of the resolver.
 */
import { describe, it, expect } from 'vitest'
import {
  storageKeyFromMediaUrl,
  resolvePublishableMediaUrl,
  assetIdFromImageProxyUrl,
} from '../server/config/publish-media-url'

describe('storageKeyFromMediaUrl', () => {
  it('extracts the key from an absolute attachment proxy URL', () => {
    expect(
      storageKeyFromMediaUrl(
        'https://app.veefore.com/api/chat/attachment/chat-attachments/ws123/abc-1.png'
      )
    ).toBe('chat-attachments/ws123/abc-1.png')
  })

  it('extracts the key from a relative attachment proxy path', () => {
    expect(
      storageKeyFromMediaUrl('/api/chat/attachment/chat-attachments/ws123/vid-2.mp4')
    ).toBe('chat-attachments/ws123/vid-2.mp4')
  })

  it('strips query/hash from the proxy URL when extracting the key', () => {
    expect(
      storageKeyFromMediaUrl('/api/chat/attachment/chat-attachments/ws/x.png?download=1#frag')
    ).toBe('chat-attachments/ws/x.png')
  })

  it('decodes percent-encoded key segments', () => {
    expect(
      storageKeyFromMediaUrl('/api/chat/attachment/chat-attachments/ws/my%20file.png')
    ).toBe('chat-attachments/ws/my file.png')
  })

  it('extracts the key from a raw S3 virtual-hosted URL', () => {
    expect(
      storageKeyFromMediaUrl(
        'https://veefore-prod-uploads.s3.us-east-1.amazonaws.com/chat-attachments/ws/a.jpg'
      )
    ).toBe('chat-attachments/ws/a.jpg')
  })

  it('extracts the key from a CloudFront/custom-domain URL under a known prefix', () => {
    expect(
      storageKeyFromMediaUrl('https://d3sx0ym0zpvru0.cloudfront.net/chat-attachments/ws/a.jpg')
    ).toBe('chat-attachments/ws/a.jpg')
  })

  it('recognises a bare storage key under a known prefix', () => {
    expect(storageKeyFromMediaUrl('chat-attachments/ws/a.jpg')).toBe('chat-attachments/ws/a.jpg')
    expect(storageKeyFromMediaUrl('ai-images/x.png')).toBe('ai-images/x.png')
  })

  it('returns null for URLs that are not ours', () => {
    expect(storageKeyFromMediaUrl('https://cdn.example.com/some/photo.jpg')).toBeNull()
    expect(storageKeyFromMediaUrl('/uploads/video-images/local.png')).toBeNull()
    expect(storageKeyFromMediaUrl('data:image/png;base64,AAAA')).toBeNull()
    expect(storageKeyFromMediaUrl('')).toBeNull()
  })
})

describe('assetIdFromImageProxyUrl', () => {
  it('extracts the assetId from an absolute image-proxy URL', () => {
    expect(
      assetIdFromImageProxyUrl('https://app.veefore.com/api/chat/image/abc-123-def')
    ).toBe('abc-123-def')
  })

  it('extracts the assetId from a relative image-proxy path (ignoring query)', () => {
    expect(assetIdFromImageProxyUrl('/api/chat/image/asset-9?download=1')).toBe('asset-9')
  })

  it('returns null for non image-proxy URLs', () => {
    expect(assetIdFromImageProxyUrl('/api/chat/attachment/chat-attachments/ws/a.png')).toBeNull()
    expect(assetIdFromImageProxyUrl('https://cdn.example.com/x.jpg')).toBeNull()
    expect(assetIdFromImageProxyUrl('')).toBeNull()
  })
})

describe('resolvePublishableMediaUrl', () => {
  it('leaves an already-public external URL unchanged', async () => {
    const url = 'https://cdn.example.com/photo.jpg'
    await expect(resolvePublishableMediaUrl(url)).resolves.toBe(url)
  })

  it('leaves a local /uploads path unchanged', async () => {
    const url = 'https://app.veefore.com/uploads/video-images/local.png'
    await expect(resolvePublishableMediaUrl(url)).resolves.toBe(url)
  })
})
