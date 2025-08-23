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

// Protected routes - require authentication
router.use(protect);

// Admin only routes
router.get('/', userController.getAllUsers);
router.patch('/approve/:userId', protect, userController.approvePayment);
router.patch('/:id', protect, userController.updateUser);
router.delete('/:id', protect, userController.deleteUser);
router.post('/notify-expired/:userId', protect, userController.notifyExpiredMember);
router.patch('/reject-renewal/:userId', protect, userController.rejectRenewal);

// Add membership history
router.post('/:userId/membership-history', protect, userController.addMembershipHistory);

// Get membership history
router.get('/:userId/membership-history', protect, async (req, res) => {
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