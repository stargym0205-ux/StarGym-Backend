const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const { generateReceipt } = require('../services/pdfService');
const User = require('../models/User');
const { sendEmail, createPaymentConfirmationEmail } = require('../services/emailService');
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
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
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

    // Generate receipt
    const receiptUrl = await generateReceipt(user);
    const fullReceiptUrl = `${process.env.BASE_URL}${receiptUrl}`;

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
      const text = `Payment confirmed for your Gold Gym ${user.plan} plan. Start: ${new Date(user.startDate).toLocaleDateString()}, End: ${new Date(user.endDate).toLocaleDateString()}. Receipt: ${fullReceiptUrl}`;
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