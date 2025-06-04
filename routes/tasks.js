const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const User = require('../models/User');
const auth = require('../middleware/auth');

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
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Validate required fields
    if (!title || !assigneeId || !targetDate) {
      return res.status(400).json({ message: 'Title, assignee, and target date are required' });
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
    
    const newTask = new Task({
      title,
      description,
      assigneeId,
      targetDate,
      status: status || 'not-started',
      priority: priority || 'medium',
      tags: tags || [],
      assignedDate: new Date(),
      lastUpdated: new Date(),
      createdBy: currentUser._id
    });
    
    const task = await newTask.save();
    const populatedTask = await Task.findById(task._id)
      .populate('assigneeId', 'name email')
      .populate('createdBy', 'name email');
    
    res.json(populatedTask);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT api/tasks/:id
// @desc    Update a task with permission checks
// @access  Private
router.put('/:id', auth, async (req, res) => {
  const { title, description, assigneeId, targetDate, status, priority, tags } = req.body;
  
  try {
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check edit permissions
    let canEdit = false;
    
    // Rule 1: Creator can edit
    if (task.createdBy && task.createdBy.toString() === currentUser._id.toString()) {
      canEdit = true;
    }
    
    // Rule 2: Manager can edit tasks of their team
    if (currentUser.role === 'manager') {
      const isTeamTask = await isUserInManagerTeam(task.assigneeId.toString(), currentUser._id.toString());
      if (isTeamTask) {
        canEdit = true;
      }
    }
    
    // Rule 3: Super admin can edit any task
    if (currentUser.role === 'super_admin') {
      canEdit = true;
    }
    
    if (!canEdit) {
      return res.status(403).json({ message: 'You cannot edit this task' });
    }
    
    // If assignee is being changed, check reassignment permissions
    if (assigneeId && assigneeId !== task.assigneeId.toString()) {
      let canReassign = false;
      
      // Rule 1: Creator can reassign
      if (task.createdBy && task.createdBy.toString() === currentUser._id.toString()) {
        canReassign = true;
      }
      
      // Rule 2: Manager can reassign
      if (currentUser.role === 'manager') {
        canReassign = true;
      }
      
      // Rule 3: Super admin can reassign
      if (currentUser.role === 'super_admin') {
        canReassign = true;
      }
      
      if (!canReassign) {
        return res.status(403).json({ message: 'You cannot reassign this task' });
      }
      
      // Validate new assignee
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
    
    // Update task
    const updateFields = {};
    if (title) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (assigneeId) updateFields.assigneeId = assigneeId;
    if (targetDate) updateFields.targetDate = targetDate;
    if (status) updateFields.status = status;
    if (priority) updateFields.priority = priority;
    if (tags) updateFields.tags = tags;
    updateFields.lastUpdated = new Date();
    
    // If status is being changed to completed, set completedDate
    if (status === 'completed' && task.status !== 'completed') {
      updateFields.completedDate = new Date();
    } else if (status && status !== 'completed') {
      updateFields.completedDate = undefined;
    }
    
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    )
      .populate('assigneeId', 'name email')
      .populate('createdBy', 'name email');
    
    res.json(updatedTask);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT api/tasks/:id/status
// @desc    Update task status
// @access  Private
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const currentUser = await User.findById(req.user.userId);
    
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check if user can update this task's status
    let canUpdate = false;
    
    // Task assignee can update status
    if (task.assigneeId.toString() === currentUser._id.toString()) {
      canUpdate = true;
    }
    
    // Task creator can update status
    if (task.createdBy && task.createdBy.toString() === currentUser._id.toString()) {
      canUpdate = true;
    }
    
    // Manager can update status of team tasks
    if (currentUser.role === 'manager') {
      const isTeamTask = await isUserInManagerTeam(task.assigneeId.toString(), currentUser._id.toString());
      if (isTeamTask) {
        canUpdate = true;
      }
    }
    
    // Super admin can update any task
    if (currentUser.role === 'super_admin') {
      canUpdate = true;
    }
    
    if (!canUpdate) {
      return res.status(403).json({ message: 'You cannot update this task status' });
    }
    
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        lastUpdated: new Date(),
        ...(status === 'completed' ? { completedDate: new Date() } : {})
      },
      { new: true }
    )
      .populate('assigneeId', 'name email')
      .populate('createdBy', 'name email');
    
    res.json(updatedTask);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE api/tasks/:id
// @desc    Delete a task with permission checks
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
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
