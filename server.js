const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const userRoutes = require('./routes/users');
const taskRoutes = require('./routes/tasks');
const User = require('./models/User');

dotenv.config();

// Import only existing routes
const authRoutes = require('./routes/auth');

// Initialize express
const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://taskmaster.xstreamapps.in',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/uploads', express.static('uploads')); // Serve static files from uploads directory

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'TaskBerry Backend is running'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'TaskBerry Backend API',
    version: '1.0.0',
    endpoints: ['/api/auth', '/api/users', '/api/tasks', '/api/health']
  });
});

// Function to create default admin user
const createDefaultAdmin = async () => {
  try {
    console.log('Checking for default admin user...');
    
    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@example.com' });
    
    if (!existingAdmin) {
      console.log('Creating default admin user...');
      
      const admin = new User({
        name: 'System Admin',
        email: 'admin@example.com',
        password: 'password', // Will be hashed automatically by User model pre-save hook
        role: 'super_admin',
        status: 'active' // Make sure admin is active
      });
      
      await admin.save();
      console.log('✅ Default admin user created successfully');
      console.log('   Email: admin@example.com');
      console.log('   Password: password');
      console.log('   Role: super_admin');
    } else {
      console.log('✅ Default admin user already exists');
    }
    
    // Also create some sample users for testing
    await createSampleUsers();
    
  } catch (error) {
    console.error('❌ Error creating default admin user:', error);
  }
};

// Function to create sample users for testing
const createSampleUsers = async () => {
  try {
    const sampleUsers = [
      {
        name: 'John Manager',
        email: 'manager@example.com',
        password: 'password',
        role: 'manager',
        status: 'active'
      },
      {
        name: 'Sarah Supervisor',
        email: 'supervisor@example.com',
        password: 'password',
        role: 'supervisor',
        status: 'active'
      },
      {
        name: 'Mike Member',
        email: 'member@example.com',
        password: 'password',
        role: 'member',
        status: 'active'
      }
    ];
    
    for (const userData of sampleUsers) {
      const existingUser = await User.findOne({ email: userData.email });
      if (!existingUser) {
        const user = new User(userData);
        await user.save();
        console.log(`✅ Sample user created: ${userData.name} (${userData.role})`);
      }
    }
  } catch (error) {
    console.error('❌ Error creating sample users:', error);
  }
};

// Connect to MongoDB
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('❌ MongoDB URI is required');
  console.log('Please set MONGO_URI or MONGODB_URI environment variable');
  process.exit(1);
}

console.log('🚀 Starting TaskBerry Backend...');

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    // Create default admin user after successful DB connection
    await createDefaultAdmin();
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
      console.log('📋 Available endpoints:');
      console.log('   • POST /api/auth/login');
      console.log('   • POST /api/auth/register');
      console.log('   • GET  /api/auth/me');
      console.log('   • GET  /api/users (super admin only)');
      console.log('   • GET  /api/tasks');
      console.log('   • POST /api/tasks');
      console.log('   • PUT  /api/tasks/:id');
      console.log('   • PUT  /api/tasks/:id/status');
      console.log('   • DELETE /api/tasks/:id');
      console.log('   • GET  /api/health');
      console.log('');
      console.log('🔐 Default admin credentials:');
      console.log('   Email: admin@example.com');
      console.log('   Password: password');
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  mongoose.connection.close(() => {
    console.log('✅ MongoDB connection closed');
    process.exit(0);
  });
});
