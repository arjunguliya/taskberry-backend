const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const { requireSuperAdmin, canDeleteUser } = require('../middleware/roles');

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
