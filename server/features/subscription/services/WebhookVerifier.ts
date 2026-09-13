import crypto from 'crypto';
import { type Redis } from 'ioredis';

const PROCESSED_KEY_PREFIX = 'sub:webhook:processed:';
const PROCESSED_KEY_TTL_SECONDS = 86400; // 24 hours

export class WebhookVerifier {
  /**
   * Verifies a Razorpay webhook signature.
   *
   * Razorpay's signing scheme (per official docs):
   *   signature = HMAC-SHA256( secret, rawBody )   — hex encoded
   *
   * Where:
   *   - `rawBody`      is the exact raw request bytes (Razorpay signs the raw payload, not parsed JSON)
   *   - `secret`       is RAZORPAY_WEBHOOK_SECRET (configured in the Razorpay Dashboard)
   *   - Result is hex-encoded in the `X-Razorpay-Signature` header
   *
   * Unlike Cashfree, Razorpay does NOT prepend a timestamp to the signed
   * message — the signature is computed over the raw body alone.
   */
  verify(
    rawBody: Buffer,
    signatureHeader: string,
    webhookSecret: string,
  ): boolean {
    try {
      if (!signatureHeader || !webhookSecret) return false;

      const computed = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const computedBuf = Buffer.from(computed);
      const receivedBuf = Buffer.from(signatureHeader);

      if (computedBuf.length !== receivedBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(computedBuf, receivedBuf);
    } catch {
      return false;
    }
  }

  async isAlreadyProcessed(eventId: string, redis: Redis): Promise<boolean> {
    const key = `${PROCESSED_KEY_PREFIX}${eventId}`;
    const exists = await redis.exists(key);
    return exists === 1;
  }

  async markProcessed(eventId: string, redis: Redis): Promise<void> {
    const key = `${PROCESSED_KEY_PREFIX}${eventId}`;
    await redis.set(key, '1', 'EX', PROCESSED_KEY_TTL_SECONDS);
  }

  /**
   * Atomically CLAIM an event for processing.
   *
   * Uses `SET key 1 EX ttl NX` so only the FIRST caller for a given eventId
   * wins — this both dedupes concurrent duplicate deliveries (no check-then-act
   * race) and marks the event processed in a single round-trip.
   *
   * Returns:
   *   - true  → claim acquired, this delivery should process the event.
   *   - false → another delivery already claimed/processed it, skip.
   *
   * If processing subsequently FAILS, call `release()` so Razorpay's retry can
   * re-claim and reprocess — otherwise a transient error would permanently
   * lose the event.
   */
  async claim(eventId: string, redis: Redis): Promise<boolean> {
    const key = `${PROCESSED_KEY_PREFIX}${eventId}`;
    const result = await redis.set(key, '1', 'EX', PROCESSED_KEY_TTL_SECONDS, 'NX');
    return result === 'OK';
  }

  /**
   * Release a previously-claimed event so a future delivery/retry can
   * reprocess it. Called only when processing FAILED.
   */
  async release(eventId: string, redis: Redis): Promise<void> {
    const key = `${PROCESSED_KEY_PREFIX}${eventId}`;
    try {
      await redis.del(key);
    } catch {
      /* best-effort — a lingering key only blocks reprocessing for 24h TTL */
    }
  }
}

export const webhookVerifier = new WebhookVerifier();
