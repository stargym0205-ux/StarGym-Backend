const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');
const QRCode = require('qrcode');
const { uploadPDFToCloudinary } = require('./cloudinaryService');

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

// Helper function to format Indian currency
const formatIndianPrice = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
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
      }
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

    doc
      .fillColor(primaryColor)
      .fontSize(10)
      .font('Helvetica')
      .text(`Receipt No: ${receiptNumber}`, 50, 150)
      .text(`Date: ${currentDate}`, 50, 165);

    // Member Information Section
    doc
      .fillColor(accentColor)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('MEMBER INFORMATION', 50, 200);

    // Member details table
    const memberDetails = [
      ['Member Name:', user.name],
      ['Email:', user.email],
      ['Phone:', user.phone],
      ['Member ID:', user._id.toString().slice(-8).toUpperCase()]
    ];

    let yPosition = 230;
    memberDetails.forEach(([label, value]) => {
      doc
        .fillColor(darkGray)
        .fontSize(11)
        .font('Helvetica')
        .text(label, 50, yPosition)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(value, 200, yPosition);
      yPosition += 20;
    });

    // Membership Details Section
    doc
      .fillColor(accentColor)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('MEMBERSHIP DETAILS', 50, yPosition + 20);

    const planAmount = getPlanAmount(user.plan);
    const planName = getPlanDisplayName(user.plan);
    const startDate = new Date(user.startDate).toLocaleDateString('en-IN');
    const endDate = new Date(user.endDate).toLocaleDateString('en-IN');

    const membershipDetails = [
      ['Plan:', planName],
      ['Duration:', `${startDate} to ${endDate}`],
      ['Payment Method:', user.paymentMethod === 'online' ? 'Online Payment' : 'Cash Payment'],
      ['Payment Status:', 'Confirmed'],
      ['Amount Paid:', formatIndianPrice(planAmount)]
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
        .text(value, 200, yPosition);
      yPosition += 20;
    });

    // Amount Box
    const amountBoxY = yPosition + 20;
    doc
      .rect(350, amountBoxY - 10, 200, 80)
      .fill(lightGray)
      .stroke(accentColor);

    doc
      .fillColor(primaryColor)
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('TOTAL AMOUNT', 360, amountBoxY, { align: 'center' });

    doc
      .fillColor(accentColor)
      .fontSize(24)
      .font('Helvetica-Bold')
      .text(formatIndianPrice(planAmount), 360, amountBoxY + 25, { align: 'center' });

    // Generate QR Code
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
        width: 100,
        margin: 2,
        color: {
          dark: primaryColor,
          light: '#FFFFFF'
        }
      });

      // Add QR Code to PDF
      doc.image(qrCodeDataURL, 50, amountBoxY - 10, { width: 80, height: 80 });
      
      // QR Code label
      doc
        .fillColor(darkGray)
        .fontSize(8)
        .font('Helvetica')
        .text('Scan for verification', 50, amountBoxY + 75, { align: 'center' });
    } catch (qrError) {
      console.warn('QR Code generation failed:', qrError);
      // Continue without QR code if generation fails
    }

    // Terms and Conditions
    const termsY = amountBoxY + 120;
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
      margin: 50,
      info: {
        Title: 'StarGym Membership Receipt',
        Author: 'StarGym',
        Subject: 'Membership Payment Receipt',
        Creator: 'StarGym Management System'
      }
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

    // Header Section
    doc
      .rect(0, 0, doc.page.width, 120)
      .fill(primaryColor);

    // Company Logo/Name
    doc
      .fontSize(28)
      .fillColor('white')
      .text('STAR GYM', 50, 30, { align: 'left' })
      .fontSize(12)
      .text('Fitness & Wellness Center', 50, 60, { align: 'left' });

    // Receipt Title
    doc
      .fontSize(24)
      .fillColor(primaryColor)
      .text('MEMBERSHIP RECEIPT', 0, 150, { align: 'center' });

    // Receipt Info Section
    const receiptNumber = `RCP-${user._id.toString().slice(-8).toUpperCase()}`;
    const memberId = `MEM-${user._id.toString().slice(-6).toUpperCase()}`;
    const currentDate = new Date().toLocaleDateString('en-IN');
    const currentTime = new Date().toLocaleTimeString('en-IN');

    doc
      .fontSize(10)
      .fillColor(darkGray)
      .text('Receipt No:', 50, 200)
      .text('Member ID:', 50, 215)
      .text('Date:', 50, 230)
      .text('Time:', 50, 245)
      .fillColor(primaryColor)
      .text(receiptNumber, 150, 200)
      .text(memberId, 150, 215)
      .text(currentDate, 150, 230)
      .text(currentTime, 150, 245);

    // Member Information Section
    doc
      .fontSize(14)
      .fillColor(primaryColor)
      .text('MEMBER INFORMATION', 50, 280)
      .moveTo(50, 300)
      .lineTo(doc.page.width - 50, 300)
      .stroke(primaryColor, 2);

    doc
      .fontSize(11)
      .fillColor(darkGray)
      .text('Name:', 50, 320)
      .text('Email:', 50, 335)
      .text('Phone:', 50, 350)
      .text('Plan:', 50, 365)
      .fillColor(primaryColor)
      .text(user.name, 150, 320)
      .text(user.email, 150, 335)
      .text(user.phone, 150, 350)
      .text(getPlanDisplayName(user.plan), 150, 365);

    // Membership Details Section
    doc
      .fontSize(14)
      .fillColor(primaryColor)
      .text('MEMBERSHIP DETAILS', 50, 400)
      .moveTo(50, 420)
      .lineTo(doc.page.width - 50, 420)
      .stroke(primaryColor, 2);

    const startDate = new Date(user.startDate).toLocaleDateString('en-IN');
    const endDate = new Date(user.endDate).toLocaleDateString('en-IN');
    const amount = getPlanAmount(user.plan);
    const formattedAmount = formatIndianPrice(amount);

    doc
      .fontSize(11)
      .fillColor(darkGray)
      .text('Plan Duration:', 50, 440)
      .text('Start Date:', 50, 455)
      .text('End Date:', 50, 470)
      .text('Status:', 50, 485)
      .fillColor(primaryColor)
      .text(getPlanDisplayName(user.plan), 200, 440)
      .text(startDate, 200, 455)
      .text(endDate, 200, 470)
      .text('Active', 200, 485);

    // Amount Section
    doc
      .rect(50, 520, doc.page.width - 100, 60)
      .fill(lightGray)
      .fontSize(16)
      .fillColor(primaryColor)
      .text('TOTAL AMOUNT', 0, 540, { align: 'center' })
      .fontSize(20)
      .fillColor(accentColor)
      .text(formattedAmount, 0, 560, { align: 'center' });

    // QR Code Section
    try {
      const qrData = `Receipt: ${receiptNumber}\nMember: ${user.name}\nAmount: ${formattedAmount}\nDate: ${currentDate}`;
      const qrCodeDataURL = await QRCode.toDataURL(qrData, {
        width: 100,
        margin: 1,
        color: {
          dark: primaryColor,
          light: '#FFFFFF'
        }
      });
      
      // Add QR code to PDF
      doc.image(qrCodeDataURL, doc.page.width - 120, 600, { width: 80, height: 80 });
      doc
        .fontSize(8)
        .fillColor(darkGray)
        .text('Scan for verification', doc.page.width - 120, 690, { width: 80, align: 'center' });
    } catch (qrError) {
      console.log('QR code generation failed:', qrError.message);
    }

    // Terms and Conditions
    const footerY = doc.page.height - 100;
    doc
      .fontSize(8)
      .fillColor(darkGray)
      .text('Terms & Conditions:', 50, footerY)
      .text('• This receipt is valid for the membership period mentioned above', 50, footerY + 15)
      .text('• Please keep this receipt for your records', 50, footerY + 30)
      .text('• For any queries, contact our support team', 50, footerY + 45);

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
    console.log('PDF generated for download, size:', pdfBuffer.length);
    
    return pdfBuffer;
  } catch (error) {
    console.error('Error generating receipt for download:', error);
    throw error;
  }
};

module.exports = { generateReceipt, generateReceiptForDownload };