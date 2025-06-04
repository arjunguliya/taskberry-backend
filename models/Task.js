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
  createdBy: {
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
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  tags: [{
    type: String
  }],
  comments: [{
    text: String,
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { 
  timestamps: true 
});

// Transform _id to id when converting to JSON
TaskSchema.set('toJSON', {
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

// Index for better performance
TaskSchema.index({ assigneeId: 1 });
TaskSchema.index({ createdBy: 1 });
TaskSchema.index({ status: 1 });
TaskSchema.index({ targetDate: 1 });

module.exports = mongoose.model('Task', TaskSchema);
