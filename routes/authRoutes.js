const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter, strictAuthLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting to authentication routes
router.post('/login', authLimiter, authController.login);
router.get('/verify', protect, authController.verifyToken);
router.post('/forgot-password', strictAuthLimiter, authController.forgotPassword);
router.post('/verify-otp', strictAuthLimiter, authController.verifyOTP);
router.post('/reset-password/:token', strictAuthLimiter, authController.resetPassword);

module.exports = router; 