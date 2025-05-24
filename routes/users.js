
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// @route   GET api/users
// @desc    Get all users
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
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

module.exports = router;
