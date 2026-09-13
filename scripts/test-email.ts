/**
 * Live email test using the REAL resend.service.ts templates.
 *
 * Usage:
 *   npx tsx scripts/test-email.ts <email> <type>
 *
 * Types: otp | welcome | waitlist | invoice | payment-failed |
 *        cancellation | pre-renewal | quota | refund | early-access | all
 */

import { config } from 'dotenv';
config();

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
} from '../server/services/resend.service';

const TO = process.argv[2];
const TYPE = process.argv[3] ?? 'otp';

if (!TO || !TO.includes('@')) {
  console.error('Usage: npx tsx scripts/test-email.ts <email> <type>');
  process.exit(1);
}

const now = new Date();
const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
const in3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

const runners: Record<string, () => Promise<boolean>> = {
  otp: () => sendOtpEmail(TO, '847291', 'Arpit'),
  welcome: () => sendWelcomeEmail(TO, 'Arpit'),
  waitlist: () => sendWaitlistEmail(TO, 'Arpit'),
  invoice: () =>
    sendInvoiceEmail(TO, {
      firstName: 'Arpit',
      planName: 'Pro',
      billingCycle: 'monthly',
      amountInr: 2499,
      periodStart: now,
      periodEnd: in30,
      paymentId: 'pay_TEST123456',
    }),
  'payment-failed': () => sendPaymentFailedEmail(TO, 'Arpit', 'Pro', in3),
  cancellation: () => sendCancellationEmail(TO, 'Arpit', 'Pro', in30),
  'pre-renewal': () => sendPreRenewalEmail(TO, 'Arpit', 'Pro', in3, 2499),
  quota: () => sendQuotaAlertEmail(TO, 'Arpit', 'AI credits', 90, 675, 750, 'Pro'),
  refund: () => sendRefundEmail(TO, 'Arpit', 2499, 'rfnd_TEST789'),
  'early-access': () => sendEarlyAccessApprovalEmail(TO, 'Arpit'),
};

async function main() {
  console.log(`\n📧  Sending "${TYPE}" → ${TO}\n`);
  const types = TYPE === 'all' ? Object.keys(runners) : [TYPE];

  for (const t of types) {
    const fn = runners[t];
    if (!fn) {
      console.error(`❌ Unknown type: ${t}. Valid: ${Object.keys(runners).join(', ')}, all`);
      process.exit(1);
    }
    process.stdout.write(`  ${t} ... `);
    const ok = await fn();
    console.log(ok ? '✅ sent' : '❌ failed');
    if (types.length > 1) await new Promise((r) => setTimeout(r, 1200));
  }
  console.log('\nDone.\n');
  process.exit(0);
}

main();
