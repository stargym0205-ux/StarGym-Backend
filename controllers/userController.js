const User = require('../models/User');
const APIError = require('../utils/APIError');
const { sendEmail, createRegistrationEmail } = require('../services/emailService');
const { getPlanAmount, getPlanDisplayName, formatIndianPrice } = require('../utils/formatters');
const { generateReceipt } = require('../services/pdfService');
const fs = require('fs');
const path = require('path');

exports.register = async (req, res) => {
  try {
    console.log('Registration request received:', req.body);
    console.log('Uploaded file:', req.file);

    // Validate required fields
    const requiredFields = ['name', 'email', 'phone', 'dob', 'plan', 'startDate', 'endDate', 'paymentMethod'];
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
      // Ensure the path starts with /uploads/
      photoPath = `/uploads/${req.file.filename}`;
      console.log('Photo path saved:', photoPath);
      
      // Verify the file exists
      const fullPath = path.join(__dirname, '..', 'public', photoPath);
      if (!fs.existsSync(fullPath)) {
        console.error('Uploaded file not found at:', fullPath);
        return res.status(500).json({
          status: 'error',
          message: 'Error saving photo'
        });
      }
    } else {
      // Set default photo path
      photoPath = '/default-avatar.png';
    }

    // Format dates
    const userData = {
      name: req.body.name,
      email: req.body.email.toLowerCase(),
      phone: req.body.phone,
      dob: new Date(req.body.dob),
      plan: req.body.plan,
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate),
      paymentMethod: req.body.paymentMethod,
      paymentStatus: 'pending',
      photo: photoPath // Add photo path to user data
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
      
      // Handle photo path
      if (userObj.photo) {
        // If it's already a full URL but using the old domain, replace it
        if (userObj.photo.includes('gym-backend-mz5w.onrender.com')) {
          userObj.photo = userObj.photo.replace(
            'https://gym-backend-mz5w.onrender.com',
            'https://gym-backend-hz0n.onrender.com'
          );
        }
        
        // If it's just a path (starts with /uploads), append it to BASE_URL
        else if (userObj.photo.startsWith('/uploads/')) {
          userObj.photo = `https://gym-backend-hz0n.onrender.com${userObj.photo}`;
        }
        
        // For default avatar
        else if (userObj.photo === '/default-avatar.png') {
          userObj.photo = `https://gym-backend-hz0n.onrender.com${userObj.photo}`;
        }
        
        // If it's already a full URL with the correct domain, leave it as is
        else if (!userObj.photo.startsWith('http')) {
          // For any other case, assume it's a relative path and append to BASE_URL
          userObj.photo = `https://gym-backend-hz0n.onrender.com/${userObj.photo.replace(/^\/+/, '')}`;
        }
      } else {
        // Set default photo if no photo is provided
        userObj.photo = `https://gym-backend-hz0n.onrender.com/default-avatar.png`;
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

    const allowedUpdates = ['name', 'email', 'phone', 'plan', 'startDate', 'endDate'];
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

    // Delete user's photo if it exists
    if (user.photo) {
      try {
        // Extract filename from the photo path (in case it's a full URL or relative path)
        const photoFilename = user.photo.split('/').pop();
        const photoPath = path.join(__dirname, '..', 'public', 'uploads', photoFilename);
        
        console.log('Attempting to delete photo at path:', photoPath);
        
        if (fs.existsSync(photoPath)) {
          fs.unlinkSync(photoPath);
          console.log('Successfully deleted photo:', photoPath);
        } else {
          console.log('Photo file not found at path:', photoPath);
        }
      } catch (photoError) {
        console.error('Error deleting photo:', photoError);
        // Continue with user deletion even if photo deletion fails
      }
    }

    // Delete user's receipt if it exists
    try {
      const receiptDir = path.join(__dirname, '..', 'public', 'receipts');
      console.log('Checking receipt directory:', receiptDir);
      
      // Get all files in the receipts directory
      const files = fs.readdirSync(receiptDir);
      console.log('Found receipt files:', files);
      
      // Find all receipts for this user
      const userReceipts = files.filter(file => file.startsWith(`receipt-${userId}-`));
      console.log('User receipts to delete:', userReceipts);
      
      // Delete each receipt file
      userReceipts.forEach(receiptFile => {
        const receiptPath = path.join(receiptDir, receiptFile);
        if (fs.existsSync(receiptPath)) {
          fs.unlinkSync(receiptPath);
          console.log('Successfully deleted receipt:', receiptPath);
        } else {
          console.log('Receipt file not found at path:', receiptPath);
        }
      });
      
      if (userReceipts.length === 0) {
        console.log('No receipt files found for user:', userId);
      }
    } catch (receiptError) {
      console.error('Error deleting receipt:', receiptError);
      // Continue with user deletion even if receipt deletion fails
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
                <p><strong>Status:</strong> <span style="color: #dc2626;">Expired</span></p>
              </div>

              <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #dc2626; margin-top: 0;">Important Notice</h3>
                <p>To continue accessing our facilities and services, please renew your membership as soon as possible.</p>
              </div>
              
              <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #166534; margin-top: 0;">Available Plans</h3>
                <ul style="list-style: none; padding: 0;">
                  <li style="margin-bottom: 10px;">• 1 Month Plan - ₹1,500</li>
                  <li style="margin-bottom: 10px;">• 6 Months Plan - ₹5,000</li>
                  <li style="margin-bottom: 10px;">• 1 Year Plan - ₹8,000</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin: 20px 0;">
                <a href="${process.env.BASE_URL}" 
                   style="background-color: #4CAF50; color: white; padding: 12px 25px; 
                          text-decoration: none; border-radius: 5px; display: inline-block;
                          font-weight: bold;">
                  Renew Your Membership Now
                </a>
              </div>
              
              <div style="border-top: 1px solid #e5e7eb; margin-top: 20px; padding-top: 20px;">
                <p style="font-size: 12px; color: #666; margin: 0;">
                  Need assistance? Our support team is here to help!<br>
                  Contact us at: <a href="mailto:support@stargym.com" style="color: #4CAF50;">support@stargym.com</a>
                </p>
              </div>
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