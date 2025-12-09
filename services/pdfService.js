const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');
const QRCode = require('qrcode');
const { uploadPDFToCloudinary } = require('./cloudinaryService');
const { getPlanAmount, getPlanDisplayName, formatIndianPrice: formatPrice } = require('../utils/formatters');

// UPI Payment details
// PRIMARY UPI ID: 9898881882thanganat-1@okicici
// This UPI ID is used in receipts, QR codes, and when opening GPay/PhonePe/Paytm apps
// Can be overridden via environment variable UPI_VPA or GPAY_VPA if needed
const PAYEE_VPA = process.env.UPI_VPA || process.env.GPAY_VPA || '9898881882thanganat-1@okicici';
const PAYEE_NAME = process.env.UPI_PAYEE_NAME || 'StarGym';

// Log UPI configuration on module load (for debugging)
if (!PAYEE_VPA || PAYEE_VPA === '') {
  console.warn('⚠️  UPI_VPA not found in environment variables. Payment QR codes will not work.');
  console.warn('   Please set UPI_VPA in your .env file (e.g., UPI_VPA=yourname@paytm)');
} else {
  console.log('✅ PDF Service - UPI_VPA configured:', PAYEE_VPA);
  // Confirm correct UPI ID
  if (PAYEE_VPA === '9898881882thanganat-1@okicici') {
    console.log('✅ PDF Service - Correct UPI ID is being used: 9898881882thanganat-1@okicici');
  }
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

// Helper function to format Indian currency with Rs. prefix (for PDF formatting)
const formatIndianPrice = (amount) => {
  // Format number with Indian numbering system (lakhs, crores)
  const formattedAmount = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
  // Return with Rs. prefix
  return `Rs. ${formattedAmount}`;
};

const generateReceipt = async (user) => {
  // This function returns a URL that points to the download endpoint
  // The actual PDF generation happens in generateReceiptForDownload
  // which has the updated professional one-page format with Rs. currency
  return `/api/receipt/download/${user._id.toString()}`;
};

// Function to generate PDF on-demand for download
const generateReceiptForDownload = async (user) => {
  try {
    console.log('📄 Generating ONE-PAGE receipt PDF (updated compact version)...');
    const doc = new PDFDocument({ 
      size: 'A4',
      margin: 30, // Reduced margins for more space
      info: {
        Title: 'StarGym Membership Receipt',
        Author: 'StarGym',
        Subject: 'Membership Payment Receipt',
        Creator: 'StarGym Management System'
      },
      // Ensure proper Unicode support for rupee symbol
      autoFirstPage: true,
      lang: 'en-IN' // Set language to Indian English for proper currency formatting
    });
    
    // Track page count to ensure we only use one page
    let pageCount = 0; // Start at 0, will be incremented when pages are added
    const maxPageHeight = doc.page.height; // A4 height: 842 points
    const usableHeight = maxPageHeight - 60; // Reserve space for margins
    
    // Track when pages are added (pageAdded fires for each new page, including the first)
    doc.on('pageAdded', () => {
      pageCount++;
      if (pageCount > 1) {
        console.error('❌ WARNING: PDFKit added an extra page!');
        console.error('   This indicates content overflow. Check yPos values and content sizing.');
        console.error('   Current page count:', pageCount);
        // Log warning but don't throw - we'll validate at the end
      }
    });
    
    // The first page is auto-created, so we need to account for it
    // After the first page is created, pageCount should be 1
    // We'll check this after PDF generation completes
    
    // Prevent automatic page breaks by checking bounds before adding content
    const checkBounds = (y, height) => {
      if (y + height > usableHeight) {
        console.warn(`⚠️ Content would overflow at y=${y}, height=${height}, max=${usableHeight}`);
        return false;
      }
      return true;
    };
    
    // Note: We don't override addPage as PDFKit needs to manage pages internally
    // Instead, we ensure all content fits within bounds and validate page count at the end
    
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

    // ==================== PROFESSIONAL HEADER SECTION ====================
    const headerHeight = 85; // Increased for better spacing
    doc
      .rect(0, 0, doc.page.width, headerHeight)
      .fill(primaryColor);

    // Decorative accent line - thicker for more impact
    doc
      .rect(0, headerHeight - 4, doc.page.width, 4)
      .fill(accentColor);

    // Load and display STAR FITNESS logo
    try {
      const logoPath = path.join(__dirname, '..', 'public', 'starlogo.png');
      if (fs.existsSync(logoPath)) {
        // Logo on the left side - Larger and more prominent
        doc.image(logoPath, 40, 15, { 
          width: 80, 
          height: 55,
          fit: [80, 55],
          align: 'left'
        });
      } else {
        // Fallback to text if logo not found
        console.warn('Logo not found at:', logoPath);
        doc
          .fontSize(26)
          .fillColor(white)
          .font('Helvetica-Bold')
          .text('STAR FITNESS', 40, 25, { align: 'left' });
      }
    } catch (logoError) {
      console.warn('Error loading logo:', logoError.message);
      // Fallback to text
      doc
        .fontSize(26)
        .fillColor(white)
        .font('Helvetica-Bold')
        .text('STAR FITNESS', 40, 25, { align: 'left' });
    }

    // Tagline - Better positioned with more spacing
    doc
      .fontSize(10)
      .fillColor(mediumGray)
      .font('Helvetica')
      .text('Fitness & Wellness Center', 130, 42);

    // Receipt Title - Centered and more prominent
    doc
      .fontSize(20)
      .fillColor(white)
      .font('Helvetica-Bold')
      .text('MEMBERSHIP RECEIPT', 0, 58, { align: 'center' });

    // ==================== RECEIPT INFO SECTION ====================
    let yPos = headerHeight + 25; // More spacing after header
    
    // Receipt Info Box - Professional card design
    const receiptNumber = `RCP-${user._id.toString().slice(-8).toUpperCase()}`;
    const memberId = `MEM-${user._id.toString().slice(-8).toUpperCase()}`;
    
    // Try to get payment date from membership history, otherwise use current date
    // Use Indian Standard Time (IST) timezone for all date/time formatting
    let paymentDate = new Date();
    if (user.membershipHistory && user.membershipHistory.length > 0) {
      const latestPayment = user.membershipHistory
        .filter(h => h.paymentStatus === 'confirmed')
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      if (latestPayment && latestPayment.date) {
        paymentDate = new Date(latestPayment.date);
      }
    }
    
    // Format date and time in Indian Standard Time (IST)
    const currentDate = paymentDate.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
    const currentTime = paymentDate.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    });

    // Info boxes - More spacious and interactive
    const infoBoxWidth = (doc.page.width - 120) / 2;
    const infoBoxHeight = 65; // Increased height for better readability
    const boxSpacing = 30;
    
    // Left Info Box - Receipt Details Card with more spacing
    doc
      .rect(40, yPos, infoBoxWidth, infoBoxHeight)
      .fill(white)
      .stroke(accentColor, 2.5);
    
    // Card header accent - thicker
    doc
      .rect(40, yPos, infoBoxWidth, 8)
      .fill(accentColor);
    
    doc
      .fontSize(8)
      .fillColor(darkGray)
      .font('Helvetica')
      .text('RECEIPT NUMBER', 50, yPos + 12)
      .fontSize(10)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text(receiptNumber, 50, yPos + 24, { width: infoBoxWidth - 20 })
      .fontSize(8)
      .fillColor(darkGray)
      .font('Helvetica')
      .text('DATE & TIME', 50, yPos + 40)
      .fontSize(9)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text(`${currentDate}`, 50, yPos + 52, { width: infoBoxWidth - 20 })
      .fontSize(8)
      .fillColor(darkGray)
      .font('Helvetica')
      .text(currentTime, 50, yPos + 62, { width: infoBoxWidth - 20 });

    // Right Info Box - Member ID Card with more spacing
    doc
      .rect(70 + infoBoxWidth, yPos, infoBoxWidth, infoBoxHeight)
      .fill(white)
      .stroke(secondaryColor, 2.5);
    
    // Card header accent - thicker
    doc
      .rect(70 + infoBoxWidth, yPos, infoBoxWidth, 8)
      .fill(secondaryColor);
    
    doc
      .fontSize(8)
      .fillColor(darkGray)
      .font('Helvetica')
      .text('MEMBER ID', 80 + infoBoxWidth, yPos + 12)
      .fontSize(10)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text(memberId, 80 + infoBoxWidth, yPos + 24, { width: infoBoxWidth - 20 })
      .fontSize(8)
      .fillColor(darkGray)
      .font('Helvetica')
      .text('TIME', 80 + infoBoxWidth, yPos + 40)
      .fontSize(9)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text(currentTime, 80 + infoBoxWidth, yPos + 52, { width: infoBoxWidth - 20 });

    yPos += infoBoxHeight + 25; // More spacing between sections

    // ==================== MEMBER INFORMATION SECTION ====================
    // Section Header - Larger and more prominent
    doc
      .rect(40, yPos, doc.page.width - 80, 25)
      .fill(accentColor);
    
    doc
      .fontSize(12)
      .fillColor(white)
      .font('Helvetica-Bold')
      .text('MEMBER INFORMATION', 50, yPos + 7);

    yPos += 30; // More spacing

    // Member Info Card - More spacious Professional Design
    const memberCardY = yPos;
    doc
      .rect(40, memberCardY, doc.page.width - 80, 95)
      .fill(white)
      .stroke(accentColor, 2.5);

    // Card header accent - thicker
    doc
      .rect(40, memberCardY, doc.page.width - 80, 5)
      .fill(accentColor);

    // Member details - More spacious layout
    const memberDetails = [
      { label: 'Full Name', value: user.name || 'N/A' },
      { label: 'Email', value: user.email || 'N/A' },
      { label: 'Phone', value: user.phone || 'N/A' },
      { label: 'Gender', value: user.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : 'N/A' },
      { label: 'Plan', value: getPlanDisplayName(user.plan) }
    ];

    let detailY = memberCardY + 15;
    memberDetails.forEach((detail, index) => {
      // Alternating row background with more padding
      if (index % 2 === 0) {
        doc
          .rect(45, detailY - 3, doc.page.width - 90, 18)
          .fill(lightGray);
      }
      
      doc
        .fontSize(9)
        .fillColor(darkGray)
        .font('Helvetica')
        .text(`${detail.label}:`, 50, detailY + 2)
        .fontSize(10)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(detail.value, 200, detailY + 2, { width: 320 });
      detailY += 18; // More spacing between rows
    });

    yPos = memberCardY + 100; // Adjusted height

    // ==================== MEMBERSHIP DETAILS SECTION ====================
    // Section Header - Larger and more prominent
    doc
      .rect(40, yPos, doc.page.width - 80, 25)
      .fill(secondaryColor);
    
    doc
      .fontSize(12)
      .fillColor(white)
      .font('Helvetica-Bold')
      .text('MEMBERSHIP DETAILS', 50, yPos + 7);

    yPos += 30; // More spacing

    // Membership Details Card - More spacious
    const membershipCardY = yPos;
    doc
      .rect(40, membershipCardY, doc.page.width - 80, 95)
      .fill(white)
      .stroke(secondaryColor, 2.5);

    // Card header accent - thicker
    doc
      .rect(40, membershipCardY, doc.page.width - 80, 5)
      .fill(secondaryColor);

    const startDate = new Date(user.startDate).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    const endDate = new Date(user.endDate).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    const amount = getPlanAmount(user.plan);
    const formattedAmount = formatIndianPrice(amount);

    const membershipDetails = [
      { label: 'Plan', value: getPlanDisplayName(user.plan) },
      { label: 'Start Date', value: startDate },
      { label: 'End Date', value: endDate },
      { label: 'Payment Method', value: user.paymentMethod === 'online' ? 'Online' : 'Cash' },
      { label: 'Status', value: 'Active', color: successColor }
    ];

    let membershipY = membershipCardY + 15;
    membershipDetails.forEach((detail, index) => {
      // Alternating row background with more padding
      if (index % 2 === 0) {
        doc
          .rect(45, membershipY - 3, doc.page.width - 90, 18)
          .fill(lightGray);
      }
      
      doc
        .fontSize(9)
        .fillColor(darkGray)
        .font('Helvetica')
        .text(`${detail.label}:`, 50, membershipY + 2)
        .fontSize(10)
        .fillColor(detail.color || primaryColor)
        .font('Helvetica-Bold')
        .text(detail.value, 200, membershipY + 2, { width: 320 });
      membershipY += 18; // More spacing between rows
    });

    yPos = membershipCardY + 100; // Adjusted height

    // ==================== PAYMENT & AMOUNT SECTION ====================
    yPos += 20; // More spacing
    
    // Two-column layout for QR Code and Amount - Properly balanced
    const pageMargin = 40;
    const columnSpacing = 20;
    const totalContentWidth = doc.page.width - (pageMargin * 2);
    const columnWidth = (totalContentWidth - columnSpacing) / 2;
    const leftColumnX = pageMargin;
    const rightColumnX = pageMargin + columnWidth + columnSpacing;
    const sectionHeight = 160; // Increased height for better balance

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
        width: 120,
        margin: 2,
        color: {
          dark: accentColor,
          light: white
        }
      });

      // QR Code Card with proper design
      doc
        .rect(leftColumnX, yPos, columnWidth, sectionHeight)
        .fill(white)
        .stroke(accentColor, 2.5);

      // QR Code Header - Properly sized
      const qrHeaderHeight = 28;
      doc
        .rect(leftColumnX, yPos, columnWidth, qrHeaderHeight)
        .fill(accentColor);
      
      doc
        .fontSize(10)
        .fillColor(white)
        .font('Helvetica-Bold')
        .text('PAYMENT QR CODE', leftColumnX, yPos + 9, { 
          align: 'center', 
          width: columnWidth 
        });

      // QR Code Image - Properly centered
      const qrSize = 100;
      const qrX = leftColumnX + (columnWidth - qrSize) / 2;
      const qrY = yPos + qrHeaderHeight + 15;
      doc.image(paymentQRCodeDataURL, qrX, qrY, { width: qrSize, height: qrSize });
      
      // QR Code Footer - Properly spaced
      const qrFooterY = qrY + qrSize + 12;
      doc
        .fontSize(8)
        .fillColor(darkGray)
        .font('Helvetica')
        .text('Scan to pay via UPI', leftColumnX, qrFooterY, { 
          align: 'center', 
          width: columnWidth 
        });
      
      doc
        .fontSize(7)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(`UPI: ${PAYEE_VPA}`, leftColumnX, qrFooterY + 12, { 
          align: 'center', 
          width: columnWidth 
        });
    } catch (qrError) {
      // If QR code fails, create a placeholder or skip
      console.warn('Payment QR Code generation failed:', qrError);
    }

    // Right Column - Amount Box (Properly balanced)
    const amountBoxY = yPos;
    doc
      .rect(rightColumnX, amountBoxY, columnWidth, sectionHeight)
      .fill(lightGray)
      .stroke(accentColor, 2.5);

    // Amount Header - Properly sized
    const amountHeaderHeight = 28;
    doc
      .rect(rightColumnX, amountBoxY, columnWidth, amountHeaderHeight)
      .fill(accentColor);
    
    doc
      .fontSize(10)
      .fillColor(white)
      .font('Helvetica-Bold')
      .text('TOTAL AMOUNT PAID', rightColumnX, amountBoxY + 9, { 
        align: 'center', 
        width: columnWidth 
      });

    // Amount Display - Properly positioned and sized
    const amountY = amountBoxY + amountHeaderHeight + 20;
    doc
      .fontSize(30)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text(formattedAmount, rightColumnX, amountY, { 
        align: 'center', 
        width: columnWidth 
      });

    // Payment Status Badge - Properly positioned
    const badgeY = amountY + 35;
    const badgeHeight = 28;
    const badgePadding = 20;
    doc
      .rect(rightColumnX + badgePadding, badgeY, columnWidth - (badgePadding * 2), badgeHeight)
      .fill(successColor);
    
    doc
      .fontSize(9)
      .fillColor(white)
      .font('Helvetica-Bold')
      .text('✓ PAYMENT CONFIRMED', rightColumnX, badgeY + 9, { 
        align: 'center', 
        width: columnWidth 
      });

    // Payment Method - Properly positioned
    const paymentMethodY = badgeY + badgeHeight + 15;
    doc
      .fontSize(9)
      .fillColor(darkGray)
      .font('Helvetica')
      .text(`Payment: ${user.paymentMethod === 'online' ? 'Online' : 'Cash'}`, 
            rightColumnX, paymentMethodY, { 
              align: 'center', 
              width: columnWidth 
            });

    yPos += sectionHeight + 20; // More spacing

    // ==================== FOOTER SECTION ====================
    // Professional footer - Properly calculated height to fit all content
    // Calculate required height: top padding (12) + thank you (17) + spacing (18) + accent (4) + spacing (12) + contact (11) + spacing (14) + address (11) + spacing (16) + disclaimer (10) + bottom padding (10) = ~125px
    const footerHeight = 90; // Adequate height for all content with proper spacing
    
    // ==================== TERMS & CONDITIONS SECTION ====================
    // Add more spacious terms section if there's space - ensure it fits on one page
    const availableSpace = usableHeight - footerHeight - yPos - 15;
    if (availableSpace > 45 && checkBounds(yPos, 50)) {
      const termsY = yPos;
      doc
        .fontSize(8)
        .fillColor(darkGray)
        .font('Helvetica')
        .text('• This receipt is valid for the membership period mentioned above', 40, termsY, { width: doc.page.width - 80 })
        .text('• Membership is non-transferable and non-refundable', 40, termsY + 12, { width: doc.page.width - 80 })
        .text('• Please keep this receipt safe for your records', 40, termsY + 24, { width: doc.page.width - 80 })
        .text('• For any queries or support, contact our customer service team', 40, termsY + 36, { width: doc.page.width - 80 });
      
      yPos = termsY + 50;
    } else {
      console.log('⚠️ Skipping terms section to ensure one-page fit');
    }
    
    // ==================== FOOTER POSITIONING ====================
    // Position footer at the bottom of the page with proper margin
    const pageBottomMargin = 30;
    const footerY = doc.page.height - footerHeight - pageBottomMargin;
    
    // Ensure content doesn't overlap with footer
    if (yPos + 10 > footerY) {
      console.warn('⚠️ Content would overlap footer! Adjusting...');
      // If content is too close, reduce terms section or adjust spacing
    }
    
    // Footer Background - Professional and spacious
    doc
      .rect(0, footerY, doc.page.width, footerHeight)
      .fill(primaryColor);

    // Thank You Message - Prominent and well-spaced
    const thankYouTopPadding = 12;
    const thankYouY = footerY + thankYouTopPadding;
    doc
      .fontSize(15)
      .fillColor(white)
      .font('Helvetica-Bold')
      .text('Thank you for choosing StarGym!', 0, thankYouY, { align: 'center' });

    // Footer Accent Line - Thicker and more prominent
    const accentLineSpacing = 18;
    const accentLineY = thankYouY + accentLineSpacing;
    const accentLineHeight = 4;
    doc
      .rect(0, accentLineY, doc.page.width, accentLineHeight)
      .fill(accentColor);

    // Contact Information - Better sized with proper spacing
    const contactSpacing = 12;
    const contactY = accentLineY + accentLineHeight + contactSpacing;
    doc
      .fontSize(9)
      .fillColor(mediumGray)
      .font('Helvetica')
      .text('Contact: 9313720714 | Email: stargympetlad0205@gmail.com', 0, contactY, { align: 'center' });

    // Address - Properly spaced
    const addressSpacing = 14;
    const addressY = contactY + addressSpacing;
    doc
      .fontSize(9)
      .fillColor(mediumGray)
      .font('Helvetica')
      .text('Address: 2nd floor, Krishiv complex, Swaminarayan mandir Rd, Petlad, 388450', 0, addressY, { align: 'center' });

    // Footer Note - Better sized and properly spaced
    const disclaimerSpacing = 16;
    const disclaimerY = addressY + disclaimerSpacing;
    const disclaimerBottomPadding = 10;
    doc
      .fontSize(8)
      .fillColor(darkGray)
      .font('Helvetica')
      .text('This is a computer-generated receipt. No signature required.', 0, disclaimerY, { align: 'center' });
    
    // Verify footer content fits within allocated height
    const footerContentBottom = disclaimerY + disclaimerBottomPadding;
    const maxFooterBottom = footerY + footerHeight;
    if (footerContentBottom > maxFooterBottom) {
      console.warn(`⚠️ Footer content extends beyond: ${footerContentBottom} > ${maxFooterBottom}`);
    } else {
      console.log(`✅ Footer content fits properly: ${footerContentBottom} <= ${maxFooterBottom}`);
    }

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
    
    // Final validation: Ensure we only have ONE page
    // Note: pageCount tracks additional pages added (0 = only first page, 1+ = extra pages)
    // The first page is auto-created, so pageCount of 0 or 1 is acceptable
    if (pageCount > 1) {
      const warningMsg = `⚠️ WARNING: PDF may have ${pageCount + 1} pages instead of 1. Content may have overflowed.`;
      console.warn(warningMsg);
      console.warn('📊 Final yPos:', yPos, 'Page height:', doc.page.height, 'Usable height:', usableHeight, 'Footer Y:', footerY);
      // Don't throw error - allow PDF to be generated so user can see what happened
      // The PDF viewer will show the issue if there are multiple pages
    }
    
    console.log('✅ PDF generated successfully (ONE PAGE), size:', pdfBuffer.length, 'bytes');
    console.log('📊 Final yPos:', yPos, 'Page height:', doc.page.height, 'Usable height:', usableHeight, 'Footer Y:', footerY);
    console.log('📄 Page count verified:', pageCount, 'page(s)');
    
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
      autoFirstPage: true,
      lang: 'en-IN' // Set language to Indian English for proper currency formatting
    });
    
    // Create a buffer to store the PDF data
    const chunks = [];
    
    // Pipe the PDF document to collect chunks
    doc.on('data', chunk => chunks.push(chunk));

    // Simplified Color Palette - Clean and Clear
    const primaryColor = '#1f2937'; // Dark gray - better contrast
    const accentColor = '#f59e0b'; // Amber for highlights
    const lightGray = '#f9fafb'; // Very light gray for backgrounds
    const mediumGray = '#e5e7eb'; // Light gray for borders
    const darkGray = '#374151'; // Dark gray for text
    const greenColor = '#059669'; // Green for active
    const redColor = '#dc2626'; // Red for expired
    const yellowColor = '#d97706'; // Yellow for pending
    const white = '#ffffff';

    // Helper function to format dates
    const formatDate = (dateString) => {
      if (!dateString) return 'N/A';
      return new Date(dateString).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    };

    // Note: getPlanDisplayName and getPlanAmount are imported from utils/formatters

    // Helper function to format currency with Rs. prefix
    const formatCurrency = (amount) => {
      // Format number with Indian numbering system
      const formattedAmount = new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 0
      }).format(amount);
      // Return with Rs. prefix
      return `Rs. ${formattedAmount}`;
    };

    // Helper function to check if subscription is expired
    const isExpired = (endDate) => {
      return new Date(endDate) < new Date();
    };

    let currentPage = 1;
    const membersPerPage = 10; // More members per page with simpler design
    let memberIndex = 0;

    // Function to add header to each page
    const addPageHeader = (pageNum, totalPages) => {
      // Simple Clean Header
      const headerHeight = 90;
      doc
        .rect(0, 0, doc.page.width, headerHeight)
        .fill(primaryColor);

      // Load and display STAR FITNESS logo
      try {
        const logoPath = path.join(__dirname, '..', 'public', 'starlogo.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 40, 10, { 
            width: 90, 
            height: 60,
            fit: [90, 60],
            align: 'left'
          });
        } else {
          doc
            .fillColor(white)
            .fontSize(24)
            .font('Helvetica-Bold')
            .text('STAR FITNESS', 40, 25);
        }
      } catch (logoError) {
        doc
          .fillColor(white)
          .fontSize(24)
          .font('Helvetica-Bold')
          .text('STAR FITNESS', 40, 25);
      }

      // Report title - Simple and clear
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .fillColor(white)
        .text('ALL MEMBERS REPORT', 0, 30, { align: 'center' });

      // Simple info text
      const reportDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const reportTime = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(white)
        .text(`Generated: ${reportDate} at ${reportTime}`, 40, 75);
      
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(white)
        .text(`Total Members: ${users.length}`, doc.page.width - 200, 50, { align: 'right' });
      
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(white)
        .text(`Page ${pageNum} of ${totalPages}`, doc.page.width - 150, 75, { align: 'right' });
    };

    // Simple section header with proper spacing
    const addSectionHeader = (yPos, text) => {
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text(text, 40, yPos);
      
      // Simple underline with more spacing below text
      doc
        .moveTo(40, yPos + 12)
        .lineTo(doc.page.width - 40, yPos + 12)
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

      let yPosition = 110;
      
      // Add simple section header with proper spacing
      if (page === 1) {
        addSectionHeader(yPosition, 'MEMBERS LIST');
        yPosition += 25; // Increased spacing to avoid overlap
      } else {
        addSectionHeader(yPosition, 'MEMBERS LIST (Continued)');
        yPosition += 25; // Increased spacing to avoid overlap
      }

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
          yPosition = 110;
          addSectionHeader(yPosition, 'MEMBERS LIST (Continued)');
          yPosition += 25; // Increased spacing to avoid overlap
        }

        // Simple Member Row - Clean and Clear
        const rowHeight = 50;
        const rowY = yPosition;
        
        // Alternating row background for better readability
        if (i % 2 === 0) {
          doc
            .rect(40, rowY, doc.page.width - 80, rowHeight)
            .fill(lightGray);
        }

        // Left border for status indicator
        doc
          .rect(40, rowY, 4, rowHeight)
          .fill(statusColor);

        // Serial Number - Simple
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor(darkGray)
          .text(`${serialNo}.`, 50, rowY + 5);

        // Member Name - Clear and Bold
        const name = user.name || 'N/A';
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor(primaryColor)
          .text(name, 70, rowY + 5, { width: 150 });

        // Member ID
        const memberId = `MEM-${user._id.toString().slice(-6).toUpperCase()}`;
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor(darkGray)
          .text(`ID: ${memberId}`, 70, rowY + 18);

        // Contact Information - Clear
        const email = user.email || 'N/A';
        const phone = user.phone || 'N/A';
        const displayEmail = email.length > 30 ? email.substring(0, 27) + '...' : email;
        const formattedPhone = phone && phone.length === 10 
          ? `${phone.substring(0, 5)} ${phone.substring(5)}` 
          : phone;
        
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor(darkGray)
          .text(displayEmail, 70, rowY + 30, { width: 150 })
          .text(formattedPhone, 70, rowY + 40, { width: 150 });

        // Plan - Clear
        const planName = getPlanDisplayName(user.plan);
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor(primaryColor)
          .text(planName, 240, rowY + 5, { width: 80 });

        // Amount - Clear
        const amountText = formatCurrency(getPlanAmount(user.plan));
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor(primaryColor)
          .text(amountText, 240, rowY + 20, { width: 80 });

        // Status - Simple badge
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor(statusColor)
          .text(statusText, 240, rowY + 35, { width: 80 });

        // Dates - Clear formatting
        const startDateText = formatDate(user.startDate);
        const endDateText = formatDate(user.endDate);
        
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor(darkGray)
          .text(`Start: ${startDateText}`, 330, rowY + 5, { width: 120 })
          .text(`End: ${endDateText}`, 330, rowY + 18, { width: 120 });

        // Payment Method
        const paymentMethod = user.paymentMethod === 'online' ? 'Online' : 'Cash';
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor(darkGray)
          .text(`Payment: ${paymentMethod}`, 330, rowY + 32, { width: 120 });

        yPosition += rowHeight + 5; // Spacing between rows
      }

      // Simple continuation notice
      if (page < totalPages) {
        const summaryY = doc.page.height - 60;
        doc
          .fillColor(darkGray)
          .fontSize(9)
          .font('Helvetica')
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

    let summaryY = 110;

    // Simple Summary Header with proper spacing
    addSectionHeader(summaryY, 'SUMMARY STATISTICS');
    summaryY += 30; // Increased spacing to avoid overlap

    // Simple Statistics Table
    const statBoxWidth = 140;
    const statBoxHeight = 60;
    const statSpacing = 15;
    const statStartX = (doc.page.width - (statBoxWidth * 2 + statSpacing)) / 2;

    // Active Members - Simple box
    doc
      .rect(statStartX, summaryY, statBoxWidth, statBoxHeight)
      .fill(white)
      .stroke(mediumGray, 1);
    
    doc
      .fillColor(primaryColor)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Active Members', statStartX + 10, summaryY + 8)
      .fontSize(24)
      .fillColor(greenColor)
      .text(activeMembers.toString(), statStartX + 10, summaryY + 25);

    // Expired Members - Simple box
    doc
      .rect(statStartX + statBoxWidth + statSpacing, summaryY, statBoxWidth, statBoxHeight)
      .fill(white)
      .stroke(mediumGray, 1);
    
    doc
      .fillColor(primaryColor)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Expired Members', statStartX + statBoxWidth + statSpacing + 10, summaryY + 8)
      .fontSize(24)
      .fillColor(redColor)
      .text(expiredMembers.toString(), statStartX + statBoxWidth + statSpacing + 10, summaryY + 25);

    summaryY += statBoxHeight + 15;

    // Pending Members - Simple box
    doc
      .rect(statStartX, summaryY, statBoxWidth, statBoxHeight)
      .fill(white)
      .stroke(mediumGray, 1);
    
    doc
      .fillColor(primaryColor)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Pending Payments', statStartX + 10, summaryY + 8)
      .fontSize(24)
      .fillColor(yellowColor)
      .text(pendingMembers.toString(), statStartX + 10, summaryY + 25);

    // Total Revenue - Simple box
    doc
      .rect(statStartX + statBoxWidth + statSpacing, summaryY, statBoxWidth, statBoxHeight)
      .fill(white)
      .stroke(accentColor, 2);
    
    doc
      .fillColor(primaryColor)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Total Revenue', statStartX + statBoxWidth + statSpacing + 10, summaryY + 8)
      .fontSize(18)
      .fillColor(accentColor)
      .text(formatCurrency(totalRevenue), statStartX + statBoxWidth + statSpacing + 10, summaryY + 25, { width: statBoxWidth - 20 });

    summaryY += statBoxHeight + 30;

    // Simple Plan Distribution with proper spacing
    addSectionHeader(summaryY, 'PLAN DISTRIBUTION');
    summaryY += 30; // Increased spacing to avoid overlap

    const plans = [
      { name: '1 Month', count: planCounts['1month'] },
      { name: '2 Months', count: planCounts['2month'] },
      { name: '3 Months', count: planCounts['3month'] },
      { name: '6 Months', count: planCounts['6month'] },
      { name: '1 Year', count: planCounts['yearly'] }
    ];

    let planY = summaryY;
    plans.forEach((plan, index) => {
      // Alternating row background
      if (index % 2 === 0) {
        doc
          .rect(40, planY, doc.page.width - 80, 20)
          .fill(lightGray);
      }
      
      // Plan name
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text(plan.name, 50, planY + 5, { width: 150 });
      
      // Count
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text(plan.count.toString(), 200, planY + 5);
      
      // Percentage
      const percentage = users.length > 0 ? ((plan.count / users.length) * 100).toFixed(1) : '0.0';
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(darkGray)
        .text(`${percentage}%`, 250, planY + 6);
      
      planY += 22;
    });

    // Simple Footer
    const footerY = doc.page.height - 50;
    
    doc
      .rect(0, footerY, doc.page.width, 50)
      .fill(lightGray);

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(darkGray)
      .text('This is a computer-generated report.', 0, footerY + 10, { align: 'center' })
      .text('For any queries, contact: stargympetlad0205@gmail.com', 0, footerY + 23, { align: 'center' })
      .text('Generated by StarGym Management System', 0, footerY + 36, { align: 'center' });

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