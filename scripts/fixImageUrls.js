const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const updateImageUrls = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all users
    const users = await User.find();
    console.log(`Found ${users.length} users`);

    // Update each user's photo URL if it contains old domains
    let updatedCount = 0;
    const oldDomains = [
      'gym-backend-mz5w.onrender.com',
      'gym-backend-hz0n.onrender.com',
      'gym-backend-kohl.vercel.app',
      'gym-backend-ochre-three.vercel.app'
    ];
    const newDomain = 'star-gym-backend.vercel.app';
    
    for (const user of users) {
      if (user.photo) {
        let updated = false;
        let newUrl = user.photo;
        
        for (const oldDomain of oldDomains) {
          if (user.photo.includes(oldDomain)) {
            newUrl = user.photo.replace(`https://${oldDomain}`, `https://${newDomain}`);
            updated = true;
            break;
          }
        }
        
        if (updated) {
          user.photo = newUrl;
          await user.save();
          updatedCount++;
          console.log(`Updated user ${user._id}: ${newUrl}`);
        }
      }
    }

    console.log(`Updated ${updatedCount} users`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

updateImageUrls(); 