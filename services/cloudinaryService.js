const cloudinary = require('../config/cloudinaryConfig');

const uploadToCloudinary = async (fileBuffer, fileType) => {
  try {
    // Validate inputs
    if (!fileBuffer || !fileType) {
      console.error('Invalid inputs to uploadToCloudinary:', { 
        hasBuffer: !!fileBuffer, 
        fileType 
      });
      throw new Error('Invalid file data provided');
    }

    // Log file details
    console.log('File details:', {
      bufferSize: fileBuffer.length,
      fileType,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME
    });

    // Convert buffer to base64
    const b64 = Buffer.from(fileBuffer).toString('base64');
    const dataURI = `data:${fileType};base64,${b64}`;
    
    console.log('Attempting to upload to Cloudinary with file type:', fileType);
    
    // Upload to Cloudinary with explicit options
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'gym-users',
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true
    });
    
    console.log('Cloudinary upload successful:', result.secure_url);
    return result.secure_url;
  } catch (error) {
    // Log detailed error information
    console.error('Cloudinary upload error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      http_code: error.http_code,
      stack: error.stack
    });
    
    // Check for specific error types
    if (error.http_code === 401) {
      throw new Error('Cloudinary authentication failed. Please check your API credentials.');
    } else if (error.http_code === 413) {
      throw new Error('File size too large for Cloudinary upload.');
    } else if (error.http_code === 400) {
      throw new Error('Invalid file format or data for Cloudinary upload.');
    }
    
    throw new Error(`Error uploading image to cloud storage: ${error.message}`);
  }
};

const uploadPDFToCloudinary = async (pdfBuffer, fileName) => {
  try {
    // Validate inputs
    if (!pdfBuffer || !fileName) {
      console.error('Invalid inputs to uploadPDFToCloudinary:', { 
        hasBuffer: !!pdfBuffer, 
        fileName 
      });
      throw new Error('Invalid PDF data provided');
    }

    // Log file details
    console.log('PDF details:', {
      bufferSize: pdfBuffer.length,
      fileName,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME
    });

    // Convert buffer to base64
    const b64 = Buffer.from(pdfBuffer).toString('base64');
    const dataURI = `data:application/pdf;base64,${b64}`;
    
    console.log('Attempting to upload PDF to Cloudinary');
    
    // Upload PDF to Cloudinary with specific options
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'gym-receipts',
      public_id: fileName.replace('.pdf', ''),
      resource_type: 'raw',
      format: 'pdf',
      use_filename: true,
      unique_filename: true
    });
    
    console.log('PDF upload successful:', result.secure_url);
    return result;
  } catch (error) {
    // Log detailed error information
    console.error('Cloudinary PDF upload error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      http_code: error.http_code,
      stack: error.stack
    });
    
    // Check for specific error types
    if (error.http_code === 401) {
      throw new Error('Cloudinary authentication failed. Please check your API credentials.');
    } else if (error.http_code === 413) {
      throw new Error('PDF file size too large for Cloudinary upload.');
    } else if (error.http_code === 400) {
      throw new Error('Invalid PDF format or data for Cloudinary upload.');
    }
    
    throw new Error(`Error uploading PDF to cloud storage: ${error.message}`);
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

module.exports = { uploadToCloudinary, uploadPDFToCloudinary, deleteFromCloudinary }; 