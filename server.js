const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const userRoutes = require('./routes/users');

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
    endpoints: ['/api/auth', '/api/health']
  });
});

// Connect to MongoDB
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('MongoDB URI is required');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
