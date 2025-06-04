
const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  assigneeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedDate: {
    type: Date,
    default: Date.now
  },
  targetDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['completed', 'in-progress', 'not-started'],
    default: 'not-started'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  completedDate: {
    type: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('Task', TaskSchema);
