import nodemailer from 'nodemailer';

export function createTransporter() {
  // Check if SendGrid API key is available
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  
  if (sendgridApiKey) {
    // Use SendGrid for production
    return nodemailer.createTransport({
      service: 'SendGrid',
      auth: {
        user: 'apikey',
        pass: sendgridApiKey
      }
    });
  }
  
  // Fallback to Gmail SMTP for development
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  
  if (gmailUser && gmailPass) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass
      }
    });
  }
  
  // Development mode - log to console instead of sending emails
  return nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true
  });
}