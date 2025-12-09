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
    enum: ['Male', 'Female', 'Other'],
    required: [true, 'Please provide a gender']
  },
  address: {
    type: String,
    required: [true, 'Please provide an address'],
    trim: true
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
  originalJoinDate: {
    type: Date,
    required: [true, 'Please provide the original joining date']
  },
  startDate: {
    type: Date,
    required: [true, 'Please provide the current subscription start date']
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
  membershipHistory: [{
    type: {
      type: String,
      enum: ['join', 'renewal'],
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    duration: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    paymentMode: {
      type: String,
      enum: ['cash', 'online'],
      required: true
    },
    plan: {
      type: String,
      enum: ['1month', '2month', '3month', '6month', 'yearly'],
      required: true
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'confirmed'],
      default: 'pending'
    },
    transactionId: String,
    notes: String
  }],
  subscriptionHistory: [{
    plan: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    paymentMethod: { type: String, required: true },
    paymentStatus: { type: String, required: true },
    amount: { type: Number, required: true },
    renewedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['completed', 'cancelled'], default: 'completed' }
  }],
  renewals: [
    {
      plan: { type: String, required: true },
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      paymentMethod: { type: String, required: true },
      renewedAt: { type: Date, default: Date.now },
      previousPlan: { type: String, required: true },
      previousAmount: { type: Number, required: true },
      newAmount: { type: Number, required: true }
    }
  ],
  renewalCount: {
    type: Number,
    default: 0
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Add a method to check if subscription is expired
UserSchema.methods.isExpired = function() {
  return new Date() > new Date(this.endDate);
};

// Add a method to add subscription history entry
UserSchema.methods.addSubscriptionHistory = function(subscriptionData) {
  this.subscriptionHistory.push({
    plan: this.plan,
    startDate: this.startDate,
    endDate: this.endDate,
    paymentMethod: this.paymentMethod,
    paymentStatus: this.paymentStatus,
    amount: subscriptionData.amount,
    renewedAt: new Date(),
    status: 'completed'
  });
  return this.save();
};

module.exports = mongoose.model('User', UserSchema);