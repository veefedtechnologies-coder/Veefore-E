/**
 * Email BullMQ Worker
 *
 * Processes async email jobs from the EMAIL queue.
 * Uses Resend as the primary delivery mechanism (with the existing
 * emailService as a fallback for legacy job types).
 *
 * Job names and data shapes:
 *  - send-welcome          { email, name }
 *  - send-otp              { email, otp, firstName? }
 *  - send-waitlist         { email, firstName }
 *  - send-invoice          { email, firstName, planName, billingCycle, amountInr, periodStart, periodEnd, paymentId? }
 *  - send-payment-failed   { email, firstName, planName, nextRetryDate? }
 *  - send-cancellation     { email, firstName, planName, accessUntil }
 *  - send-pre-renewal      { email, firstName, planName, renewalDate, amountInr }
 *  - send-quota-alert      { email, firstName, quotaType, thresholdPct, used, total, planName }
 *  - send-refund           { email, firstName, amountInr, refundId }
 *  - send-early-access-approved { email, firstName }
 */

import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES } from '../lib/queue';
import { getRedisOptions } from '../lib/redis';
import { emailService } from '../email-service';
import {
  sendOtpEmail,
  sendWelcomeEmail,
  sendWaitlistEmail,
  sendInvoiceEmail,
  sendPaymentFailedEmail,
  sendCancellationEmail,
  sendPreRenewalEmail,
  sendQuotaAlertEmail,
  sendRefundEmail,
  sendEarlyAccessApprovalEmail,
} from '../services/resend.service';

const redisUrl =
  process.env.REDIS_URL ||
  process.env.KV_URL ||
  process.env.STORAGE_REDIS_URL ||
  'redis://localhost:6379';

const baseOptions = getRedisOptions(redisUrl);

const workerOptions = {
  connection: {
    url: redisUrl,
    ...baseOptions,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  },
  concurrency: 5,
};

let emailWorker: Worker | null = null;

export const initEmailWorker = () => {
  if (emailWorker) return emailWorker;

  console.log('[WORKER] Initializing Email Worker (Resend)...');

  emailWorker = new Worker(QUEUE_NAMES.EMAIL, async (job: Job) => {
    console.log(`[EMAIL WORKER] Processing job ${job.id} — type: ${job.name}`);

    switch (job.name) {
      // ── Legacy ──────────────────────────────────────────────────────────
      case 'send-welcome': {
        const { email, name } = job.data;
        await emailService.sendWaitlistWelcomeEmail(email, name);
        return { sent: true, email };
      }

      // ── OTP / verification ───────────────────────────────────────────────
      case 'send-otp': {
        const { email, otp, firstName } = job.data;
        await sendOtpEmail(email, otp, firstName);
        return { sent: true, email };
      }

      // ── Waitlist ─────────────────────────────────────────────────────────
      case 'send-waitlist': {
        const { email, firstName } = job.data;
        await sendWaitlistEmail(email, firstName);
        return { sent: true, email };
      }

      // ── Invoice / receipt ────────────────────────────────────────────────
      case 'send-invoice': {
        const { email, firstName, planName, billingCycle, amountInr, periodStart, periodEnd, paymentId } = job.data;
        await sendInvoiceEmail(email, {
          firstName,
          planName,
          billingCycle,
          amountInr,
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
          paymentId,
        });
        return { sent: true, email };
      }

      // ── Payment failed ───────────────────────────────────────────────────
      case 'send-payment-failed': {
        const { email, firstName, planName, nextRetryDate } = job.data;
        await sendPaymentFailedEmail(email, firstName, planName, nextRetryDate ? new Date(nextRetryDate) : undefined);
        return { sent: true, email };
      }

      // ── Cancellation ─────────────────────────────────────────────────────
      case 'send-cancellation': {
        const { email, firstName, planName, accessUntil } = job.data;
        await sendCancellationEmail(email, firstName, planName, new Date(accessUntil));
        return { sent: true, email };
      }

      // ── Pre-renewal reminder ─────────────────────────────────────────────
      case 'send-pre-renewal': {
        const { email, firstName, planName, renewalDate, amountInr } = job.data;
        await sendPreRenewalEmail(email, firstName, planName, new Date(renewalDate), amountInr);
        return { sent: true, email };
      }

      // ── Quota alert ───────────────────────────────────────────────────────
      case 'send-quota-alert': {
        const { email, firstName, quotaType, thresholdPct, used, total, planName } = job.data;
        await sendQuotaAlertEmail(email, firstName, quotaType, thresholdPct, used, total, planName);
        return { sent: true, email };
      }

      // ── Refund receipt ────────────────────────────────────────────────────
      case 'send-refund': {
        const { email, firstName, amountInr, refundId } = job.data;
        await sendRefundEmail(email, firstName, amountInr, refundId);
        return { sent: true, email };
      }

      // ── Early-access approval ─────────────────────────────────────────────
      case 'send-early-access-approved': {
        const { email, firstName } = job.data;
        await sendEarlyAccessApprovalEmail(email, firstName);
        return { sent: true, email };
      }

      default:
        console.warn(`[EMAIL WORKER] Unknown job type: ${job.name}`);
        throw new Error(`Unknown email job type: ${job.name}`);
    }
  }, workerOptions);

  emailWorker.on('completed', (job) => {
    console.log(`[EMAIL WORKER] Job ${job.id} (${job.name}) completed`);
  });

  emailWorker.on('failed', (job, err) => {
    console.error(`[EMAIL WORKER] Job ${job?.id} (${job?.name}) failed:`, err);
  });

  return emailWorker;
};
