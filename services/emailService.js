const nodemailer = require('nodemailer');
const { formatIndianPrice, getPlanAmount, getPlanDisplayName } = require('../utils/formatters');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true, // Use SSL/TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    // Do not fail on invalid certs
    rejectUnauthorized: false
  }
});

// Verify transporter configuration
transporter.verify(function(error, success) {
  if (error) {
    console.error('SMTP Connection Error:', error);
  } else {
    console.log('SMTP Server is ready to send emails');
  }
});

// Template for registration confirmation
const createRegistrationEmail = (user) => {
  const amount = getPlanAmount(user.plan);
  const planName = getPlanDisplayName(user.plan);
  const formattedAmount = formatIndianPrice(amount);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Star Gym</title>
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f8f8; padding: 20px;">
      <div style="background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0;">Welcome to Star Gym! 💪</h1>
          <p style="color: #666; margin-top: 10px;">Your fitness journey begins here</p>
        </div>

        <div style="margin-bottom: 30px;">
          <p style="color: #444; font-size: 16px;">Dear ${user.name},</p>
          <p style="color: #444; line-height: 1.5;">Thank you for registering with Star Gym! We're excited to have you join our fitness family. Your registration has been successfully received and is pending approval.</p>
        </div>

        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
          <h2 style="color: #333; margin-top: 0; font-size: 18px;">Membership Details</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666;">Plan Selected:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${planName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Amount to Pay:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${formattedAmount}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Start Date:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${new Date(user.startDate).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">End Date:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${new Date(user.endDate).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Payment Status:</td>
              <td style="padding: 8px 0; color: #ff9800; font-weight: bold;">Pending</td>
            </tr>
          </table>
        </div>

        <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
          <p style="color: #f57c00; margin: 0;">⚠️ Important Note:</p>
          <p style="color: #666; margin: 10px 0 0 0;">Your membership will be activated once the payment is confirmed by our admin team.</p>
        </div>

        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; margin-bottom: 5px;">Need help? Contact us:</p>
          <p style="color: #666; margin: 0;">📞 Phone: 9662468784</p>
          <p style="color: #666; margin: 5px 0;">📧 Email: admin@gmail.com</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Template for payment confirmation
const createPaymentConfirmationEmail = (user, receiptUrl) => {
  const amount = getPlanAmount(user.plan);
  const planName = getPlanDisplayName(user.plan);
  const formattedAmount = formatIndianPrice(amount);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Confirmation - Star Gym</title>
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f8f8; padding: 20px;">
      <div style="background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0;">Payment Confirmed! 🎉</h1>
          <p style="color: #666; margin-top: 10px;">Your Star Gym membership is now active</p>
        </div>

        <div style="margin-bottom: 30px;">
          <p style="color: #444; font-size: 16px;">Dear ${user.name},</p>
          <p style="color: #444; line-height: 1.5;">Great news! Your payment has been confirmed and your membership is now active. Welcome to the Star Gym family!</p>
        </div>

        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
          <h2 style="color: #333; margin-top: 0; font-size: 18px;">Membership Details</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666;">Plan:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${planName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Amount Paid:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${formattedAmount}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Start Date:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${new Date(user.startDate).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">End Date:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${new Date(user.endDate).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Status:</td>
              <td style="padding: 8px 0; color: #4caf50; font-weight: bold;">Active</td>
            </tr>
          </table>
        </div>

        <div style="background-color: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
          <p style="color: #2e7d32; margin: 0;">✨ Getting Started:</p>
          <ul style="color: #666; margin: 10px 0 0 0; padding-left: 20px;">
            <li>Visit our gym during operational hours</li>
            <li>Bring your ID for first-time check-in</li>
            <li>Join our orientation session</li>
            <li>Download our mobile app for schedules</li>
          </ul>
        </div>

        ${receiptUrl ? `
        <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 10px; border: 2px dashed #dee2e6;">
          <h3 style="color: #333; margin: 0 0 15px 0; font-size: 18px;">📄 Your Payment Receipt</h3>
          <p style="color: #666; margin: 0 0 20px 0; font-size: 14px;">Download your official payment receipt for your records</p>
          <a href="${receiptUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); transition: all 0.3s ease;"
             onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(102, 126, 234, 0.6)';"
             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(102, 126, 234, 0.4)';">
            📥 Download Receipt
          </a>
          <p style="color: #999; margin: 15px 0 0 0; font-size: 12px;">Keep this receipt safe for your records</p>
        </div>
        ` : ''}

        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; margin-bottom: 5px;">Need help? Contact us:</p>
          <p style="color: #666; margin: 0;">📞 Phone: 9662468784</p>
          <p style="color: #666; margin: 5px 0;">📧 Email: stargym0205@gmail.com</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const sendEmail = async (options) => {
  try {
    console.log('Attempting to send email to:', options.email);
    console.log('Using SMTP settings:', {
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      user: process.env.EMAIL_USER
    });

    const mailOptions = {
      from: {
        name: 'Star Gym',
        address: process.env.EMAIL_USER
      },
      to: options.email,
      subject: options.subject,
      html: options.customEmail || options.html,
      headers: {
        'X-Mailer': 'StarGym Mailer',
        'X-Priority': '1',
        'Importance': 'high'
      }
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email sending failed:', {
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response
    });
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// Template for password reset OTP
const createPasswordResetOTPEmail = (otp) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset OTP - Star Gym Admin</title>
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f8f8; padding: 20px;">
      <div style="background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0;">Password Reset OTP 🔐</h1>
          <p style="color: #666; margin-top: 10px;">Star Gym Admin Panel</p>
        </div>

        <div style="margin-bottom: 30px;">
          <p style="color: #444; font-size: 16px;">Hello,</p>
          <p style="color: #444; line-height: 1.5;">You requested to reset your password for your Star Gym admin account. Use the OTP below to verify your identity:</p>
        </div>

        <div style="text-align: center; margin: 30px 0; padding: 30px; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); border-radius: 15px;">
          <p style="color: #fff; margin: 0 0 15px 0; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">Your OTP Code</p>
          <div style="background-color: #ffffff; padding: 20px; border-radius: 10px; display: inline-block; min-width: 200px;">
            <p style="color: #f59e0b; margin: 0; font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</p>
          </div>
        </div>

        <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
          <p style="color: #f57c00; margin: 0; font-weight: bold;">⚠️ Important:</p>
          <ul style="color: #666; margin: 10px 0 0 0; padding-left: 20px;">
            <li>This OTP will expire in 10 minutes</li>
            <li>If you didn't request this, please ignore this email</li>
            <li>For security, never share this OTP with anyone</li>
            <li>Enter this OTP on the password reset page to continue</li>
          </ul>
        </div>

        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; margin-bottom: 5px;">Need help? Contact us:</p>
          <p style="color: #666; margin: 0;">📧 Email: admin@gmail.com</p>
          <p style="color: #666; margin: 5px 0;">📞 Phone: 9101321032</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Template for password reset (legacy - kept for backward compatibility)
const createPasswordResetEmail = (resetURL) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset - Star Gym Admin</title>
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f8f8; padding: 20px;">
      <div style="background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0;">Password Reset Request 🔐</h1>
          <p style="color: #666; margin-top: 10px;">Star Gym Admin Panel</p>
        </div>

        <div style="margin-bottom: 30px;">
          <p style="color: #444; font-size: 16px;">Hello,</p>
          <p style="color: #444; line-height: 1.5;">You requested to reset your password for your Star Gym admin account. Click the button below to reset your password:</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetURL}" 
             style="display: inline-block; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: white; padding: 14px 35px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(251, 191, 36, 0.4);">
            Reset Password
          </a>
        </div>

        <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
          <p style="color: #f57c00; margin: 0; font-weight: bold;">⚠️ Important:</p>
          <ul style="color: #666; margin: 10px 0 0 0; padding-left: 20px;">
            <li>This link will expire in 10 minutes</li>
            <li>If you didn't request this, please ignore this email</li>
            <li>For security, never share this link with anyone</li>
          </ul>
        </div>

        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
          <p style="color: #666; margin: 0; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="color: #333; margin: 10px 0 0 0; font-size: 12px; word-break: break-all;">${resetURL}</p>
        </div>

        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; margin-bottom: 5px;">Need help? Contact us:</p>
          <p style="color: #666; margin: 0;">📧 Email: admin@gmail.com</p>
          <p style="color: #666; margin: 5px 0;">📞 Phone: 9101321032</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Export all functions in a single object
module.exports = { 
  sendEmail, 
  createRegistrationEmail,
  createPaymentConfirmationEmail,
  createPasswordResetEmail,
  createPasswordResetOTPEmail
};