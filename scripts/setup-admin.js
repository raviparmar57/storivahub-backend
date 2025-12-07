const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function setupAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@storyhub.com' });
    
    if (existingAdmin) {
      console.log('Admin user already exists');
      console.log('Email: admin@storyhub.com');
      console.log('You can reset the password by updating the user in the database');
      return;
    }

    // Create admin user
    const adminUser = new User({
      email: 'admin@storyhub.com',
      password: 'admin123', // This will be hashed by the pre-save hook
      name: 'Admin User',
      role: 'admin',
      isActive: true
    });

    await adminUser.save();
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@storyhub.com');
    console.log('🔑 Password: admin123');
    console.log('⚠️  Please change the password after first login');
    
  } catch (error) {
    console.error('❌ Error setting up admin user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

setupAdmin();