const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const { uploadToCloudinary } = require('../services/cloudinaryService');

// Public route
router.post('/register', upload.single('photo'), handleUploadError, userController.register);

// Protected routes - require authentication
router.use(protect); // Apply authentication middleware to all routes below

// Admin only routes
router.get('/', userController.getAllUsers);
router.patch('/approve/:userId', protect, userController.approvePayment);
router.patch('/:id', protect, userController.updateUser);
router.delete('/:id', protect, userController.deleteUser);
router.post('/notify-expired/:userId', protect, userController.notifyExpiredMember);

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