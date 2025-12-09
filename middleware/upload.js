const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Pick a writable directory (serverless platforms only allow /tmp)
const uploadDir =
  process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'uploads');

// Lazily create the directory when needed; ignore failures on read-only FS
const ensureUploadDir = () => {
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('Created uploads directory:', uploadDir);
    }

    // Quick write test to surface permissions issues early
    const testFile = path.join(uploadDir, '.test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch (error) {
    console.warn(
      'Uploads directory not writable; continuing with memory storage only:',
      error.message
    );
  }
};

ensureUploadDir();

// Configure multer for memory storage
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 * 1024, // 100GB (effectively no limit for photos)
    files: 1
  },
  fileFilter: function (req, file, cb) {
    console.log('Processing file upload:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      console.log('File accepted:', file.originalname);
      return cb(null, true);
    } else {
      console.log('Invalid file type:', file.originalname);
      cb(new Error('Only .jpg, .jpeg, and .png files are allowed!'));
    }
  }
});

// Error handling middleware
const handleUploadError = (err, req, res, next) => {
  console.error('Upload error:', err);
  
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      status: 'error',
      message: err.message || 'Error uploading file'
    });
  } else if (err) {
    return res.status(400).json({
      status: 'error',
      message: err.message || 'Error uploading file'
    });
  }
  next();
};

module.exports = { upload, handleUploadError }; 