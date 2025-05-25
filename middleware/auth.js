// middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add user info to request
    req.user = decoded;
    
    console.log('Authenticated user:', {
      userId: decoded.userId,
      role: decoded.user?.role,
      email: decoded.user?.email
    });
    
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token has expired' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    } else {
      return res.status(401).json({ message: 'Token verification failed' });
    }
  }
};
