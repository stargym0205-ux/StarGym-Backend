const mongoose = require('mongoose');
const validator = require('validator');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: [true, 'Please provide a phone number']
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other']
  },
  photo: {
    type: String,
    default: 'https://res.cloudinary.com/dovjfipbt/image/upload/v1/default-avatar'
  },
  plan: {
    type: String,
    enum: ['1month', '2month', '3month', '6month', 'yearly'],
    required: [true, 'Please select a plan']
  },
  startDate: {
    type: Date,
    required: [true, 'Please provide a start date']
  },
  endDate: {
    type: Date,
    required: [true, 'Please provide an end date']
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'online'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'confirmed'],
    default: 'pending'
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'expired', 'pending'],
    default: 'active'
  },
  renewalRequests: [{
    plan: {
      type: String,
      enum: ['1month', '2month', '3month', '6month', 'yearly'],
      required: true
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'online'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    processedAt: Date
  }]
}, { timestamps: true });

// Add a method to check if subscription is expired
UserSchema.methods.isExpired = function() {
  return new Date() > new Date(this.endDate);
};

module.exports = mongoose.model('User', UserSchema);