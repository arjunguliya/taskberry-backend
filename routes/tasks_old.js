
const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const auth = require('../middleware/auth');

// @route   GET api/tasks
// @desc    Get all tasks
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const tasks = await Task.find().sort({ lastUpdated: -1 });
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET api/tasks/:id
// @desc    Get task by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET api/tasks/user/:userId
// @desc    Get tasks for a user
// @access  Private
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ assigneeId: req.params.userId }).sort({ lastUpdated: -1 });
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET api/tasks/team/:userId
// @desc    Get tasks for a team
// @access  Private
router.get('/team/:userId', auth, async (req, res) => {
  try {
    // This endpoint would need to fetch the team members first,
    // then get all tasks assigned to those team members
    // The logic would be similar to what's in the frontend
    // This is a simplified version just to demonstrate
    
    const response = await fetch(`http://localhost:${process.env.PORT}/api/users/team/${req.params.userId}`);
    const teamMembers = await response.json();
    
    const teamMemberIds = teamMembers.map(member => member.id);
    const tasks = await Task.find({ assigneeId: { $in: teamMemberIds } }).sort({ lastUpdated: -1 });
    
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST api/tasks
// @desc    Create a task
// @access  Private
router.post('/', auth, async (req, res) => {
  const { title, description, assigneeId, targetDate, status } = req.body;
  
  try {
    const newTask = new Task({
      title,
      description,
      assigneeId,
      targetDate,
      status: status || 'not-started',
      assignedDate: new Date(),
      lastUpdated: new Date()
    });
    
    const task = await newTask.save();
    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT api/tasks/:id
// @desc    Update a task
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    let task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Update fields
    Object.keys(req.body).forEach(key => {
      if (task[key] !== undefined) {
        task[key] = req.body[key];
      }
    });
    
    // Always update lastUpdated
    task.lastUpdated = new Date();
    
    // If status is being changed to completed, set completedDate
    if (req.body.status === 'completed' && task.status !== 'completed') {
      task.completedDate = new Date();
    } else if (req.body.status && req.body.status !== 'completed') {
      // If changing from completed to something else, remove completedDate
      task.completedDate = undefined;
    }
    
    await task.save();
    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   DELETE api/tasks/:id
// @desc    Delete a task
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    await task.deleteOne();
    res.json({ message: 'Task removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
