const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const { generateReceipt } = require('../services/pdfService');
const User = require('../models/User');
const { sendEmail, createPaymentConfirmationEmail, createPasswordResetEmail, createPasswordResetOTPEmail } = require('../services/emailService');
const { sendWhatsAppText } = require('../services/whatsappService');
const { getPlanAmount, getPlanDisplayName } = require('../utils/formatters');

// Cache for storing failed login attempts
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_TIMEOUT = 15 * 60 * 1000; // 15 minutes

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if email and password exist
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide email and password'
      });
    }

    // Check for too many failed attempts
    const attempts = loginAttempts.get(email) || { count: 0, timestamp: Date.now() };
    if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
      const timeElapsed = Date.now() - attempts.timestamp;
      if (timeElapsed < LOGIN_TIMEOUT) {
        return res.status(429).json({
          status: 'error',
          message: 'Too many failed attempts. Please try again later.'
        });
      } else {
        loginAttempts.delete(email);
      }
    }

    // Find admin and explicitly select the password field
    const admin = await Admin.findOne({ email }).select('+password');
    
    if (!admin) {
      // Increment failed attempts
      loginAttempts.set(email, {
        count: (attempts.count || 0) + 1,
        timestamp: Date.now()
      });

      return res.status(401).json({
        status: 'error',
        message: 'Incorrect email or password'
      });
    }

    // Compare passwords using the instance method
    const isPasswordCorrect = await admin.correctPassword(password, admin.password);
    
    if (!isPasswordCorrect) {
      // Increment failed attempts
      loginAttempts.set(email, {
        count: (attempts.count || 0) + 1,
        timestamp: Date.now()
      });

      return res.status(401).json({
        status: 'error',
        message: 'Incorrect email or password'
      });
    }

    // Clear failed attempts on successful login
    loginAttempts.delete(email);

    // If everything ok, send token to client
    const token = jwt.sign(
      { id: admin._id, role: 'admin' },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN
      }
    );

    // Set token in HTTP-only cookie for better security
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction, // Only send over HTTPS in production
      sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-site requests in production
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      domain: isProduction ? undefined : undefined, // Let browser set domain automatically
      path: '/'
    });

    // Also send token in response body for client-side storage
    res.status(200).json({
      status: 'success',
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred during login'
    });
  }
};

exports.verifyToken = async (req, res) => {
  // If the middleware passes, the token is valid
  res.status(200).json({
    status: 'success',
    message: 'Token is valid'
  });
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide your email address'
      });
    }

    // Find admin by email
    const admin = await Admin.findOne({ email: email.toLowerCase() });

    // Always return success message for security (don't reveal if email exists)
    if (!admin) {
      return res.status(200).json({
        status: 'success',
        message: 'If an account with that email exists, an OTP has been sent to your email.'
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');

    // Save hashed OTP and expiration (10 minutes)
    admin.passwordResetOTP = hashedOTP;
    admin.passwordResetOTPExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    // Clear old token fields if they exist
    admin.passwordResetToken = undefined;
    admin.passwordResetExpires = undefined;
    await admin.save({ validateBeforeSave: false });

    try {
      // Send email with OTP
      console.log(`📧 Sending OTP email to: ${admin.email}`);
      console.log(`🔐 Generated OTP: ${otp} (for testing - remove in production)`);
      
      await sendEmail({
        email: admin.email,
        subject: 'Password Reset OTP - Star Gym Admin',
        html: createPasswordResetOTPEmail(otp)
      });

      console.log(`✅ OTP email sent successfully to ${admin.email}`);

      res.status(200).json({
        status: 'success',
        message: 'OTP has been sent to your email. Please check your inbox.'
      });
    } catch (error) {
      // If email fails, clear the OTP
      admin.passwordResetOTP = undefined;
      admin.passwordResetOTPExpires = undefined;
      await admin.save({ validateBeforeSave: false });

      console.error('Error sending password reset OTP email:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error sending email. Please try again later.'
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred. Please try again later.'
    });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide email and OTP'
      });
    }

    // Find admin by email
    const admin = await Admin.findOne({ email: email.toLowerCase() });

    if (!admin) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email or OTP'
      });
    }

    // Hash the provided OTP to compare with stored OTP
    const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');

    // Check if OTP is valid and not expired
    if (!admin.passwordResetOTP || admin.passwordResetOTP !== hashedOTP) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid OTP'
      });
    }

    if (!admin.passwordResetOTPExpires || admin.passwordResetOTPExpires < Date.now()) {
      return res.status(400).json({
        status: 'error',
        message: 'OTP has expired. Please request a new one.'
      });
    }

    // OTP is valid - generate a temporary token for password reset
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save token and clear OTP (OTP can only be used once)
    admin.passwordResetToken = hashedToken;
    admin.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    admin.passwordResetOTP = undefined;
    admin.passwordResetOTPExpires = undefined;

    await admin.save({ validateBeforeSave: false });

    res.status(200).json({
      status: 'success',
      message: 'OTP verified successfully',
      resetToken: resetToken // Send token to frontend for password reset
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred. Please try again later.'
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a new password'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 8 characters long'
      });
    }

    // Hash the token to compare with stored token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find admin with valid reset token
    const admin = await Admin.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!admin) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset token'
      });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    admin.password = await bcrypt.hash(password, salt);

    // Clear all reset fields
    admin.passwordResetToken = undefined;
    admin.passwordResetExpires = undefined;
    admin.passwordResetOTP = undefined;
    admin.passwordResetOTPExpires = undefined;

    await admin.save();

    res.status(200).json({
      status: 'success',
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred. Please try again later.'
    });
  }
};

exports.approvePayment = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Generate receipt (now returns download endpoint URL)
    const receiptUrl = await generateReceipt(user);
    console.log('Generated Receipt URL:', receiptUrl);
    
    // Prepend base URL to create full download URL
    // Use environment variable for backend URL, with proper fallback
    // Ensure we always use the full backend API URL for email links
    let emailBaseUrl = process.env.EMAIL_BASE_URL || process.env.BACKEND_URL;
    
    // If VERCEL_URL is set, ensure it has https:// protocol
    if (!emailBaseUrl && process.env.VERCEL_URL) {
      emailBaseUrl = process.env.VERCEL_URL.startsWith('http') 
        ? process.env.VERCEL_URL 
        : `https://${process.env.VERCEL_URL}`;
    }
    
    // Final fallback to production backend URL
    if (!emailBaseUrl) {
      emailBaseUrl = 'https://star-gym-backend.vercel.app';
    }
    
    // Ensure the URL doesn't end with a slash and doesn't have double slashes
    emailBaseUrl = emailBaseUrl.replace(/\/$/, '').replace(/\/+/g, '/');
    
    // Ensure receiptUrl starts with / if it doesn't already
    const normalizedReceiptUrl = receiptUrl.startsWith('/') ? receiptUrl : `/${receiptUrl}`;
    
    const fullReceiptUrl = `${emailBaseUrl}${normalizedReceiptUrl}`;
    console.log('Final Receipt URL for email:', fullReceiptUrl);
    console.log('Base URL used:', emailBaseUrl);
    console.log('Receipt path:', normalizedReceiptUrl);

    // Ensure membershipHistory exists and append confirmed entry for revenue tracking
    if (!user.membershipHistory) {
      user.membershipHistory = [];
    }

    const planToMonths = {
      '1month': 1,
      '2month': 2,
      '3month': 3,
      '6month': 6,
      'yearly': 12
    };

    user.membershipHistory.push({
      type: 'join',
      date: new Date(),
      duration: String(planToMonths[user.plan] || 0),
      amount: getPlanAmount(user.plan),
      paymentMode: user.paymentMethod,
      plan: user.plan,
      paymentStatus: 'confirmed'
    });

    // Update user payment status
    user.paymentStatus = 'confirmed';
    await user.save();

    // Send confirmation email
    await sendEmail({
      email: user.email,
      subject: 'Payment Confirmed - StarGym Membership',
      html: createPaymentConfirmationEmail(user, fullReceiptUrl)
    });
    // WhatsApp confirmation
    try {
      const text = `Payment confirmed for your Star Gym ${user.plan} plan. Start: ${new Date(user.startDate).toLocaleDateString()}, End: ${new Date(user.endDate).toLocaleDateString()}. Receipt: ${fullReceiptUrl}`;
      await sendWhatsAppText({ phone: user.phone, message: text });
    } catch (waError) {
      console.error('WhatsApp payment confirm error:', waError);
    }

    res.status(200).json({
      status: 'success',
      message: 'Payment approved successfully',
      receiptUrl
    });
  } catch (error) {
    console.error('Error approving payment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error approving payment'
    });
  }
}; 