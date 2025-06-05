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

exports.register = async (req, res) => {
  try {
    console.log('Registration request received:', req.body);
    console.log('Uploaded file:', req.file);

    // Validate required fields
    const requiredFields = ['name', 'email', 'phone', 'gender', 'plan', 'startDate', 'endDate', 'paymentMethod'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Missing required fields: ${missingFields.join(', ')}`
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
    const userData = {
      name: req.body.name,
      email: req.body.email.toLowerCase(),
      phone: req.body.phone,
      gender: req.body.gender,
      plan: req.body.plan,
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate),
      paymentMethod: req.body.paymentMethod,
      paymentStatus: 'pending',
      photo: photoPath
    };

    // Validate plan type
    if (!['1month', '2month', '3month', '6month', 'yearly'].includes(userData.plan)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid plan type. Must be one of: 1month, 2month, 3month, 6month, yearly'
      });
    }

    // Validate payment method
    if (!['cash', 'online'].includes(userData.paymentMethod)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid payment method. Must be either cash or online'
      });
    }

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
      // Don't fail the registration if email fails
    }

    res.status(201).json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle duplicate email error
    if (error.code === 11000) {
      return res.status(400).json({
        status: 'error',
        message: 'Email already exists'
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        status: 'error',
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      status: 'error',
      message: error.message || 'An error occurred during registration'
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

    // Generate receipt
    const receiptUrl = await generateReceipt(user);
    const fullReceiptUrl = `${process.env.BASE_URL}${receiptUrl}`;

    // Update user payment status
    user.paymentStatus = 'confirmed';
    await user.save();

    // Send confirmation email
    await sendEmail({
      email: user.email,
      subject: 'Payment Confirmed - StarGym Membership',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; text-align: center;">Payment Confirmed!</h1>
          
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px;">
            <p>Dear ${user.name},</p>
            <p>Your payment has been confirmed for your ${user.plan} membership plan.</p>
            
            <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3>Membership Details:</h3>
              <p><strong>Plan:</strong> ${user.plan}</p>
              <p><strong>Start Date:</strong> ${new Date(user.startDate).toLocaleDateString()}</p>
              <p><strong>End Date:</strong> ${new Date(user.endDate).toLocaleDateString()}</p>
              <p><strong>Payment Status:</strong> Confirmed</p>
            </div>
            
            <p style="font-size: 14px; color: #666; margin-top: 20px;">
              Thank you for your payment. Your membership is now active.
            </p>
          </div>
        </div>
      `
    });

    res.status(200).json({
      status: 'success',
      message: 'Payment approved successfully',
      receiptUrl
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
    const users = await User.find();
    
    // Process users to ensure photo URLs are correct
    const processedUsers = users.map(user => {
      const userObj = user.toObject();
      
      // If photo is already a Cloudinary URL, use it as is
      if (userObj.photo && userObj.photo.includes('cloudinary.com')) {
        return userObj;
      }
      
      // For backward compatibility with old local paths
      if (userObj.photo && userObj.photo.startsWith('/uploads/')) {
        userObj.photo = `${process.env.BASE_URL}${userObj.photo}`;
      }
      
      // For default avatar
      if (userObj.photo === '/default-avatar.png') {
        userObj.photo = `${process.env.BASE_URL}${userObj.photo}`;
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

    const allowedUpdates = ['name', 'email', 'phone', 'gender', 'plan', 'startDate', 'endDate'];
    const updates = {};
    
    // Only include allowed fields that are present in the request
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key) && req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      {
        new: true, // Return the updated document
        runValidators: true // Run model validators
      }
    );

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    console.log('User updated successfully:', user); // Debug log

    res.status(200).json({
      status: 'success',
      data: {
        user
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

    // Delete user from database
    await User.findByIdAndDelete(userId);
    console.log('User deleted successfully from database:', userId);

    res.status(200).json({
      status: 'success',
      message: 'User and associated files deleted successfully'
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

    // Use direct URL for frontend
    const renewalUrl = `http://localhost:5173/renew-membership/${renewalToken}`;

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

// Add new function to handle membership renewal
exports.renewMembership = async (req, res) => {
  try {
    const { token } = req.params;
    const { plan, paymentMethod } = req.body;

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Calculate amount based on plan
    const amount = getPlanAmount(plan);

    // Create renewal request
    user.renewalRequests.push({
      plan,
      paymentMethod,
      amount,
      status: 'pending'
    });

    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Renewal request submitted successfully',
      data: {
        requestId: user.renewalRequests[user.renewalRequests.length - 1]._id,
        amount
      }
    });
  } catch (error) {
    console.error('Error in renewMembership:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Error processing renewal request'
    });
  }
};

// Add new function to handle renewal request approval
exports.approveRenewalRequest = async (req, res) => {
  try {
    const { userId, requestId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const renewalRequest = user.renewalRequests.id(requestId);
    if (!renewalRequest) {
      return res.status(404).json({
        status: 'error',
        message: 'Renewal request not found'
      });
    }

    if (renewalRequest.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: 'This request has already been processed'
      });
    }

    // Calculate new dates
    const startDate = new Date();
    let endDate = new Date();
    
    switch (renewalRequest.plan) {
      case '1month':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case '2month':
        endDate.setMonth(endDate.getMonth() + 2);
        break;
      case '3month':
        endDate.setMonth(endDate.getMonth() + 3);
        break;
      case '6month':
        endDate.setMonth(endDate.getMonth() + 6);
        break;
      case 'yearly':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
    }

    // Update user membership
    user.plan = renewalRequest.plan;
    user.startDate = startDate;
    user.endDate = endDate;
    user.paymentMethod = renewalRequest.paymentMethod;
    user.paymentStatus = 'confirmed';
    user.subscriptionStatus = 'active';

    // Update renewal request status
    renewalRequest.status = 'approved';
    renewalRequest.processedAt = new Date();

    await user.save();

    // Send confirmation email
    await sendEmail({
      email: user.email,
      subject: 'Membership Renewal Approved - StarGym',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; text-align: center;">Membership Renewal Approved!</h1>
          
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px;">
            <p>Dear ${user.name},</p>
            <p>Your membership renewal request has been approved!</p>
            
            <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">Your New Membership Details:</h3>
              <p><strong>Plan:</strong> ${renewalRequest.plan}</p>
              <p><strong>Start Date:</strong> ${startDate.toLocaleDateString()}</p>
              <p><strong>End Date:</strong> ${endDate.toLocaleDateString()}</p>
              <p><strong>Amount Paid:</strong> ₹${renewalRequest.amount}</p>
            </div>

            <p>Thank you for continuing your fitness journey with us!</p>
          </div>
        </div>
      `
    });

    res.status(200).json({
      status: 'success',
      message: 'Renewal request approved successfully'
    });
  } catch (error) {
    console.error('Error in approveRenewalRequest:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Error approving renewal request'
    });
  }
};

// Add new function to get pending renewal requests
exports.getPendingRenewalRequests = async (req, res) => {
  try {
    console.log('Fetching pending renewal requests');
    
    const users = await User.find({
      'renewalRequests.status': 'pending'
    }).select('name email phone renewalRequests');

    console.log('Found users with pending renewals:', users.length);

    const pendingRequests = users.reduce((acc, user) => {
      const userRequests = user.renewalRequests
        .filter(request => request.status === 'pending')
        .map(request => ({
          userId: user._id,
          userName: user.name,
          userEmail: user.email,
          userPhone: user.phone,
          requestId: request._id,
          plan: request.plan,
          paymentMethod: request.paymentMethod,
          amount: request.amount,
          requestedAt: request.requestedAt,
          status: request.status
        }));
      return [...acc, ...userRequests];
    }, []);

    console.log('Formatted pending requests:', pendingRequests.length);

    res.status(200).json({
      status: 'success',
      data: pendingRequests
    });
  } catch (error) {
    console.error('Error in getPendingRenewalRequests:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching pending renewal requests'
    });
  }
};

exports.verifyRenewalToken = async (req, res) => {
  try {
    const { token } = req.params;

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Calculate days remaining
    const today = new Date();
    const endDate = new Date(user.endDate);
    const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Format dates for display
    const formattedStartDate = new Date(user.startDate).toLocaleDateString();
    const formattedEndDate = new Date(user.endDate).toLocaleDateString();

    res.status(200).json({
      status: 'success',
      message: 'Token is valid',
      data: {
        userId: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        photo: user.photo,
        plan: user.plan,
        startDate: formattedStartDate,
        endDate: formattedEndDate,
        daysRemaining,
        subscriptionStatus: user.subscriptionStatus,
        paymentStatus: user.paymentStatus,
        gender: user.gender,
        currentPlan: {
          name: user.plan,
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          status: user.subscriptionStatus
        }
      }
    });
  } catch (error) {
    console.error('Error in verifyRenewalToken:', error);
    res.status(401).json({
      status: 'error',
      message: 'Invalid or expired token'
    });
  }
};

// Add these email notification functions at the top with other imports
const sendRenewalRequestEmail = async (user) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Gym Membership Renewal Request Received',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Renewal Request Received</h2>
          <p>Dear ${user.name},</p>
          <p>We have received your membership renewal request. Your request is now pending admin approval.</p>
          <p>Details of your renewal request:</p>
          <ul>
            <li>Plan: ${user.renewalRequests[user.renewalRequests.length - 1].plan}</li>
            <li>Amount: ₹${user.renewalRequests[user.renewalRequests.length - 1].amount}</li>
            <li>Payment Method: ${user.renewalRequests[user.renewalRequests.length - 1].paymentMethod}</li>
          </ul>
          <p>We will notify you once your request is approved.</p>
          <p>Best regards,<br>Your Gym Team</p>
        </div>
      `
    };
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending renewal request email:', error);
  }
};

const sendRenewalApprovalEmail = async (user) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Gym Membership Renewal Approved',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Membership Renewal Approved!</h2>
          <p>Dear ${user.name},</p>
          <p>Your membership renewal request has been approved!</p>
          <p>Your membership details:</p>
          <ul>
            <li>Plan: ${user.plan}</li>
            <li>Start Date: ${new Date(user.startDate).toLocaleDateString()}</li>
            <li>End Date: ${new Date(user.endDate).toLocaleDateString()}</li>
          </ul>
          <p>Thank you for continuing your fitness journey with us!</p>
          <p>Best regards,<br>Your Gym Team</p>
        </div>
      `
    };
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending renewal approval email:', error);
  }
};

// Update the requestRenewal function
exports.requestRenewal = async (req, res) => {
  try {
    console.log('Received renewal request:', req.body);
    const { userId, plan, paymentMethod, amount } = req.body;

    if (!userId || !plan || !paymentMethod || !amount) {
      console.log('Missing required fields:', { userId, plan, paymentMethod, amount });
      return res.status(400).json({ 
        status: 'error',
        message: 'Missing required fields' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log('User not found:', userId);
      return res.status(404).json({ 
        status: 'error',
        message: 'User not found' 
      });
    }

    console.log('Found user:', user.name);

    // Add the renewal request
    const renewalRequest = {
      plan,
      paymentMethod,
      amount,
      status: 'pending',
      requestedAt: new Date()
    };

    user.renewalRequests.push(renewalRequest);
    await user.save();
    console.log('Saved renewal request for user:', user.name);

    // Send email notification for renewal request
    try {
      await sendEmail({
        email: user.email,
        subject: 'Membership Renewal Request Received - StarGym',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333; text-align: center;">Renewal Request Received</h1>
            
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px;">
              <p>Dear ${user.name},</p>
              <p>We have received your membership renewal request. Your request is now pending admin approval.</p>
              
              <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Your Renewal Request Details:</h3>
                <p><strong>Plan:</strong> ${plan}</p>
                <p><strong>Amount:</strong> ₹${amount}</p>
                <p><strong>Payment Method:</strong> ${paymentMethod}</p>
                <p><strong>Status:</strong> Pending Approval</p>
              </div>

              <p>We will notify you once your request is approved.</p>
              <p>Thank you for your patience!</p>
            </div>
          </div>
        `
      });
      console.log('Sent renewal request email to:', user.email);
    } catch (emailError) {
      console.error('Error sending renewal request email:', emailError);
      // Don't fail the request if email fails
    }

    res.status(200).json({ 
      status: 'success',
      message: 'Renewal request submitted successfully',
      data: {
        requestId: user.renewalRequests[user.renewalRequests.length - 1]._id
      }
    });
  } catch (error) {
    console.error('Error in requestRenewal:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Error processing renewal request',
      error: error.message 
    });
  }
};

// Update the approveRenewal function
exports.approveRenewal = async (req, res) => {
  try {
    const { userId, requestId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const renewalRequest = user.renewalRequests.id(requestId);
    if (!renewalRequest) {
      return res.status(404).json({ message: 'Renewal request not found' });
    }

    // Update the renewal request status
    renewalRequest.status = 'approved';
    renewalRequest.processedAt = new Date();

    // Update user's membership details
    user.plan = renewalRequest.plan;
    user.startDate = new Date();
    
    // Calculate end date based on plan
    const endDate = new Date();
    switch (renewalRequest.plan) {
      case '1month':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case '2month':
        endDate.setMonth(endDate.getMonth() + 2);
        break;
      case '3month':
        endDate.setMonth(endDate.getMonth() + 3);
        break;
      case '6month':
        endDate.setMonth(endDate.getMonth() + 6);
        break;
      case 'yearly':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
    }
    user.endDate = endDate;

    // Update payment status
    user.paymentStatus = 'confirmed';
    user.subscriptionStatus = 'active';

    await user.save();

    // Send email notification for renewal approval
    await sendRenewalApprovalEmail(user);

    res.status(200).json({ message: 'Renewal request approved successfully' });
  } catch (error) {
    console.error('Error in approveRenewal:', error);
    res.status(500).json({ message: 'Error approving renewal request' });
  }
};