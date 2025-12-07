const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { protect } = require('../middleware/auth');

// Public routes
router.get('/pricing', settingsController.getPlanPricing);
router.get('/gym-info', settingsController.getGymInfo);

// Protected routes
router.get('/', protect, settingsController.getSettings);
router.put('/', protect, settingsController.updateSettings);
router.patch('/', protect, settingsController.updateSettings);

module.exports = router;
