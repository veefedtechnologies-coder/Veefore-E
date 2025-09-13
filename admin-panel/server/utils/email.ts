import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  template?: string;
  data?: any;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      let html = options.html;
      
      if (options.template && options.data) {
        html = this.generateEmailTemplate(options.template, options.data);
      }
      
      if (!html) {
        throw new Error('Either html content or template with data must be provided');
      }
      
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@veefore.com',
        to: options.to,
        subject: options.subject,
        html
      });
      
      console.log(`Email sent successfully to ${options.to}`);
    } catch (error) {
      console.error('Email sending error:', error);
      throw error;
    }
  }

  private generateEmailTemplate(template: string, data: any): string {
    const templates: { [key: string]: string } = {
      'admin-invite': `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Admin Invitation - VeeFore</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000; color: #fff; padding: 20px; text-align: center; }
            .content { padding: 30px; background: #f9f9f9; }
            .button { display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 4px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>VeeFore Admin Panel</h1>
            </div>
            <div class="content">
              <h2>Welcome to VeeFore Admin Panel</h2>
              <p>Hello ${data.firstName} ${data.lastName},</p>
              <p>You have been invited to join the VeeFore Admin Panel. Your account has been created with the following credentials:</p>
              <ul>
                <li><strong>Email:</strong> ${data.email}</li>
                <li><strong>Password:</strong> ${data.password}</li>
                <li><strong>Role:</strong> ${data.role}</li>
              </ul>
              <p>Please click the button below to accept the invitation and set up your account:</p>
              <p style="text-align: center;">
                <a href="${data.inviteLink}" class="button">Accept Invitation</a>
              </p>
              <p><strong>Note:</strong> This invitation will expire on ${new Date(data.expiresAt).toLocaleDateString()}.</p>
              <p>If you have any questions, please contact your administrator.</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 VeeFore. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      'admin-invite-approved': `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Admin Invitation Approved - VeeFore</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000; color: #fff; padding: 20px; text-align: center; }
            .content { padding: 30px; background: #f9f9f9; }
            .button { display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 4px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>VeeFore Admin Panel</h1>
            </div>
            <div class="content">
              <h2>Invitation Approved</h2>
              <p>Hello ${data.firstName} ${data.lastName},</p>
              <p>Your admin invitation has been approved! You can now access the VeeFore Admin Panel.</p>
              <p style="text-align: center;">
                <a href="${data.loginLink}" class="button">Access Admin Panel</a>
              </p>
              <p>If you have any questions, please contact your administrator.</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 VeeFore. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      'password-reset': `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Password Reset - VeeFore</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000; color: #fff; padding: 20px; text-align: center; }
            .content { padding: 30px; background: #f9f9f9; }
            .button { display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 4px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>VeeFore Admin Panel</h1>
            </div>
            <div class="content">
              <h2>Password Reset Request</h2>
              <p>Hello ${data.firstName},</p>
              <p>You have requested to reset your password for the VeeFore Admin Panel.</p>
              <p>Click the button below to reset your password:</p>
              <p style="text-align: center;">
                <a href="${data.resetLink}" class="button">Reset Password</a>
              </p>
              <p><strong>Note:</strong> This link will expire in 1 hour for security reasons.</p>
              <p>If you did not request this password reset, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 VeeFore. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    return templates[template] || '<p>Email template not found</p>';
  }
}

export const emailService = new EmailService();

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  return emailService.sendEmail(options);
};
