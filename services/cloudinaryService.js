const cloudinary = require('../config/cloudinaryConfig');

const uploadToCloudinary = async (fileBuffer, fileType) => {
  try {
    // Convert buffer to base64
    const b64 = Buffer.from(fileBuffer).toString('base64');
    const dataURI = `data:${fileType};base64,${b64}`;
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'gym-users',
      resource_type: 'auto'
    });
    
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Error uploading image to cloud storage');
  }
};

const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error('Error deleting image from cloud storage');
  }
};

module.exports = { uploadToCloudinary, deleteFromCloudinary }; 