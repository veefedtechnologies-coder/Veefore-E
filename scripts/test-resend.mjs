/**
 * Resend Email Integration Test
 *
 * Usage:
 *   node scripts/test-resend.mjs <your-email@example.com> [test-type]
 *
 * Test types:
 *   otp           — OTP / email verification (default)
 *   welcome       — Welcome email
 *   waitlist      — Waitlist confirmation
 *   invoice       — Subscription invoice / receipt
 *   payment-failed — Payment failure alert
 *   cancellation  — Subscription cancellation
 *   pre-renewal   — Pre-renewal reminder
 *   quota         — AI quota alert (90%)
 *   refund        — Refund receipt
 *   early-access  — Early-access approval
 *   all           — Fire all types sequentially (with 1s gap each)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env manually (no dotenv dependency needed) ──────────────────────
const envPath = join(__dirname, '..', '.env');
try {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.error('Could not load .env — make sure you run from Veefore-E/');
  process.exit(1);
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? 'Veefore <noreply@veefore.com>';

if (!RESEND_API_KEY) {
  console.error('❌  RESEND_API_KEY is not set in .env');
  process.exit(1);
}

// ── Parse args ─────────────────────────────────────────────────────────────
const TO = process.argv[2];
const TYPE = process.argv[3] ?? 'otp';

if (!TO || !TO.includes('@')) {
  console.error('Usage: node scripts/test-resend.mjs <email> [test-type]');
  console.error('       e.g.  node scripts/test-resend.mjs you@gmail.com otp');
  process.exit(1);
}

// ── Resend client (inline, no TS build required) ───────────────────────────
async function sendEmail(subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [TO],
      subject,
      html,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

// ── Shared HTML helpers ────────────────────────────────────────────────────
const BRAND = '#1e3a5f';
const ACCENT = '#2563eb';
const TEAL = '#0d9488';

function wrap(inner) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>body{margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}</style>
  </head><body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  ${inner}
  </table></td></tr></table></body></html>`;
}

function hdr(sub) {
  return `<tr><td style="background:${BRAND};padding:28px 40px;text-align:center;">
  <span style="color:#fff;font-size:22px;font-weight:700;">VeeFore</span>
  ${sub ? `<br><span style="color:rgba(255,255,255,.75);font-size:13px;">${sub}</span>` : ''}
  </td></tr>`;
}

function ftr() {
  return `<tr><td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
  <p style="color:#94a3b8;font-size:12px;margin:0;">Questions? <a href="mailto:support@veefore.com" style="color:${TEAL};">support@veefore.com</a></p>
  <p style="color:#cbd5e1;font-size:11px;margin:6px 0 0 0;">© ${new Date().getFullYear()} Veefore Technologies Pvt Ltd</p>
  </td></tr>`;
}

function btn(text, url) {
  return `<a href="${url}" style="display:inline-block;background:${ACCENT};color:#fff;padding:12px 26px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;">${text}</a>`;
}

// ── Email builders ──────────────────────────────────────────────────────────
const emails = {
  otp: () => sendEmail(
    '[TEST] Your VeeFore verification code',
    wrap(`${hdr('Email Verification')}
    <tr><td style="background:#fff;padding:36px 40px;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 12px 0;">Hi Test User, you're almost in!</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 24px 0;">Your one-time verification code:</p>
      <div style="background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
        <p style="color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 10px 0;">Verification Code</p>
        <div style="font-family:monospace;font-size:44px;font-weight:700;color:#0f172a;letter-spacing:12px;">847291</div>
        <p style="color:#94a3b8;font-size:12px;margin:10px 0 0 0;">Valid for 15 minutes</p>
      </div>
      <p style="color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;padding-top:16px;margin:0;">If you didn't request this, ignore this email.</p>
    </td></tr>${ftr()}`)
  ),

  welcome: () => sendEmail(
    '[TEST] Welcome to VeeFore — you\'re all set!',
    wrap(`${hdr('Welcome 🎉')}
    <tr><td style="background:#fff;padding:36px 40px;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 12px 0;">You're verified, Test User!</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 20px 0;">Your VeeFore account is now active. Start growing your social media presence.</p>
      <div style="text-align:center;margin:20px 0;">${btn('Go to Dashboard', 'https://veefore.com/dashboard')}</div>
    </td></tr>${ftr()}`)
  ),

  waitlist: () => sendEmail(
    '[TEST] 🎉 You\'re on the VeeFore waitlist!',
    wrap(`${hdr("You're on the waitlist")}
    <tr><td style="background:#fff;padding:36px 40px;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 12px 0;">Hi Test User — you're in!</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 20px 0;">You're on our early-access waitlist. We'll email your invite when your spot opens.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;">
        <p style="color:#1e293b;font-weight:600;font-size:13px;margin:0 0 8px 0;">Your early-access benefits</p>
        <p style="color:#475569;font-size:13px;margin:4px 0;">✓ 500 bonus credits on launch</p>
        <p style="color:#475569;font-size:13px;margin:4px 0;">✓ Founding-member pricing locked in</p>
        <p style="color:#475569;font-size:13px;margin:4px 0;">✓ Direct access to our team</p>
      </div>
    </td></tr>${ftr()}`)
  ),

  invoice: () => sendEmail(
    '[TEST] VeeFore receipt — Pro plan',
    wrap(`${hdr('Payment Confirmation')}
    <tr><td style="background:#fff;padding:36px 40px;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 6px 0;">Receipt #VF-TEST-001</h2>
      <p style="color:#64748b;font-size:13px;margin:0 0 24px 0;">Hi Test User, your payment was successful.</p>
      <table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;font-size:13px;color:#334155;margin-bottom:24px;">
        <tr style="background:#f8fafc;"><td style="font-weight:600;border-bottom:1px solid #e2e8f0;">Plan</td><td style="text-align:right;border-bottom:1px solid #e2e8f0;">Pro (monthly)</td></tr>
        <tr><td style="border-bottom:1px solid #e2e8f0;">Billing period</td><td style="text-align:right;border-bottom:1px solid #e2e8f0;">1 Aug 2026 – 1 Sep 2026</td></tr>
        <tr><td style="border-bottom:1px solid #e2e8f0;">Payment ID</td><td style="text-align:right;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px;">pay_TEST123456</td></tr>
        <tr style="background:#f0fdf4;"><td style="font-weight:700;font-size:15px;">Total paid</td><td style="text-align:right;font-weight:700;font-size:15px;color:#059669;">₹2,499</td></tr>
      </table>
      <div style="text-align:center;">${btn('View Dashboard', 'https://veefore.com/dashboard')}</div>
    </td></tr>${ftr()}`)
  ),

  'payment-failed': () => sendEmail(
    '[TEST] Action required: VeeFore payment failed',
    wrap(`${hdr('⚠️ Action Required')}
    <tr><td style="background:#fff;padding:36px 40px;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 12px 0;">Hi Test User, your payment didn't go through</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 16px 0;">We couldn't charge your card for your <strong>Pro</strong> plan. You have a 3-day grace period.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:#991b1b;">
        ⚠️ If not resolved in 3 days, your account reverts to the free plan.
      </div>
      <div style="text-align:center;">${btn('Update payment method', 'https://veefore.com/settings/billing')}</div>
    </td></tr>${ftr()}`)
  ),

  cancellation: () => sendEmail(
    '[TEST] Your VeeFore subscription has been cancelled',
    wrap(`${hdr('Subscription Cancelled')}
    <tr><td style="background:#fff;padding:36px 40px;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 12px 0;">Your subscription has been cancelled, Test User</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 16px 0;">Your <strong>Pro</strong> plan has been cancelled. Access continues until <strong>1 Sep 2026</strong>.</p>
      <div style="text-align:center;">${btn('Re-subscribe', 'https://veefore.com/settings/billing')}</div>
    </td></tr>${ftr()}`)
  ),

  'pre-renewal': () => sendEmail(
    '[TEST] VeeFore subscription renews on 1 Sep 2026',
    wrap(`${hdr('Renewal Reminder')}
    <tr><td style="background:#fff;padding:36px 40px;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 12px 0;">Your subscription renews in 3 days, Test User</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 16px 0;">Your <strong>Pro</strong> plan renews on <strong>1 Sep 2026</strong> for <strong>₹2,499</strong>. No action needed.</p>
      <div style="text-align:center;">${btn('Manage subscription', 'https://veefore.com/settings/billing')}</div>
    </td></tr>${ftr()}`)
  ),

  quota: () => sendEmail(
    '[TEST] VeeFore: 90% of your AI credits used',
    wrap(`${hdr('90% Quota Used')}
    <tr><td style="background:#fff;padding:36px 40px;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 12px 0;">You've used 90% of your AI credits</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 16px 0;">Used <strong>675</strong> of <strong>750</strong> AI credits on your <strong>Pro</strong> plan.</p>
      <div style="background:#e2e8f0;border-radius:99px;height:10px;overflow:hidden;margin-bottom:20px;">
        <div style="background:#f59e0b;height:100%;width:90%;border-radius:99px;"></div>
      </div>
      <div style="text-align:center;">${btn('Upgrade plan', 'https://veefore.com/settings/billing')}</div>
    </td></tr>${ftr()}`)
  ),

  refund: () => sendEmail(
    '[TEST] VeeFore refund of ₹2,499 processed',
    wrap(`${hdr('Refund Processed')}
    <tr><td style="background:#fff;padding:36px 40px;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 12px 0;">Your refund of ₹2,499 is on its way, Test User</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 16px 0;">Typically takes 5–7 business days to appear on your statement.</p>
      <p style="color:#64748b;font-size:12px;margin:0;">Refund ID: <span style="font-family:monospace;">rfnd_TEST789</span></p>
    </td></tr>${ftr()}`)
  ),

  'early-access': () => sendEmail(
    "[TEST] You're approved — welcome to VeeFore early access!",
    wrap(`${hdr("You're Approved! 🎉")}
    <tr><td style="background:#fff;padding:36px 40px;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 12px 0;">Great news, Test User!</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 20px 0;">Your early-access application is approved. Create your account and unlock founding-member benefits.</p>
      <div style="text-align:center;">${btn('Activate my account', 'https://veefore.com/signup')}</div>
    </td></tr>${ftr()}`)
  ),
};

// ── Runner ─────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n📧  Testing Resend integration → sending to: ${TO}`);
  console.log(`🔑  API key: ${RESEND_API_KEY.slice(0, 10)}...`);
  console.log(`📤  From:    ${RESEND_FROM}\n`);

  const types = TYPE === 'all' ? Object.keys(emails) : [TYPE];

  for (const type of types) {
    const fn = emails[type];
    if (!fn) {
      console.error(`❌  Unknown test type: "${type}"\n    Valid: ${Object.keys(emails).join(', ')}, all`);
      process.exit(1);
    }

    process.stdout.write(`  Sending "${type}" ... `);
    try {
      const result = await fn();
      console.log(`✅  Delivered — ID: ${result.id}`);
    } catch (err) {
      console.log(`❌  FAILED`);
      console.error(`    ${err.message}`);
    }

    if (types.length > 1) {
      await new Promise(r => setTimeout(r, 1200)); // brief gap between sends
    }
  }

  console.log('\nDone. Check your inbox (and spam folder).\n');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
