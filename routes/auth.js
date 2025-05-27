const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/profile-pictures/';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Email transporter configuration
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
};

// Generate password reset email HTML
const generatePasswordResetEmail = (resetUrl) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
        <h1 style="color: #333;">Chatzy TaskMaster</h1>
      </div>
      <div style="padding: 20px; border: 1px solid #ddd; background-color: #fff;">
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your password for your Chatzy TaskMaster account.</p>
        <p>Please click the button below to reset your password. This link will expire in 1 hour.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Reset Password
          </a>
        </div>
        <p>If you didn't request a password reset, you can safely ignore this email.</p>
        <p>If the button doesn't work, copy and paste this URL into your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
      </div>
      <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
        <p>This is an automated email. Please do not reply.</p>
        <p>&copy; ${new Date().getFullYear()} Chatzy TaskMaster. All rights reserved.</p>
      </div>
    </div>
  `;
};

// Send password reset email function
const sendPasswordResetEmail = async (email, resetToken) => {
  try {
    const transporter = createTransporter();
    
    // Create the reset URL (adjust based on your frontend URL)
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Reset Your Chatzy TaskMaster Password',
      html: generatePasswordResetEmail(resetUrl),
      text: `Reset your password by visiting: ${resetUrl}`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
};

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Validate password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Create JWT payload
    const payload = {
      userId: user._id,
      user: {
        id: user._id,
        role: user.role,
        email: user.email,
        name: user.name
      }
    };
    
    // Generate JWT token
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ 
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        supervisorId: user.supervisorId,
        managerId: user.managerId
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST api/auth/register
// @desc    Register new user (pending approval)
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Name, email, and password are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists' 
      });
    }
    
    // Create user with pending status
    const user = new User({
      name,
      email,
      password,
      role: 'pending', // Set to pending until approved
      status: 'pending_approval' // Add this field to track approval status
    });
    
    await user.save();
    
    // For now, we'll return a token but with limited access
    // In a production system, you might want to require approval first
    const payload = {
      userId: user._id,
      user: {
        id: user._id,
        role: user.role,
        email: user.email,
        name: user.name,
        status: user.status
      }
    };
    
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Log the registration for admin notification
    console.log(`New user registered: ${user.name} (${user.email}) - Pending approval`);
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        avatarUrl: user.avatarUrl
      },
      message: 'Registration successful. Your account is pending approval by an administrator.'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// @route   POST api/auth/forgot-password
// @desc    Forgot password functionality
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ email });
    
    // For security, always return success even if user doesn't exist
    if (!user) {
      console.log(`Reset requested for non-existent email: ${email}`);
      return res.status(200).json({ 
        success: true,
        message: 'If an account with this email exists, we have sent password reset instructions.' 
      });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();
    
    // Send the actual email
    const emailSent = await sendPasswordResetEmail(email, resetToken);
    
    if (emailSent) {
      console.log(`Password reset email sent successfully to: ${email}`);
      res.json({ 
        success: true,
        message: 'Password reset instructions have been sent to your email.' 
      });
    } else {
      console.error(`Failed to send password reset email to: ${email}`);
      res.status(500).json({ 
        success: false,
        message: 'Failed to send reset email. Please try again later.' 
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error. Please try again later.' 
    });
  }
});

// @route   POST api/auth/reset-password
// @desc    Reset password functionality
// @access  Public
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }
    
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or expired token' 
      });
    }
    
    // Update password (let the User model handle hashing)
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    console.log(`Password reset successful for user: ${user.email}`);
    res.json({ 
      success: true,
      message: 'Password reset successful' 
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error. Please try again later.' 
    });
  }
});

// @route   POST api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    // Get the user
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password (the User model will hash it automatically)
    user.password = newPassword;
    await user.save();

    console.log(`Password changed successfully for user: ${user.email}`);
    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
});

// @route   POST api/auth/upload-profile-picture
// @desc    Upload user profile picture
// @access  Private
router.post('/upload-profile-picture', auth, upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Get the user
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete old profile picture if it exists
    if (user.avatarUrl) {
      const oldImagePath = path.join(__dirname, '..', user.avatarUrl);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    // Update user's avatar URL
    const avatarUrl = `/uploads/profile-pictures/${req.file.filename}`;
    user.avatarUrl = avatarUrl;
    await user.save();

    console.log(`Profile picture updated for user: ${user.email}`);
    res.json({
      success: true,
      message: 'Profile picture updated successfully',
      avatarUrl: avatarUrl
    });

  } catch (error) {
    console.error('Profile picture upload error:', error);
    
    // Clean up uploaded file if there was an error
    if (req.file) {
      const filePath = req.file.path;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
});

// @route   GET /uploads/profile-pictures/:filename
// @desc    Serve uploaded profile pictures
// @access  Public
router.get('/uploads/profile-pictures/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '..', 'uploads', 'profile-pictures', filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(path.resolve(filePath));
  } else {
    res.status(404).json({ message: 'Image not found' });
  }
});

// @route   GET api/auth/pending-users
// @desc    Get all pending users (Super Admin only)
// @access  Private
router.get('/pending-users', auth, async (req, res) => {
  try {
    // Check if user is super admin
    const currentUser = await User.findById(req.user.userId);
    if (currentUser.role !== 'super_admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. Super Admin only.' 
      });
    }

    const pendingUsers = await User.find({ 
      status: 'pending_approval' 
    }).select('-password').sort({ createdAt: -1 });

    res.json({
      success: true,
      users: pendingUsers
    });
  } catch (error) {
    console.error('Get pending users error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server Error' 
    });
  }
});

// @route   POST api/auth/approve-user
// @desc    Approve a pending user (Super Admin only)
// @access  Private
router.post('/approve-user', auth, async (req, res) => {
  try {
    const { userId, role, supervisorId, managerId } = req.body;

    // Check if current user is super admin
    const currentUser = await User.findById(req.user.userId);
    if (currentUser.role !== 'super_admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. Super Admin only.' 
      });
    }

    // Find and update the pending user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    if (user.status !== 'pending_approval') {
      return res.status(400).json({ 
        success: false,
        message: 'User is not pending approval' 
      });
    }

    // Update user
    user.status = 'active';
    user.role = role;
    user.supervisorId = supervisorId || null;
    user.managerId = managerId || null;
    user.approvedBy = req.user.userId;
    user.approvedAt = new Date();

    await user.save();

    // Send approval email (you can implement this later)
    // await sendApprovalEmail(user);

    console.log(`User approved: ${user.name} (${user.email}) by ${currentUser.name}`);

    res.json({
      success: true,
      message: 'User approved successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });

  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server Error' 
    });
  }
});

// @route   POST api/auth/reject-user
// @desc    Reject a pending user (Super Admin only)
// @access  Private
router.post('/reject-user', auth, async (req, res) => {
  try {
    const { userId, reason } = req.body;

    // Check if current user is super admin
    const currentUser = await User.findById(req.user.userId);
    if (currentUser.role !== 'super_admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. Super Admin only.' 
      });
    }

    // Find and delete the pending user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Send rejection email (optional - implement later)
    // await sendRejectionEmail(user, reason);

    // Delete the user
    await User.findByIdAndDelete(userId);

    console.log(`User rejected and deleted: ${user.name} (${user.email}) by ${currentUser.name}`);

    res.json({
      success: true,
      message: 'User rejected and removed'
    });

  } catch (error) {
    console.error('Reject user error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server Error' 
    });
  }
});

module.exports = router;
