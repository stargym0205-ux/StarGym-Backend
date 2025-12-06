const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const { generateReceipt } = require('../services/pdfService');
const User = require('../models/User');
const { sendEmail, createPaymentConfirmationEmail, createPasswordResetEmail } = require('../services/emailService');
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
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save hashed token and expiration (10 minutes)
    admin.passwordResetToken = hashedToken;
    admin.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await admin.save({ validateBeforeSave: false });

    // Create reset URL
    const baseUrl = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:5173';
    const resetURL = `${baseUrl}/admin/reset-password/${resetToken}`;

    try {
      // Send email with reset link
      await sendEmail({
        email: admin.email,
        subject: 'Password Reset Request - Star Gym Admin',
        html: createPasswordResetEmail(resetURL)
      });

      res.status(200).json({
        status: 'success',
        message: 'Password reset link has been sent to your email'
      });
    } catch (error) {
      // If email fails, clear the reset token
      admin.passwordResetToken = undefined;
      admin.passwordResetExpires = undefined;
      await admin.save({ validateBeforeSave: false });

      console.error('Error sending password reset email:', error);
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

    // Clear reset token fields
    admin.passwordResetToken = undefined;
    admin.passwordResetExpires = undefined;

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
    // Use Vercel URL for email OTP and receipt links
    const emailBaseUrl = process.env.EMAIL_BASE_URL || process.env.VERCEL_URL || 'https://gym-backend-ochre-three.vercel.app';
    const fullReceiptUrl = `${emailBaseUrl}${receiptUrl}`;

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