const User = require('../models/User');

// Middleware to check if user is super admin
const requireSuperAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId || req.user.user?.id);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    if (user.role !== 'super_admin') {
      return res.status(403).json({ 
        message: 'Access denied. Super admin privileges required.' 
      });
    }
    
    req.currentUser = user;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Middleware to check if user can delete target user
const canDeleteUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId;
    const currentUser = req.currentUser;
    
    // Prevent self-deletion
    if (currentUser._id.toString() === targetUserId) {
      return res.status(403).json({ 
        message: 'You cannot delete your own account for security reasons.' 
      });
    }
    
    // Check if target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    req.targetUser = targetUser;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  requireSuperAdmin,
  canDeleteUser
};
