const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const { requireSuperAdmin, canDeleteUser } = require('../middleware/roles');
const mongoose = require('mongoose');
const emailService = require('../services/emailService');

// @route   GET api/users
// @desc    Get all team members
// @access  Private (Super Admin only)
router.get('/', auth, requireSuperAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -resetPasswordToken')
      .populate('supervisorId', 'name email')
      .populate('managerId', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/users/pending
// @desc    Get all pending users awaiting approval
// @access  Private (Super Admin only)
router.get('/pending', auth, requireSuperAdmin, async (req, res) => {
  try {
    const pendingUsers = await User.find({ 
      status: 'pending_approval',
      role: 'pending'
    })
      .select('-password -resetPasswordToken')
      .sort({ createdAt: -1 });
    
    console.log('Found pending users:', pendingUsers.length);
    res.json(pendingUsers);
  } catch (error) {
    console.error('Error fetching pending users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/users/:id
// @desc    Get user by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET api/users/team/:userId
// @desc    Get team members for a user
// @access  Private
router.get('/team/:userId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    let teamMembers = [];
    
    if (user.role === 'manager') {
      // Find supervisors
      const supervisors = await User.find({ managerId: user._id, role: 'supervisor' });
      
      // Find direct team members
      const directMembers = await User.find({ managerId: user._id, role: 'member' });
      
      // Find indirect members (under supervisors)
      const supervisorIds = supervisors.map(s => s._id);
      const indirectMembers = await User.find({ 
        supervisorId: { $in: supervisorIds },
        role: 'member'
      });
      
      teamMembers = [...supervisors, ...directMembers, ...indirectMembers];
    } 
    else if (user.role === 'supervisor') {
      // Find team members under this supervisor
      teamMembers = await User.find({ supervisorId: user._id });
    }
    
    res.json(teamMembers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST api/users
// @desc    Create a new user
// @access  Private
router.post('/', auth, async (req, res) => {
  const { name, email, role, password, supervisorId, managerId, avatarUrl } = req.body;
  
  try {
    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    // Create new user
    user = new User({
      name,
      email,
      password: password || 'password', // Default password if not provided
      role,
      supervisorId,
      managerId,
      avatarUrl
    });
    
    await user.save();
    
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT api/users/:id
// @desc    Update a user
// @access  Private
router.put('/:id', auth, async (req, res) => {
  const { name, email, role, supervisorId, managerId, avatarUrl } = req.body;
  
  // Build user object
  const userFields = {};
  if (name) userFields.name = name;
  if (email) userFields.email = email;
  if (role) userFields.role = role;
  if (supervisorId) userFields.supervisorId = supervisorId;
  if (managerId) userFields.managerId = managerId;
  if (avatarUrl) userFields.avatarUrl = avatarUrl;
  
  try {
    let user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: userFields },
      { new: true }
    );
    
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT api/users/:userId/approve
// @desc    Approve a pending user
// @access  Private (Super Admin only)
router.put('/:userId/approve', auth, requireSuperAdmin, async (req, res) => {
  try {
    console.log('=== APPROVE USER REQUEST ===');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    console.log('Current user:', req.currentUser?.email);
    
    const { role, supervisorId, managerId } = req.body;
    const targetUserId = req.params.userId;
    
    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      console.log('Invalid user ID format:', targetUserId);
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    
    // Check if user exists and is pending
    const existingUser = await User.findById(targetUserId);
    console.log('Found user:', existingUser ? {
      id: existingUser._id,
      email: existingUser.email,
      name: existingUser.name,
      status: existingUser.status,
      role: existingUser.role
    } : 'Not found');
    
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user is actually pending
    if (existingUser.status !== 'pending_approval' || existingUser.role !== 'pending') {
      console.log('User is not pending approval:', {
        status: existingUser.status,
        role: existingUser.role
      });
      return res.status(400).json({ 
        message: 'User is not pending approval',
        currentStatus: existingUser.status,
        currentRole: existingUser.role
      });
    }
    
    // Validate role
    const validRoles = ['super_admin', 'manager', 'supervisor', 'member'];
    if (!validRoles.includes(role)) {
      console.log('Invalid role provided:', role);
      return res.status(400).json({ 
        message: 'Invalid role. Must be one of: ' + validRoles.join(', ') 
      });
    }
    
    // Build update object
    const updateFields = {
      status: 'active',
      role: role,
      approvedBy: req.currentUser._id,
      approvedAt: new Date()
    };
    
    // Validate and add supervisor/manager if provided
    if (supervisorId) {
      if (!mongoose.Types.ObjectId.isValid(supervisorId)) {
        return res.status(400).json({ message: 'Invalid supervisor ID format' });
      }
      updateFields.supervisorId = supervisorId;
    }
    
    if (managerId) {
      if (!mongoose.Types.ObjectId.isValid(managerId)) {
        return res.status(400).json({ message: 'Invalid manager ID format' });
      }
      updateFields.managerId = managerId;
    }
    
    console.log('Update fields to apply:', updateFields);
    
    // Update user with validation
    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      { $set: updateFields },
      { 
        new: true, 
        runValidators: true 
      }
    ).select('-password -resetPasswordToken');
    
    if (!updatedUser) {
      console.log('Failed to update user - user not found after update');
      return res.status(404).json({ message: 'Failed to update user' });
    }
    
    console.log('User successfully approved:', {
      id: updatedUser._id,
      email: updatedUser.email,
      name: updatedUser.name,
      newStatus: updatedUser.status,
      newRole: updatedUser.role,
      approvedBy: updatedUser.approvedBy,
      approvedAt: updatedUser.approvedAt
    });
    
    // Send approval email notification
    let emailSent = false;
    try {
      console.log('Sending approval email to:', updatedUser.email);
      
      await emailService.sendApprovalEmail({
        to: updatedUser.email,
        name: updatedUser.name,
        role: role,
        approvedBy: req.currentUser.name,
        loginUrl: process.env.FRONTEND_URL || 'https://taskberry-frontend.vercel.app'
      });
      
      console.log('Approval email sent successfully to:', updatedUser.email);
      emailSent = true;
      
    } catch (emailError) {
      console.error('Failed to send approval email:', emailError);
      // Don't fail the approval if email fails, just log the error
      // You might want to implement a retry mechanism or queue here
    }
    
    res.json({ 
      message: 'User approved successfully',
      user: updatedUser,
      emailSent: emailSent
    });
    
  } catch (error) {
    console.error('=== APPROVE USER ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    
    // Handle specific MongoDB errors
    if (error.name === 'ValidationError') {
      console.error('Validation errors:', error.errors);
      return res.status(400).json({ 
        message: 'Validation error',
        details: Object.keys(error.errors).map(key => ({
          field: key,
          message: error.errors[key].message
        }))
      });
    }
    
    if (error.name === 'CastError') {
      console.error('Cast error:', error);
      return res.status(400).json({ 
        message: 'Invalid data format',
        field: error.path,
        value: error.value
      });
    }
    
    console.error('Full error:', error);
    res.status(500).json({ 
      message: 'Server error during user approval',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   DELETE api/users/:userId/reject
// @desc    Reject and remove a pending user
// @access  Private (Super Admin only)
router.delete('/:userId/reject', auth, requireSuperAdmin, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    
    // Find the user first
    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Only allow rejection of pending users
    if (user.status !== 'pending_approval' || user.role !== 'pending') {
      return res.status(400).json({ 
        message: 'Can only reject pending users' 
      });
    }
    
    // Store user info for response
    const rejectedUserInfo = {
      id: user._id,
      name: user.name,
      email: user.email
    };
    
    // Send rejection email before deleting user
    try {
      await emailService.sendRejectionEmail({
        to: user.email,
        name: user.name,
        reason: req.body.reason || 'No specific reason provided',
        adminEmail: req.currentUser.email
      });
      console.log('Rejection email sent to:', user.email);
    } catch (emailError) {
      console.error('Failed to send rejection email:', emailError);
      // Continue with deletion even if email fails
    }
    
    // Delete the user
    await User.findByIdAndDelete(targetUserId);
    
    console.log(`User rejected and removed: ${rejectedUserInfo.email}`);
    
    res.json({ 
      message: 'User rejected and removed successfully',
      rejectedUser: rejectedUserInfo
    });
    
  } catch (error) {
    console.error('Error rejecting user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE api/users/:userId
// @desc    Delete team member
// @access  Private (Super Admin only, cannot delete self)
router.delete('/:userId', 
  auth, 
  requireSuperAdmin, 
  canDeleteUser, 
  async (req, res) => {
    try {
      const targetUser = req.targetUser;
      const currentUser = req.currentUser;
      
      // Additional security check - prevent deletion of other super admins
      if (targetUser.role === 'super_admin') {
        return res.status(403).json({ 
          message: 'Cannot delete another super admin account.' 
        });
      }
      
      // Store user info for response
      const deletedUserInfo = {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role
      };
      
      // Delete the user
      await User.findByIdAndDelete(targetUser._id);
      
      // Log the deletion (for audit trail)
      console.log(`User deleted by super admin:`, {
        deletedUser: deletedUserInfo,
        deletedBy: {
          id: currentUser._id,
          name: currentUser.name,
          email: currentUser.email
        },
        timestamp: new Date().toISOString()
      });
      
      res.json({ 
        message: 'Team member deleted successfully',
        deletedUser: deletedUserInfo
      });
      
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   PUT api/users/:userId/role
// @desc    Update user role
// @access  Private (Super Admin only)
router.put('/:userId/role', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const targetUserId = req.params.userId;
    const currentUser = req.currentUser;
    
    // Prevent changing own role
    if (currentUser._id.toString() === targetUserId) {
      return res.status(403).json({ 
        message: 'You cannot change your own role.' 
      });
    }
    
    // Validate role
    const validRoles = ['super_admin', 'manager', 'supervisor', 'member'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        message: 'Invalid role. Must be one of: ' + validRoles.join(', ') 
      });
    }
    
    const user = await User.findByIdAndUpdate(
      targetUserId,
      { role },
      { new: true }
    ).select('-password -resetPasswordToken');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ 
      message: 'User role updated successfully',
      user 
    });
    
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
