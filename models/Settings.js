const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  // Membership Plan Pricing
  planPricing: {
    '1month': {
      type: Number,
      default: 1500,
      required: true
    },
    '2month': {
      type: Number,
      default: 2500,
      required: true
    },
    '3month': {
      type: Number,
      default: 3500,
      required: true
    },
    '6month': {
      type: Number,
      default: 5000,
      required: true
    },
    'yearly': {
      type: Number,
      default: 8000,
      required: true
    }
  },
  // Gym Information
  gymInfo: {
    name: {
      type: String,
      default: 'StarGym',
      trim: true
    },
    address: {
      type: String,
      default: '2st floor, Krishiv complex, Swaminarayan mandir Rd, Petlad, 388450',
      trim: true
    },
    phone: {
      type: String,
      default: '',
      trim: true
    },
    email: {
      type: String,
      default: '',
      trim: true
    },
    website: {
      type: String,
      default: '',
      trim: true
    },
    businessHours: {
      type: String,
      default: '6:00 AM - 10:00 PM',
      trim: true
    },
    // Footer Information
    footer: {
      openingHours: {
        days: {
          type: String,
          default: 'Monday - Saturday',
          trim: true
        },
        morningHours: {
          type: String,
          default: '6:00 AM - 9:00 AM',
          trim: true
        },
        eveningHours: {
          type: String,
          default: '4:00 PM - 9:00 PM',
          trim: true
        }
      },
      paymentMethods: {
        type: String,
        default: 'Cash, Online Payment',
        trim: true
      },
      contactEmail: {
        type: String,
        default: 'admin@gmail.com',
        trim: true
      },
      contactPhone: {
        type: String,
        default: '9101321032',
        trim: true
      }
    }
  },
  // Email/SMTP Settings
  emailSettings: {
    enabled: {
      type: Boolean,
      default: true
    },
    fromEmail: {
      type: String,
      default: '',
      trim: true
    },
    fromName: {
      type: String,
      default: 'StarGym',
      trim: true
    }
  },
  // Notification Settings
  notificationSettings: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    whatsappNotifications: {
      type: Boolean,
      default: true
    },
    renewalReminders: {
      type: Boolean,
      default: true
    },
    expiryReminders: {
      type: Boolean,
      default: true
    }
  },
  // System Preferences
  systemPreferences: {
    currency: {
      type: String,
      default: 'INR',
      enum: ['INR', 'USD', 'EUR'],
      trim: true
    },
    currencySymbol: {
      type: String,
      default: 'Rs.',
      trim: true
    },
    dateFormat: {
      type: String,
      default: 'DD/MM/YYYY',
      enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
      trim: true
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata',
      trim: true
    }
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
SettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('Settings', SettingsSchema);
