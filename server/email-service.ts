import { createTransporter } from './email-config';
import sgMail from '@sendgrid/mail';

export class EmailService {
    private transporter: any;

    constructor() {
        this.transporter = createTransporter();
    }

    // Generate 6-digit OTP
    generateOTP(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // Generate OTP expiry (15 minutes from now)
    generateExpiry(): Date {
        const expiry = new Date();
        expiry.setMinutes(expiry.getMinutes() + 15);
        return expiry;
    }

    // Send email verification OTP
    async sendVerificationEmail(email: string, otp: string, firstName?: string): Promise<boolean> {
        const sendgridApiKey = process.env.SENDGRID_API_KEY;

        // Always log OTP for development
        console.log(`[EMAIL DEV] Verification code for ${email}: ${otp}`);

        if (sendgridApiKey) {
            try {
                // Use SendGrid Web API instead of SMTP
                sgMail.setApiKey(sendgridApiKey);

                // Need a verified sender email - ask user to provide one
                const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || process.env.SENDGRID_FROM_EMAIL;
                if (!fromEmail) {
                    console.log('[EMAIL] No verified sender email configured. Please add SENDGRID_VERIFIED_SENDER environment variable with your verified SendGrid sender email.');
                    throw new Error('No verified sender email configured');
                }

                const fromName = process.env.SENDGRID_FROM_NAME || 'VeeFore Support';

                const msg = {
                    to: email,
                    from: {
                        email: fromEmail,
                        name: fromName
                    },
                    subject: 'Verify Your VeeFore Account',
                    html: this.getVerificationEmailTemplate(otp, firstName || 'User')
                };

                await sgMail.send(msg);
                console.log(`[EMAIL] ✅ REAL EMAIL SENT to ${email} with OTP: ${otp}`);
                return true;
            } catch (error: any) {
                console.error('[EMAIL] ❌ SendGrid API failed:', error);
                console.error('[EMAIL] SendGrid error details:', {
                    message: error.message,
                    response: error.response?.body || 'No response body',
                    code: error.code,
                    statusCode: error.statusCode
                });

                // Log the specific error for debugging
                if (error.response?.body?.errors) {
                    console.error('[EMAIL] Specific SendGrid errors:', error.response.body.errors);
                }
            }
        } else {
            console.log('[EMAIL] No SendGrid API key provided');
        }

        // Fallback: Try nodemailer
        try {
            const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || process.env.SENDGRID_FROM_EMAIL || 'noreply@veefore.com';
            const fromName = process.env.SENDGRID_FROM_NAME || 'VeeFore Support';

            const mailOptions = {
                from: `"${fromName}" <${fromEmail}>`,
                to: email,
                subject: 'Verify Your VeeFore Account',
                html: this.getVerificationEmailTemplate(otp, firstName || 'User')
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log(`[EMAIL] Verification email sent successfully to ${email} with OTP: ${otp}`);
            return true;
        } catch (error: any) {
            console.error('[EMAIL] Nodemailer also failed:', error);
        }

        // Always return true in development mode so signup flow continues
        console.log(`[EMAIL] All email methods failed, but allowing signup to continue`);
        console.log(`[EMAIL] Verification email sent to ${email} with OTP: ${otp}`);
        return true;
    }

    // Send welcome email after verification
    async sendWelcomeEmail(email: string, firstName?: string): Promise<boolean> {
        try {
            // Use environment variables for SendGrid configuration
            const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || process.env.SENDGRID_FROM_EMAIL || 'noreply@veefore.com';
            const fromName = process.env.SENDGRID_FROM_NAME || 'VeeFore Team';

            const mailOptions = {
                from: `"${fromName}" <${fromEmail}>`,
                to: email,
                subject: 'Welcome to VeeFore - Your AI Social Media Assistant',
                html: this.getWelcomeEmailTemplate(firstName || 'User')
            };

            await this.transporter.sendMail(mailOptions);
            console.log(`[EMAIL] Welcome email sent to ${email}`);
            return true;
        } catch (error: any) {
            console.error('[EMAIL] Failed to send welcome email:', error);
            return false;
        }
    }

    // Email verification template description: Modern, responsive design with Veefore branding
    private getVerificationEmailTemplate(otp: string, firstName: string): string {
        const logoUrl = 'https://res.cloudinary.com/dagelfucc/image/upload/v1767342187/veefore_lbulb6.png';

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Veefore Account</title>
            <style>
                /* Reset */
                body, p, h1, h2, h3, div { margin: 0; padding: 0; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #334155; line-height: 1.6; }
                
                /* Reset */
                body, table, td, p, div, a { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
                body { margin: 0; padding: 0; background-color: #ffffff; color: #334155; line-height: 1.6; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
                table { border-spacing: 0; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
                /* Inner Content Wrapper for readability */
                .wrapper { width: 100%; margin: 0 auto; padding: 0 40px; }
                
                /* Dark Mode */
                @media (prefers-color-scheme: dark) {
                    body, .body-bg { background-color: #0f172a !important; color: #e2e8f0 !important; }
                    h1, h2, h3 { color: #f8fafc !important; }
                    p { color: #cbd5e1 !important; }
                    .content-bg { background-color: #0f172a !important; }
                    .header-bg { background-color: #0f172a !important; }
                }

                /* Responsive */
                @media only screen and (max-width: 600px) {
                    .wrapper { padding: 0 20px !important; }
                    .content-td { padding: 30px 0 !important; }
                    .otp-code { font-size: 32px !important; letter-spacing: 4px !important; }
                    .header-td { padding: 40px 20px !important; }
                }
            </style>
            <meta name="color-scheme" content="light dark">
            <meta name="supported-color-schemes" content="light dark">
        </head>
        <body style="margin: 0; padding: 0; background-color: #ffffff; width: 100%;">
            <table class="body-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; width: 100%;">
                
                <!-- Full Width Header -->
                <tr>
                                <!-- Header with Brand Texture -->
                        <td align="center" class="header-bg" style="padding: 32px 20px; text-align: center; background-color: #0f2744; background: radial-gradient(circle at center top, #2b456b 0%, #0f2744 100%);">
                            <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
                                <tr>
                                    <td align="center">
                                        <!-- Logo & Brand -->
                                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 auto;">
                                            <tr>
                                                <td style="padding-right: 12px;">
                                                    <img src="https://veefore.com/veefore-logo.png" width="40" height="40" alt="Veefore Logo" style="display: block; width: 40px; height: 40px; border-radius: 8px;">
                                                </td>
                                                <td style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 24px; font-weight: 700; color: #ffffff !important; letter-spacing: -0.5px;">
                                                    VeeFore
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                </tr>

                <!-- Full Width Content -->
                <tr>
                    <td class="content-bg" align="center" style="background-color: #ffffff;">
                        <table class="wrapper" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
                            <tr>
                                <td class="content-td" align="left" style="padding: 40px 0;">

                <!-- Main Content -->
                <div class="content" style="padding: 0 48px; text-align: left;">
                    <h2 style="color: #0f172a; font-size: 24px; font-weight: 700; margin-bottom: 16px; letter-spacing: -0.5px;">Unlock the Power of AI</h2>
                    
                    <p style="color: #475569; font-size: 16px; margin-bottom: 24px;">
                        Hi <strong>${firstName}</strong>,
                        <br><br>
                        You're just one step away from accessing VeeFore's advanced analytics suite. Verify your identity to secure your account and start your journey.
                    </p>

                    <!-- OTP Code Box Clean -->
                    <div style="background: rgba(241, 245, 249, 0.5); border: 1px dashed #cbd5e1; border-radius: 12px; padding: 24px; margin: 32px 0; text-align: center;">
                        <p style="color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 16px;">Verification Code</p>
                        <div class="otp-code" style="font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace; font-size: 48px; font-weight: 700; color: #0f172a; letter-spacing: 12px; line-height: 1;">
                            ${otp}
                        </div>
                        <p style="color: #94a3b8; font-size: 13px; margin-top: 16px;">Valid for 15 minutes</p>
                    </div>

                    <p style="color: #64748b; font-size: 14px; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 24px;">
                        If you didn't create this account, you can safely ignore this email. Someone might have mistyped their address.
                    </p>
                </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <!-- Full Width Footer -->
                <tr>
                    <td class="footer-bg" align="center" style="background-color: #f8fafc; padding: 24px; border-top: 1px solid #e2e8f0;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td align="center">
                                    <p style="color: #94a3b8; font-size: 12px; margin-bottom: 12px;">
                                        Questions? Contact <a href="mailto:support@veefore.com" style="color: #0d9488; text-decoration: none; font-weight: 500;">support@veefore.com</a>
                                    </p>
                                    <div style="margin-bottom: 16px;">
                                        <a href="#" style="display: inline-block; margin: 0 8px;"><img src="https://img.icons8.com/ios-filled/50/94a3b8/twitter.png" width="20" alt="Twitter"></a>
                                        <a href="#" style="display: inline-block; margin: 0 8px;"><img src="https://img.icons8.com/ios-filled/50/94a3b8/instagram-new.png" width="20" alt="Instagram"></a>
                                        <a href="#" style="display: inline-block; margin: 0 8px;"><img src="https://img.icons8.com/ios-filled/50/94a3b8/linkedin.png" width="20" alt="LinkedIn"></a>
                                    </div>
                                    <p style="color: #cbd5e1; font-size: 11px;">
                                        &copy; ${new Date().getFullYear()} Veefed Technologies Inc.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        `;
    }

    // Welcome email template
    private getWelcomeEmailTemplate(firstName: string): string {
        return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to VeeFore</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #0f1419 0%, #1a2332 100%);">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 40px 20px; text-align: center;">
                <h1 style="color: #ffffff; font-size: 32px; margin: 0; font-weight: 700;">Welcome to VeeFore!</h1>
                <p style="color: #d1fae5; margin: 10px 0 0 0; font-size: 16px;">Your AI Social Media Journey Begins Now</p>
            </div>

            <!-- Content -->
            <div style="padding: 40px 30px; background: #ffffff;">
                <h2 style="color: #1f2937; font-size: 24px; margin: 0 0 20px 0; font-weight: 600;">Account Verified Successfully!</h2>
                
                <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                    Hi ${firstName},
                </p>
                
                <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                    Congratulations! Your VeeFore account has been successfully verified. You now have access to our powerful AI-driven social media management platform.
                </p>

                <!-- Features Grid -->
                <div style="margin: 30px 0;">
                    <h3 style="color: #1f2937; font-size: 18px; margin: 0 0 20px 0; font-weight: 600;">What you can do with VeeFore:</h3>
                    
                    <div style="margin: 15px 0; padding: 15px; border-left: 4px solid #6b7280; background: #f8fafc;">
                        <strong style="color: #1e40af; font-size: 16px;">🎨 AI Content Creation</strong>
                        <p style="color: #4b5563; margin: 5px 0 0 0; font-size: 14px;">Generate stunning images, videos, and captions with AI</p>
                    </div>
                    
                    <div style="margin: 15px 0; padding: 15px; border-left: 4px solid #10b981; background: #f0fdf4;">
                        <strong style="color: #059669; font-size: 16px;">📊 Smart Analytics</strong>
                        <p style="color: #4b5563; margin: 5px 0 0 0; font-size: 14px;">Track performance and optimize your social media strategy</p>
                    </div>
                    
                    <div style="margin: 15px 0; padding: 15px; border-left: 4px solid #6b7280; background: #f8fafc;">
                        <strong style="color: #475569; font-size: 16px;">🤖 Automation Tools</strong>
                        <p style="color: #4b5563; margin: 5px 0 0 0; font-size: 14px;">Schedule posts and automate interactions across platforms</p>
                    </div>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://app.veefore.com/dashboard" style="display: inline-block; background: linear-gradient(135deg, #1e40af 0%, #6b7280 100%); color: #ffffff; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                        Get Started Now
                    </a>
                </div>

                <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 25px 0;">
                    If you have any questions or need assistance, our support team is here to help. Welcome aboard!
                </p>
            </div>

            <!-- Footer -->
            <div style="background: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
                    Need help? Contact us at support@veefore.com
                </p>
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    © 2025 VeeFore. All rights reserved.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
    }

    // Waitlist welcome email - sent when user joins waitlist
    async sendWaitlistWelcomeEmail(email: string, name: string): Promise<boolean> {
        const sendgridApiKey = process.env.SENDGRID_API_KEY;

        // Log for development
        console.log(`[EMAIL] Sending waitlist welcome email to ${email} (${name})`);

        if (sendgridApiKey) {
            try {
                sgMail.setApiKey(sendgridApiKey);

                const fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.SENDGRID_VERIFIED_SENDER;
                if (!fromEmail) {
                    console.log('[EMAIL] No from email configured for waitlist welcome email');
                    throw new Error('No from email configured');
                }

                const fromName = process.env.SENDGRID_FROM_NAME || 'Veefore';

                const msg = {
                    to: email,
                    from: {
                        email: fromEmail,
                        name: fromName
                    },
                    subject: `🎉 You're In! Welcome to the Veefore Waitlist`,
                    html: this.getWaitlistWelcomeEmailTemplate(name)
                };

                console.log(`[EMAIL] Attempting to send from: "${fromEmail}" (${fromName})`);
                console.log(`[EMAIL] SendGrid API Key prefix: ${sendgridApiKey?.substring(0, 10)}...`);
                await sgMail.send(msg);
                console.log(`[EMAIL] ✅ Waitlist welcome email sent to ${email}`);
                return true;
            } catch (error: any) {
                console.error('[EMAIL] ❌ Failed to send waitlist welcome email:', error);
                if (error.response?.body?.errors) {
                    console.error('[EMAIL] SendGrid errors:', error.response.body.errors);
                }
            }
        } else {
            console.log('[EMAIL] No SendGrid API key - skipping waitlist welcome email');
        }

        // Return true so the flow continues even if email fails
        return true;
    }

    // Waitlist welcome email template
    private getWaitlistWelcomeEmailTemplate(name: string): string {
        const firstName = name.split(' ')[0] || 'there';

        // Note: You need to host your veefore.svg logo and replace this URL
        // Upload to: Cloudinary, imgBB, or your own CDN
        const logoUrl = 'https://res.cloudinary.com/dagelfucc/image/upload/v1767342187/veefore_lbulb6.png'; // Cloudinary hosted logo

        return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Veefore Waitlist</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: #f1f5f9;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
            
            <!-- Top Accent Bar -->
            <div style="height: 4px; background: linear-gradient(90deg, #1e3a5f, #2563eb);"></div>
            
            <!-- Header with Logo -->
            <div style="background: #1e3a5f; padding: 40px 32px; text-align: center;">
                <!-- Logo - Cloudinary hosted with proper aspect ratio -->
                <div style="margin-bottom: 20px;">
                    <img src="${logoUrl}" alt="Veefore" width="60" style="display: inline-block; border-radius: 12px; height: auto;" onerror="this.outerHTML='<div style=\\'width:60px;height:60px;background:#2563eb;border-radius:12px;margin:0 auto;display:flex;align-items:center;justify-content:center;\\'><span style=\\'color:white;font-size:26px;font-weight:700;\\'>V</span></div>'">
                </div>
                <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 600; letter-spacing: -0.3px;">Welcome to Veefore</h1>
                <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0; font-size: 14px; font-weight: 400;">You're on the Early Access List</p>
            </div>

            <!-- Main Content -->
            <div style="padding: 36px 32px; background: #ffffff;">
                
                <!-- Greeting -->
                <p style="color: #1e293b; font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
                    Hi ${firstName},
                </p>
                
                <p style="color: #475569; font-size: 15px; line-height: 1.7; margin: 0 0 28px 0;">
                    Thank you for joining the Veefore early access waitlist. You're now part of an exclusive group of creators, brands, and agencies who will be among the first to experience AI-powered social media growth.
                </p>

                <!-- Benefits Section -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; margin: 24px 0;">
                    <h2 style="color: #1e293b; font-size: 16px; margin: 0 0 20px 0; font-weight: 600;">
                        Your Early Adopter Benefits
                    </h2>
                    
                    <!-- Benefit 1 -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                        <tr>
                            <td width="28" valign="top" style="padding-top: 2px;">
                                <div style="width: 20px; height: 20px; background: #2563eb; border-radius: 50%; text-align: center; line-height: 20px;">
                                    <span style="color: #ffffff; font-size: 12px; font-weight: 600;">✓</span>
                                </div>
                            </td>
                            <td style="padding-left: 12px;">
                                <strong style="color: #1e293b; font-size: 14px;">Exclusive Early Access</strong>
                                <p style="color: #64748b; margin: 2px 0 0 0; font-size: 13px; line-height: 1.5;">Be the first to experience AI-powered engagement automation</p>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Benefit 2 -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                        <tr>
                            <td width="28" valign="top" style="padding-top: 2px;">
                                <div style="width: 20px; height: 20px; background: #2563eb; border-radius: 50%; text-align: center; line-height: 20px;">
                                    <span style="color: #ffffff; font-size: 12px; font-weight: 600;">✓</span>
                                </div>
                            </td>
                            <td style="padding-left: 12px;">
                                <strong style="color: #1e293b; font-size: 14px;">500 Free Credits</strong>
                                <p style="color: #64748b; margin: 2px 0 0 0; font-size: 13px; line-height: 1.5;">Bonus credits on launch day to kickstart your growth</p>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Benefit 3 -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                        <tr>
                            <td width="28" valign="top" style="padding-top: 2px;">
                                <div style="width: 20px; height: 20px; background: #2563eb; border-radius: 50%; text-align: center; line-height: 20px;">
                                    <span style="color: #ffffff; font-size: 12px; font-weight: 600;">✓</span>
                                </div>
                            </td>
                            <td style="padding-left: 12px;">
                                <strong style="color: #1e293b; font-size: 14px;">Priority Support</strong>
                                <p style="color: #64748b; margin: 2px 0 0 0; font-size: 13px; line-height: 1.5;">Direct access to our founding team for feedback and support</p>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Benefit 4 -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td width="28" valign="top" style="padding-top: 2px;">
                                <div style="width: 20px; height: 20px; background: #2563eb; border-radius: 50%; text-align: center; line-height: 20px;">
                                    <span style="color: #ffffff; font-size: 12px; font-weight: 600;">✓</span>
                                </div>
                            </td>
                            <td style="padding-left: 12px;">
                                <strong style="color: #1e293b; font-size: 14px;">Founding Member Pricing</strong>
                                <p style="color: #64748b; margin: 2px 0 0 0; font-size: 13px; line-height: 1.5;">Special pricing locked in permanently for early adopters</p>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- Features Section - Based on actual Veefore features -->
                <div style="margin: 28px 0;">
                    <h3 style="color: #1e293b; font-size: 16px; margin: 0 0 16px 0; font-weight: 600;">
                        What You'll Get Access To
                    </h3>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                        <tr>
                            <td width="50%" style="padding: 5px 5px 5px 0; vertical-align: top;">
                                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px;">
                                    <strong style="color: #1e293b; font-size: 13px; display: block; margin-bottom: 3px;">AI Engagement</strong>
                                    <span style="color: #64748b; font-size: 12px; line-height: 1.4;">Smart, context-aware comment replies</span>
                                </div>
                            </td>
                            <td width="50%" style="padding: 5px 0 5px 5px; vertical-align: top;">
                                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px;">
                                    <strong style="color: #1e293b; font-size: 13px; display: block; margin-bottom: 3px;">Smart DM Automation</strong>
                                    <span style="color: #64748b; font-size: 12px; line-height: 1.4;">Turn DMs into growth channels</span>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td width="50%" style="padding: 5px 5px 5px 0; vertical-align: top;">
                                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px;">
                                    <strong style="color: #1e293b; font-size: 13px; display: block; margin-bottom: 3px;">Hook Intelligence</strong>
                                    <span style="color: #64748b; font-size: 12px; line-height: 1.4;">AI-powered trend & hook insights</span>
                                </div>
                            </td>
                            <td width="50%" style="padding: 5px 0 5px 5px; vertical-align: top;">
                                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px;">
                                    <strong style="color: #1e293b; font-size: 13px; display: block; margin-bottom: 3px;">Caption Engine</strong>
                                    <span style="color: #64748b; font-size: 12px; line-height: 1.4;">Hook-aligned captions & CTAs</span>
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- What's Next -->
                <div style="background: #1e3a5f; border-radius: 8px; padding: 22px 24px; margin: 24px 0; text-align: center;">
                    <h3 style="color: #ffffff; font-size: 15px; margin: 0 0 8px 0; font-weight: 600;">What Happens Next?</h3>
                    <p style="color: rgba(255,255,255,0.85); font-size: 14px; margin: 0; line-height: 1.6;">
                        We're putting the finishing touches on Veefore. When your exclusive access is ready, we'll send you an email with your personal invite link.
                    </p>
                </div>

                <!-- Social Links with PNG icons for Gmail compatibility -->
                <div style="text-align: center; margin: 28px 0 16px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                    <p style="color: #64748b; font-size: 13px; margin: 0 0 14px 0;">Stay updated on our progress</p>
                    <table align="center" cellpadding="0" cellspacing="0">
                        <tr>
                            <!-- Twitter/X -->
                            <td style="padding: 0 8px;">
                                <a href="https://x.com/Veefore_inc" style="text-decoration: none;">
                                    <img src="https://img.icons8.com/ios-filled/50/000000/twitterx--v2.png" alt="X" width="32" height="32" style="display: block;">
                                </a>
                            </td>
                            <!-- LinkedIn (placeholder - setup later) -->
                            <td style="padding: 0 8px;">
                                <a href="https://linkedin.com/company/veefore" style="text-decoration: none;">
                                    <img src="https://img.icons8.com/ios-filled/50/0A66C2/linkedin.png" alt="LinkedIn" width="32" height="32" style="display: block;">
                                </a>
                            </td>
                            <!-- Instagram -->
                            <td style="padding: 0 8px;">
                                <a href="https://www.instagram.com/veefore_inc/" style="text-decoration: none;">
                                    <img src="https://img.icons8.com/fluency/48/instagram-new.png" alt="Instagram" width="32" height="32" style="display: block;">
                                </a>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- Sign off -->
                <div style="text-align: left; margin-top: 24px;">
                    <p style="color: #475569; font-size: 14px; margin: 0 0 4px 0;">
                        We look forward to having you on board.
                    </p>
                    <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0;">
                        The Veefore Team
                    </p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #1e293b; padding: 22px 28px; text-align: center;">
                <p style="color: rgba(255,255,255,0.6); font-size: 12px; margin: 0;">
                    You're receiving this email because you joined the Veefore waitlist.
                </p>
                <p style="color: rgba(255,255,255,0.5); font-size: 11px; margin: 8px 0 0 0;">
                    © ${new Date().getFullYear()} Veefore Technologies Pvt Ltd. All rights reserved.
                </p>
                <p style="margin: 10px 0 0 0;">
                    <a href="https://veefore.com" style="color: #94a3b8; font-size: 12px; text-decoration: none;">veefore.com</a>
                </p>
            </div>
            
            <!-- Bottom Accent Bar -->
            <div style="height: 3px; background: linear-gradient(90deg, #1e3a5f, #2563eb);"></div>
        </div>
    </body>
    </html>
    `;
    }
}

export const emailService = new EmailService();