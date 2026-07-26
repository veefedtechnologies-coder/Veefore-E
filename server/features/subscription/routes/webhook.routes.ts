/**
 * Webhook Routes
 *
 * Mounts the Razorpay webhook endpoint at POST /razorpay.
 * This router is expected to be mounted at /api/webhooks in the main app.
 *
 * IMPORTANT: express.raw() is applied PER-ROUTE (before the handler) so that
 * req.body arrives as a raw Buffer. This is required for HMAC-SHA256 signature
 * verification in the webhook controller. The global express.json() middleware
 * does NOT run for this route.
 *
 * Rate limiting: 300 requests per minute per IP to guard against flooding
 * while still accommodating Razorpay's legitimate retry behaviour.
 */

import { Router } from 'express'
import express from 'express'
import rateLimit from 'express-rate-limit'
import { handleRazorpayWebhook } from '../controllers/webhook.controller'

// ---------------------------------------------------------------------------
// Rate limiter — 300 requests per minute per source IP
// ---------------------------------------------------------------------------

const razorpayRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,  // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,   // Disable the X-RateLimit-* headers
  message: { error: 'Too many requests', message: 'Rate limit exceeded. Please try again later.' },
})

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const webhookRouter = Router()

/**
 * POST /razorpay
 *
 * Middleware order:
 *  1. razorpayRateLimiter  — reject floods before doing any work
 *  2. express.raw(...)     — parse body as Buffer for HMAC verification
 *  3. handleRazorpayWebhook — verify signature, process event, respond 200
 */
webhookRouter.post(
  '/razorpay',
  razorpayRateLimiter,
  express.raw({ type: 'application/json' }),
  handleRazorpayWebhook
)
