/**
 * ResendEmailService
 *
 * Primary email delivery via the Resend API (https://resend.com).
 * Covers all transactional email types used by Veefore:
 *  - OTP / email verification
 *  - Welcome (post-verification)
 *  - Waitlist confirmation
 *  - Subscription activated / renewed (invoice receipt)
 *  - Payment failed
 *  - Subscription cancellation confirmation
 *  - Pre-renewal reminder
 *  - AI credit quota alerts (80 / 90 / 100 %)
 *  - Refund processed
 *
 * Falls back gracefully (logs only) when RESEND_API_KEY is not set.
 */

import { Resend } from 'resend';
import logger from '../config/logger';

// ---------------------------------------------------------------------------
// Client (lazy-initialised so missing key = warning, not crash)
// ---------------------------------------------------------------------------

let _resend: Resend | null = null;

function getClient(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    _resend = new Resend(key);
  }
  return _resend;
}

// ---------------------------------------------------------------------------
// Shared config
// ---------------------------------------------------------------------------

export const RESEND_FROM =
  process.env.RESEND_FROM_EMAIL ?? 'Veefore <noreply@veefore.com>';

const BRAND_COLOR = '#1e3a5f';
const ACCENT_COLOR = '#2563eb';
const TEAL = '#0d9488';

// ---------------------------------------------------------------------------
// Design System (v2) — modern, enterprise, mobile-first
// ---------------------------------------------------------------------------
//
// Design tokens shared across all templates. Every email is built from these
// primitives so the brand stays consistent while each email keeps its own
// tailored body. All layout is table-based (the only reliable cross-client
// approach) with a fluid 600px max width that collapses cleanly on mobile.
//
// Logo: hosted on Cloudinary (renders in Gmail/Apple Mail/Outlook). A text
// wordmark sits beside it so the brand is still visible if images are blocked.

// Full padded logo (square-ish, for standalone use if ever needed).
const LOGO_URL =
  'https://res.cloudinary.com/dagelfucc/image/upload/v1767342187/veefore_lbulb6.png';

// Tightly-cropped V glyph (Cloudinary c_crop removes the built-in whitespace
// so the icon sits flush against the "eefore" wordmark and reads as one word).
// Cropped box is 184x133 (aspect ≈ 1.383:1).
const LOGO_ICON_URL =
  'https://res.cloudinary.com/dagelfucc/image/upload/c_crop,x_12,y_14,w_184,h_133/v1767342187/veefore_lbulb6.png';

const COLORS = {
  ink: '#0b1220', // near-black headings
  body: '#4b5563', // body copy
  muted: '#8b94a3', // secondary text
  faint: '#b9c0cc', // footer text
  line: '#eceff3', // hairline borders
  bg: '#eef1f5', // page background
  card: '#ffffff', // card surface
  accent: '#2563eb',
  accentDark: '#1d4ed8',
  success: '#16a34a',
  danger: '#dc2626',
  warning: '#d97706',
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Full document shell. `accent` sets the thin top brand bar color so each
 * email type can carry a subtle contextual tint (blue default, red for
 * failures, green for success, etc). `preheader` is the hidden inbox-preview
 * snippet shown next to the subject line in most clients.
 */
function shell(opts: { accent?: string; preheader?: string; body: string }): string {
  const accent = opts.accent ?? COLORS.accent;
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>VeeFore</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background:${COLORS.bg};}
  table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
  img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
  a{text-decoration:none;}
  .vf-card{width:600px;max-width:600px;}
  @media only screen and (max-width:620px){
    .vf-card{width:100%!important;}
    .vf-pad{padding-left:24px!important;padding-right:24px!important;}
    .vf-pad-lg{padding-left:24px!important;padding-right:24px!important;}
    .vf-h1{font-size:22px!important;line-height:30px!important;}
    .vf-otp{font-size:38px!important;letter-spacing:8px!important;}
    .vf-btn a{display:block!important;}
    .vf-stack{display:block!important;width:100%!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:${FONT};">
${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${COLORS.bg};">${opts.preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" class="vf-card" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${COLORS.card};border-radius:16px;overflow:hidden;border:1px solid ${COLORS.line};box-shadow:0 1px 2px rgba(16,24,40,.04),0 8px 24px rgba(16,24,40,.06);">
  <tr><td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
  ${brandHeader()}
  ${opts.body}
  ${brandFooter()}
</table>
<table role="presentation" class="vf-card" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
  <tr><td style="padding:20px 24px;text-align:center;">
    <p style="margin:0;font-family:${FONT};font-size:11px;line-height:16px;color:${COLORS.faint};">
      Veefed Technologies Pvt Limited · You received this email because you have a VeeFore account.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Centered lockup header. The logo IS the letter "V" (the icon), so the
 * wordmark text is the remaining lowercase letters "eefore" set flush against
 * the icon with negative-ish tight spacing so the whole thing reads as the
 * single word "Veefore". Sizes are tuned so the V-glyph cap height lines up
 * with the text x-height/cap height.
 */
function brandHeader(): string {
  // Cropped V is 184x133 → at height 26px the width is ~36px.
  return `<tr><td class="vf-pad" style="padding:34px 40px 10px 40px;text-align:center;">
  <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;padding:0;font-size:0;line-height:0;">
      <img src="${LOGO_ICON_URL}" width="36" height="26" alt="V" style="display:block;width:36px;height:26px;">
    </td>
    <td style="vertical-align:middle;padding:0;font-family:${FONT};font-size:25px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.8px;line-height:26px;">eefore</td>
  </tr></table>
</td></tr>`;
}

/** Muted footer with support link + legal line. */
function brandFooter(): string {
  return `<tr><td class="vf-pad" style="padding:28px 40px 36px 40px;border-top:1px solid ${COLORS.line};">
  <p style="margin:0 0 6px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};text-align:center;">
    Need help? <a href="mailto:support@veefore.com" style="color:${COLORS.accent};font-weight:600;">support@veefore.com</a>
  </p>
  <p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.faint};text-align:center;">
    © ${new Date().getFullYear()} Veefed Technologies Pvt Limited · All rights reserved
  </p>
</td></tr>`;
}

/** Bulletproof (Outlook-safe) CTA button. */
function button(text: string, url: string, color: string = COLORS.accent): string {
  return `<table role="presentation" class="vf-btn" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;">
  <tr><td align="center" style="border-radius:10px;background:${color};">
    <!--[if mso]>&nbsp;<![endif]-->
    <a href="${url}" style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;border-radius:10px;background:${color};">${text}</a>
    <!--[if mso]>&nbsp;<![endif]-->
  </td></tr>
</table>`;
}

/** Section heading + lead paragraph block used at the top of most bodies. */
function heroText(heading: string, lead: string): string {
  return `<h1 class="vf-h1" style="margin:0 0 12px 0;font-family:${FONT};font-size:26px;line-height:34px;font-weight:700;color:${COLORS.ink};letter-spacing:-0.5px;">${heading}</h1>
  <p style="margin:0;font-family:${FONT};font-size:15px;line-height:24px;color:${COLORS.body};">${lead}</p>`;
}

// Legacy aliases kept so not-yet-migrated templates keep compiling.
// (Removed once every email is migrated to the v2 design system.)
function emailWrapper(bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:${FONT};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
${bodyHtml}
</table></td></tr></table></body></html>`;
}

function header(title: string): string {
  return `<tr><td style="background:${BRAND_COLOR};padding:32px 40px;text-align:center;">
  <span style="font-size:24px;font-weight:700;color:#fff;">VeeFore</span>
  ${title ? `<br><span style="color:rgba(255,255,255,.8);font-size:14px;">${title}</span>` : ''}
</td></tr>`;
}

function footer(): string {
  return `<tr><td style="background:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
  <p style="color:#94a3b8;font-size:12px;margin:0 0 8px 0;">Questions? <a href="mailto:support@veefore.com" style="color:${TEAL};">support@veefore.com</a></p>
  <p style="color:#cbd5e1;font-size:11px;margin:0;">© ${new Date().getFullYear()} Veefed Technologies Pvt Limited</p>
</td></tr>`;
}

function ctaButton(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:${ACCENT_COLOR};color:#fff;padding:13px 28px;border-radius:8px;font-weight:600;font-size:15px;text-decoration:none;">${text}</a>`;
}

// ---------------------------------------------------------------------------
// Helper: safe send wrapper
// ---------------------------------------------------------------------------

async function send(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  try {
    const client = getClient();
    const result = await client.emails.send({
      from: RESEND_FROM,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });
    if (result.error) {
      logger.error('Resend API error', new Error(result.error.message), {
        module: 'resend',
        subject: opts.subject,
      });
      return false;
    }
    logger.info('Email sent via Resend', { module: 'resend', subject: opts.subject, to: opts.to });
    return true;
  } catch (err) {
    logger.error('Resend send failed', err instanceof Error ? err : new Error(String(err)), {
      module: 'resend',
      subject: opts.subject,
    });
    return false;
  }
}

// ===========================================================================
// 1. OTP / Email Verification
// ===========================================================================

export async function sendOtpEmail(
  to: string,
  otp: string,
  firstName = 'User',
): Promise<boolean> {
  const digits = otp.split('').join('&nbsp;&nbsp;');

  const html = shell({
    accent: COLORS.accent,
    preheader: `Your VeeFore verification code is ${otp}. It expires in 15 minutes.`,
    body: `
<tr><td class="vf-pad-lg" style="padding:16px 48px 8px 48px;">
  ${heroText(`Verify it's you, ${firstName}`, 'Enter this code to confirm your email address and secure your VeeFore account.')}
</td></tr>

<tr><td class="vf-pad-lg" style="padding:28px 48px 8px 48px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border:1px solid ${COLORS.line};border-radius:14px;">
    <tr><td style="padding:26px 20px;text-align:center;">
      <p style="margin:0 0 14px 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${COLORS.muted};">Verification Code</p>
      <div class="vf-otp" style="font-family:'SF Mono',SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;font-size:46px;font-weight:700;letter-spacing:14px;color:${COLORS.ink};line-height:1;">${digits}</div>
      <p style="margin:16px 0 0 0;font-family:${FONT};font-size:12px;color:${COLORS.muted};">
        <span style="display:inline-block;vertical-align:middle;width:6px;height:6px;border-radius:50%;background:${COLORS.warning};margin-right:6px;"></span>
        Expires in 15 minutes
      </p>
    </td></tr>
  </table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:24px 48px 8px 48px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfcfe;border:1px solid ${COLORS.line};border-radius:12px;">
    <tr>
      <td style="padding:14px 16px;vertical-align:top;width:26px;">
        <span style="font-size:16px;">🔒</span>
      </td>
      <td style="padding:14px 16px 14px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};">
        For your security, never share this code with anyone. VeeFore staff will never ask you for it.
      </td>
    </tr>
  </table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:20px 48px 32px 48px;">
  <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};border-top:1px solid ${COLORS.line};padding-top:20px;">
    Didn't request this? You can safely ignore this email — your account is still secure.
  </p>
</td></tr>`,
  });

  return send({ to, subject: `${otp} is your VeeFore verification code`, html });
}

// ===========================================================================
// 2. Welcome email (post-verification)
// ===========================================================================

export async function sendWelcomeEmail(to: string, firstName = 'User'): Promise<boolean> {
  const features: Array<{ icon: string; bg: string; title: string; desc: string }> = [
    {
      icon: '✨',
      bg: '#eef2ff',
      title: 'AI content studio',
      desc: 'Generate captions, images and videos tuned to your brand voice.',
    },
    {
      icon: '📈',
      bg: '#ecfdf5',
      title: 'Smart analytics',
      desc: 'Track growth, reach and engagement across every connected account.',
    },
    {
      icon: '🚀',
      bg: '#fef3f2',
      title: 'Automated publishing',
      desc: 'Schedule and auto-publish posts at the moments that perform best.',
    },
  ];

  const featureRows = features
    .map(
      (f) => `
    <tr><td style="padding:0 0 14px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${COLORS.line};border-radius:12px;">
        <tr>
          <td width="52" style="padding:16px 0 16px 16px;vertical-align:top;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="width:40px;height:40px;background:${f.bg};border-radius:10px;text-align:center;font-size:19px;line-height:40px;">${f.icon}</td>
            </tr></table>
          </td>
          <td style="padding:15px 18px 15px 14px;vertical-align:top;">
            <p style="margin:0 0 3px 0;font-family:${FONT};font-size:15px;font-weight:700;color:${COLORS.ink};">${f.title}</p>
            <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};">${f.desc}</p>
          </td>
        </tr>
      </table>
    </td></tr>`,
    )
    .join('');

  const html = shell({
    accent: COLORS.accent,
    preheader: `Welcome to VeeFore, ${firstName}! Your account is ready — here's how to get started.`,
    body: `
<tr><td class="vf-pad-lg" style="padding:16px 48px 8px 48px;">
  ${heroText(`Welcome aboard, ${firstName} 🎉`, 'Your account is verified and ready. VeeFore helps you create, schedule and grow across social platforms — all powered by AI.')}
</td></tr>

<tr><td class="vf-pad-lg" style="padding:26px 48px 8px 48px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${featureRows}
  </table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:14px 48px 8px 48px;">
  ${button('Open your dashboard', 'https://veefore.com/dashboard')}
</td></tr>

<tr><td class="vf-pad-lg" style="padding:22px 48px 34px 48px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border-radius:12px;">
    <tr><td style="padding:16px 18px;">
      <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};">
        💡 <strong style="color:${COLORS.body};">Quick start:</strong> connect your first social account to unlock analytics and scheduling. It takes less than a minute.
      </p>
    </td></tr>
  </table>
</td></tr>`,
  });

  return send({ to, subject: `Welcome to VeeFore, ${firstName} 🎉`, html });
}

// ===========================================================================
// 3. Waitlist confirmation
// ===========================================================================

export async function sendWaitlistEmail(to: string, firstName = 'there'): Promise<boolean> {
  const benefits: Array<{ icon: string; title: string; desc: string }> = [
    { icon: '🎁', title: '500 bonus credits', desc: 'Dropped into your account the day we launch.' },
    { icon: '🔒', title: 'Founding-member pricing', desc: 'A locked-in rate that never goes up.' },
    { icon: '💬', title: 'Direct line to our team', desc: 'Shape the product with priority support.' },
  ];

  const benefitRows = benefits
    .map(
      (b) => `
    <tr>
      <td width="44" style="padding:12px 0;vertical-align:top;">
        <span style="font-size:20px;">${b.icon}</span>
      </td>
      <td style="padding:12px 0;vertical-align:top;border-bottom:1px solid ${COLORS.line};">
        <p style="margin:0 0 2px 0;font-family:${FONT};font-size:14px;font-weight:700;color:${COLORS.ink};">${b.title}</p>
        <p style="margin:0;font-family:${FONT};font-size:13px;line-height:19px;color:${COLORS.muted};">${b.desc}</p>
      </td>
    </tr>`,
    )
    .join('');

  const html = shell({
    accent: '#7c3aed', // premium violet for the aspirational waitlist moment
    preheader: `You're on the VeeFore early-access waitlist. Here's what you'll unlock.`,
    body: `
<tr><td class="vf-pad-lg" style="padding:8px 48px 0 48px;text-align:center;">
  <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
    <td style="width:64px;height:64px;background:#f3f0ff;border-radius:50%;text-align:center;font-size:30px;line-height:64px;">🎉</td>
  </tr></table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:20px 48px 8px 48px;text-align:center;">
  <h1 class="vf-h1" style="margin:0 0 12px 0;font-family:${FONT};font-size:26px;line-height:34px;font-weight:700;color:${COLORS.ink};letter-spacing:-0.5px;">You're on the list, ${firstName}!</h1>
  <p style="margin:0;font-family:${FONT};font-size:15px;line-height:24px;color:${COLORS.body};">
    Thanks for joining the VeeFore early-access waitlist. You're now in line for the first wave of invites — we'll email you the moment your spot opens.
  </p>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:26px 48px 8px 48px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9ff;border:1px solid #ece8fb;border-radius:14px;">
    <tr><td style="padding:6px 20px 10px 20px;">
      <p style="margin:14px 0 6px 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#7c3aed;">What you'll unlock</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${benefitRows}
      </table>
    </td></tr>
  </table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:22px 48px 34px 48px;">
  <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};text-align:center;">
    We'll reach out at <strong style="color:${COLORS.body};">${to}</strong> — no action needed for now. Keep an eye on your inbox. 👀
  </p>
</td></tr>`,
  });

  return send({ to, subject: `You're on the VeeFore waitlist, ${firstName} 🎉`, html });
}

// ===========================================================================
// 4. Subscription activated (invoice receipt)
// ===========================================================================

export interface InvoiceEmailData {
  firstName: string;
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  amountInr: number;
  periodStart: Date;
  periodEnd: Date;
  paymentId?: string;
  invoiceNumber?: string;
}

export async function sendInvoiceEmail(to: string, data: InvoiceEmailData): Promise<boolean> {
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const invoiceNo = data.invoiceNumber ?? `VF-${Date.now().toString().slice(-8)}`;
  const amount = `₹${data.amountInr.toLocaleString('en-IN')}`;

  const row = (label: string, value: string, mono = false) => `
    <tr>
      <td style="padding:12px 0;font-family:${FONT};font-size:13px;color:${COLORS.muted};border-bottom:1px solid ${COLORS.line};">${label}</td>
      <td style="padding:12px 0;font-family:${mono ? "'SF Mono',Consolas,monospace" : FONT};font-size:13px;color:${COLORS.body};text-align:right;border-bottom:1px solid ${COLORS.line};">${value}</td>
    </tr>`;

  const html = shell({
    accent: COLORS.success,
    preheader: `Payment received — ${amount} for your VeeFore ${data.planName} plan. Receipt #${invoiceNo}.`,
    body: `
<tr><td class="vf-pad-lg" style="padding:8px 48px 0 48px;text-align:center;">
  <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
    <td style="width:56px;height:56px;background:#ecfdf5;border-radius:50%;text-align:center;font-size:26px;line-height:56px;">✅</td>
  </tr></table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:18px 48px 4px 48px;text-align:center;">
  <h1 class="vf-h1" style="margin:0 0 6px 0;font-family:${FONT};font-size:26px;line-height:34px;font-weight:700;color:${COLORS.ink};letter-spacing:-0.5px;">Payment successful</h1>
  <p style="margin:0;font-family:${FONT};font-size:15px;line-height:24px;color:${COLORS.body};">
    Thanks, ${data.firstName}. Here's your receipt.
  </p>
</td></tr>

<!-- Amount hero -->
<tr><td class="vf-pad-lg" style="padding:24px 48px 8px 48px;text-align:center;">
  <p style="margin:0 0 4px 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${COLORS.muted};">Amount paid</p>
  <p style="margin:0;font-family:${FONT};font-size:40px;line-height:1;font-weight:800;color:${COLORS.ink};letter-spacing:-1px;">${amount}</p>
</td></tr>

<!-- Receipt detail card -->
<tr><td class="vf-pad-lg" style="padding:22px 48px 8px 48px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfcfe;border:1px solid ${COLORS.line};border-radius:14px;">
    <tr><td style="padding:6px 20px 14px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:14px 0 12px 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${COLORS.muted};">Receipt #${invoiceNo}</td>
          <td style="padding:14px 0 12px 0;text-align:right;">
            <span style="display:inline-block;background:#ecfdf5;color:${COLORS.success};font-family:${FONT};font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;">PAID</span>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${row('Plan', `VeeFore ${data.planName}`)}
        ${row('Billing cycle', data.billingCycle === 'yearly' ? 'Yearly' : 'Monthly')}
        ${row('Billing period', `${fmt(data.periodStart)} – ${fmt(data.periodEnd)}`)}
        ${data.paymentId ? row('Payment ID', data.paymentId, true) : ''}
        <tr>
          <td style="padding:14px 0 4px 0;font-family:${FONT};font-size:15px;font-weight:700;color:${COLORS.ink};">Total paid</td>
          <td style="padding:14px 0 4px 0;font-family:${FONT};font-size:15px;font-weight:800;color:${COLORS.success};text-align:right;">${amount}</td>
        </tr>
      </table>
    </td></tr>
  </table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:18px 48px 8px 48px;">
  ${button('View billing history', 'https://app.veefore.com/billing-history', COLORS.ink)}
</td></tr>

<tr><td class="vf-pad-lg" style="padding:18px 48px 34px 48px;">
  <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};text-align:center;border-top:1px solid ${COLORS.line};padding-top:18px;">
    Your plan renews on <strong style="color:${COLORS.body};">${fmt(data.periodEnd)}</strong>. You can manage or cancel anytime in billing settings.
  </p>
</td></tr>`,
  });

  return send({ to, subject: `Your VeeFore receipt — ${amount} (${data.planName})`, html });
}

// ===========================================================================
// 5. Payment failed
// ===========================================================================

export async function sendPaymentFailedEmail(
  to: string,
  firstName: string,
  planName: string,
  nextRetryDate?: Date,
): Promise<boolean> {
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const html = shell({
    accent: COLORS.danger,
    preheader: `We couldn't process your payment for the ${planName} plan. Update your payment method within 3 days to keep your access.`,
    body: `
<tr><td class="vf-pad-lg" style="padding:8px 48px 0 48px;text-align:center;">
  <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
    <td style="width:56px;height:56px;background:#fef2f2;border-radius:50%;text-align:center;font-size:26px;line-height:56px;">⚠️</td>
  </tr></table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:18px 48px 8px 48px;text-align:center;">
  <h1 class="vf-h1" style="margin:0 0 8px 0;font-family:${FONT};font-size:26px;line-height:34px;font-weight:700;color:${COLORS.ink};letter-spacing:-0.5px;">Your payment didn't go through</h1>
  <p style="margin:0;font-family:${FONT};font-size:15px;line-height:24px;color:${COLORS.body};">
    Hi ${firstName}, we couldn't charge your payment method for your <strong>${planName}</strong> subscription.
  </p>
</td></tr>

<!-- Grace period alert -->
<tr><td class="vf-pad-lg" style="padding:24px 48px 8px 48px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7f7;border:1px solid #fbd5d5;border-radius:12px;">
    <tr>
      <td width="44" style="padding:16px 0 16px 16px;vertical-align:top;font-size:18px;">⏳</td>
      <td style="padding:16px 18px 16px 10px;">
        <p style="margin:0 0 3px 0;font-family:${FONT};font-size:14px;font-weight:700;color:#b42318;">3-day grace period active</p>
        <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:#912018;">
          Your access stays active while we retry.${nextRetryDate ? ` Next automatic retry: <strong>${fmt(nextRetryDate)}</strong>.` : ''} If payment isn't resolved, your account will move to the free plan.
        </p>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:20px 48px 8px 48px;">
  ${button('Update payment method', 'https://veefore.com/settings/billing', COLORS.danger)}
</td></tr>

<!-- Common reasons -->
<tr><td class="vf-pad-lg" style="padding:22px 48px 8px 48px;">
  <p style="margin:0 0 10px 0;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COLORS.muted};">Common reasons</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};">
    <tr><td style="padding:4px 0;">• Card expired or was replaced</td></tr>
    <tr><td style="padding:4px 0;">• Insufficient funds at the time of charge</td></tr>
    <tr><td style="padding:4px 0;">• Bank declined the recurring payment</td></tr>
  </table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:18px 48px 34px 48px;">
  <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};text-align:center;border-top:1px solid ${COLORS.line};padding-top:18px;">
    Trouble updating? Reply to this email or reach us at <a href="mailto:support@veefore.com" style="color:${COLORS.accent};font-weight:600;">support@veefore.com</a>.
  </p>
</td></tr>`,
  });

  return send({ to, subject: `Action needed: your VeeFore payment failed`, html });
}

// ===========================================================================
// 6. Subscription cancellation confirmation
// ===========================================================================

export async function sendCancellationEmail(
  to: string,
  firstName: string,
  planName: string,
  accessUntil: Date,
): Promise<boolean> {
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const html = shell({
    accent: COLORS.muted,
    preheader: `Your VeeFore ${planName} subscription is cancelled. You keep full access until ${fmt(accessUntil)}.`,
    body: `
<tr><td class="vf-pad-lg" style="padding:16px 48px 8px 48px;">
  ${heroText(`Your subscription is cancelled`, `Hi ${firstName}, we've cancelled your <strong>${planName}</strong> subscription. No further charges will be made.`)}
</td></tr>

<!-- Access-until highlight -->
<tr><td class="vf-pad-lg" style="padding:24px 48px 8px 48px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border:1px solid ${COLORS.line};border-radius:14px;">
    <tr><td style="padding:20px 22px;text-align:center;">
      <p style="margin:0 0 4px 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${COLORS.muted};">You keep full access until</p>
      <p style="margin:0;font-family:${FONT};font-size:22px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.4px;">${fmt(accessUntil)}</p>
      <p style="margin:8px 0 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};">After this date, your account moves to the free plan. Your data stays safe.</p>
    </td></tr>
  </table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:20px 48px 8px 48px;">
  ${button('Reactivate my subscription', 'https://veefore.com/settings/billing')}
</td></tr>

<tr><td class="vf-pad-lg" style="padding:22px 48px 34px 48px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfcfe;border:1px solid ${COLORS.line};border-radius:12px;">
    <tr><td style="padding:16px 18px;">
      <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};">
        💬 We'd genuinely love to know what made you leave. Just reply to this email — your feedback helps us make VeeFore better.
      </p>
    </td></tr>
  </table>
</td></tr>`,
  });

  return send({ to, subject: `Your VeeFore subscription has been cancelled`, html });
}

// ===========================================================================
// 7. Pre-renewal reminder
// ===========================================================================

export async function sendPreRenewalEmail(
  to: string,
  firstName: string,
  planName: string,
  renewalDate: Date,
  amountInr: number,
): Promise<boolean> {
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const amount = `₹${amountInr.toLocaleString('en-IN')}`;

  const line = (label: string, value: string) => `
    <tr>
      <td style="padding:11px 0;font-family:${FONT};font-size:13px;color:${COLORS.muted};border-bottom:1px solid ${COLORS.line};">${label}</td>
      <td style="padding:11px 0;font-family:${FONT};font-size:13px;font-weight:600;color:${COLORS.body};text-align:right;border-bottom:1px solid ${COLORS.line};">${value}</td>
    </tr>`;

  const html = shell({
    accent: COLORS.accent,
    preheader: `Heads up — your VeeFore ${planName} plan renews on ${fmt(renewalDate)} for ${amount}.`,
    body: `
<tr><td class="vf-pad-lg" style="padding:8px 48px 0 48px;text-align:center;">
  <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
    <td style="width:56px;height:56px;background:#eff4ff;border-radius:50%;text-align:center;font-size:26px;line-height:56px;">🔔</td>
  </tr></table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:18px 48px 4px 48px;text-align:center;">
  <h1 class="vf-h1" style="margin:0 0 8px 0;font-family:${FONT};font-size:26px;line-height:34px;font-weight:700;color:${COLORS.ink};letter-spacing:-0.5px;">Your plan renews in 3 days</h1>
  <p style="margin:0;font-family:${FONT};font-size:15px;line-height:24px;color:${COLORS.body};">
    Hi ${firstName}, just a heads-up before your <strong>${planName}</strong> subscription renews. No action needed — we'll handle it automatically.
  </p>
</td></tr>

<!-- Renewal summary card -->
<tr><td class="vf-pad-lg" style="padding:24px 48px 8px 48px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfcfe;border:1px solid ${COLORS.line};border-radius:14px;">
    <tr><td style="padding:8px 20px 14px 20px;">
      <p style="margin:14px 0 8px 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${COLORS.muted};">Upcoming renewal</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${line('Plan', `VeeFore ${planName}`)}
        ${line('Renewal date', fmt(renewalDate))}
        <tr>
          <td style="padding:14px 0 4px 0;font-family:${FONT};font-size:15px;font-weight:700;color:${COLORS.ink};">Amount</td>
          <td style="padding:14px 0 4px 0;font-family:${FONT};font-size:15px;font-weight:800;color:${COLORS.ink};text-align:right;">${amount}</td>
        </tr>
      </table>
    </td></tr>
  </table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:20px 48px 8px 48px;">
  ${button('Manage subscription', 'https://veefore.com/settings/billing', COLORS.ink)}
</td></tr>

<tr><td class="vf-pad-lg" style="padding:18px 48px 34px 48px;">
  <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};text-align:center;border-top:1px solid ${COLORS.line};padding-top:18px;">
    Want to change or cancel your plan? Do it any time before <strong style="color:${COLORS.body};">${fmt(renewalDate)}</strong> and you won't be charged.
  </p>
</td></tr>`,
  });

  return send({ to, subject: `Your VeeFore plan renews on ${fmt(renewalDate)}`, html });
}

// ===========================================================================
// 8. Quota alert
// ===========================================================================

export async function sendQuotaAlertEmail(
  to: string,
  firstName: string,
  quotaType: string,
  thresholdPct: number,
  used: number,
  total: number,
  planName: string,
): Promise<boolean> {
  const isExhausted = thresholdPct >= 100;
  const isCritical = thresholdPct >= 90;
  const barColor = isExhausted ? COLORS.danger : isCritical ? COLORS.warning : COLORS.accent;
  const tintBg = isExhausted ? '#fef2f2' : isCritical ? '#fffbeb' : '#eff4ff';
  const barPct = Math.min(Math.max(thresholdPct, 3), 100); // keep a sliver visible
  const remaining = Math.max(0, total - used);
  const emoji = isExhausted ? '🚫' : isCritical ? '⚠️' : '📊';

  const subject = isExhausted
    ? `You've used all your VeeFore ${quotaType}`
    : `${thresholdPct}% of your VeeFore ${quotaType} used`;

  const html = shell({
    accent: barColor,
    preheader: isExhausted
      ? `You've used all ${total} ${quotaType} on your ${planName} plan. Upgrade to keep going.`
      : `You've used ${used} of ${total} ${quotaType} (${thresholdPct}%) on your ${planName} plan.`,
    body: `
<tr><td class="vf-pad-lg" style="padding:8px 48px 0 48px;text-align:center;">
  <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
    <td style="width:56px;height:56px;background:${tintBg};border-radius:50%;text-align:center;font-size:26px;line-height:56px;">${emoji}</td>
  </tr></table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:18px 48px 4px 48px;text-align:center;">
  <h1 class="vf-h1" style="margin:0 0 8px 0;font-family:${FONT};font-size:25px;line-height:32px;font-weight:700;color:${COLORS.ink};letter-spacing:-0.5px;">
    ${isExhausted ? `You're out of ${quotaType}` : `${thresholdPct}% of your ${quotaType} used`}
  </h1>
  <p style="margin:0;font-family:${FONT};font-size:15px;line-height:24px;color:${COLORS.body};">
    Hi ${firstName}, ${isExhausted
      ? `you've used all your ${quotaType} on the <strong>${planName}</strong> plan.`
      : `here's where your <strong>${planName}</strong> plan usage stands this cycle.`}
  </p>
</td></tr>

<!-- Usage meter card -->
<tr><td class="vf-pad-lg" style="padding:24px 48px 8px 48px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfcfe;border:1px solid ${COLORS.line};border-radius:14px;">
    <tr><td style="padding:20px 22px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${FONT};font-size:13px;font-weight:600;color:${COLORS.body};">${quotaType}</td>
        <td style="font-family:${FONT};font-size:13px;font-weight:700;color:${barColor};text-align:right;">${thresholdPct}%</td>
      </tr></table>
      <!-- Progress track -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 12px 0;">
        <tr><td style="background:#eaeef3;border-radius:999px;padding:0;font-size:0;line-height:0;">
          <table role="presentation" width="${barPct}%" cellpadding="0" cellspacing="0">
            <tr><td style="height:10px;background:${barColor};border-radius:999px;font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${FONT};font-size:12px;color:${COLORS.muted};">${used.toLocaleString('en-IN')} used</td>
        <td style="font-family:${FONT};font-size:12px;color:${COLORS.muted};text-align:right;">${remaining.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} left</td>
      </tr></table>
    </td></tr>
  </table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:20px 48px 8px 48px;">
  ${button(isExhausted ? 'Upgrade to keep going' : 'Upgrade your plan', 'https://veefore.com/settings/billing', barColor)}
</td></tr>

<tr><td class="vf-pad-lg" style="padding:18px 48px 34px 48px;">
  <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};text-align:center;border-top:1px solid ${COLORS.line};padding-top:18px;">
    ${isExhausted
      ? 'Upgrade now for a higher limit, or wait for your quota to reset at the start of your next billing cycle.'
      : 'Upgrade any time for a higher limit, or your quota resets automatically next billing cycle.'}
  </p>
</td></tr>`,
  });

  return send({ to, subject, html });
}

// ===========================================================================
// 9. Refund processed
// ===========================================================================

export async function sendRefundEmail(
  to: string,
  firstName: string,
  amountInr: number,
  refundId: string,
): Promise<boolean> {
  const amount = `₹${amountInr.toLocaleString('en-IN')}`;

  const html = shell({
    accent: COLORS.success,
    preheader: `Your refund of ${amount} has been processed and is on its way back to you.`,
    body: `
<tr><td class="vf-pad-lg" style="padding:8px 48px 0 48px;text-align:center;">
  <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
    <td style="width:56px;height:56px;background:#ecfdf5;border-radius:50%;text-align:center;font-size:26px;line-height:56px;">💸</td>
  </tr></table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:18px 48px 4px 48px;text-align:center;">
  <h1 class="vf-h1" style="margin:0 0 6px 0;font-family:${FONT};font-size:26px;line-height:34px;font-weight:700;color:${COLORS.ink};letter-spacing:-0.5px;">Refund on its way</h1>
  <p style="margin:0;font-family:${FONT};font-size:15px;line-height:24px;color:${COLORS.body};">
    Hi ${firstName}, we've processed your refund. Here are the details.
  </p>
</td></tr>

<!-- Amount hero -->
<tr><td class="vf-pad-lg" style="padding:24px 48px 8px 48px;text-align:center;">
  <p style="margin:0 0 4px 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${COLORS.muted};">Refund amount</p>
  <p style="margin:0;font-family:${FONT};font-size:40px;line-height:1;font-weight:800;color:${COLORS.success};letter-spacing:-1px;">${amount}</p>
</td></tr>

<!-- Detail card -->
<tr><td class="vf-pad-lg" style="padding:22px 48px 8px 48px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfcfe;border:1px solid ${COLORS.line};border-radius:14px;">
    <tr><td style="padding:6px 20px 12px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:13px 0;font-family:${FONT};font-size:13px;color:${COLORS.muted};border-bottom:1px solid ${COLORS.line};">Refund ID</td>
          <td style="padding:13px 0;font-family:'SF Mono',Consolas,monospace;font-size:12px;color:${COLORS.body};text-align:right;border-bottom:1px solid ${COLORS.line};">${refundId}</td>
        </tr>
        <tr>
          <td style="padding:13px 0;font-family:${FONT};font-size:13px;color:${COLORS.muted};">Expected arrival</td>
          <td style="padding:13px 0;font-family:${FONT};font-size:13px;font-weight:600;color:${COLORS.body};text-align:right;">5–7 business days</td>
        </tr>
      </table>
    </td></tr>
  </table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:18px 48px 34px 48px;">
  <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};text-align:center;border-top:1px solid ${COLORS.line};padding-top:18px;">
    The refund will appear on the original payment method. Questions? Reach us at <a href="mailto:support@veefore.com" style="color:${COLORS.accent};font-weight:600;">support@veefore.com</a>.
  </p>
</td></tr>`,
  });

  return send({ to, subject: `Your VeeFore refund of ${amount} is processed`, html });
}

// ===========================================================================
// 10. Early-access approval notification
// ===========================================================================

export async function sendEarlyAccessApprovalEmail(
  to: string,
  firstName: string,
): Promise<boolean> {
  const benefits: Array<{ icon: string; text: string }> = [
    { icon: '🎁', text: '500 bonus credits to start creating right away' },
    { icon: '🔒', text: 'Founding-member pricing, locked in for good' },
    { icon: '⚡', text: 'First access to new AI features as they ship' },
  ];

  const benefitRows = benefits
    .map(
      (b) => `
    <tr>
      <td width="38" style="padding:9px 0;vertical-align:top;font-size:17px;">${b.icon}</td>
      <td style="padding:9px 0;vertical-align:middle;font-family:${FONT};font-size:14px;line-height:21px;color:${COLORS.body};">${b.text}</td>
    </tr>`,
    )
    .join('');

  const html = shell({
    accent: '#7c3aed',
    preheader: `Great news, ${firstName} — your VeeFore early access is approved. Activate your account now.`,
    body: `
<tr><td class="vf-pad-lg" style="padding:8px 48px 0 48px;text-align:center;">
  <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
    <td style="width:64px;height:64px;background:#f3f0ff;border-radius:50%;text-align:center;font-size:30px;line-height:64px;">🚀</td>
  </tr></table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:20px 48px 4px 48px;text-align:center;">
  <h1 class="vf-h1" style="margin:0 0 10px 0;font-family:${FONT};font-size:27px;line-height:34px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.6px;">You're in, ${firstName}! 🎉</h1>
  <p style="margin:0;font-family:${FONT};font-size:15px;line-height:24px;color:${COLORS.body};">
    Your early-access application is approved. Activate your account to claim your founding-member perks and start creating.
  </p>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:26px 48px 8px 48px;">
  ${button('Activate my account', 'https://veefore.com/signup', '#7c3aed')}
</td></tr>

<!-- Perks card -->
<tr><td class="vf-pad-lg" style="padding:16px 48px 8px 48px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9ff;border:1px solid #ece8fb;border-radius:14px;">
    <tr><td style="padding:8px 22px 14px 22px;">
      <p style="margin:14px 0 6px 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#7c3aed;">Your founding-member perks</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${benefitRows}
      </table>
    </td></tr>
  </table>
</td></tr>

<tr><td class="vf-pad-lg" style="padding:18px 48px 34px 48px;">
  <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};text-align:center;border-top:1px solid ${COLORS.line};padding-top:18px;">
    This invite is for <strong style="color:${COLORS.body};">${to}</strong>. If you didn't apply, you can safely ignore this email.
  </p>
</td></tr>`,
  });

  return send({ to, subject: `You're approved, ${firstName} — welcome to VeeFore 🚀`, html });
}

// ===========================================================================
// Singleton export (compatible with existing EmailService callers)
// ===========================================================================

export const resendEmailService = {
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
};
