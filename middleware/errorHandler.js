// middleware/errorHandler.js
module.exports = (err, req, res, next) => {
  console.error(err.stack);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }
  
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid ID format' });
  }
  
  res.status(500).json({ message: 'Something went wrong!' });
};

// Use in server.js
app.use(errorHandler);
