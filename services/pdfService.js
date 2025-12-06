const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');
const QRCode = require('qrcode');
const { uploadPDFToCloudinary } = require('./cloudinaryService');

// UPI Payment details - can be configured via environment variables
// Note: Make sure .env file is loaded before this module is imported
const PAYEE_VPA = process.env.UPI_VPA || process.env.GPAY_VPA || '';
const PAYEE_NAME = process.env.UPI_PAYEE_NAME || 'StarGym';

// Log UPI configuration on module load (for debugging)
if (!PAYEE_VPA || PAYEE_VPA === '') {
  console.warn('⚠️  UPI_VPA not found in environment variables. Payment QR codes will not work.');
  console.warn('   Please set UPI_VPA in your .env file (e.g., UPI_VPA=yourname@paytm)');
} else {
  console.log('✅ UPI_VPA configured:', PAYEE_VPA);
}

// Helper function to build UPI payment intent
const buildUpiIntent = ({ amount, note }) => {
  if (!PAYEE_VPA || PAYEE_VPA === '' || PAYEE_VPA === 'yourupi@paytm') {
    throw new Error('UPI_VPA is not configured. Please set UPI_VPA in .env file (e.g., UPI_VPA=yourname@paytm)');
  }
  
  const encodedNote = encodeURIComponent(note || 'Gym Membership Payment');
  const encodedVPA = encodeURIComponent(PAYEE_VPA.trim());
  const encodedName = encodeURIComponent(PAYEE_NAME.trim());
  
  // UPI payment format: upi://pay?pa=<VPA>&pn=<Name>&am=<Amount>&cu=<Currency>&tn=<Note>
  // Important: First parameter uses ? and subsequent use &
  const upiIntent = `upi://pay?pa=${encodedVPA}&pn=${encodedName}&am=${amount.toFixed(2)}&cu=INR&tn=${encodedNote}`;
  
  console.log('📱 Generated UPI Intent:', upiIntent); // Debug log
  return upiIntent;
};

// Helper function to get plan display name
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

// Helper function to get plan amount
const getPlanAmount = (plan) => {
  const planPrices = {
    '1month': 1500,
    '2month': 2500,
    '3month': 3500,
    '6month': 5000,
    'yearly': 8000
  };
  return planPrices[plan] || 0;
};

// Helper function to format Indian currency with proper rupee symbol
// Using proper ₹ symbol with Unicode support
const formatIndianPrice = (amount) => {
  // Format number with Indian numbering system (lakhs, crores)
  const formattedAmount = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
  // Return with proper rupee symbol ₹
  return `₹ ${formattedAmount}`;
};

const generateReceipt = async (user) => {
  try {
    const doc = new PDFDocument({ 
      size: 'A4',
      margin: 50,
      info: {
        Title: 'StarGym Membership Receipt',
        Author: 'StarGym',
        Subject: 'Membership Payment Receipt',
        Creator: 'StarGym Management System'
      },
      // Ensure proper Unicode support for rupee symbol
      autoFirstPage: true
    });
    
    // Create unique filename for Cloudinary
    const fileName = `receipt-${user._id.toString()}-${Date.now()}.pdf`;
    
    // Create a buffer to store the PDF data
    const chunks = [];
    
    // Pipe the PDF document to collect chunks
    doc.on('data', chunk => chunks.push(chunk));

    // Colors
    const primaryColor = '#1f2937'; // Dark gray
    const accentColor = '#f59e0b'; // Amber
    const lightGray = '#f3f4f6';
    const darkGray = '#6b7280';

    // Header Section
    doc
      .rect(0, 0, doc.page.width, 120)
      .fill(primaryColor);

    // Company Logo/Name
    doc
      .fillColor('white')
      .fontSize(28)
      .font('Helvetica-Bold')
      .text('STARGYM', 50, 30, { align: 'left' });

    // Tagline
    doc
      .fontSize(12)
      .font('Helvetica')
      .text('Fitness & Wellness Center', 50, 60);

    // Receipt Title
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('MEMBERSHIP RECEIPT', 0, 80, { align: 'center' });

    // Receipt Number and Date
    const receiptNumber = `RCP-${user._id.toString().slice(-6).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    const currentDate = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const currentTime = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    doc
      .fillColor(primaryColor)
      .fontSize(10)
      .font('Helvetica')
      .text(`Receipt No: ${receiptNumber}`, 50, 150)
      .text(`Date: ${currentDate}`, 50, 165)
      .text(`Time: ${currentTime}`, 50, 180);

    // Member Information Section
    doc
      .fillColor(accentColor)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('MEMBER INFORMATION', 50, 210)
      .moveTo(50, 228)
      .lineTo(doc.page.width - 50, 228)
      .stroke(accentColor, 1);

    // Member details table with better formatting
    const memberDetails = [
      ['Member Name:', user.name || 'N/A'],
      ['Email:', user.email || 'N/A'],
      ['Phone:', user.phone || 'N/A'],
      ['Member ID:', `MEM-${user._id.toString().slice(-8).toUpperCase()}`],
      ['Gender:', user.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : 'N/A']
    ];

    let yPosition = 245;
    memberDetails.forEach(([label, value]) => {
      doc
        .fillColor(darkGray)
        .fontSize(11)
        .font('Helvetica')
        .text(label, 50, yPosition)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(value, 200, yPosition, { width: 300 });
      yPosition += 22;
    });

    // Membership Details Section
    doc
      .fillColor(accentColor)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('MEMBERSHIP DETAILS', 50, yPosition + 15)
      .moveTo(50, yPosition + 33)
      .lineTo(doc.page.width - 50, yPosition + 33)
      .stroke(accentColor, 1);

    const planAmount = getPlanAmount(user.plan);
    const planName = getPlanDisplayName(user.plan);
    const startDate = new Date(user.startDate).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const endDate = new Date(user.endDate).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const membershipDetails = [
      ['Plan:', planName],
      ['Start Date:', startDate],
      ['End Date:', endDate],
      ['Payment Method:', user.paymentMethod === 'online' ? 'Online Payment' : 'Cash Payment'],
      ['Payment Status:', 'Confirmed']
    ];

    yPosition += 50;
    membershipDetails.forEach(([label, value]) => {
      doc
        .fillColor(darkGray)
        .fontSize(11)
        .font('Helvetica')
        .text(label, 50, yPosition)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(value, 200, yPosition, { width: 300 });
      yPosition += 22;
    });

    // Amount Box - Enhanced with better formatting and Payment QR Code
    const amountBoxY = yPosition + 25;
    
    // Payment QR Code Section (on the left)
    try {
      // Generate UPI Payment QR Code
      if (!PAYEE_VPA || PAYEE_VPA === '' || PAYEE_VPA === 'yourupi@paytm') {
        console.warn('⚠️  UPI_VPA not configured. Payment QR code will not be generated.');
        console.warn('   Please set UPI_VPA in your .env file (e.g., UPI_VPA=yourname@paytm)');
        throw new Error('UPI_VPA not configured');
      }
      
      const upiIntent = buildUpiIntent({
        amount: planAmount,
        note: `StarGym ${planName} - ${user.name}`
      });
      
      console.log('Generated UPI Intent for QR:', upiIntent.substring(0, 80) + '...'); // Debug log
      
      const paymentQRCodeDataURL = await QRCode.toDataURL(upiIntent, {
        width: 120,
        margin: 2,
        color: {
          dark: accentColor,
          light: '#FFFFFF'
        }
      });

      // Payment QR Code Box
      doc
        .rect(50, amountBoxY - 15, 140, 140)
        .fill('#FFFFFF')
        .stroke(accentColor, 2);

      // Add Payment QR Code to PDF
      doc.image(paymentQRCodeDataURL, 60, amountBoxY - 5, { width: 120, height: 120 });
      
      // Payment QR Code labels
      doc
        .fillColor(primaryColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('PAYMENT QR CODE', 50, amountBoxY + 110, { align: 'center', width: 140 });
      
      doc
        .fillColor(darkGray)
        .fontSize(8)
        .font('Helvetica')
        .text('Scan to pay via UPI', 50, amountBoxY + 125, { align: 'center', width: 140 });
      
      // UPI ID display
      doc
        .fillColor(darkGray)
        .fontSize(7)
        .font('Helvetica')
        .text(`UPI ID: ${PAYEE_VPA}`, 50, amountBoxY + 138, { align: 'center', width: 140 });
    } catch (qrError) {
      console.warn('Payment QR Code generation failed:', qrError);
      // Continue without payment QR code if generation fails
    }

    // Amount Box (on the right)
    doc
      .rect(350, amountBoxY - 15, 200, 90)
      .fill(lightGray)
      .stroke(accentColor, 2);

    doc
      .fillColor(primaryColor)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('TOTAL AMOUNT PAID', 360, amountBoxY, { align: 'center', width: 180 });

    doc
      .fillColor(accentColor)
      .fontSize(28)
      .font('Helvetica-Bold')
      .text(formatIndianPrice(planAmount), 360, amountBoxY + 25, { align: 'center', width: 180 });

    // Generate Verification QR Code (smaller, below amount box)
    try {
      const qrData = {
        receiptNumber,
        memberId: user._id.toString(),
        memberName: user.name,
        plan: planName,
        amount: planAmount,
        date: currentDate,
        verificationUrl: `https://stargym.com/verify/${receiptNumber}`
      };
      
      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
        width: 80,
        margin: 2,
        color: {
          dark: primaryColor,
          light: '#FFFFFF'
        }
      });

      // Add Verification QR Code to PDF (below amount box)
      doc.image(qrCodeDataURL, 380, amountBoxY + 85, { width: 60, height: 60 });
      
      // QR Code label
      doc
        .fillColor(darkGray)
        .fontSize(7)
        .font('Helvetica')
        .text('Verify Receipt', 380, amountBoxY + 148, { align: 'center', width: 60 });
    } catch (qrError) {
      console.warn('Verification QR Code generation failed:', qrError);
      // Continue without QR code if generation fails
    }

    // Terms and Conditions
    const termsY = amountBoxY + 160;
    doc
      .fillColor(primaryColor)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('TERMS & CONDITIONS', 50, termsY);

    const terms = [
      '• This receipt is valid for the membership period mentioned above.',
      '• Membership is non-transferable and non-refundable.',
      '• Please bring this receipt for any membership-related queries.',
      '• For any issues, contact us at support@stargym.com'
    ];

    doc
      .fillColor(darkGray)
      .fontSize(9)
      .font('Helvetica')
      .text(terms.join('\n'), 50, termsY + 20, {
        width: 500,
        lineGap: 5
      });

    // Footer
    const footerY = doc.page.height - 100;
    doc
      .rect(0, footerY, doc.page.width, 100)
      .fill(lightGray);

    doc
      .fillColor(primaryColor)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Thank you for choosing StarGym!', 0, footerY + 20, { align: 'center' });

    doc
      .fillColor(darkGray)
      .fontSize(10)
      .font('Helvetica')
      .text('This is a computer-generated receipt. No signature required.', 0, footerY + 40, { align: 'center' });

    // Contact Information
    doc
      .text('Contact: +91 98765 43210 | Email: info@stargym.com', 0, footerY + 60, { align: 'center' })
      .text('Address: 123 Fitness Street, Petlad, Gujarat 388450', 0, footerY + 75, { align: 'center' });

    // Finalize the PDF and wait for completion
    await new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
      doc.end();
    });

    // Combine chunks into a buffer
    const pdfBuffer = Buffer.concat(chunks);
    
    // Return a download endpoint URL instead of base64 data
    // The PDF will be generated on-demand when the endpoint is accessed
    return `/api/receipt/download/${user._id.toString()}`;
  } catch (error) {
    console.error('Error generating receipt:', error);
    throw error;
  }
};

// Function to generate PDF on-demand for download
const generateReceiptForDownload = async (user) => {
  try {
    const doc = new PDFDocument({ 
      size: 'A4',
      margin: 40,
      info: {
        Title: 'StarGym Membership Receipt',
        Author: 'StarGym',
        Subject: 'Membership Payment Receipt',
        Creator: 'StarGym Management System'
      },
      // Ensure proper Unicode support for rupee symbol
      autoFirstPage: true
    });
    
    // Create a buffer to store the PDF data
    const chunks = [];
    
    // Pipe the PDF document to collect chunks
    doc.on('data', chunk => chunks.push(chunk));

    // Enhanced Color Palette - Professional and Modern
    const primaryColor = '#0f172a'; // Deep slate
    const accentColor = '#f59e0b'; // Amber/Gold
    const secondaryColor = '#3b82f6'; // Blue
    const lightGray = '#f8fafc';
    const mediumGray = '#e2e8f0';
    const darkGray = '#64748b';
    const successColor = '#10b981'; // Green
    const white = '#ffffff';

    // ==================== ENHANCED HEADER SECTION ====================
    const headerHeight = 140;
    doc
      .rect(0, 0, doc.page.width, headerHeight)
      .fill(primaryColor);

    // Decorative accent line
    doc
      .rect(0, headerHeight - 5, doc.page.width, 5)
      .fill(accentColor);

    // Company Name - Larger and more prominent
    doc
      .fontSize(36)
      .fillColor(white)
      .font('Helvetica-Bold')
      .text('STAR GYM', 40, 35, { align: 'left' });

    // Tagline with better spacing
    doc
      .fontSize(13)
      .fillColor(mediumGray)
      .font('Helvetica')
      .text('Fitness & Wellness Center', 40, 75);

    // Receipt Title - Centered and prominent
    doc
      .fontSize(28)
      .fillColor(white)
      .font('Helvetica-Bold')
      .text('MEMBERSHIP RECEIPT', 0, 100, { align: 'center' });

    // ==================== RECEIPT INFO SECTION ====================
    let yPos = headerHeight + 30;
    
    // Receipt Info Box - Professional card design
    const receiptNumber = `RCP-${user._id.toString().slice(-8).toUpperCase()}`;
    const memberId = `MEM-${user._id.toString().slice(-8).toUpperCase()}`;
    const currentDate = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const currentTime = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // Info boxes with better visual design
    const infoBoxWidth = (doc.page.width - 100) / 2;
    const infoBoxHeight = 80;
    
    // Left Info Box
    doc
      .rect(40, yPos, infoBoxWidth, infoBoxHeight)
      .fill(lightGray)
      .stroke(mediumGray, 1);
    
    doc
      .fontSize(9)
      .fillColor(darkGray)
      .font('Helvetica')
      .text('Receipt Number', 50, yPos + 15)
      .fontSize(12)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text(receiptNumber, 50, yPos + 30, { width: infoBoxWidth - 20 })
      .fontSize(9)
      .fillColor(darkGray)
      .font('Helvetica')
      .text('Date & Time', 50, yPos + 55)
      .fontSize(10)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text(`${currentDate}`, 50, yPos + 65, { width: infoBoxWidth - 20 });

    // Right Info Box
    doc
      .rect(60 + infoBoxWidth, yPos, infoBoxWidth, infoBoxHeight)
      .fill(lightGray)
      .stroke(mediumGray, 1);
    
    doc
      .fontSize(9)
      .fillColor(darkGray)
      .font('Helvetica')
      .text('Member ID', 70 + infoBoxWidth, yPos + 15)
      .fontSize(12)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text(memberId, 70 + infoBoxWidth, yPos + 30, { width: infoBoxWidth - 20 })
      .fontSize(9)
      .fillColor(darkGray)
      .font('Helvetica')
      .text('Time', 70 + infoBoxWidth, yPos + 55)
      .fontSize(10)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text(currentTime, 70 + infoBoxWidth, yPos + 65, { width: infoBoxWidth - 20 });

    yPos += infoBoxHeight + 30;

    // ==================== MEMBER INFORMATION SECTION ====================
    // Section Header with accent
    doc
      .rect(40, yPos, doc.page.width - 80, 30)
      .fill(accentColor);
    
    doc
      .fontSize(16)
      .fillColor(white)
      .font('Helvetica-Bold')
      .text('MEMBER INFORMATION', 50, yPos + 8);

    yPos += 40;

    // Member Info Card - Spacious design
    const memberCardY = yPos;
    doc
      .rect(40, memberCardY, doc.page.width - 80, 140)
      .fill(white)
      .stroke(mediumGray, 1);

    // Member details with better spacing
    const memberDetails = [
      { label: 'Full Name', value: user.name || 'N/A' },
      { label: 'Email Address', value: user.email || 'N/A' },
      { label: 'Phone Number', value: user.phone || 'N/A' },
      { label: 'Gender', value: user.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : 'N/A' },
      { label: 'Membership Plan', value: getPlanDisplayName(user.plan) }
    ];

    let detailY = memberCardY + 20;
    memberDetails.forEach((detail, index) => {
      doc
        .fontSize(10)
        .fillColor(darkGray)
        .font('Helvetica')
        .text(detail.label + ':', 50, detailY)
        .fontSize(11)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(detail.value, 200, detailY, { width: 320 });
      detailY += 24;
    });

    yPos = memberCardY + 150;

    // ==================== MEMBERSHIP DETAILS SECTION ====================
    // Section Header
    doc
      .rect(40, yPos, doc.page.width - 80, 30)
      .fill(secondaryColor);
    
    doc
      .fontSize(16)
      .fillColor(white)
      .font('Helvetica-Bold')
      .text('MEMBERSHIP DETAILS', 50, yPos + 8);

    yPos += 40;

    // Membership Details Card
    const membershipCardY = yPos;
    doc
      .rect(40, membershipCardY, doc.page.width - 80, 130)
      .fill(white)
      .stroke(mediumGray, 1);

    const startDate = new Date(user.startDate).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const endDate = new Date(user.endDate).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const amount = getPlanAmount(user.plan);
    const formattedAmount = formatIndianPrice(amount);

    const membershipDetails = [
      { label: 'Plan Duration', value: getPlanDisplayName(user.plan) },
      { label: 'Start Date', value: startDate },
      { label: 'End Date', value: endDate },
      { label: 'Payment Method', value: user.paymentMethod === 'online' ? 'Online Payment' : 'Cash Payment' },
      { label: 'Status', value: 'Active', color: successColor }
    ];

    let membershipY = membershipCardY + 20;
    membershipDetails.forEach((detail) => {
      doc
        .fontSize(10)
        .fillColor(darkGray)
        .font('Helvetica')
        .text(detail.label + ':', 50, membershipY)
        .fontSize(11)
        .fillColor(detail.color || primaryColor)
        .font('Helvetica-Bold')
        .text(detail.value, 200, membershipY, { width: 320 });
      membershipY += 24;
    });

    yPos = membershipCardY + 140;

    // ==================== PAYMENT & AMOUNT SECTION ====================
    yPos += 20;
    
    // Two-column layout for QR Code and Amount
    const leftColumnX = 40;
    const rightColumnX = 340;
    const columnWidth = 240;
    const sectionHeight = 200;

    // Left Column - Payment QR Code (if available)
    try {
      if (!PAYEE_VPA || PAYEE_VPA === '' || PAYEE_VPA === 'yourupi@paytm') {
        throw new Error('UPI_VPA not configured');
      }
      
      const upiIntent = buildUpiIntent({
        amount: amount,
        note: `StarGym ${getPlanDisplayName(user.plan)} - ${user.name}`
      });
      
      const paymentQRCodeDataURL = await QRCode.toDataURL(upiIntent, {
        width: 150,
        margin: 3,
        color: {
          dark: accentColor,
          light: white
        }
      });

      // QR Code Card with enhanced design
      doc
        .rect(leftColumnX, yPos, columnWidth, sectionHeight)
        .fill(white)
        .stroke(accentColor, 2);

      // QR Code Header
      doc
        .rect(leftColumnX, yPos, columnWidth, 35)
        .fill(accentColor);
      
      doc
        .fontSize(12)
        .fillColor(white)
        .font('Helvetica-Bold')
        .text('PAYMENT QR CODE', leftColumnX + 10, yPos + 12);

      // QR Code Image
      doc.image(paymentQRCodeDataURL, leftColumnX + 45, yPos + 50, { width: 150, height: 150 });
      
      // QR Code Footer
      doc
        .fontSize(9)
        .fillColor(darkGray)
        .font('Helvetica')
        .text('Scan to pay via UPI', leftColumnX + 10, yPos + 170, { width: columnWidth - 20, align: 'center' });
      
      doc
        .fontSize(8)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(`UPI: ${PAYEE_VPA}`, leftColumnX + 10, yPos + 185, { width: columnWidth - 20, align: 'center' });
    } catch (qrError) {
      // If QR code fails, create a placeholder or skip
      console.warn('Payment QR Code generation failed:', qrError);
    }

    // Right Column - Amount Box (Enhanced)
    const amountBoxY = yPos;
    doc
      .rect(rightColumnX, amountBoxY, columnWidth, sectionHeight)
      .fill(lightGray)
      .stroke(accentColor, 3);

    // Amount Header
    doc
      .rect(rightColumnX, amountBoxY, columnWidth, 50)
      .fill(accentColor);
    
    doc
      .fontSize(14)
      .fillColor(white)
      .font('Helvetica-Bold')
      .text('TOTAL AMOUNT PAID', rightColumnX + 10, amountBoxY + 18, { width: columnWidth - 20, align: 'center' });

    // Amount Display - Large and prominent
    doc
      .fontSize(42)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text(formattedAmount, rightColumnX + 10, amountBoxY + 70, { width: columnWidth - 20, align: 'center' });

    // Payment Status Badge
    doc
      .rect(rightColumnX + 20, amountBoxY + 130, columnWidth - 40, 30)
      .fill(successColor);
    
    doc
      .fontSize(12)
      .fillColor(white)
      .font('Helvetica-Bold')
      .text('✓ PAYMENT CONFIRMED', rightColumnX + 10, amountBoxY + 138, { width: columnWidth - 20, align: 'center' });

    // Payment Method
    doc
      .fontSize(10)
      .fillColor(darkGray)
      .font('Helvetica')
      .text(`Payment Method: ${user.paymentMethod === 'online' ? 'Online Payment' : 'Cash Payment'}`, 
            rightColumnX + 10, amountBoxY + 170, { width: columnWidth - 20, align: 'center' });

    yPos += sectionHeight + 30;

    // ==================== VERIFICATION QR CODE SECTION ====================
    try {
      const qrData = `Receipt: ${receiptNumber}\nMember: ${user.name}\nAmount: ${formattedAmount}\nDate: ${currentDate}\nMember ID: ${memberId}`;
      const qrCodeDataURL = await QRCode.toDataURL(qrData, {
        width: 100,
        margin: 2,
        color: {
          dark: primaryColor,
          light: white
        }
      });
      
      // Verification QR Code Box - Centered
      const qrBoxWidth = 120;
      const qrBoxX = (doc.page.width - qrBoxWidth) / 2;
      
      doc
        .rect(qrBoxX, yPos, qrBoxWidth, qrBoxWidth + 30)
        .fill(white)
        .stroke(primaryColor, 1);
      
      doc.image(qrCodeDataURL, qrBoxX + 10, yPos + 10, { width: 100, height: 100 });
      
      doc
        .fontSize(9)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text('VERIFY RECEIPT', qrBoxX, yPos + 115, { width: qrBoxWidth, align: 'center' });
    } catch (qrError) {
      console.log('Verification QR code generation failed:', qrError.message);
    }

    yPos += 150;

    // ==================== TERMS & CONDITIONS SECTION ====================
    const termsY = yPos;
    
    // Terms Header
    doc
      .rect(40, termsY, doc.page.width - 80, 25)
      .fill(mediumGray);
    
    doc
      .fontSize(12)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text('TERMS & CONDITIONS', 50, termsY + 7);

    // Terms Content Box
    const termsBoxY = termsY + 30;
    doc
      .rect(40, termsBoxY, doc.page.width - 80, 80)
      .fill(lightGray)
      .stroke(mediumGray, 1);

    const terms = [
      '• This receipt is valid for the membership period mentioned above',
      '• Membership is non-transferable and non-refundable',
      '• Please keep this receipt safe for your records',
      '• For any queries or support, contact our customer service team'
    ];

    doc
      .fontSize(9)
      .fillColor(darkGray)
      .font('Helvetica')
      .text(terms.join('\n'), 50, termsBoxY + 15, {
        width: doc.page.width - 100,
        lineGap: 8
      });

    // ==================== FOOTER SECTION ====================
    const footerY = doc.page.height - 90;
    
    // Footer Background
    doc
      .rect(0, footerY, doc.page.width, 90)
      .fill(primaryColor);

    // Thank You Message
    doc
      .fontSize(16)
      .fillColor(white)
      .font('Helvetica-Bold')
      .text('Thank you for choosing StarGym!', 0, footerY + 15, { align: 'center' });

    // Footer Accent Line
    doc
      .rect(0, footerY + 35, doc.page.width, 2)
      .fill(accentColor);

    // Contact Information - Better formatted
    doc
      .fontSize(10)
      .fillColor(mediumGray)
      .font('Helvetica')
      .text('Contact: +91 98765 43210', 0, footerY + 45, { align: 'center' })
      .text('Email: info@stargym.com', 0, footerY + 58, { align: 'center' })
      .text('Address: 123 Fitness Street, Petlad, Gujarat 388450', 0, footerY + 71, { align: 'center' });

    // Footer Note
    doc
      .fontSize(8)
      .fillColor(darkGray)
      .font('Helvetica')
      .text('This is a computer-generated receipt. No signature required.', 0, footerY + 82, { align: 'center' });

    // Finalize the PDF and wait for completion
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('PDF generation timeout after 30 seconds'));
      }, 30000); // 30 second timeout
      
      doc.on('end', () => {
        clearTimeout(timeout);
        resolve();
      });
      doc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      doc.end();
    });

    // Combine chunks into a buffer
    const pdfBuffer = Buffer.concat(chunks);
    
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF buffer is empty');
    }
    
    console.log('PDF generated for download successfully, size:', pdfBuffer.length, 'bytes');
    
    return pdfBuffer;
  } catch (error) {
    console.error('Error generating receipt for download:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      userId: user?._id,
      userName: user?.name
    });
    throw error;
  }
};

// Function to generate PDF with all members details
const generateAllMembersPDF = async (users) => {
  try {
    const doc = new PDFDocument({ 
      size: 'A4',
      margin: 50,
      info: {
        Title: 'StarGym - All Members Report',
        Author: 'StarGym',
        Subject: 'Complete Members List',
        Creator: 'StarGym Management System'
      },
      // Ensure proper Unicode support for rupee symbol
      autoFirstPage: true
    });
    
    // Create a buffer to store the PDF data
    const chunks = [];
    
    // Pipe the PDF document to collect chunks
    doc.on('data', chunk => chunks.push(chunk));

    // Colors
    const primaryColor = '#1f2937'; // Dark gray
    const accentColor = '#f59e0b'; // Amber
    const lightGray = '#f3f4f6';
    const darkGray = '#6b7280';
    const greenColor = '#10b981';
    const redColor = '#ef4444';
    const yellowColor = '#f59e0b';

    // Helper function to format dates
    const formatDate = (dateString) => {
      if (!dateString) return 'N/A';
      return new Date(dateString).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    };

    // Helper function to get plan display name
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

    // Helper function to get plan amount
    const getPlanAmount = (plan) => {
      const planPrices = {
        '1month': 1500,
        '2month': 2500,
        '3month': 3500,
        '6month': 5000,
        'yearly': 8000
      };
      return planPrices[plan] || 0;
    };

    // Helper function to format currency with proper rupee symbol
    // Using proper ₹ symbol with Unicode support
    const formatCurrency = (amount) => {
      // Format number with Indian numbering system
      const formattedAmount = new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 0
      }).format(amount);
      // Return with proper rupee symbol ₹
      return `₹ ${formattedAmount}`;
    };

    // Helper function to check if subscription is expired
    const isExpired = (endDate) => {
      return new Date(endDate) < new Date();
    };

    let currentPage = 1;
    const membersPerPage = 8;
    let memberIndex = 0;

    // Function to add header to each page
    const addPageHeader = (pageNum, totalPages) => {
      // Header background
      doc
        .rect(0, 0, doc.page.width, 100)
        .fill(primaryColor);

      // Company name
      doc
        .fillColor('white')
        .fontSize(24)
        .font('Helvetica-Bold')
        .text('STARGYM', 50, 25);

      // Tagline
      doc
        .fontSize(10)
        .font('Helvetica')
        .text('Fitness & Wellness Center', 50, 50);

      // Report title
      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('ALL MEMBERS REPORT', 0, 30, { align: 'center' });

      // Date and page info
      const reportDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      doc
        .fontSize(9)
        .font('Helvetica')
        .text(`Generated on: ${reportDate}`, 50, 70)
        .text(`Page ${pageNum} of ${totalPages}`, doc.page.width - 150, 70, { align: 'right' });

      // Total members count
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(`Total Members: ${users.length}`, doc.page.width - 200, 50, { align: 'right' });
    };

    // Function to add table header
    const addTableHeader = (yPos) => {
      doc
        .fillColor('white')
        .fontSize(10)
        .font('Helvetica-Bold');
      
      // Header background
      doc
        .rect(50, yPos - 8, doc.page.width - 100, 20)
        .fill(primaryColor);
      
      // Header text with better column spacing
      doc
        .text('S.No', 50, yPos)
        .text('Name', 80, yPos)
        .text('Contact', 180, yPos)
        .text('Plan', 280, yPos)
        .text('Status', 350, yPos)
        .text('Amount', 420, yPos)
        .text('Dates', 500, yPos);

      // Draw header underline
      doc
        .fillColor(primaryColor)
        .moveTo(50, yPos + 12)
        .lineTo(doc.page.width - 50, yPos + 12)
        .stroke(primaryColor, 1);
    };

    // Calculate total pages
    const totalPages = Math.ceil(users.length / membersPerPage);

    // Process members
    for (let page = 1; page <= totalPages; page++) {
      if (page > 1) {
        doc.addPage();
      }

      addPageHeader(page, totalPages);

      let yPosition = 130;
      addTableHeader(yPosition);
      yPosition += 30;

      // Add members for this page
      const startIndex = (page - 1) * membersPerPage;
      const endIndex = Math.min(startIndex + membersPerPage, users.length);

      for (let i = startIndex; i < endIndex; i++) {
        const user = users[i];
        const serialNo = i + 1;
        const expired = isExpired(user.endDate);
        const statusColor = user.paymentStatus === 'confirmed' 
          ? (expired ? redColor : greenColor)
          : yellowColor;
        const statusText = user.paymentStatus === 'confirmed' 
          ? (expired ? 'Expired' : 'Active')
          : 'Pending';

        // Check if we need a new page
        if (yPosition > doc.page.height - 100) {
          doc.addPage();
          addPageHeader(page + 1, totalPages);
          yPosition = 130;
          addTableHeader(yPosition);
          yPosition += 30;
        }

        // Serial number
        doc
          .fillColor(darkGray)
          .fontSize(9)
          .font('Helvetica')
          .text(serialNo.toString(), 50, yPosition);

        // Name (truncate if too long)
        const name = user.name && user.name.length > 18 ? user.name.substring(0, 15) + '...' : (user.name || 'N/A');
        doc
          .fillColor(primaryColor)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(name, 80, yPosition, { width: 95 });

        // Contact info (email and phone) - better formatting with more space
        const email = user.email || 'N/A';
        const phone = user.phone || 'N/A';
        // Truncate email if too long but give more space
        const displayEmail = email.length > 30 ? email.substring(0, 27) + '...' : email;
        doc
          .fillColor(darkGray)
          .font('Helvetica')
          .fontSize(8)
          .text(displayEmail, 180, yPosition, { width: 95 });
        // Format phone number properly
        const formattedPhone = phone && phone.length === 10 
          ? `${phone.substring(0, 5)} ${phone.substring(5)}` 
          : phone;
        doc
          .fillColor(darkGray)
          .font('Helvetica')
          .fontSize(8)
          .text(`Ph: ${formattedPhone}`, 180, yPosition + 10, { width: 95 });

        // Plan
        doc
          .fillColor(primaryColor)
          .fontSize(9)
          .font('Helvetica')
          .text(getPlanDisplayName(user.plan), 280, yPosition, { width: 65 });

        // Status with color indicator
        doc
          .fillColor(statusColor)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(statusText, 350, yPosition, { width: 65 });

        // Amount with proper rupee symbol
        const amountText = formatCurrency(getPlanAmount(user.plan));
        doc
          .fillColor(primaryColor)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(amountText, 420, yPosition, { width: 75 });

        // Dates - better formatting
        const startDateText = formatDate(user.startDate);
        const endDateText = formatDate(user.endDate);
        doc
          .fillColor(darkGray)
          .font('Helvetica')
          .fontSize(8)
          .text(`S: ${startDateText}`, 500, yPosition, { width: 95 });
        doc
          .fillColor(darkGray)
          .font('Helvetica')
          .fontSize(8)
          .text(`E: ${endDateText}`, 500, yPosition + 10, { width: 95 });

        yPosition += 45;
      }

      // Add summary section at the bottom of each page (except last)
      if (page < totalPages) {
        const summaryY = doc.page.height - 80;
        doc
          .fillColor(primaryColor)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('--- Continued on next page ---', 0, summaryY, { align: 'center' });
      }
    }

    // Add summary page
    doc.addPage();
    addPageHeader(totalPages + 1, totalPages + 1);

    // Summary statistics
    const activeMembers = users.filter(u => u.paymentStatus === 'confirmed' && !isExpired(u.endDate)).length;
    const expiredMembers = users.filter(u => u.paymentStatus === 'confirmed' && isExpired(u.endDate)).length;
    const pendingMembers = users.filter(u => u.paymentStatus === 'pending').length;
    const totalRevenue = users.reduce((sum, u) => sum + getPlanAmount(u.plan), 0);

    const planCounts = {
      '1month': users.filter(u => u.plan === '1month').length,
      '2month': users.filter(u => u.plan === '2month').length,
      '3month': users.filter(u => u.plan === '3month').length,
      '6month': users.filter(u => u.plan === '6month').length,
      'yearly': users.filter(u => u.plan === 'yearly').length
    };

    let summaryY = 130;

    doc
      .fillColor(primaryColor)
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('SUMMARY STATISTICS', 0, summaryY, { align: 'center' });

    summaryY += 40;

    // Statistics boxes
    const boxWidth = 150;
    const boxHeight = 60;
    const boxSpacing = 20;
    const startX = (doc.page.width - (boxWidth * 2 + boxSpacing)) / 2;

    // Active Members
    doc
      .rect(startX, summaryY, boxWidth, boxHeight)
      .fill(lightGray)
      .stroke(greenColor, 2);
    doc
      .fillColor(greenColor)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Active Members', startX + 10, summaryY + 10)
      .fontSize(20)
      .text(activeMembers.toString(), startX + 10, summaryY + 30);

    // Expired Members
    doc
      .rect(startX + boxWidth + boxSpacing, summaryY, boxWidth, boxHeight)
      .fill(lightGray)
      .stroke(redColor, 2);
    doc
      .fillColor(redColor)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Expired Members', startX + boxWidth + boxSpacing + 10, summaryY + 10)
      .fontSize(20)
      .text(expiredMembers.toString(), startX + boxWidth + boxSpacing + 10, summaryY + 30);

    summaryY += boxHeight + 30;

    // Pending Members
    doc
      .rect(startX, summaryY, boxWidth, boxHeight)
      .fill(lightGray)
      .stroke(yellowColor, 2);
    doc
      .fillColor(yellowColor)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Pending Payments', startX + 10, summaryY + 10)
      .fontSize(20)
      .text(pendingMembers.toString(), startX + 10, summaryY + 30);

    // Total Revenue
    doc
      .rect(startX + boxWidth + boxSpacing, summaryY, boxWidth, boxHeight)
      .fill(lightGray)
      .stroke(accentColor, 2);
    doc
      .fillColor(accentColor)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Total Revenue', startX + boxWidth + boxSpacing + 10, summaryY + 10)
      .fontSize(16)
      .text(formatCurrency(totalRevenue), startX + boxWidth + boxSpacing + 10, summaryY + 30, { width: boxWidth - 20 });

    summaryY += boxHeight + 40;

    // Plan distribution
    doc
      .fillColor(primaryColor)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('PLAN DISTRIBUTION', 50, summaryY);

    summaryY += 25;

    const plans = [
      { name: '1 Month', count: planCounts['1month'] },
      { name: '2 Months', count: planCounts['2month'] },
      { name: '3 Months', count: planCounts['3month'] },
      { name: '6 Months', count: planCounts['6month'] },
      { name: '1 Year', count: planCounts['yearly'] }
    ];

    plans.forEach((plan, index) => {
      const rowY = summaryY + (index * 20);
      doc
        .fillColor(darkGray)
        .fontSize(10)
        .font('Helvetica')
        .text(plan.name, 50, rowY)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(plan.count.toString(), 200, rowY);
    });

    // Footer
    const footerY = doc.page.height - 60;
    doc
      .rect(0, footerY, doc.page.width, 60)
      .fill(lightGray);

    doc
      .fillColor(primaryColor)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('This is a computer-generated report.', 0, footerY + 10, { align: 'center' })
      .font('Helvetica')
      .fillColor(darkGray)
      .text('For any queries, contact: info@stargym.com', 0, footerY + 25, { align: 'center' })
      .text('Generated by StarGym Management System', 0, footerY + 40, { align: 'center' });

    // Finalize the PDF
    await new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
      doc.end();
    });

    // Combine chunks into a buffer
    const pdfBuffer = Buffer.concat(chunks);
    console.log('All members PDF generated, size:', pdfBuffer.length);
    
    return pdfBuffer;
  } catch (error) {
    console.error('Error generating all members PDF:', error);
    throw error;
  }
};

module.exports = { generateReceipt, generateReceiptForDownload, generateAllMembersPDF };