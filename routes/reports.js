
const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const Task = require('../models/Task');
const auth = require('../middleware/auth');

// @route   GET api/reports
// @desc    Get all reports
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const reports = await Report.find().sort({ generatedAt: -1 });
    res.json(reports);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET api/reports/:id
// @desc    Get report by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id).populate('taskIds');
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    res.json(report);
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Report not found' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST api/reports
// @desc    Generate a report
// @access  Private
router.post('/', auth, async (req, res) => {
  const { title, type } = req.body;
  
  try {
    // Get tasks based on report type
    const now = new Date();
    let startDate;
    
    if (type === 'daily') {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    } else if (type === 'weekly') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
      startDate.setHours(0, 0, 0, 0);
    } else if (type === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Start of month
    }
    
    const tasks = await Task.find({
      lastUpdated: { $gte: startDate }
    });
    
    const taskIds = tasks.map(task => task._id);
    
    const newReport = new Report({
      title,
      type,
      generatedAt: now,
      taskIds
    });
    
    const report = await newReport.save();
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
