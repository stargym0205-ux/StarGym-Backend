require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const errorHandler = require('./middleware/error');
const path = require('path');
const fs = require('fs');
const os = require('os');
const authRoutes = require('./routes/authRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const sendEmail = require('./services/emailService');
const { checkExpiredSubscriptions } = require('./services/subscriptionService');
const healthRoutes = require('./routes/healthRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

const app = express();

// CORS configuration - Support multiple production domains
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://gym-frontend-hz0n.onrender.com',
  'https://stargym.netlify.app',
  'https://starfitnesspetlad.netlify.app',
  'https://stargympetlad.netlify.app'
];

// Add environment-specific origins
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
if (process.env.NETLIFY_URL) {
  allowedOrigins.push(process.env.NETLIFY_URL);
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // In development, allow all origins
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Add headers for all responses (CORS middleware handles this, but keep for compatibility)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development') {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

app.use(morgan('dev'));

// Create a writable uploads directory (use /tmp on serverless)
const uploadsDir =
  process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (error) {
  console.warn(
    'Uploads directory not writable; proceeding with memory storage only:',
    error.message
  );
}

// Database connection
connectDB();

// Test root route
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Gym Management API is running',
    timestamp: new Date().toISOString()
  });
});

// Mount routes
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/settings', settingsRoutes);

// Receipt download endpoint
const { generateReceiptForDownload, generateAllMembersPDF } = require('./services/pdfService');
const User = require('./models/User');
const { protect } = require('./middleware/auth');

// Health check for receipt service
app.get('/api/receipt/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'Receipt service is running',
    timestamp: new Date().toISOString()
  });
});

// Handle OPTIONS preflight for receipt download
app.options('/api/receipt/download/:userId', (req, res) => {
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://stargympetlad.netlify.app',
    'https://stargym.netlify.app',
    'https://starfitnesspetlad.netlify.app'
  ];
  const origin = req.headers.origin;
  let allowedOrigin = '*';
  if (origin && allowedOrigins.includes(origin)) {
    allowedOrigin = origin;
  } else if (origin && process.env.NODE_ENV === 'development') {
    allowedOrigin = origin;
  } else if (!origin) {
    const protocol = req.protocol || 'https';
    const host = req.get('host') || req.headers.host;
    if (host) {
      allowedOrigin = `${protocol}://${host}`;
    }
  }
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (allowedOrigin !== '*') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.status(204).send();
});

app.get('/api/receipt/download/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('Receipt download requested for user ID:', userId);
    console.log('Request origin:', req.headers.origin || 'Direct access (no origin - likely from email)');
    console.log('Request referer:', req.headers.referer || 'No referer');
    console.log('User-Agent:', req.headers['user-agent'] || 'Unknown');
    console.log('Request URL:', req.url);
    console.log('Request method:', req.method);
    console.log('Request host:', req.get('host') || req.headers.host);
    
    // Find the user
    const user = await User.findById(userId);
    console.log('User found:', user ? 'Yes' : 'No');
    
    if (!user) {
      console.log('User not found in database');
      // Set CORS headers even for errors
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
        userId: userId
      });
    }
    
    console.log('Generating PDF for user:', user.name);
    
    // Generate PDF on-demand with timeout
    console.log('Starting PDF generation...');
    const pdfBuffer = await Promise.race([
      generateReceiptForDownload(user),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PDF generation timeout')), 30000)
      )
    ]);
    
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF is empty');
    }
    
    console.log('PDF generated successfully, size:', pdfBuffer.length, 'bytes');
    
    // Determine allowed origin - support both localhost and production
    // If no origin (direct access from email), use the request host
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://stargympetlad.netlify.app',
      'https://stargym.netlify.app',
      'https://starfitnesspetlad.netlify.app'
    ];
    const origin = req.headers.origin;
    
    // For direct access (no origin - from email links), allow all origins
    // This is critical for email links to work properly
    let allowedOrigin = '*'; // Default to allow all for direct downloads from email
    if (origin && allowedOrigins.includes(origin)) {
      allowedOrigin = origin;
    } else if (origin && process.env.NODE_ENV === 'development') {
      // In development, allow any origin
      allowedOrigin = origin;
    }
    // For email links (no origin), we keep '*' to allow the download
    
    // Set headers for PDF download - CRITICAL ORDER: Set download headers FIRST
    // This ensures the browser treats it as a download, not a navigation
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${user._id}.pdf"; filename*=UTF-8''receipt-${user._id}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    // Additional headers to force download behavior and prevent redirects
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Transfer-Encoding', 'binary');
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Set CORS headers - allow direct access from email links
    // Note: When using '*', we cannot use credentials, but for direct downloads this is fine
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type');
    // Only set credentials if we have a specific origin (not '*')
    if (allowedOrigin !== '*') {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Send the PDF directly - no redirects, no JSON wrapper
    // Express res.send() handles Buffer correctly for binary data
    res.send(pdfBuffer);
    console.log('PDF sent successfully. Origin:', origin || 'Direct access (email)', 'Allowed origin:', allowedOrigin);
  } catch (error) {
    console.error('Error serving receipt:', error);
    console.error('Error stack:', error.stack);
    
    // Set CORS headers even for errors
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://stargympetlad.netlify.app',
      'https://stargym.netlify.app',
      'https://starfitnesspetlad.netlify.app'
    ];
    const origin = req.headers.origin;
    let allowedOrigin = '*';
    if (origin && allowedOrigins.includes(origin)) {
      allowedOrigin = origin;
    } else if (origin && process.env.NODE_ENV === 'development') {
      allowedOrigin = origin;
    } else if (!origin) {
      // Direct access from email - construct origin from request
      const protocol = req.protocol || 'https';
      const host = req.get('host') || req.headers.host;
      if (host) {
        allowedOrigin = `${protocol}://${host}`;
      }
    }
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (allowedOrigin !== '*') {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate receipt',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Preview receipt endpoint (serves PDF inline for viewing in browser)
app.get('/api/receipt/preview/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('Receipt preview requested for user ID:', userId);
    
    // Find the user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
        userId: userId
      });
    }
    
    console.log('Generating PDF for preview, user:', user.name);
    
    // Generate PDF on-demand with timeout
    const pdfBuffer = await Promise.race([
      generateReceiptForDownload(user),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PDF generation timeout')), 30000)
      )
    ]);
    
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF is empty');
    }
    
    console.log('PDF generated successfully for preview, size:', pdfBuffer.length, 'bytes');
    
    // Determine allowed origin
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://stargympetlad.netlify.app',
      'https://stargym.netlify.app',
      'https://starfitnesspetlad.netlify.app'
    ];
    const origin = req.headers.origin;
    const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    
    // Set headers for PDF preview (inline instead of attachment)
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${user._id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Cache-Control', 'no-cache');
    
    // Send the PDF
    res.send(pdfBuffer);
    console.log('PDF preview sent successfully to origin:', allowedOrigin);
  } catch (error) {
    console.error('Error serving receipt preview:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      userId: req.params.userId
    });
    
    // Set CORS headers even for errors
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://stargympetlad.netlify.app',
      'https://stargym.netlify.app',
      'https://starfitnesspetlad.netlify.app'
    ];
    const origin = req.headers.origin;
    const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate receipt preview',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Download all members PDF endpoint (protected)
app.get('/api/members/download-pdf', protect, async (req, res) => {
  try {
    console.log('All members PDF download requested');
    
    // Fetch all users
    const users = await User.find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .lean();
    
    if (!users || users.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No members found'
      });
    }
    
    console.log(`Generating PDF for ${users.length} members`);
    
    // Generate PDF
    const pdfBuffer = await generateAllMembersPDF(users);
    console.log('PDF generated successfully, size:', pdfBuffer.length);
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `all-members-report-${timestamp}.pdf`;
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'https://stargympetlad.netlify.app');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Send the PDF
    res.send(pdfBuffer);
    console.log('PDF sent successfully');
  } catch (error) {
    console.error('Error generating all members PDF:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate members report',
      error: error.message
    });
  }
});

// Test endpoint to check if user exists
app.get('/api/receipt/test/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('Testing user ID:', userId);
    
    const user = await User.findById(userId);
    if (!user) {
      return res.json({
        status: 'error',
        message: 'User not found',
        userId: userId
      });
    }
    
    res.json({
      status: 'success',
      message: 'User found',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        subscriptionStatus: user.subscriptionStatus
      }
    });
  } catch (error) {
    console.error('Error testing user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Database error',
      error: error.message
    });
  }
});

// Receipt verification endpoint
app.get('/verify/:receiptNumber', (req, res) => {
  const { receiptNumber } = req.params;
  
  // Simple verification page
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Receipt Verification - StarGym</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          margin: 0;
          padding: 20px;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .verification-card {
          background: white;
          border-radius: 15px;
          padding: 40px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 500px;
          width: 100%;
        }
        .logo {
          font-size: 2.5rem;
          font-weight: bold;
          color: #1f2937;
          margin-bottom: 10px;
        }
        .tagline {
          color: #6b7280;
          margin-bottom: 30px;
        }
        .status {
          background: #10b981;
          color: white;
          padding: 15px 30px;
          border-radius: 50px;
          font-size: 1.2rem;
          font-weight: bold;
          margin: 20px 0;
          display: inline-block;
        }
        .receipt-info {
          background: #f3f4f6;
          padding: 20px;
          border-radius: 10px;
          margin: 20px 0;
        }
        .receipt-number {
          font-family: 'Courier New', monospace;
          font-size: 1.1rem;
          color: #1f2937;
          font-weight: bold;
        }
        .footer {
          margin-top: 30px;
          color: #6b7280;
          font-size: 0.9rem;
        }
        .icon {
          font-size: 3rem;
          margin-bottom: 20px;
        }
      </style>
    </head>
    <body>
      <div class="verification-card">
        <div class="logo">STARGYM</div>
        <div class="tagline">Fitness & Wellness Center</div>
        
        <div class="icon">✅</div>
        
        <div class="status">RECEIPT VERIFIED</div>
        
        <div class="receipt-info">
          <div class="receipt-number">Receipt Number: ${receiptNumber}</div>
          <p>This receipt has been successfully verified and is valid.</p>
        </div>
        
        <div class="footer">
          <p>Thank you for choosing StarGym!</p>
          <p>For any queries, contact us at stargym0205@gmail.com</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  res.send(html);
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Add a route for the test upload page
app.get('/test-upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-upload.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error'
  });
});

// 404 handler - use a simple string path
app.use('/404', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: 'Route not found'
  });
});

// Catch-all route handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});

// Check subscriptions every day at midnight
const scheduleSubscriptionCheck = () => {
  const now = new Date();
  const night = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // tomorrow
    0, 0, 0 // midnight
  );
  const timeToMidnight = night.getTime() - now.getTime();

  setTimeout(() => {
    checkExpiredSubscriptions();
    // Run every 24 hours
    setInterval(checkExpiredSubscriptions, 24 * 60 * 60 * 1000);
  }, timeToMidnight);
};

scheduleSubscriptionCheck();

const PORT = process.env.PORT || 3000;
console.log('Starting server...');
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', PORT);
console.log('MongoDB URI exists:', !!process.env.MONGODB_URI);

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Server URL: http://localhost:${PORT}`);
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION!');
  console.log(err.name, err.message);
  process.exit(1);
});
