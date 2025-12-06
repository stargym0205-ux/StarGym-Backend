const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const { uploadToCloudinary } = require('../services/cloudinaryService');
const User = require('../models/User');

// Public routes
router.post('/register', upload.single('photo'), handleUploadError, userController.register);

// Renewal routes (public)
router.get('/verify-renewal-token/:token', userController.verifyRenewalToken);
router.post('/renew-membership/:token', userController.renewMembership);

// Protected routes - require authentication (all routes below require admin authentication)
router.use(protect);

// Admin only routes
router.get('/', userController.getAllUsers);
router.patch('/approve/:userId', userController.approvePayment);
router.patch('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);
router.post('/notify-expired/:userId', userController.notifyExpiredMember);
router.patch('/reject-renewal/:userId', userController.rejectRenewal);

// Add membership history
router.post('/:userId/membership-history', userController.addMembershipHistory);

// Get all membership history entries (including deleted users) for revenue calculations
// IMPORTANT: This route must come before /:userId/membership-history to avoid route conflicts
router.get('/membership-history/all', async (req, res) => {
  try {
    // Fetch all users including deleted ones for revenue calculations
    // Revenue data must be preserved even after member deletion for accounting purposes
    const users = await User.find({}).select('_id membershipHistory');
    
    const allEntries = [];
    users.forEach(user => {
      if (user.membershipHistory && user.membershipHistory.length > 0) {
        user.membershipHistory.forEach(entry => {
          if (entry && entry.paymentStatus === 'confirmed') {
            allEntries.push({
              ...entry.toObject(),
              userId: user._id.toString()
            });
          }
        });
      }
    });

    res.status(200).json({
      status: 'success',
      data: {
        membershipHistory: allEntries
      }
    });
  } catch (error) {
    console.error('Error fetching all membership history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching all membership history'
    });
  }
});

// Get membership history for a specific user
router.get('/:userId/membership-history', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, type } = req.query;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    let membershipHistory = user.membershipHistory || [];

    // Filter by date range if provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      membershipHistory = membershipHistory.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate >= start && entryDate <= end;
      });
    }

    // Filter by type if provided
    if (type) {
      membershipHistory = membershipHistory.filter(entry => entry.type === type);
    }

    res.status(200).json({
      status: 'success',
      data: {
        membershipHistory
      }
    });
  } catch (error) {
    console.error('Error fetching membership history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching membership history'
    });
  }
});

// Add this new route
router.post('/test-upload', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    console.log('Test upload - File received:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // Upload to Cloudinary
    const photoPath = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    
    res.status(200).json({
      status: 'success',
      data: {
        photoUrl: photoPath
      }
    });
  } catch (error) {
    console.error('Test upload error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Error uploading photo'
    });
  }
});

// Simple test endpoint for Cloudinary uploads
router.post('/test-cloudinary', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    console.log('Test upload - File received:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // Upload to Cloudinary
    const photoPath = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    
    res.status(200).json({
      status: 'success',
      data: {
        photoUrl: photoPath
      }
    });
  } catch (error) {
    console.error('Test upload error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Error uploading photo',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;