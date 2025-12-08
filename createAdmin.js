const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const Admin = require('./models/Admin');

async function createAdminUser() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB...');

        // Admin credentials
        const adminData = {
            email: 'stargympetlad0205@gmail.com',
            password: 'star@0205'  // This will be hashed
        };

        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ email: adminData.email });
        if (existingAdmin) {
            console.log('Admin already exists');
            process.exit(0);
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(adminData.password, 12);

        // Create new admin
        const newAdmin = await Admin.create({
            email: adminData.email,
            password: hashedPassword
        });

        console.log('Admin created successfully');
        console.log('Email:', adminData.email);
        console.log('Password:', adminData.password);

    } catch (error) {
        console.error('Error creating admin:', error);
    } finally {
        // Close the database connection
        await mongoose.connection.close();
        process.exit(0);
    }
}

// Run the function
createAdminUser(); 