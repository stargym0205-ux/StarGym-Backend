const User = require('../models/User');
const APIError = require('../utils/APIError');
const { sendEmail, createRegistrationEmail } = require('../services/emailService');
const { getPlanAmount, getPlanDisplayName, formatIndianPrice } = require('../utils/formatters');
const { generateReceipt } = require('../services/pdfService');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const transporter = require('../services/emailService').transporter;
const { sendWhatsAppText, formatPhoneE164 } = require('../services/whatsappService');

exports.register = async (req, res) => {
  try {
    console.log('Registration request received:', req.body);
    console.log('Uploaded file:', req.file);

    // Validate required fields
    const requiredFields = ['name', 'email', 'phone', 'gender', 'address', 'plan', 'startDate', 'endDate', 'paymentMethod'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      console.log('Missing fields:', missingFields);
      return res.status(400).json({
        status: 'error',
        message: `Missing required fields: ${missingFields.join(', ')}`,
        details: {
          missingFields,
          receivedFields: Object.keys(req.body)
        }
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(req.body.email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email format'
      });
    }

    // Validate phone format (10 digits)
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(req.body.phone)) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number must be 10 digits'
      });
    }

    // Validate gender
    if (!['Male', 'Female', 'Other'].includes(req.body.gender)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid gender. Must be Male, Female, or Other'
      });
    }

    // Validate plan type
    if (!['1month', '2month', '3month', '6month', 'yearly'].includes(req.body.plan)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid plan type. Must be one of: 1month, 2month, 3month, 6month, yearly'
      });
    }

    // Validate payment method
    if (!['cash', 'online'].includes(req.body.paymentMethod)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid payment method. Must be either cash or online'
      });
    }

    // Handle photo upload
    let photoPath = null;
    if (req.file) {
      try {
        console.log('Processing photo upload for user:', req.body.name);
        console.log('File details:', {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        });
        
        // Upload to Cloudinary
        photoPath = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
        console.log('Photo uploaded to Cloudinary:', photoPath);
      } catch (uploadError) {
        console.error('Error uploading to Cloudinary:', uploadError);
        return res.status(500).json({
          status: 'error',
          message: uploadError.message || 'Error uploading photo',
          details: process.env.NODE_ENV === 'development' ? uploadError.stack : undefined
        });
      }
    } else {
      // Set default photo path
      photoPath = 'https://res.cloudinary.com/dovjfipbt/image/upload/v1744948014/default-avatar';
      console.log('Using default avatar:', photoPath);
    }

    // Format dates
    const startDate = new Date(req.body.startDate);
    const endDate = new Date(req.body.endDate);

    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid date format for start date or end date'
      });
    }

    const userData = {
      name: req.body.name,
      email: req.body.email.toLowerCase(),
      phone: req.body.phone,
      gender: req.body.gender,
      address: req.body.address,
      plan: req.body.plan,
      originalJoinDate: startDate,
      startDate: startDate,
      endDate: endDate,
      paymentMethod: req.body.paymentMethod,
      paymentStatus: 'pending',
      photo: photoPath
    };

    console.log('Creating user with data:', userData);
    const user = new User(userData);
    await user.save();
    console.log('User created successfully:', user);

    try {
      await sendEmail({
        email: user.email,
        subject: 'Welcome to StarGym - Registration Successful',
        html: createRegistrationEmail(user)
      });
      console.log('Welcome email sent successfully');
    } catch (emailError) {
      console.error('Error sending welcome email:', emailError);
    }
    try {
      const text = `Hi ${user.name}, welcome to Star Gym! Your plan ${user.plan} starts on ${new Date(user.startDate).toLocaleDateString()} and ends on ${new Date(user.endDate).toLocaleDateString()}.`;
      await sendWhatsAppText({ phone: user.phone, message: text });
    } catch (waError) {
      console.error('WhatsApp welcome message error:', waError);
    }

    res.status(201).json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle duplicate email error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        status: 'error',
        message: `${field} already exists`,
        field: field
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        status: 'error',
        message: messages.join(', '),
        details: error.errors
      });
    }

    res.status(500).json({
      status: 'error',
      message: error.message || 'An error occurred during registration',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
    
    // Validate receiptUrl
    if (!receiptUrl || typeof receiptUrl !== 'string') {
      console.error('Invalid receiptUrl generated:', receiptUrl);
      throw new Error('Failed to generate receipt URL');
    }
    
    // Prepend base URL to create full download URL
    // IMPORTANT: Never use VERCEL_URL for email links as it's a preview URL that requires authentication
    // Always use the production domain or explicitly set EMAIL_BASE_URL/BACKEND_URL
    let emailBaseUrl = process.env.EMAIL_BASE_URL || process.env.BACKEND_URL;
    
    // Final fallback to production backend URL
    // DO NOT use VERCEL_URL here - it's a deployment-specific preview URL
    if (!emailBaseUrl) {
      emailBaseUrl = 'https://star-gym-backend.vercel.app';
    }
    
    // Clean and validate the base URL
    emailBaseUrl = emailBaseUrl.trim();
    
    // Ensure it starts with http:// or https://
    if (!emailBaseUrl.startsWith('http://') && !emailBaseUrl.startsWith('https://')) {
      emailBaseUrl = `https://${emailBaseUrl}`;
    }
    
    // Remove trailing slashes
    emailBaseUrl = emailBaseUrl.replace(/\/+$/, '');
    
    // CRITICAL: Reject Vercel preview/deployment URLs that require authentication
    // Preview URLs have patterns like: project-xxx-username.vercel.app (with hash-like strings)
    // Production URLs are: project-name.vercel.app (simpler pattern)
    // Check if URL contains a long hash-like segment (7+ alphanumeric chars) which indicates preview URL
    const vercelPreviewPattern = /-[a-z0-9]{7,}-[a-z0-9-]+\.vercel\.app/i;
    if (vercelPreviewPattern.test(emailBaseUrl)) {
      console.error('❌ BLOCKED: Attempted to use Vercel preview URL for email:', emailBaseUrl);
      console.error('   Preview URLs require authentication and cannot be used in emails');
      console.error('   Falling back to production URL');
      emailBaseUrl = 'https://star-gym-backend.vercel.app';
    }
    
    // Ensure receiptUrl starts with / if it doesn't already
    const normalizedReceiptUrl = receiptUrl.startsWith('/') ? receiptUrl : `/${receiptUrl}`;
    
    // Construct final URL
    const finalReceiptUrl = `${emailBaseUrl}${normalizedReceiptUrl}`;
    
    // Validate the final URL
    try {
      new URL(finalReceiptUrl); // This will throw if URL is invalid
      console.log('✅ Valid Final Receipt URL for email:', finalReceiptUrl);
    } catch (urlError) {
      console.error('❌ Invalid URL constructed:', finalReceiptUrl);
      console.error('Base URL:', emailBaseUrl);
      console.error('Receipt path:', normalizedReceiptUrl);
      throw new Error(`Invalid receipt URL: ${finalReceiptUrl}`);
    }
    
    console.log('Base URL used:', emailBaseUrl);
    console.log('Receipt path:', normalizedReceiptUrl);

    // Determine if this is a renewal or new membership
    // Check if user has renewals array with recent entries or if renewalCount > 0
    const isRenewal = (user.renewals && user.renewals.length > 0) || (user.renewalCount && user.renewalCount > 0);

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

    const historyType = isRenewal ? 'renewal' : 'join';

    user.membershipHistory.push({
      type: historyType,
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
      subject: isRenewal ? 'Renewal Confirmed - StarGym Membership' : 'Payment Confirmed - StarGym Membership',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f8f8; padding: 20px;">
          <div style="background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #333; text-align: center; margin: 0;">${isRenewal ? 'Renewal' : 'Payment'} Confirmed! 🎉</h1>
            <p style="color: #666; text-align: center; margin: 10px 0 30px 0;">Your StarGym membership is now active</p>
            
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <p style="color: #444; font-size: 16px; margin: 0 0 15px 0;">Dear ${user.name},</p>
              <p style="color: #444; line-height: 1.5; margin: 0 0 20px 0;">Your ${isRenewal ? 'renewal' : 'payment'} has been confirmed for your ${user.plan} membership plan.</p>
              
              <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin: 0 0 15px 0;">Membership Details:</h3>
                <p style="margin: 8px 0; color: #666;"><strong>Plan:</strong> ${user.plan}</p>
                <p style="margin: 8px 0; color: #666;"><strong>Start Date:</strong> ${new Date(user.startDate).toLocaleDateString()}</p>
                <p style="margin: 8px 0; color: #666;"><strong>End Date:</strong> ${new Date(user.endDate).toLocaleDateString()}</p>
                <p style="margin: 8px 0; color: #666;"><strong>Payment Status:</strong> <span style="color: #4caf50; font-weight: bold;">Confirmed</span></p>
              </div>
              
              ${finalReceiptUrl && finalReceiptUrl.trim() ? `
              <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 10px; border: 2px dashed #dee2e6;">
                <h3 style="color: #333; margin: 0 0 15px 0; font-size: 18px;">📄 Your Payment Receipt</h3>
                <p style="color: #666; margin: 0 0 20px 0; font-size: 14px;">Download your official payment receipt for your records</p>
                <a href="${finalReceiptUrl.replace(/"/g, '&quot;')}" 
                   target="_blank"
                   rel="noopener noreferrer"
                   style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); transition: all 0.3s ease;"
                   onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(102, 126, 234, 0.6)';"
                   onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(102, 126, 234, 0.4)';">
                  📥 Download Receipt
                </a>
                <p style="color: #999; margin: 15px 0 0 0; font-size: 12px;">Keep this receipt safe for your records</p>
                <p style="color: #999; margin: 10px 0 0 0; font-size: 11px;">If the download doesn't start automatically, right-click the button and select "Save link as..."</p>
              </div>
              ` : ''}
              
              <p style="font-size: 14px; color: #666; margin-top: 20px; text-align: center;">
                Thank you for your payment. Your membership is now active.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; margin-bottom: 5px;">Need help? Contact us:</p>
              <p style="color: #666; margin: 0;">📍 Address: 2nd floor, Krishiv complex, Swaminarayan mandir Rd, Petlad, 388450</p>
              <p style="color: #666; margin: 5px 0;">📞 Phone: 9313720714</p>
              <p style="color: #666; margin: 5px 0;">📧 Email: stargympetlad0205@gmail.com</p>
            </div>
          </div>
        </div>
      `
    });
    // WhatsApp confirmation
    try {
      const text = `Payment confirmed for your Star Gym ${user.plan} plan. Start: ${new Date(user.startDate).toLocaleDateString()}, End: ${new Date(user.endDate).toLocaleDateString()}.`;
      await sendWhatsAppText({ phone: user.phone, message: text });
    } catch (waError) {
      console.error('WhatsApp payment confirm error:', waError);
    }

    res.status(200).json({
      status: 'success',
      message: 'Payment approved successfully',
      receiptUrl: finalReceiptUrl
    });
  } catch (error) {
    console.error('Error approving payment:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    // Exclude deleted users from the main list
    const users = await User.find({ isDeleted: { $ne: true } });
    
    // Process users to ensure photo URLs are correct
    // Use Render URL for image assets
    const assetBaseUrl =
      process.env.IMAGE_BASE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      'https://gym-backend-hz0n.onrender.com';

    const processedUsers = users.map(user => {
      const userObj = user.toObject();
      
      // If photo is already a Cloudinary URL, use it as is
      if (userObj.photo && userObj.photo.includes('cloudinary.com')) {
        return userObj;
      }
      
      // For backward compatibility with old local paths
      if (userObj.photo && userObj.photo.startsWith('/uploads/')) {
        userObj.photo = `${assetBaseUrl}${userObj.photo}`;
      }
      
      // For default avatar
      if (userObj.photo === '/default-avatar.png') {
        userObj.photo = `${assetBaseUrl}${userObj.photo}`;
      }
      
      return userObj;
    });
    
    res.status(200).json({
      status: 'success',
      data: {
        users: processedUsers
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching users'
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    console.log('Update request received:', req.params.id, req.body); // Debug log

    const allowedUpdates = ['name', 'email', 'phone', 'gender', 'address', 'plan', 'startDate', 'endDate'];
    const updates = {};
    
    // Only include allowed fields that are present in the request
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key) && req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    });

    // Get the user first to check current values
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Plan to months mapping
    const planToMonths = {
      '1month': 1,
      '2month': 2,
      '3month': 3,
      '6month': 6,
      'yearly': 12
    };

    // Auto-calculate end date if start date is updated or plan is changed
    const plan = updates.plan || user.plan;
    const startDate = updates.startDate ? new Date(updates.startDate) : new Date(user.startDate);
    
    // If start date is being updated or plan is being changed, recalculate end date
    if (updates.startDate || updates.plan) {
      if (startDate && !isNaN(startDate.getTime())) {
        const months = planToMonths[plan] || 1;
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + months);
        updates.endDate = endDate;
        console.log('Auto-calculated end date:', updates.endDate, 'based on plan:', plan, 'and start date:', startDate);
      }
    }

    // Update the user
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      {
        new: true, // Return the updated document
        runValidators: true // Run model validators
      }
    );

    console.log('User updated successfully:', updatedUser); // Debug log

    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    console.error('Update error:', error); // Debug log
    res.status(500).json({
      status: 'error',
      message: error.message || 'Error updating user'
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    console.log('Attempting to delete user:', userId);

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Delete user's photo from Cloudinary if it exists
    if (user.photo && user.photo.includes('cloudinary.com')) {
      try {
        // Extract public_id from the Cloudinary URL
        const urlParts = user.photo.split('/');
        const filename = urlParts[urlParts.length - 1].split('.')[0];
        const publicId = `gym-users/${filename}`;
        
        console.log('Attempting to delete photo from Cloudinary:', publicId);
        
        await deleteFromCloudinary(publicId);
        console.log('Successfully deleted photo from Cloudinary');
      } catch (photoError) {
        console.error('Error deleting photo from Cloudinary:', photoError);
        // Continue with user deletion even if photo deletion fails
      }
    }

    // Soft delete: Mark user as deleted but preserve revenue data
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.name = `[DELETED] ${user.name}`;
    user.email = `deleted_${Date.now()}_${user.email}`;
    user.phone = `deleted_${Date.now()}_${user.phone}`;
    user.photo = 'https://res.cloudinary.com/dovjfipbt/image/upload/v1/default-avatar';
    user.subscriptionStatus = 'expired';
    
    await user.save();
    console.log('User soft deleted successfully (revenue preserved):', userId);

    res.status(200).json({
      status: 'success',
      message: 'User deleted successfully. Revenue data preserved for accounting purposes.'
    });
  } catch (error) {
    console.error('Error in deleteUser:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete user and associated files',
      error: error.message
    });
  }
};

exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};

exports.createTestUser = async (req, res) => {
  try {
    // Create test users with various expiry dates
    const testUsers = [
      {
        ...req.body,
        startDate: new Date(Date.now() - (25 * 24 * 60 * 60 * 1000)), // 25 days ago
        endDate: new Date(Date.now() + (5 * 24 * 60 * 60 * 1000)) // 5 days from now
      },
      {
        ...req.body,
        name: "Test Expired User",
        email: "expired@example.com",
        startDate: new Date(Date.now() - (35 * 24 * 60 * 60 * 1000)), // 35 days ago
        endDate: new Date(Date.now() - (5 * 24 * 60 * 60 * 1000)) // 5 days ago (expired)
      }
    ];

    const users = await User.create(testUsers);

    res.status(201).json({
      status: 'success',
      data: {
        users
      }
    });
  } catch (error) {
    console.error('Error creating test users:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Add a cleanup function for test data
exports.cleanupTestUsers = async (req, res) => {
  try {
    await User.deleteMany({ email: { $in: ['test@example.com', 'expired@example.com'] } });
    res.status(200).json({
      status: 'success',
      message: 'Test users cleaned up'
    });
  } catch (error) {
    console.error('Error cleaning up test users:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

exports.notifyExpiredMember = async (req, res) => {
  try {
    const { userId } = req.params;
    const { email, name } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Create renewal token
    const renewalToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Use environment variable for frontend URL; default to live site in production
    const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production'
      ? 'https://stargympetlad.netlify.app'
      : 'http://localhost:5173');
    const renewalUrl = `${frontendUrl}/renew-membership/${renewalToken}`;

    // Send notification email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Your StarGym Membership Has Expired - Renew Now!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333; text-align: center;">Membership Expired</h1>
            
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px;">
              <p>Dear ${user.name},</p>
              <p>We hope you've been enjoying your fitness journey with StarGym! We noticed that your membership has expired on ${new Date(user.endDate).toLocaleDateString()}.</p>
              
              <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Your Membership Details:</h3>
                <p><strong>Plan:</strong> ${user.plan}</p>
                <p><strong>Start Date:</strong> ${new Date(user.startDate).toLocaleDateString()}</p>
                <p><strong>End Date:</strong> ${new Date(user.endDate).toLocaleDateString()}</p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${renewalUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                  Renew Membership
                </a>
              </div>

              <p style="font-size: 14px; color: #666;">
                This renewal link will expire in 7 days. If you have any questions, please don't hesitate to contact us.
              </p>
            </div>
          </div>
        `
      });
      try {
        const text = `Hi ${user.name}, your Star Gym membership expired on ${new Date(user.endDate).toLocaleDateString()}. Renew here: ${renewalUrl}`;
        await sendWhatsAppText({ phone: user.phone, message: text });
      } catch (waError) {
        console.error('WhatsApp expired notify error:', waError);
      }
      res.status(200).json({
        status: 'success',
        message: 'Notification sent successfully'
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      res.status(500).json({
        status: 'error',
        message: 'Failed to send email notification',
        error: emailError.message
      });
    }
  } catch (error) {
    console.error('Error in notifyExpiredMember:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: error.message
    });
  }
};

exports.notifyExpiringMember = async (req, res) => {
  try {
    const { userId } = req.params;
    const { email, name } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Calculate days left
    const today = new Date();
    const endDate = new Date(user.endDate);
    const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Only send notification if subscription is expiring (7 days or less) and not expired
    if (daysLeft > 7 || daysLeft < 0) {
      return res.status(400).json({
        status: 'error',
        message: 'User subscription is not expiring (must be 7 days or less and not expired)'
      });
    }

    // Create renewal token
    const renewalToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Use environment variable for frontend URL; default to live site in production
    const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production'
      ? 'https://stargympetlad.netlify.app'
      : 'http://localhost:5173');
    const renewalUrl = `${frontendUrl}/renew-membership/${renewalToken}`;

    // Send notification email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Your StarGym Membership Expires Soon - Renew Now!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f8f8; padding: 20px;">
            <div style="background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <h1 style="color: #333; text-align: center; margin: 0;">⚠️ Membership Expiring Soon</h1>
              
              <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
                <p style="color: #444; font-size: 16px; margin: 0 0 15px 0;">Dear ${user.name},</p>
                <p style="color: #444; line-height: 1.5; margin: 0 0 20px 0;">We wanted to remind you that your StarGym membership will expire in <strong>${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}</strong> on ${new Date(user.endDate).toLocaleDateString()}.</p>
                
                <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #333; margin-top: 0;">Your Membership Details:</h3>
                  <p style="margin: 8px 0; color: #666;"><strong>Plan:</strong> ${user.plan}</p>
                  <p style="margin: 8px 0; color: #666;"><strong>Start Date:</strong> ${new Date(user.startDate).toLocaleDateString()}</p>
                  <p style="margin: 8px 0; color: #666;"><strong>End Date:</strong> ${new Date(user.endDate).toLocaleDateString()}</p>
                  <p style="margin: 8px 0; color: #666;"><strong>Days Remaining:</strong> <span style="color: #ff9800; font-weight: bold;">${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}</span></p>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${renewalUrl}" style="background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(255, 152, 0, 0.4); display: inline-block; transition: all 0.3s ease;">
                    🔄 Renew Membership Now
                  </a>
                </div>

                <p style="font-size: 14px; color: #666; margin-top: 20px;">
                  Don't miss out on your fitness journey! Renew now to continue enjoying all StarGym facilities and services.
                </p>
                <p style="font-size: 12px; color: #999; margin-top: 15px;">
                  This renewal link will expire in 7 days. If you have any questions, please don't hesitate to contact us.
                </p>
              </div>
              
              <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                <p style="color: #666; margin-bottom: 5px;">Need help? Contact us:</p>
                <p style="color: #666; margin: 0;">📍 Address: 2nd floor, Krishiv complex, Swaminarayan mandir Rd, Petlad, 388450</p>
                <p style="color: #666; margin: 5px 0;">📞 Phone: 9313720714</p>
                <p style="color: #666; margin: 5px 0;">📧 Email: stargympetlad0205@gmail.com</p>
              </div>
            </div>
          </div>
        `
      });
      try {
        const text = `Hi ${user.name}, your Star Gym membership expires in ${daysLeft} days on ${new Date(user.endDate).toLocaleDateString()}. Renew here: ${renewalUrl}`;
        await sendWhatsAppText({ phone: user.phone, message: text });
      } catch (waError) {
        console.error('WhatsApp expiring notify error:', waError);
      }
      res.status(200).json({
        status: 'success',
        message: 'Expiry notification sent successfully',
        daysLeft: daysLeft
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      res.status(500).json({
        status: 'error',
        message: 'Failed to send email notification',
        error: emailError.message
      });
    }
  } catch (error) {
    console.error('Error in notifyExpiringMember:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: error.message
    });
  }
};

exports.verifyRenewalToken = async (req, res) => {
  try {
    const { token } = req.params;
    
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Return user data without sensitive information
    res.status(200).json({
      status: 'success',
      user: {
        name: user.name,
        email: user.email,
        currentPlan: user.plan,
        endDate: user.endDate
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired token'
      });
    }
    res.status(500).json({
      status: 'error',
      message: 'Error verifying token'
    });
  }
};

exports.renewMembership = async (req, res) => {
  try {
    const { token } = req.params;
    const { plan, startDate, endDate, paymentMethod, orderId } = req.body;

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Store previous plan details
    const previousPlan = user.plan;
    const previousAmount = getPlanAmount(user.plan);
    const newAmount = getPlanAmount(plan);

    // If this is the first renewal, set the originalJoinDate
    if (!user.originalJoinDate) {
      user.originalJoinDate = user.startDate;
    }

    // Update user's membership details
    user.plan = plan;
    user.startDate = startDate;
    user.endDate = endDate;
    user.paymentMethod = paymentMethod;
    user.paymentStatus = 'pending';
    user.subscriptionStatus = 'pending';

    // Log this renewal in the renewals array with previous plan details
    user.renewals = user.renewals || [];
    user.renewals.push({
      plan,
      startDate,
      endDate,
      paymentMethod,
      renewedAt: new Date(),
      previousPlan,
      previousAmount,
      newAmount
    });

    // Increment renewal count
    user.renewalCount = (user.renewalCount || 0) + 1;

    let paymentData = null;

    // If online payment, create payment
    if (paymentMethod === 'online') {
      const { createPayment } = require('../services/paymentService');
      try {
        const { payment } = await createPayment({
          userId: user._id,
          plan: plan,
          amount: newAmount
        });
        
        // Link payment to renewal
        payment.meta = { ...payment.meta, plan, isRenewal: true };
        await payment.save();
        
        paymentData = {
          orderId: payment.orderId,
          paymentId: payment._id.toString(),
          upiIntent: payment.upiIntent,
          qrImage: payment.qrImage,
          amount: payment.amount,
          currency: payment.currency,
          expiresAt: payment.expiresAt,
          status: payment.status
        };
      } catch (paymentError) {
        console.error('Error creating payment for renewal:', paymentError);
        // Continue with renewal even if payment creation fails
      }
    } else if (orderId) {
      // If orderId provided (legacy support), link existing payment
      const Payment = require('../models/Payment');
      const payment = await Payment.findOne({ orderId });
      if (payment) {
        payment.user = user._id;
        payment.meta = { ...payment.meta, plan, isRenewal: true };
        await payment.save();
      }
    }

    await user.save();

    // Send confirmation email
    await sendEmail({
      email: user.email,
      subject: 'Membership Renewal Request Received - StarGym',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Renewal Request - StarGym</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f8f8; padding: 20px;">
          <div style="background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #333; margin: 0;">Renewal Request Received! 🎉</h1>
              <p style="color: #666; margin-top: 10px;">Your StarGym membership renewal is being processed</p>
            </div>

            <div style="margin-bottom: 30px;">
              <p style="color: #444; font-size: 16px;">Dear ${user.name},</p>
              <p style="color: #444; line-height: 1.5;">Thank you for choosing to continue your fitness journey with StarGym! Your renewal request has been received and is pending approval.</p>
            </div>

            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
              <h2 style="color: #333; margin-top: 0; font-size: 18px;">Renewal Details</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Previous Plan:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: bold;">${getPlanDisplayName(previousPlan)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Previous Amount:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: bold;">₹${previousAmount.toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">New Plan:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: bold;">${getPlanDisplayName(plan)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">New Amount:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: bold;">₹${newAmount.toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Start Date:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: bold;">${new Date(startDate).toLocaleDateString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">End Date:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: bold;">${new Date(endDate).toLocaleDateString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Payment Method:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: bold;">${paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Status:</td>
                  <td style="padding: 8px 0; color: #ff9800; font-weight: bold;">Pending Approval</td>
                </tr>
              </table>
            </div>

            <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
              <p style="color: #f57c00; margin: 0;">⚠️ Important Note:</p>
              <p style="color: #666; margin: 10px 0 0 0;">Your membership will be activated once the payment is confirmed by our admin team. Please ensure your payment is completed as per the selected payment method.</p>
            </div>

            <div style="background-color: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
              <p style="color: #2e7d32; margin: 0;">✨ What's Next?</p>
              <ul style="color: #666; margin: 10px 0 0 0; padding-left: 20px;">
                <li>Complete your payment as per the selected method</li>
                <li>Wait for admin confirmation</li>
                <li>You'll receive another email once your renewal is approved</li>
                <li>Continue enjoying all StarGym facilities</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; margin-bottom: 5px;">Need help? Contact us:</p>
              <p style="color: #666; margin: 0;">📍 Address: 2nd floor, Krishiv complex, Swaminarayan mandir Rd, Petlad, 388450</p>
              <p style="color: #666; margin: 5px 0;">📞 Phone: 9313720714</p>
              <p style="color: #666; margin: 5px 0;">📧 Email: stargympetlad0205@gmail.com</p>
            </div>
          </div>
        </body>
        </html>
      `
    });
    // WhatsApp renewal received
    try {
      const text = `Hi ${user.name}, your Star Gym renewal request for ${getPlanDisplayName(plan)} has been received. Start: ${new Date(startDate).toLocaleDateString()}, End: ${new Date(endDate).toLocaleDateString()}.`;
      await sendWhatsAppText({ phone: user.phone, message: text });
    } catch (waError) {
      console.error('WhatsApp renewal message error:', waError);
    }

    res.status(200).json({
      status: 'success',
      message: 'Renewal request submitted successfully',
      paymentData: paymentData,
      orderId: paymentData?.orderId || null
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired token'
      });
    }
    res.status(500).json({
      status: 'error',
      message: 'Error processing renewal request'
    });
  }
};

exports.rejectRenewal = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Update user's subscription status
    user.subscriptionStatus = 'expired';
    await user.save();

    // Send rejection email
    await sendEmail({
      email: user.email,
      subject: 'Membership Renewal Request Rejected - Star Gym',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; text-align: center;">Renewal Request Rejected</h1>
          
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px;">
            <p>Dear ${user.name},</p>
            <p>We regret to inform you that your membership renewal request has been rejected.</p>
            
            <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3>Membership Details:</h3>
              <p><strong>Current Plan:</strong> ${user.plan}</p>
              <p><strong>End Date:</strong> ${new Date(user.endDate).toLocaleDateString()}</p>
            </div>
            
            <p style="font-size: 14px; color: #666; margin-top: 20px;">
              If you have any questions or concerns, please contact our support team.
            </p>
          </div>
        </div>
      `
    });
    // WhatsApp rejection notice
    try {
      const text = `Hi ${user.name}, your Star Gym renewal request was rejected. Please contact support if you have questions.`;
      await sendWhatsAppText({ phone: user.phone, message: text });
    } catch (waError) {
      console.error('WhatsApp renewal reject error:', waError);
    }

    res.status(200).json({
      status: 'success',
      message: 'Renewal request rejected successfully'
    });
  } catch (error) {
    console.error('Error rejecting renewal:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error rejecting renewal request'
    });
  }
};

exports.addMembershipHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      type,
      date,
      duration,
      amount,
      paymentMode,
      plan,
      paymentStatus,
      transactionId,
      notes 
    } = req.body;

    // Validate required fields
    if (!type || !date || !duration || !amount || !paymentMode || !plan) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields for membership history'
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Initialize membershipHistory array if it doesn't exist
    if (!user.membershipHistory) {
      user.membershipHistory = [];
    }

    // Add the membership history entry
    const membershipEntry = {
      type,
      date: new Date(date),
      duration,
      amount,
      paymentMode,
      plan,
      paymentStatus: paymentStatus || 'pending',
      transactionId,
      notes
    };
    user.membershipHistory.push(membershipEntry);

    // Update user's current plan and dates if it's a new membership or renewal
    if (type === 'join' || type === 'renewal') {
      user.plan = plan;
      user.startDate = new Date(date);
      
      // Calculate end date based on duration
      const durationMonths = parseInt(duration);
      const endDate = new Date(date);
      endDate.setMonth(endDate.getMonth() + durationMonths);
      user.endDate = endDate;
      
      user.paymentMethod = paymentMode;
      user.paymentStatus = paymentStatus || 'pending';
    }

    // Save the user
    await user.save();

    res.status(200).json({
      status: 'success',
      data: {
        membershipHistory: user.membershipHistory,
        currentPlan: {
          plan: user.plan,
          startDate: user.startDate,
          endDate: user.endDate,
          paymentMethod: user.paymentMethod,
          paymentStatus: user.paymentStatus
        }
      }
    });
  } catch (error) {
    console.error('Error adding membership history:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Error adding membership history'
    });
  }
};