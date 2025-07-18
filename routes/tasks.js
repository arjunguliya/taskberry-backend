const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const User = require('../models/User');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// Helper function to check if user is in manager's team
const isUserInManagerTeam = async (userId, managerId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return false;
    
    // Direct report to manager
    if (user.managerId && user.managerId.toString() === managerId) {
      return true;
    }
    
    // Member under supervisor who reports to manager
    if (user.role === 'member' && user.supervisorId) {
      const supervisor = await User.findById(user.supervisorId);
      if (supervisor && supervisor.managerId && supervisor.managerId.toString() === managerId) {
        return true;
      }
    }
    
    // Supervisor reporting to manager
    if (user.role === 'supervisor' && user.managerId && user.managerId.toString() === managerId) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking if user is in manager team:', error);
    return false;
  }
};

// Helper function to get assignable users
const getAssignableUsers = async (currentUser) => {
  try {
    const allUsers = await User.find({ status: 'active' }).select('-password');
    let assignableUsers = [];
    
    switch (currentUser.role) {
      case 'super_admin':
        // Super admin can assign to anyone
        assignableUsers = allUsers.filter(user => user._id.toString() !== currentUser._id.toString());
        break;
        
      case 'manager':
        // Manager can assign to:
        // 1. Supervisors under them
        // 2. Members under them (direct reports)
        // 3. Members under their supervisors
        // 4. Other managers (for reassignment)
        assignableUsers = allUsers.filter(user => {
          if (user._id.toString() === currentUser._id.toString()) return false;
          
          // Include supervisors reporting to this manager
          if (user.role === 'supervisor' && user.managerId && user.managerId.toString() === currentUser._id.toString()) {
            return true;
          }
          
          // Include members reporting directly to this manager
          if (user.role === 'member' && user.managerId && user.managerId.toString() === currentUser._id.toString()) {
            return true;
          }
          
          // Include members under supervisors of this manager
          if (user.role === 'member' && user.supervisorId) {
            const supervisor = allUsers.find(s => s._id.toString() === user.supervisorId.toString());
            if (supervisor && supervisor.managerId && supervisor.managerId.toString() === currentUser._id.toString()) {
              return true;
            }
          }
          
          // Include other managers for reassignment
          if (user.role === 'manager') {
            return true;
          }
          
          return false;
        });
        break;
        
      case 'supervisor':
        // Supervisor can assign to:
        // 1. Members under them
        // 2. Themselves
        assignableUsers = allUsers.filter(user => {
          if (user._id.toString() === currentUser._id.toString()) return true;
          
          // Include members reporting to this supervisor
          if (user.role === 'member' && user.supervisorId && user.supervisorId.toString() === currentUser._id.toString()) {
            return true;
          }
          
          return false;
        });
        break;
        
      case 'member':
        // Member can only assign to themselves
        assignableUsers = [currentUser];
        break;
        
      default:
        assignableUsers = [];
    }
    
    return assignableUsers;
  } catch (error) {
    console.error('Error getting assignable users:', error);
    return [];
  }
};

// @route   GET api/tasks/assignable-users
// @desc    Get users that current user can assign tasks to
// @access  Private
router.get('/assignable-users', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const assignableUsers = await getAssignableUsers(currentUser);
    res.json(assignableUsers);
  } catch (error) {
    console.error('Error getting assignable users:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET api/tasks
// @desc    Get tasks based on user role and permissions
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    let tasks = [];
    
    switch (currentUser.role) {
      case 'super_admin':
        // Super admin can see all tasks
        tasks = await Task.find()
          .populate('assigneeId', 'name email')
          .populate('createdBy', 'name email')
          .sort({ lastUpdated: -1 });
        break;
        
      case 'manager':
        // Manager can see tasks assigned to their team
        const teamMembers = await User.find({
          $or: [
            { managerId: currentUser._id },
            { supervisorId: { $in: await User.find({ managerId: currentUser._id }).distinct('_id') } }
          ]
        }).distinct('_id');
        
        teamMembers.push(currentUser._id); // Include manager's own tasks
        
        tasks = await Task.find({ 
          assigneeId: { $in: teamMembers } 
        })
          .populate('assigneeId', 'name email')
          .populate('createdBy', 'name email')
          .sort({ lastUpdated: -1 });
        break;
        
      case 'supervisor':
        // Supervisor can see their tasks and their team members' tasks
        const supervisorTeam = await User.find({ 
          supervisorId: currentUser._id 
        }).distinct('_id');
        
        supervisorTeam.push(currentUser._id); // Include supervisor's own tasks
        
        tasks = await Task.find({ 
          assigneeId: { $in: supervisorTeam } 
        })
          .populate('assigneeId', 'name email')
          .populate('createdBy', 'name email')
          .sort({ lastUpdated: -1 });
        break;
        
      case 'member':
        // Member can only see their own tasks
        tasks = await Task.find({ 
          assigneeId: currentUser._id 
        })
          .populate('assigneeId', 'name email')
          .populate('createdBy', 'name email')
          .sort({ lastUpdated: -1 });
        break;
        
      default:
        tasks = [];
    }
    
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET api/tasks/:id
// @desc    Get task by ID (with permission check)
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const task = await Task.findById(req.params.id)
      .populate('assigneeId', 'name email')
      .populate('createdBy', 'name email');
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    const currentUser = await User.findById(req.user.userId);
    
    // Check if user has permission to view this task
    let hasPermission = false;
    
    if (currentUser.role === 'super_admin') {
      hasPermission = true;
    } else if (currentUser.role === 'manager') {
      // Manager can view tasks of their team
      hasPermission = await isUserInManagerTeam(task.assigneeId._id, currentUser._id.toString());
      // Also allow if manager created the task
      if (task.createdBy && task.createdBy._id.toString() === currentUser._id.toString()) {
        hasPermission = true;
      }
    } else if (currentUser.role === 'supervisor') {
      // Supervisor can view their own tasks and their team's tasks
      if (task.assigneeId._id.toString() === currentUser._id.toString()) {
        hasPermission = true;
      } else {
        const teamMember = await User.findById(task.assigneeId._id);
        if (teamMember && teamMember.supervisorId && teamMember.supervisorId.toString() === currentUser._id.toString()) {
          hasPermission = true;
        }
      }
    } else if (currentUser.role === 'member') {
      // Member can only view their own tasks
      hasPermission = task.assigneeId._id.toString() === currentUser._id.toString();
    }
    
    if (!hasPermission) {
      return res.status(403).json({ message: 'Access denied' });
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

// @route   POST api/tasks
// @desc    Create a task with permission checks
// @access  Private
router.post('/', auth, async (req, res) => {
  const { title, description, assigneeId, targetDate, status, priority, tags } = req.body;
  
  try {
    console.log('Creating task with data:', req.body);

    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Validate required fields
    if (!title || !assigneeId || !targetDate) {
      return res.status(400).json({ message: 'Title, assignee, and target date are required' });
    }
    
    // Validate ObjectId format for assigneeId
    if (!mongoose.Types.ObjectId.isValid(assigneeId)) {
      return res.status(400).json({ message: 'Invalid assignee ID format' });
    }

    // Validate assignee
    const assignee = await User.findById(assigneeId);
    if (!assignee) {
      return res.status(400).json({ message: 'Assignee not found' });
    }
    
    // Check if current user can assign to this user
    const assignableUsers = await getAssignableUsers(currentUser);
    const canAssign = assignableUsers.some(user => user._id.toString() === assigneeId);
    
    if (!canAssign) {
      return res.status(403).json({ message: 'You cannot assign tasks to this user' });
    }
    
    // Validate date format
    const targetDateObj = new Date(targetDate);
    if (isNaN(targetDateObj.getTime())) {
      return res.status(400).json({ message: 'Invalid target date format' });
    }

    const newTask = new Task({
      title: title.trim(),
      description: description ? description.trim() : '',
      assigneeId: assigneeId,
      targetDate: targetDateObj,
      status: status || 'not-started',
      priority: priority || 'medium',
      tags: tags || [],
      assignedDate: new Date(),
      lastUpdated: new Date(),
      createdBy: currentUser._id
    });
    
    console.log('Saving new task:', newTask);
    const task = await newTask.save();
    console.log('Task saved successfully:', task._id);
    
    const populatedTask = await Task.findById(task._id)
      .populate('assigneeId', 'name email')
      .populate('createdBy', 'name email');
    
    res.status(201).json(populatedTask);
  } catch (error) {
    console.error('Task creation error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: errors
      });
    }
    
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT api/tasks/:id
// @desc    Update a task with permission checks
// @access  Private
router.put('/:id', auth, async (req, res) => {
  const { title, description, assigneeId, targetDate, status, priority, tags } = req.body;
  
  try {
    console.log('=== TASK UPDATE REQUEST ===');
    console.log('Task ID:', req.params.id);
    console.log('Request body:', req.body);

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    console.log('Current task data:', {
      taskId: task._id,
      title: task.title,
      status: task.status,
      assigneeId: task.assigneeId,
      createdBy: task.createdBy
    });

    console.log('Current user data:', {
      userId: currentUser._id,
      role: currentUser.role,
      name: currentUser.name
    });
    
    // ENHANCED: More comprehensive edit permissions
    let canEdit = false;
    let editReason = '';
    
    // Rule 1: Creator can edit
    if (task.createdBy && task.createdBy.toString() === currentUser._id.toString()) {
      canEdit = true;
      editReason = 'User is task creator';
    }
    
    // Rule 2: Current assignee can edit (if they're supervisor or higher)
    else if (task.assigneeId.toString() === currentUser._id.toString() && 
        ['supervisor', 'manager', 'super_admin'].includes(currentUser.role)) {
      canEdit = true;
      editReason = 'User is task assignee with appropriate role';
    }
    
    // Rule 3: Manager can edit tasks of their team
    else if (currentUser.role === 'manager') {
      const isTeamTask = await isUserInManagerTeam(task.assigneeId.toString(), currentUser._id.toString());
      if (isTeamTask) {
        canEdit = true;
        editReason = 'Manager editing team task';
      }
    }
    
    // Rule 4: Supervisor can edit tasks assigned to their team members
    else if (currentUser.role === 'supervisor') {
      const taskAssignee = await User.findById(task.assigneeId);
      if (taskAssignee && taskAssignee.supervisorId && 
          taskAssignee.supervisorId.toString() === currentUser._id.toString()) {
        canEdit = true;
        editReason = 'Supervisor editing team member task';
      }
    }
    
    // Rule 5: Super admin can edit any task
    else if (currentUser.role === 'super_admin') {
      canEdit = true;
      editReason = 'Super admin';
    }
    
    console.log('Edit permission check:', { canEdit, editReason });
    
    if (!canEdit) {
      console.log('Edit denied: No applicable permission rule matched');
      return res.status(403).json({ 
        message: 'You cannot edit this task',
        debug: {
          userRole: currentUser.role,
          userId: currentUser._id,
          taskCreatedBy: task.createdBy,
          taskAssigneeId: task.assigneeId
        }
      });
    }
    
    // If assignee is being changed, check reassignment permissions
    if (assigneeId && assigneeId !== task.assigneeId.toString()) {
      console.log('Checking reassignment permissions...');
      
      // Validate new assignee ObjectId format
      if (!mongoose.Types.ObjectId.isValid(assigneeId)) {
        return res.status(400).json({ message: 'Invalid new assignee ID format' });
      }

      let canReassign = false;
      
      // Rule 1: Creator can reassign
      if (task.createdBy && task.createdBy.toString() === currentUser._id.toString()) {
        canReassign = true;
      }
      
      // Rule 2: Current assignee can reassign (if they're supervisor or higher)
      if (task.assigneeId.toString() === currentUser._id.toString() && 
          ['supervisor', 'manager', 'super_admin'].includes(currentUser.role)) {
        canReassign = true;
      }
      
      // Rule 3: Manager can reassign
      if (currentUser.role === 'manager') {
        canReassign = true;
      }
      
      // Rule 4: Super admin can reassign
      if (currentUser.role === 'super_admin') {
        canReassign = true;
      }
      
      if (!canReassign) {
        return res.status(403).json({ message: 'You cannot reassign this task' });
      }
      
      // Validate new assignee exists
      const newAssignee = await User.findById(assigneeId);
      if (!newAssignee) {
        return res.status(400).json({ message: 'New assignee not found' });
      }
      
      // Check if user can assign to the new assignee
      const assignableUsers = await getAssignableUsers(currentUser);
      const canAssignToUser = assignableUsers.some(user => user._id.toString() === assigneeId);
      
      if (!canAssignToUser) {
        return res.status(403).json({ message: 'You cannot assign tasks to this user' });
      }
    }
    
    // Build update object with validation
    const updateFields = {};
    
    if (title !== undefined) {
      if (title.trim().length === 0) {
        return res.status(400).json({ message: 'Title cannot be empty' });
      }
      updateFields.title = title.trim();
    }
    
    if (description !== undefined) {
      updateFields.description = description ? description.trim() : '';
    }
    
    if (assigneeId) {
      updateFields.assigneeId = assigneeId;
    }
    
    if (targetDate) {
      const targetDateObj = new Date(targetDate);
      if (isNaN(targetDateObj.getTime())) {
        return res.status(400).json({ message: 'Invalid target date format' });
      }
      updateFields.targetDate = targetDateObj;
    }
    
    if (status) {
      const validStatuses = ['not-started', 'in-progress', 'completed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      }
      updateFields.status = status;
    }
    
    if (priority) {
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({ message: 'Invalid priority value' });
      }
      updateFields.priority = priority;
    }
    
    if (tags) {
      updateFields.tags = Array.isArray(tags) ? tags : [];
    }
    
    updateFields.lastUpdated = new Date();
    
    // Handle completion logic
    if (status === 'completed' && task.status !== 'completed') {
      updateFields.completedDate = new Date();
      console.log('Setting completion date');
    } else if (status && status !== 'completed' && task.status === 'completed') {
      updateFields.completedDate = undefined;
      console.log('Removing completion date');
    }
    
    console.log('Update fields:', updateFields);
    
    // Perform the update
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields, $unset: updateFields.completedDate === undefined ? { completedDate: 1 } : {} },
      { 
        new: true,
        runValidators: true
      }
    )
      .populate('assigneeId', 'name email')
      .populate('createdBy', 'name email');
    
    if (!updatedTask) {
      return res.status(404).json({ message: 'Task not found after update' });
    }
    
    console.log('Task updated successfully:', updatedTask._id);
    console.log('=== TASK UPDATE SUCCESS ===');
    
    res.json(updatedTask);
  } catch (error) {
    console.error('=== TASK UPDATE ERROR ===');
    console.error('Error details:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: errors
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: 'Invalid data format',
        field: error.path
      });
    }
    
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT api/tasks/:id/status
// @desc    Update task status
// @access  Private
router.put('/:id/status', auth, async (req, res) => {
  try {
    console.log('=== STATUS UPDATE REQUEST ===');
    console.log('Task ID:', req.params.id);
    console.log('New status:', req.body.status);

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const { status } = req.body;
    const currentUser = await User.findById(req.user.userId);
    
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Validate status
    const validStatuses = ['not-started', 'in-progress', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }
    
    // Check if user can update this task's status
    let canUpdate = false;
    let updateReason = '';
    
    // Task assignee can update status
    if (task.assigneeId.toString() === currentUser._id.toString()) {
      canUpdate = true;
      updateReason = 'User is task assignee';
    }
    
    // Task creator can update status
    else if (task.createdBy && task.createdBy.toString() === currentUser._id.toString()) {
      canUpdate = true;
      updateReason = 'User is task creator';
    }
    
    // Manager can update status of team tasks
    else if (currentUser.role === 'manager') {
      const isTeamTask = await isUserInManagerTeam(task.assigneeId.toString(), currentUser._id.toString());
      if (isTeamTask) {
        canUpdate = true;
        updateReason = 'Manager updating team task status';
      }
    }
    
    // Supervisor can update status of their team's tasks
    else if (currentUser.role === 'supervisor') {
      const taskAssignee = await User.findById(task.assigneeId);
      if (taskAssignee && taskAssignee.supervisorId && 
          taskAssignee.supervisorId.toString() === currentUser._id.toString()) {
        canUpdate = true;
        updateReason = 'Supervisor updating team task status';
      }
    }
    
    // Super admin can update any task
    else if (currentUser.role === 'super_admin') {
      canUpdate = true;
      updateReason = 'Super admin';
    }
    
    console.log('Status update permission check:', { canUpdate, updateReason });
    
    if (!canUpdate) {
      return res.status(403).json({ message: 'You cannot update this task status' });
    }
    
    // Build update object
    const updateFields = {
      status,
      lastUpdated: new Date()
    };
    
    // Handle completion date
    if (status === 'completed' && task.status !== 'completed') {
      updateFields.completedDate = new Date();
    } else if (status !== 'completed' && task.status === 'completed') {
      // Remove completion date when moving away from completed
      updateFields.$unset = { completedDate: 1 };
    }
    
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    )
      .populate('assigneeId', 'name email')
      .populate('createdBy', 'name email');
    
    console.log('Status updated successfully:', updatedTask._id, 'to', status);
    console.log('=== STATUS UPDATE SUCCESS ===');
    
    res.json(updatedTask);
  } catch (error) {
    console.error('=== STATUS UPDATE ERROR ===');
    console.error('Error details:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: errors
      });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE api/tasks/:id
// @desc    Delete a task with permission checks
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check delete permissions
    let canDelete = false;
    
    // Rule 1: Manager can delete tasks created by them or their team
    if (currentUser.role === 'manager') {
      if (task.createdBy && task.createdBy.toString() === currentUser._id.toString()) {
        canDelete = true; // Manager created the task
      } else {
        // Check if task is from manager's team
        const isTeamTask = await isUserInManagerTeam(task.assigneeId.toString(), currentUser._id.toString());
        if (isTeamTask) {
          canDelete = true;
        }
      }
    }
    
    // Rule 2: Super admin can delete any task
    if (currentUser.role === 'super_admin') {
      canDelete = true;
    }
    
    if (!canDelete) {
      return res.status(403).json({ message: 'You cannot delete this task' });
    }
    
    await Task.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/tasks/user/:userId
// @desc    Get tasks for a specific user (with permission check)
// @access  Private
router.get('/user/:userId', auth, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const currentUser = await User.findById(req.user.userId);
    const targetUserId = req.params.userId;
    
    // Check if current user can view tasks of target user
    let canView = false;
    
    if (currentUser.role === 'super_admin') {
      canView = true;
    } else if (currentUser._id.toString() === targetUserId) {
      canView = true; // Can view own tasks
    } else if (currentUser.role === 'manager') {
      canView = await isUserInManagerTeam(targetUserId, currentUser._id.toString());
    } else if (currentUser.role === 'supervisor') {
      const targetUser = await User.findById(targetUserId);
      if (targetUser && targetUser.supervisorId && targetUser.supervisorId.toString() === currentUser._id.toString()) {
        canView = true;
      }
    }
    
    if (!canView) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const tasks = await Task.find({ assigneeId: targetUserId })
      .populate('assigneeId', 'name email')
      .populate('createdBy', 'name email')
      .sort({ lastUpdated: -1 });
    
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET api/tasks/team/:userId
// @desc    Get tasks for a team (based on user's role)
// @access  Private
router.get('/team/:userId', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.userId);
    let teamMemberIds = [];
    
    if (currentUser.role === 'manager') {
      // Get all users under this manager
      const directReports = await User.find({ managerId: currentUser._id }).distinct('_id');
      const supervisors = await User.find({ managerId: currentUser._id, role: 'supervisor' }).distinct('_id');
      const indirectReports = await User.find({ supervisorId: { $in: supervisors } }).distinct('_id');
      
      teamMemberIds = [...directReports, ...indirectReports, currentUser._id];
    } else if (currentUser.role === 'supervisor') {
      // Get members under this supervisor
      const teamMembers = await User.find({ supervisorId: currentUser._id }).distinct('_id');
      teamMemberIds = [...teamMembers, currentUser._id];
    } else {
      // Members can only see their own tasks
      teamMemberIds = [currentUser._id];
    }
    
    const tasks = await Task.find({ assigneeId: { $in: teamMemberIds } })
      .populate('assigneeId', 'name email')
      .populate('createdBy', 'name email')
      .sort({ lastUpdated: -1 });
    
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
