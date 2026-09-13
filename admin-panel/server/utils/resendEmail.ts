/**
 * Resend email helper (admin-panel)
 *
 * Self-contained sender used by the waitlist approval flow to send the branded
 * "early access approved" email. Uses the Resend REST API via global fetch
 * (Node 20+) so no extra dependency is needed. Mirrors the design system used
 * by the main app's server/services/resend.service.ts.
 *
 * Requires RESEND_API_KEY (and optionally RESEND_FROM_EMAIL) in the admin-panel
 * server environment.
 */

const LOGO_ICON_URL =
  'https://res.cloudinary.com/dagelfucc/image/upload/c_crop,x_12,y_14,w_184,h_133/v1767342187/veefore_lbulb6.png';

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const COLORS = {
  ink: '#0b1220',
  body: '#4b5563',
  muted: '#8b94a3',
  faint: '#b9c0cc',
  line: '#eceff3',
  bg: '#eef1f5',
  card: '#ffffff',
  accent: '#2563eb',
};

function brandHeader(): string {
  return `<tr><td style="padding:34px 40px 10px 40px;text-align:center;">
  <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;padding:0;font-size:0;line-height:0;">
      <img src="${LOGO_ICON_URL}" width="36" height="26" alt="V" style="display:block;width:36px;height:26px;">
    </td>
    <td style="vertical-align:middle;padding:0;font-family:${FONT};font-size:25px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.8px;line-height:26px;">eefore</td>
  </tr></table>
</td></tr>`;
}

function brandFooter(): string {
  return `<tr><td style="padding:28px 40px 36px 40px;border-top:1px solid ${COLORS.line};">
  <p style="margin:0 0 6px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};text-align:center;">
    Need help? <a href="mailto:support@veefore.com" style="color:${COLORS.accent};font-weight:600;text-decoration:none;">support@veefore.com</a>
  </p>
  <p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.faint};text-align:center;">
    © ${new Date().getFullYear()} Veefed Technologies Pvt Limited · All rights reserved
  </p>
</td></tr>`;
}

export async function sendEarlyAccessApprovalEmail(
  to: string,
  firstName = 'there',
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[RESEND] RESEND_API_KEY not set in admin-panel — skipping approval email');
    return false;
  }
  const from = process.env.RESEND_FROM_EMAIL ?? 'Veefore <noreply@veefore.com>';

  const benefits = [
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

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Great news, ${firstName} — your VeeFore early access is approved. Activate your account now.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${COLORS.card};border-radius:16px;overflow:hidden;border:1px solid ${COLORS.line};box-shadow:0 8px 24px rgba(16,24,40,.06);">
  <tr><td style="height:4px;background:#7c3aed;font-size:0;line-height:0;">&nbsp;</td></tr>
  ${brandHeader()}
  <tr><td style="padding:8px 48px 0 48px;text-align:center;">
    <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
      <td style="width:64px;height:64px;background:#f3f0ff;border-radius:50%;text-align:center;font-size:30px;line-height:64px;">🚀</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:20px 48px 4px 48px;text-align:center;">
    <h1 style="margin:0 0 10px 0;font-family:${FONT};font-size:27px;line-height:34px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.6px;">You're in, ${firstName}! 🎉</h1>
    <p style="margin:0;font-family:${FONT};font-size:15px;line-height:24px;color:${COLORS.body};">Your early-access application is approved. Activate your account to claim your founding-member perks and start creating.</p>
  </td></tr>
  <tr><td style="padding:26px 48px 8px 48px;">
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
      <td align="center" style="border-radius:10px;background:#7c3aed;">
        <a href="https://veefore.com/signup" style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;border-radius:10px;">Activate my account</a>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:16px 48px 8px 48px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9ff;border:1px solid #ece8fb;border-radius:14px;">
      <tr><td style="padding:8px 22px 14px 22px;">
        <p style="margin:14px 0 6px 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#7c3aed;">Your founding-member perks</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${benefitRows}</table>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:18px 48px 34px 48px;">
    <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};text-align:center;border-top:1px solid ${COLORS.line};padding-top:18px;">This invite is for <strong style="color:${COLORS.body};">${to}</strong>. If you didn't apply, you can safely ignore this email.</p>
  </td></tr>
  ${brandFooter()}
</table>
</td></tr></table>
</body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `You're approved, ${firstName} — welcome to VeeFore 🚀`,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[RESEND] Early-access approval email failed:', res.status, body);
      return false;
    }
    console.log(`[RESEND] Early-access approval email sent to ${to}`);
    return true;
  } catch (err) {
    console.error('[RESEND] Early-access approval email error:', err);
    return false;
  }
}
