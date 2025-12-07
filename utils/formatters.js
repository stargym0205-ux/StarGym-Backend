const Settings = require('../models/Settings');

// Cache for settings to avoid frequent database queries
let settingsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Refresh settings cache
const refreshSettingsCache = async () => {
  try {
    const settings = await Settings.getSettings();
    settingsCache = settings;
    cacheTimestamp = Date.now();
    return settings;
  } catch (error) {
    console.error('Error refreshing settings cache:', error);
    // Return default prices if database fails
    return {
      planPricing: {
        '1month': 1500,
        '2month': 2500,
        '3month': 3500,
        '6month': 5000,
        'yearly': 8000
      }
    };
  }
};

// Get settings (with caching)
const getSettings = async () => {
  const now = Date.now();
  if (!settingsCache || !cacheTimestamp || (now - cacheTimestamp) > CACHE_DURATION) {
    await refreshSettingsCache();
  }
  return settingsCache;
};

const formatIndianPrice = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
};

// Synchronous version (uses cache or defaults)
const getPlanAmount = (plan) => {
  // Use cached settings if available
  if (settingsCache && settingsCache.planPricing) {
    return settingsCache.planPricing[plan] || 0;
  }
  
  // Fallback to default prices
  const defaultPrices = {
    '1month': 1500,
    '2month': 2500,
    '3month': 3500,
    '6month': 5000,
    'yearly': 8000
  };
  return defaultPrices[plan] || 0;
};

// Async version (fetches from database if needed)
const getPlanAmountAsync = async (plan) => {
  const settings = await getSettings();
  return settings.planPricing[plan] || 0;
};

const getPlanDisplayName = (plan) => {
  const planNames = {
    '1month': '1 Month',
    '2month': '2 Months',
    '3month': '3 Months',
    '6month': '6 Months',
    'yearly': '1 Year'
  };
  return planNames[plan] || plan;
};

// Clear cache (useful when settings are updated)
const clearSettingsCache = () => {
  settingsCache = null;
  cacheTimestamp = null;
};

module.exports = {
  formatIndianPrice,
  getPlanAmount,
  getPlanAmountAsync,
  getPlanDisplayName,
  getSettings,
  clearSettingsCache,
  refreshSettingsCache
}; 