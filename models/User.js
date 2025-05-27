const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['super_admin', 'manager', 'supervisor', 'member', 'pending'],
      default: 'pending' // New users start as pending
    },
    status: {
      type: String,
      enum: ['active', 'pending_approval', 'suspended'],
      default: 'pending_approval' // New users need approval
    },
    avatarUrl: {
      type: String
    },
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resetPasswordToken: {
      type: String
    },
    resetPasswordExpires: {
      type: Date
    },
    // Additional fields for tracking
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: {
      type: Date
    }
  },
  { 
    timestamps: true 
  }
);

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
UserSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', UserSchema);
