const Settings = require('../models/Settings');
const { clearSettingsCache } = require('../utils/formatters');

// Get settings (public for plan pricing, protected for full settings)
exports.getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    // If not authenticated, only return plan pricing
    if (!req.user) {
      return res.status(200).json({
        status: 'success',
        data: {
          planPricing: settings.planPricing
        }
      });
    }
    
    // If authenticated, return all settings
    res.status(200).json({
      status: 'success',
      data: settings
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch settings',
      error: error.message
    });
  }
};

// Update settings (protected)
exports.updateSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    
    if (!settings) {
      settings = await Settings.create({});
    }
    
    // Update only provided fields
    const {
      planPricing,
      gymInfo,
      emailSettings,
      notificationSettings,
      systemPreferences
    } = req.body;
    
    if (planPricing) {
      settings.planPricing = { ...settings.planPricing, ...planPricing };
    }
    
    if (gymInfo) {
      settings.gymInfo = { ...settings.gymInfo, ...gymInfo };
    }
    
    if (emailSettings) {
      settings.emailSettings = { ...settings.emailSettings, ...emailSettings };
    }
    
    if (notificationSettings) {
      settings.notificationSettings = { ...settings.notificationSettings, ...notificationSettings };
    }
    
    if (systemPreferences) {
      settings.systemPreferences = { ...settings.systemPreferences, ...systemPreferences };
    }
    
    await settings.save();
    
    // Clear cache so new settings are used immediately
    clearSettingsCache();
    
    res.status(200).json({
      status: 'success',
      message: 'Settings updated successfully',
      data: settings
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update settings',
      error: error.message
    });
  }
};

// Get plan pricing only (public endpoint)
exports.getPlanPricing = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.status(200).json({
      status: 'success',
      data: {
        planPricing: settings.planPricing
      }
    });
  } catch (error) {
    console.error('Error fetching plan pricing:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch plan pricing',
      error: error.message
    });
  }
};

// Get gym info only (public endpoint for footer)
exports.getGymInfo = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.status(200).json({
      status: 'success',
      data: {
        gymInfo: settings.gymInfo
      }
    });
  } catch (error) {
    console.error('Error fetching gym info:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch gym info',
      error: error.message
    });
  }
};
