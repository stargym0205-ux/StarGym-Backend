require('dotenv').config();
const cloudinary = require('cloudinary').v2;

// Log environment variables
console.log('Environment variables:');
console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? '***' : 'missing');
console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '***' : 'missing');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Test simple API call
console.log('Testing Cloudinary API...');
cloudinary.api.ping()
  .then(result => {
    console.log('Cloudinary API ping successful:', result);
  })
  .catch(error => {
    console.error('Cloudinary API ping failed:', error);
  }); 