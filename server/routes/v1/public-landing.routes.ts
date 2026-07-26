/**
 * Public Landing Caption Proxy (Caption_Proxy)
 *
 * Unauthenticated, rate-limited endpoint that powers the new landing page's
 * Live Demo caption generator. It calls the AI provider server-side via
 * `LandingCaptionService` so the provider API key never reaches the client.
 *
 * Mounted at `/api/public/landing` (see server/routes/v1/index.ts), exposing:
 *   POST /api/public/landing/captions
 *
 * Design contract (design.md "Caption_Proxy request flow" + Error Handling table):
 *   - 200 { captions: string[] }       success (exactly 3 captions)
 *   - 400 { error: 'invalid_request' } zod body validation failed
 *   - 429 { error: 'rate_limited', retryAfter } per-IP rate limit exceeded
 *   - 502 { error: 'generation_failed' } CaptionGenerationError from service
 *   - 504 { error: 'timeout' }         provider/request timeout
 *   - 500 { error: 'internal_error' }  anything else
 *
 * No auth middleware is applied (Requirement 12.8). The API key, raw provider
 * errors, and stack traces are never leaked to the client.
 *
 * Requirements: 12.5, 12.7, 12.8
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  generateLandingCaptions,
  CaptionGenerationError,
} from '../../services/LandingCaptionService';

const router = Router();

// ============================================
// RATE LIMITING (per-IP, unauthenticated abuse protection — Req 12.8)
// ============================================

/** Window for the public caption limiter. */
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

/** Max caption requests per IP per window. */
const RATE_LIMIT_MAX = 10;

/**
 * Per-IP rate limiter for the unauthenticated caption proxy. Uses the default
 * in-memory store (sufficient for an abuse-limiting public demo endpoint).
 */
export const landingCaptionRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Key strictly by IP — this endpoint has no authenticated user.
  keyGenerator: (req: Request) => req.ip || req.socket.remoteAddress || 'unknown',
  handler: (req: Request, res: Response) => {
    const retryAfter = Math.ceil(
      Math.max(0, (req.rateLimit?.resetTime?.getTime() ?? Date.now()) - Date.now()) / 1000
    );
    res.status(429).json({
      error: 'rate_limited',
      message: 'Too many caption requests. Please wait a moment and try again.',
      retryAfter,
    });
  },
});

// ============================================
// INPUT VALIDATION
// ============================================

const captionRequestSchema = z.object({
  topic: z
    .string({ required_error: 'A topic is required.' })
    .transform((val) => val.trim())
    .refine((val) => val.length >= 1, 'A topic is required.')
    .refine((val) => val.length <= 200, 'Topic is too long (max 200 characters).'),
  niche: z
    .string()
    .max(100, 'Niche is too long.')
    .optional()
    .transform((val) => (val ? val.trim() : 'general')),
  tone: z
    .string()
    .max(100, 'Tone is too long.')
    .optional()
    .transform((val) => (val ? val.trim() : 'friendly')),
});

/**
 * Best-effort detection of a timeout-style failure so we can map it to 504.
 * Inspects only safe shape (code/name/status) — never logs or returns the raw error.
 */
function isTimeoutError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return true;

  const name = (error as { name?: string })?.name;
  if (name === 'AbortError' || name === 'TimeoutError') return true;

  const status =
    (error as { status?: number; statusCode?: number })?.status ??
    (error as { statusCode?: number })?.statusCode;
  if (status === 408 || status === 504) return true;

  return false;
}

// ============================================
// ROUTES
// ============================================

/**
 * POST /captions — generate exactly 3 captions for the landing demo.
 * Unauthenticated + rate-limited. Mounted at /api/public/landing/captions.
 */
router.post('/captions', landingCaptionRateLimiter, async (req: Request, res: Response) => {
  // Validate the JSON body (Req 12.7 — descriptive client-facing error).
  const parsed = captionRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request.';
    return res.status(400).json({ error: 'invalid_request', message });
  }

  const { topic, niche, tone } = parsed.data;

  try {
    const captions = await generateLandingCaptions({ topic, niche, tone });
    return res.status(200).json({ captions });
  } catch (error) {
    // CaptionGenerationError carries a safe message → 502 generation_failed.
    if (error instanceof CaptionGenerationError) {
      return res.status(502).json({ error: 'generation_failed', message: error.message });
    }

    // Timeout-style failures → 504.
    if (isTimeoutError(error)) {
      return res.status(504).json({
        error: 'timeout',
        message: 'Caption generation timed out. Please try again.',
      });
    }

    // Anything else → 500. Never leak the raw error/stack/key.
    return res.status(500).json({
      error: 'internal_error',
      message: 'Something went wrong generating captions. Please try again.',
    });
  }
});

export default router;
