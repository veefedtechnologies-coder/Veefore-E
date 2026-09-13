/**
 * Unit tests for the VeeGPT image capability routing helpers (pure functions).
 * These guard the "automatic model selection" and "platform → aspect ratio"
 * behaviour required by the Gemini image integration spec.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  selectImageModel,
  isGeminiModel,
  aspectForPlatform,
  IMAGE_ASPECT_RATIOS,
  GEMINI_IMAGE_MODEL_DEFAULT,
  GEMINI_IMAGE_MODEL_PREMIUM,
  toServerFetchableImageUrl,
  imageDeliveryMode,
  imageSignedUrlTtlSeconds,
  shouldRedirectImage,
  cloudFrontConfig,
  cloudFrontUrlForKey,
  IMAGE_SIGNED_URL_TTL_MIN,
  IMAGE_SIGNED_URL_TTL_MAX,
  IMAGE_SIGNED_URL_TTL_DEFAULT,
} from '../server/config/veegpt-image.config'

describe('selectImageModel', () => {
  it('defaults to the fast model when nothing special is requested', () => {
    expect(selectImageModel({})).toBe(GEMINI_IMAGE_MODEL_DEFAULT)
  })

  it('uses the premium model only when premium/complex is requested', () => {
    expect(selectImageModel({ premiumRequested: true })).toBe(GEMINI_IMAGE_MODEL_PREMIUM)
    expect(selectImageModel({ complex: true })).toBe(GEMINI_IMAGE_MODEL_PREMIUM)
  })

  it('does not use premium for a normal request', () => {
    expect(selectImageModel({ premiumRequested: false, complex: false })).toBe(
      GEMINI_IMAGE_MODEL_DEFAULT
    )
  })

  it('derives from the user AI-config model: a fast Gemini selection → default', () => {
    expect(selectImageModel({ preferredModel: 'gemini-2.5-flash' })).toBe(
      GEMINI_IMAGE_MODEL_DEFAULT
    )
  })

  it('routes premium/pro/3.x Gemini selections to the premium image model', () => {
    expect(selectImageModel({ preferredModel: 'gemini-3.5-flash' })).toBe(
      GEMINI_IMAGE_MODEL_PREMIUM
    )
    expect(selectImageModel({ preferredModel: 'gemini-2.5-pro' })).toBe(
      GEMINI_IMAGE_MODEL_PREMIUM
    )
  })

  it('falls back to a Gemini image model when a non-Gemini model (GPT) is selected', () => {
    // Native image generation is always Gemini; a GPT selection must not fail.
    const chosen = selectImageModel({ preferredModel: 'openai-gpt-4.1' })
    expect([GEMINI_IMAGE_MODEL_DEFAULT, GEMINI_IMAGE_MODEL_PREMIUM]).toContain(chosen)
  })
})

describe('isGeminiModel', () => {
  it('treats gemini/google/veegpt ids (and empty) as Gemini-backed', () => {
    for (const id of ['gemini-3.5-flash', 'google-ai-studio', 'veegpt-hybrid', 'veegpt-auto', ''])
      expect(isGeminiModel(id)).toBe(true)
  })
  it('treats GPT/Claude/Perplexity as non-Gemini', () => {
    for (const id of ['openai-gpt-4.1', 'claude-3-5-sonnet', 'perplexity-sonar'])
      expect(isGeminiModel(id)).toBe(false)
  })
})

describe('aspectForPlatform', () => {
  it('maps stories/reels to 9:16', () => {
    expect(aspectForPlatform('instagram story')).toBe('story')
    expect(aspectForPlatform('reel')).toBe('story')
    expect(aspectForPlatform('tiktok')).toBe('story')
  })

  it('maps youtube/thumbnail to landscape', () => {
    expect(aspectForPlatform('youtube thumbnail')).toBe('landscape')
  })

  it('maps instagram feed to portrait', () => {
    expect(aspectForPlatform('instagram')).toBe('portrait')
  })

  it('falls back to square when unknown', () => {
    expect(aspectForPlatform('')).toBe('square')
    expect(aspectForPlatform('something-else')).toBe('square')
  })

  it('every returned id exists in the aspect registry', () => {
    for (const p of ['instagram', 'reel', 'youtube', 'linkedin', '']) {
      expect(IMAGE_ASPECT_RATIOS[aspectForPlatform(p)]).toBeTruthy()
    }
  })
})

describe('toServerFetchableImageUrl', () => {
  const base = 'http://127.0.0.1:3000'

  it('rewrites a root-relative /uploads URL to an absolute server URL (multi-turn edit fix)', () => {
    expect(toServerFetchableImageUrl('/uploads/ai-images/ws/img.png', base)).toBe(
      'http://127.0.0.1:3000/uploads/ai-images/ws/img.png'
    )
  })

  it('leaves absolute http(s) URLs unchanged (e.g. S3 in production)', () => {
    const s3 = 'https://bucket.s3.amazonaws.com/ai-images/img.png'
    expect(toServerFetchableImageUrl(s3, base)).toBe(s3)
    expect(toServerFetchableImageUrl('http://cdn.example.com/x.jpg', base)).toBe(
      'http://cdn.example.com/x.jpg'
    )
  })

  it('leaves inline data URLs unchanged', () => {
    const data = 'data:image/png;base64,AAAA'
    expect(toServerFetchableImageUrl(data, base)).toBe(data)
  })

  it('does not produce a double slash when the base has a trailing slash', () => {
    expect(toServerFetchableImageUrl('/uploads/x.png', 'http://127.0.0.1:3000/')).toBe(
      'http://127.0.0.1:3000/uploads/x.png'
    )
  })

  it('returns empty/blank input unchanged', () => {
    expect(toServerFetchableImageUrl('', base)).toBe('')
  })
})

describe('image delivery mode (bandwidth offload)', () => {
  const prev = { ...process.env }
  afterEach(() => {
    process.env = { ...prev }
  })

  it('defaults to "stream" when unset', () => {
    delete process.env.IMAGE_DELIVERY
    expect(imageDeliveryMode()).toBe('stream')
  })

  it('honours "redirect" (case/space-insensitive)', () => {
    process.env.IMAGE_DELIVERY = '  REDIRECT '
    expect(imageDeliveryMode()).toBe('redirect')
  })

  it('honours "cloudfront"', () => {
    process.env.IMAGE_DELIVERY = 'CloudFront'
    expect(imageDeliveryMode()).toBe('cloudfront')
  })

  it('treats any other value as "stream"', () => {
    process.env.IMAGE_DELIVERY = 'proxy'
    expect(imageDeliveryMode()).toBe('stream')
  })
})

describe('cloudFrontConfig', () => {
  const prev = { ...process.env }
  afterEach(() => {
    process.env = { ...prev }
  })

  it('returns null unless all three values are present', () => {
    delete process.env.CLOUDFRONT_DOMAIN
    delete process.env.CLOUDFRONT_KEY_PAIR_ID
    delete process.env.CLOUDFRONT_PRIVATE_KEY
    expect(cloudFrontConfig()).toBeNull()
    process.env.CLOUDFRONT_DOMAIN = 'd123.cloudfront.net'
    process.env.CLOUDFRONT_KEY_PAIR_ID = 'K123'
    expect(cloudFrontConfig()).toBeNull() // still missing the key
  })

  it('parses all three, strips scheme/trailing slash, and unescapes \\n in the key', () => {
    process.env.CLOUDFRONT_DOMAIN = 'https://d123.cloudfront.net/'
    process.env.CLOUDFRONT_KEY_PAIR_ID = 'K123'
    process.env.CLOUDFRONT_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nAAA\\n-----END PRIVATE KEY-----\\n'
    const cfg = cloudFrontConfig()
    expect(cfg).not.toBeNull()
    expect(cfg!.domain).toBe('d123.cloudfront.net')
    expect(cfg!.keyPairId).toBe('K123')
    expect(cfg!.privateKey).toContain('\n') // real newlines restored
    expect(cfg!.privateKey.startsWith('-----BEGIN PRIVATE KEY-----')).toBe(true)
  })
})

describe('cloudFrontUrlForKey', () => {
  it('builds an https URL, drops leading slash, and URL-encodes each segment', () => {
    expect(cloudFrontUrlForKey('d123.cloudfront.net', 'ai-images/ws 1/img a.png')).toBe(
      'https://d123.cloudfront.net/ai-images/ws%201/img%20a.png'
    )
    expect(cloudFrontUrlForKey('d123.cloudfront.net/', '/ai-images/x.png')).toBe(
      'https://d123.cloudfront.net/ai-images/x.png'
    )
  })
})

describe('imageSignedUrlTtlSeconds', () => {
  const prev = { ...process.env }
  afterEach(() => {
    process.env = { ...prev }
  })

  it('uses the default when unset or malformed', () => {
    delete process.env.IMAGE_SIGNED_URL_TTL
    expect(imageSignedUrlTtlSeconds()).toBe(IMAGE_SIGNED_URL_TTL_DEFAULT)
    process.env.IMAGE_SIGNED_URL_TTL = 'not-a-number'
    expect(imageSignedUrlTtlSeconds()).toBe(IMAGE_SIGNED_URL_TTL_DEFAULT)
  })

  it('passes through a valid in-range value', () => {
    process.env.IMAGE_SIGNED_URL_TTL = '1800'
    expect(imageSignedUrlTtlSeconds()).toBe(1800)
  })

  it('clamps below the minimum and above the maximum', () => {
    process.env.IMAGE_SIGNED_URL_TTL = '5'
    expect(imageSignedUrlTtlSeconds()).toBe(IMAGE_SIGNED_URL_TTL_MIN)
    process.env.IMAGE_SIGNED_URL_TTL = '999999'
    expect(imageSignedUrlTtlSeconds()).toBe(IMAGE_SIGNED_URL_TTL_MAX)
  })
})

describe('shouldRedirectImage', () => {
  const s3 = 'https://veefore-prod-uploads.s3.amazonaws.com/x.png?X-Amz-Signature=abc'

  it('redirects only in redirect mode with an absolute https URL and no download', () => {
    expect(shouldRedirectImage({ mode: 'redirect', isDownload: false, signedUrl: s3 })).toBe(true)
  })

  it('never redirects in stream mode', () => {
    expect(shouldRedirectImage({ mode: 'stream', isDownload: false, signedUrl: s3 })).toBe(false)
  })

  it('never redirects a download (keeps same-origin streaming)', () => {
    expect(shouldRedirectImage({ mode: 'redirect', isDownload: true, signedUrl: s3 })).toBe(false)
  })

  it('never redirects to a relative/local path', () => {
    expect(
      shouldRedirectImage({ mode: 'redirect', isDownload: false, signedUrl: '/uploads/x.png' })
    ).toBe(false)
    expect(shouldRedirectImage({ mode: 'redirect', isDownload: false, signedUrl: '' })).toBe(false)
    expect(shouldRedirectImage({ mode: 'redirect', isDownload: false })).toBe(false)
  })
})
