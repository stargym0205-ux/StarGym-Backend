const express = require('express');
const router = express.Router();
const {
  createPayment,
  markPaymentPaid,
  markPaymentFailed,
  verifyWebhookSecret
} = require('../services/paymentService');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Create a new UPI payment and return QR + intent
router.post('/create', async (req, res) => {
  try {
    const { userId, plan, amount } = req.body;
    if (!userId) {
      return res.status(400).json({ status: 'error', message: 'userId required' });
    }
    const { payment } = await createPayment({ userId, plan, amount });
    return res.status(201).json({
      status: 'success',
      data: {
        orderId: payment.orderId,
        paymentId: payment._id,
        upiIntent: payment.upiIntent,
        qrImage: payment.qrImage,
        amount: payment.amount,
        currency: payment.currency,
        expiresAt: payment.expiresAt,
        status: payment.status
      }
    });
  } catch (error) {
    console.error('Create payment error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create payment'
    });
  }
});

// Public status check for polling
router.get('/status/:orderId', async (req, res) => {
  try {
    const payment = await Payment.findOne({ orderId: req.params.orderId }).lean();
    if (!payment) {
      return res.status(404).json({ status: 'error', message: 'Payment not found' });
    }
    return res.json({
      status: 'success',
      data: {
        orderId: payment.orderId,
        state: payment.status,
        paidAt: payment.paidAt,
        transactionRef: payment.transactionRef,
        expiresAt: payment.expiresAt
      }
    });
  } catch (error) {
    console.error('Status error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch status' });
  }
});

// Get full payment details including QR code
router.get('/details/:orderId', async (req, res) => {
  try {
    const payment = await Payment.findOne({ orderId: req.params.orderId }).lean();
    if (!payment) {
      return res.status(404).json({ status: 'error', message: 'Payment not found' });
    }
    return res.json({
      status: 'success',
      data: {
        orderId: payment.orderId,
        paymentId: payment._id,
        upiIntent: payment.upiIntent,
        qrImage: payment.qrImage,
        amount: payment.amount,
        currency: payment.currency,
        expiresAt: payment.expiresAt,
        status: payment.status
      }
    });
  } catch (error) {
    console.error('Payment details error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch payment details' });
  }
});

// Mock webhook/confirmation endpoint to mark paid (secured by header secret)
router.post('/webhook', async (req, res) => {
  try {
    const provided = req.headers['x-webhook-secret'];
    if (!verifyWebhookSecret(provided)) {
      return res.status(401).json({ status: 'error', message: 'Invalid webhook secret' });
    }

    const { orderId, transactionRef, status } = req.body;
    if (!orderId) {
      return res.status(400).json({ status: 'error', message: 'orderId required' });
    }

    let payment;
    if (status === 'failed') {
      payment = await markPaymentFailed({ orderId, reason: 'webhook_failed' });
    } else {
      payment = await markPaymentPaid({ orderId, transactionRef });
    }

    return res.json({ status: 'success', data: { orderId: payment.orderId, state: payment.status } });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to process webhook' });
  }
});

// Admin helper: list recent payments (protected route)
router.get('/recent', protect, async (req, res) => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 }).limit(20).lean();
    return res.json({ status: 'success', data: payments });
  } catch (error) {
    console.error('Recent payments error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch payments' });
  }
});

module.exports = router;

