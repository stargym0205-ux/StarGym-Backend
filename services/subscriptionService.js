const User = require('../models/User');
const { sendEmail } = require('./emailService');
const { sendWhatsAppText } = require('./whatsappService');
const jwt = require('jsonwebtoken');

const checkExpiredSubscriptions = async () => {
  try {
    const today = new Date();
    
    // Find users whose subscriptions have expired
    const expiredUsers = await User.find({
      endDate: { $lt: today },
      subscriptionStatus: { $ne: 'expired' }
    });

    // Update their status and send notifications
    for (const user of expiredUsers) {
      user.subscriptionStatus = 'expired';
      await user.save();

      // Generate renewal token
      const renewalToken = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const renewalUrl = `${frontendUrl}/renew-membership/${renewalToken}`;

      // Send notification email
      await sendEmail({
        email: user.email,
        subject: 'StarGym Membership Expired',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1>Your StarGym Membership Has Expired</h1>
            <p>Dear ${user.name},</p>
            <p>Your membership plan has expired on ${new Date(user.endDate).toLocaleDateString()}.</p>
            <p>To continue enjoying our services, please renew your membership.</p>
            <div style="text-align:center; margin: 30px 0;">
              <a href="${renewalUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Renew Membership
              </a>
            </div>
            <p>Thank you for choosing StarGym!</p>
          </div>
        `
      });
      try {
        const text = `Hi ${user.name}, your Gold Gym membership expired on ${new Date(user.endDate).toLocaleDateString()}. Renew here: ${renewalUrl}`;
        await sendWhatsAppText({ phone: user.phone, message: text });
      } catch (waError) {
        console.error('WhatsApp expired notify error:', waError);
      }
    }

    // Find users whose subscriptions are about to expire
    const nearingExpiry = await User.find({
      endDate: {
        $gt: today,
        $lt: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      },
      subscriptionStatus: 'active'
    });

    // Send reminder emails
    for (const user of nearingExpiry) {
      const daysLeft = Math.ceil((new Date(user.endDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      await sendEmail({
        email: user.email,
        subject: 'StarGym Membership Expiring Soon',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1>Your StarGym Membership is Expiring Soon</h1>
            <p>Dear ${user.name},</p>
            <p>Your membership plan will expire in ${daysLeft} days on ${new Date(user.endDate).toLocaleDateString()}.</p>
            <p>To avoid any interruption in services, please renew your membership before it expires.</p>
            <p>Thank you for choosing StarGym!</p>
          </div>
        `
      });
      try {
        const text = `Hi ${user.name}, your Gold Gym membership expires in ${daysLeft} days on ${new Date(user.endDate).toLocaleDateString()}.`;
        await sendWhatsAppText({ phone: user.phone, message: text });
      } catch (waError) {
        console.error('WhatsApp expiry soon error:', waError);
      }
    }
  } catch (error) {
    console.error('Error checking subscriptions:', error);
  }
};

const calculateMonthlyRevenue = async (year, month) => {
  try {
    // Create start and end dates for the specified month
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const result = await User.aggregate([
      {
        $match: {
          'membershipHistory.date': {
            $gte: startDate,
            $lte: endDate
          },
          'membershipHistory.paymentStatus': 'confirmed'
        }
      },
      {
        $unwind: '$membershipHistory'
      },
      {
        $match: {
          'membershipHistory.date': {
            $gte: startDate,
            $lte: endDate
          },
          'membershipHistory.paymentStatus': 'confirmed'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$membershipHistory.amount' },
          cashRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$membershipHistory.paymentMode', 'cash'] },
                '$membershipHistory.amount',
                0
              ]
            }
          },
          onlineRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$membershipHistory.paymentMode', 'online'] },
                '$membershipHistory.amount',
                0
              ]
            }
          },
          newSubscriptions: {
            $sum: {
              $cond: [
                { $eq: ['$membershipHistory.type', 'join'] },
                1,
                0
              ]
            }
          },
          renewals: {
            $sum: {
              $cond: [
                { $eq: ['$membershipHistory.type', 'renewal'] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    return {
      month,
      year,
      totalRevenue: result[0]?.totalRevenue || 0,
      cashRevenue: result[0]?.cashRevenue || 0,
      onlineRevenue: result[0]?.onlineRevenue || 0,
      newSubscriptionsCount: result[0]?.newSubscriptions || 0,
      renewalsCount: result[0]?.renewals || 0,
      startDate,
      endDate
    };
  } catch (error) {
    console.error('Error calculating monthly revenue:', error);
    throw error;
  }
};

const calculateYearlyRevenue = async (year) => {
  try {
    const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    const result = await User.aggregate([
      {
        $match: {
          'membershipHistory.date': {
            $gte: startDate,
            $lte: endDate
          },
          'membershipHistory.paymentStatus': 'confirmed'
        }
      },
      {
        $unwind: '$membershipHistory'
      },
      {
        $match: {
          'membershipHistory.date': {
            $gte: startDate,
            $lte: endDate
          },
          'membershipHistory.paymentStatus': 'confirmed'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$membershipHistory.amount' },
          cashRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$membershipHistory.paymentMode', 'cash'] },
                '$membershipHistory.amount',
                0
              ]
            }
          },
          onlineRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$membershipHistory.paymentMode', 'online'] },
                '$membershipHistory.amount',
                0
              ]
            }
          },
          newSubscriptions: {
            $sum: {
              $cond: [
                { $eq: ['$membershipHistory.type', 'join'] },
                1,
                0
              ]
            }
          },
          renewals: {
            $sum: {
              $cond: [
                { $eq: ['$membershipHistory.type', 'renewal'] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    return {
      year,
      totalRevenue: result[0]?.totalRevenue || 0,
      cashRevenue: result[0]?.cashRevenue || 0,
      onlineRevenue: result[0]?.onlineRevenue || 0,
      newSubscriptionsCount: result[0]?.newSubscriptions || 0,
      renewalsCount: result[0]?.renewals || 0,
      startDate,
      endDate
    };
  } catch (error) {
    console.error('Error calculating yearly revenue:', error);
    throw error;
  }
};

const calculateRevenueByPlan = async () => {
  try {
    const result = await User.aggregate([
      {
        $unwind: '$membershipHistory'
      },
      {
        $match: {
          'membershipHistory.paymentStatus': 'confirmed'
        }
      },
      {
        $group: {
          _id: '$membershipHistory.plan',
          totalRevenue: { $sum: '$membershipHistory.amount' },
          count: { $sum: 1 },
          cashRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$membershipHistory.paymentMode', 'cash'] },
                '$membershipHistory.amount',
                0
              ]
            }
          },
          onlineRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$membershipHistory.paymentMode', 'online'] },
                '$membershipHistory.amount',
                0
              ]
            }
          }
        }
      }
    ]);

    const planRevenue = {};
    result.forEach(item => {
      planRevenue[item._id] = {
        totalRevenue: item.totalRevenue,
        count: item.count,
        cashRevenue: item.cashRevenue,
        onlineRevenue: item.onlineRevenue
      };
    });

    return planRevenue;
  } catch (error) {
    console.error('Error calculating revenue by plan:', error);
    throw error;
  }
};

const getRevenueForDateRange = async (startDate, endDate) => {
  try {
    // Ensure dates are in UTC
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);

    const monthlyRevenues = [];
    const currentDate = new Date(start);

    while (currentDate <= end) {
      const year = currentDate.getUTCFullYear();
      const month = currentDate.getUTCMonth() + 1;
      
      const monthlyRevenue = await calculateMonthlyRevenue(year, month);
      monthlyRevenues.push(monthlyRevenue);
      
      currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
    }

    // Calculate totals for the date range
    const totals = monthlyRevenues.reduce((acc, curr) => ({
      totalRevenue: acc.totalRevenue + curr.totalRevenue,
      cashRevenue: acc.cashRevenue + curr.cashRevenue,
      onlineRevenue: acc.onlineRevenue + curr.onlineRevenue,
      newSubscriptionsCount: acc.newSubscriptionsCount + curr.newSubscriptionsCount,
      renewalsCount: acc.renewalsCount + curr.renewalsCount
    }), {
      totalRevenue: 0,
      cashRevenue: 0,
      onlineRevenue: 0,
      newSubscriptionsCount: 0,
      renewalsCount: 0
    });

    return {
      monthlyRevenues,
      totals,
      startDate: start,
      endDate: end
    };
  } catch (error) {
    console.error('Error getting revenue for date range:', error);
    throw error;
  }
};

module.exports = { 
  checkExpiredSubscriptions,
  calculateMonthlyRevenue,
  getRevenueForDateRange
}; 