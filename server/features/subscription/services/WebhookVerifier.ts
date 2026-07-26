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
}

export const webhookVerifier = new WebhookVerifier();
