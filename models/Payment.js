const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    orderId: {
      type: String,
      required: true,
      unique: true
    },
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'INR'
    },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed', 'expired'],
      default: 'created'
    },
    expiresAt: Date,
    upiIntent: String,
    qrImage: String,
    transactionRef: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    paidAt: Date,
    meta: {
      type: Object,
      default: {}
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', PaymentSchema);

