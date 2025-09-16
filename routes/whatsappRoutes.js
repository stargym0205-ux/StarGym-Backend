const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const { sendWhatsAppText } = require('../services/whatsappService');

// Protected test endpoint to send a WhatsApp message
router.post('/test', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { phone, message } = req.body || {};

    if (!phone || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'phone and message are required'
      });
    }

    const result = await sendWhatsAppText({ phone, message });

    if (result.skipped) {
      return res.status(200).json({ status: 'skipped', ...result });
    }

    if (!result.ok) {
      return res.status(502).json({ status: 'error', error: result.error || 'Failed to send WhatsApp' });
    }

    res.status(200).json({ status: 'success', data: result.data });
  } catch (error) {
    console.error('WhatsApp test error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;


