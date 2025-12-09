const crypto = require('crypto');
const QRCode = require('qrcode');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { getPlanAmount } = require('../utils/formatters');

// UPI Payment Configuration
// PRIMARY UPI ID: 9898881882thanganat-1@okicici
// This UPI ID is used in payment QR codes, UPI intents, and when opening GPay/PhonePe/Paytm apps
// Can be overridden via environment variable UPI_VPA or GPAY_VPA if needed
const PAYEE_VPA = process.env.UPI_VPA || process.env.GPAY_VPA || '9898881882thanganat-1@okicici';
const PAYEE_NAME = process.env.UPI_PAYEE_NAME || 'StarGym';
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'changeme';

// Log UPI configuration on module load
console.log('✅ Payment Service - UPI_VPA configured:', PAYEE_VPA);
if (PAYEE_VPA === '9898881882thanganat-1@okicici') {
  console.log('✅ Payment Service - Correct UPI ID is being used: 9898881882thanganat-1@okicici');
}

const planToMonths = {
  '1month': 1,
  '2month': 2,
  '3month': 3,
  '6month': 6,
  yearly: 12
};

const generateOrderId = () =>
  `ORD-${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex')}`;

const buildUpiIntent = ({ amount, orderId, note }) => {
  if (!PAYEE_VPA) {
    throw new Error('UPI_VPA is not configured');
  }
  
  const encodedNote = encodeURIComponent(note || `Gym subscription ${orderId}`);
  const encodedVPA = encodeURIComponent(PAYEE_VPA.trim());
  const encodedName = encodeURIComponent(PAYEE_NAME.trim());
  
  // UPI payment format: upi://pay?pa=<VPA>&pn=<Name>&am=<Amount>&cu=<Currency>&tn=<Note>&tr=<TransactionRef>
  // Important: First parameter uses ? and subsequent use &
  const upiIntent = `upi://pay?pa=${encodedVPA}&pn=${encodedName}&am=${amount.toFixed(2)}&cu=INR&tn=${encodedNote}&tr=${orderId}`;
  
  return upiIntent;
};

const createPayment = async ({ userId, plan, amount }) => {
  if (!PAYEE_VPA) {
    throw new Error('UPI_VPA not configured');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const resolvedPlan = plan || user.plan;
  const resolvedAmount = amount || getPlanAmount(resolvedPlan);
  if (!resolvedAmount) {
    throw new Error('Unable to resolve amount for plan');
  }

  const orderId = generateOrderId();
  const upiIntent = buildUpiIntent({
    amount: resolvedAmount,
    orderId,
    note: `Subscription ${resolvedPlan}`
  });
  const qrImage = await QRCode.toDataURL(upiIntent, { margin: 1, scale: 6 });

  const payment = await Payment.create({
    user: userId,
    orderId,
    amount: resolvedAmount,
    currency: 'INR',
    status: 'created',
    upiIntent,
    qrImage,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    meta: { plan: resolvedPlan }
  });

  return { payment, user };
};

const markPaymentPaid = async ({ orderId, transactionRef }) => {
  const payment = await Payment.findOne({ orderId });
  if (!payment) {
    throw new Error('Payment not found');
  }
  if (payment.status === 'paid') {
    return payment;
  }
  payment.status = 'paid';
  payment.transactionRef = transactionRef || payment.transactionRef || orderId;
  payment.paidAt = new Date();
  await payment.save();

  const user = await User.findById(payment.user);
  if (user) {
    user.paymentStatus = 'confirmed';
    user.subscriptionStatus = 'active';

    // Ensure membership history entry exists
    if (!user.membershipHistory) {
      user.membershipHistory = [];
    }
    const months = planToMonths[user.plan] || 1;
    const amount = payment.amount;
    user.membershipHistory.push({
      type: 'join',
      date: new Date(),
      duration: String(months),
      amount,
      paymentMode: 'online',
      plan: user.plan,
      paymentStatus: 'confirmed',
      transactionId: payment.transactionRef
    });
    await user.save();
  }

  return payment;
};

const markPaymentFailed = async ({ orderId, reason }) => {
  const payment = await Payment.findOne({ orderId });
  if (!payment) {
    throw new Error('Payment not found');
  }
  payment.status = 'failed';
  payment.meta = { ...payment.meta, reason };
  await payment.save();
  return payment;
};

const verifyWebhookSecret = (secret) => secret && secret === WEBHOOK_SECRET;

module.exports = {
  createPayment,
  markPaymentPaid,
  markPaymentFailed,
  verifyWebhookSecret
};
