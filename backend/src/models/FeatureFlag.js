const mongoose = require('mongoose');
const features = require('../config/features');

const featureFlagSchema = new mongoose.Schema({
  // Feature Information
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100
  },
  
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  
  description: {
    type: String,
    maxlength: 1000,
    default: ''
  },
  
  // Feature Status
  isEnabled: {
    type: Boolean,
    default: false
  },
  
  status: {
    type: String,
    enum: ['draft', 'testing', 'beta', 'stable', 'deprecated', 'removed'],
    default: 'draft'
  },
  
  // Feature Configuration
  config: {
    rolloutPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    targetAudience: {
      type: String,
      enum: ['all', 'premium', 'beta-testers', 'specific-users', 'location-based', 'tier-based'],
      default: 'all'
    },
    targetUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    targetLocations: [{
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: [Number],
      radius: Number
    }],
    targetTiers: [{
      type: Number,
      min: 1,
      max: 6
    }],
    conditions: {
      minAge: Number,
      maxAge: Number,
      userTypes: [String],
      deviceTypes: [String],
      appVersions: [String],
      timeRestrictions: {
        startTime: String, // HH:MM format
        endTime: String,   // HH:MM format
        daysOfWeek: [Number], // 0-6 (Sunday-Saturday)
        timezone: String
      }
    }
  },
  
  // Feature Metadata
  category: {
    type: String,
    enum: ['core', 'social', 'communication', 'media', 'location', 'security', 'analytics', 'integration', 'experimental'],
    default: 'core'
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  version: {
    type: String,
    default: '1.0.0'
  },
  
  dependencies: [{
    featureName: String,
    required: Boolean,
    minVersion: String
  }],
  
  conflicts: [String], // Array of conflicting feature names
  
  // Rollout Information
  rollout: {
    startDate: Date,
    endDate: Date,
    isGradual: {
      type: Boolean,
      default: false
    },
    stages: [{
      name: String,
      percentage: Number,
      startDate: Date,
      endDate: Date,
      isActive: {
        type: Boolean,
        default: false
      },
      metrics: {
        users: Number,
        engagement: Number,
        errors: Number,
        feedback: Number
      }
    }],
    currentStage: {
      type: Number,
      default: 0
    }
  },
  
  // Testing & Validation
  testing: {
    isAbtesting: {
      type: Boolean,
      default: false
    },
    abTestGroups: [{
      name: String,
      percentage: Number,
      variant: String,
      config: mongoose.Schema.Types.Mixed
    }],
    testUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    testLocations: [{
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: [Number],
      radius: Number
    }],
    testCriteria: {
      minUsers: Number,
      minEngagement: Number,
      maxErrorRate: Number,
      testDuration: Number // in days
    }
  },
  
  // Monitoring & Analytics
  monitoring: {
    isMonitored: {
      type: Boolean,
      default: true
    },
    metrics: [{
      name: String,
      type: {
        type: String,
        enum: ['counter', 'gauge', 'histogram', 'summary']
      },
      description: String,
      unit: String,
      thresholds: {
        warning: Number,
        critical: Number
      }
    }],
    alerts: [{
      name: String,
      condition: String,
      threshold: Number,
      severity: {
        type: String,
        enum: ['info', 'warning', 'error', 'critical']
      },
      isActive: {
        type: Boolean,
        default: true
      },
      recipients: [String]
    }]
  },
  
  // Feature Usage
  usage: {
    totalUsers: {
      type: Number,
      default: 0
    },
    activeUsers: {
      type: Number,
      default: 0
    },
    dailyActiveUsers: {
      type: Number,
      default: 0
    },
    weeklyActiveUsers: {
      type: Number,
      default: 0
    },
    monthlyActiveUsers: {
      type: Number,
      default: 0
    },
    engagementRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    errorRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    feedback: {
      positive: {
        type: Number,
        default: 0
      },
      negative: {
        type: Number,
        default: 0
      },
      neutral: {
        type: Number,
        default: 0
      },
      total: {
        type: Number,
        default: 0
      }
    }
  },
  
  // Admin & Management
  admin: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    requiresApproval: {
      type: Boolean,
      default: true
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    approvalNotes: [{
      note: String,
      approver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      action: {
        type: String,
        enum: ['approve', 'reject', 'comment']
      }
    }]
  },
  
  // Documentation
  documentation: {
    userGuide: String,
    apiDocs: String,
    changelog: [{
      version: String,
      date: Date,
      changes: [String],
      author: String
    }],
    supportContact: String,
    faq: [{
      question: String,
      answer: String
    }]
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastEnabledAt: Date,
  lastDisabledAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
featureFlagSchema.index({ name: 1 });
featureFlagSchema.index({ isEnabled: 1 });
featureFlagSchema.index({ status: 1 });
featureFlagSchema.index({ category: 1 });
featureFlagSchema.index({ priority: 1 });
featureFlagSchema.index({ 'rollout.startDate': 1 });
featureFlagSchema.index({ 'admin.approvalStatus': 1 });
featureFlagSchema.index({ 'config.targetAudience': 1 });
featureFlagSchema.index({ 'config.targetTiers': 1 });

// Virtuals
featureFlagSchema.virtual('isActive').get(function() {
  return this.isEnabled && this.status === 'stable';
});

featureFlagSchema.virtual('isTesting').get(function() {
  return ['testing', 'beta'].includes(this.status);
});

featureFlagSchema.virtual('isDeprecated').get(function() {
  return ['deprecated', 'removed'].includes(this.status);
});

featureFlagSchema.virtual('rolloutProgress').get(function() {
  if (!this.rollout.stages || this.rollout.stages.length === 0) {
    return this.config.rolloutPercentage;
  }
  
  const currentStage = this.rollout.stages[this.rollout.currentStage];
  if (!currentStage) return 0;
  
  return currentStage.percentage;
});

featureFlagSchema.virtual('canBeEnabled').get(function() {
  // Check dependencies
  if (this.dependencies && this.dependencies.length > 0) {
    // This would need to be implemented based on your feature system
    return true; // Placeholder
  }
  
  // Check conflicts
  if (this.conflicts && this.conflicts.length > 0) {
    // This would need to be implemented based on your feature system
    return true; // Placeholder
  }
  
  return true;
});

featureFlagSchema.virtual('approvalRequired').get(function() {
  return this.admin.requiresApproval && this.admin.approvalStatus === 'pending';
});

// Pre-save middleware
featureFlagSchema.pre('save', function(next) {
  // Update timestamps
  this.updatedAt = new Date();
  
  // Update last enabled/disabled timestamps
  if (this.isModified('isEnabled')) {
    if (this.isEnabled) {
      this.lastEnabledAt = new Date();
    } else {
      this.lastDisabledAt = new Date();
    }
  }
  
  // Validate rollout stages
  if (this.rollout.stages && this.rollout.stages.length > 0) {
    const totalPercentage = this.rollout.stages.reduce((sum, stage) => sum + stage.percentage, 0);
    if (totalPercentage > 100) {
      return next(new Error('Rollout stages cannot exceed 100% total'));
    }
  }
  
  next();
});

// Pre-validate middleware
featureFlagSchema.pre('validate', function(next) {
  // Validate rollout percentage
  if (this.config.rolloutPercentage < 0 || this.config.rolloutPercentage > 100) {
    this.invalidate('config.rolloutPercentage', 'Rollout percentage must be between 0 and 100');
  }
  
  // Validate target audience configuration
  if (this.config.targetAudience === 'specific-users' && (!this.config.targetUsers || this.config.targetUsers.length === 0)) {
    this.invalidate('config.targetUsers', 'Specific users must be specified when target audience is specific-users');
  }
  
  if (this.config.targetAudience === 'location-based' && (!this.config.targetLocations || this.config.targetLocations.length === 0)) {
    this.invalidate('config.targetLocations', 'Target locations must be specified when target audience is location-based');
  }
  
  if (this.config.targetAudience === 'tier-based' && (!this.config.targetTiers || this.config.targetTiers.length === 0)) {
    this.invalidate('config.targetTiers', 'Target tiers must be specified when target audience is tier-based');
  }
  
  // Validate dependencies
  if (this.dependencies && this.dependencies.length > 0) {
    for (const dep of this.dependencies) {
      if (!dep.featureName) {
        this.invalidate('dependencies', 'Dependency feature name is required');
      }
    }
  }
  
  next();
});

// Instance methods
featureFlagSchema.methods.enable = function(enabledBy = null) {
  if (!this.canBeEnabled) {
    throw new Error('Feature cannot be enabled due to dependencies or conflicts');
  }
  
  this.isEnabled = true;
  this.lastEnabledAt = new Date();
  
  if (enabledBy) {
    this.admin.lastModifiedBy = enabledBy;
  }
  
  return this.save();
};

featureFlagSchema.methods.disable = function(disabledBy = null) {
  this.isEnabled = false;
  this.lastDisabledAt = new Date();
  
  if (disabledBy) {
    this.admin.lastModifiedBy = disabledBy;
  }
  
  return this.save();
};

featureFlagSchema.methods.updateRolloutPercentage = function(percentage, updatedBy = null) {
  if (percentage < 0 || percentage > 100) {
    throw new Error('Rollout percentage must be between 0 and 100');
  }
  
  this.config.rolloutPercentage = percentage;
  
  if (updatedBy) {
    this.admin.lastModifiedBy = updatedBy;
  }
  
  return this.save();
};

featureFlagSchema.methods.addRolloutStage = function(stageData) {
  if (!this.rollout.stages) {
    this.rollout.stages = [];
  }
  
  this.rollout.stages.push({
    ...stageData,
    isActive: false,
    metrics: {
      users: 0,
      engagement: 0,
      errors: 0,
      feedback: 0
    }
  });
  
  return this.save();
};

featureFlagSchema.methods.activateRolloutStage = function(stageIndex) {
  if (!this.rollout.stages || stageIndex >= this.rollout.stages.length) {
    throw new Error('Invalid stage index');
  }
  
  // Deactivate all stages
  this.rollout.stages.forEach((stage, index) => {
    stage.isActive = index === stageIndex;
  });
  
  this.rollout.currentStage = stageIndex;
  
  return this.save();
};

featureFlagSchema.methods.addTestUser = function(userId) {
  if (!this.testing.testUsers) {
    this.testing.testUsers = [];
  }
  
  if (!this.testing.testUsers.includes(userId)) {
    this.testing.testUsers.push(userId);
  }
  
  return this.save();
};

featureFlagSchema.methods.removeTestUser = function(userId) {
  if (this.testing.testUsers) {
    this.testing.testUsers = this.testing.testUsers.filter(id => id.toString() !== userId.toString());
  }
  
  return this.save();
};

featureFlagSchema.methods.addABTestGroup = function(groupData) {
  if (!this.testing.abTestGroups) {
    this.testing.abTestGroups = [];
  }
  
  this.testing.abTestGroups.push(groupData);
  
  return this.save();
};

featureFlagSchema.methods.updateUsageMetrics = function(metrics) {
  if (metrics.totalUsers !== undefined) this.usage.totalUsers = metrics.totalUsers;
  if (metrics.activeUsers !== undefined) this.usage.activeUsers = metrics.activeUsers;
  if (metrics.dailyActiveUsers !== undefined) this.usage.dailyActiveUsers = metrics.dailyActiveUsers;
  if (metrics.weeklyActiveUsers !== undefined) this.usage.weeklyActiveUsers = metrics.weeklyActiveUsers;
  if (metrics.monthlyActiveUsers !== undefined) this.usage.monthlyActiveUsers = metrics.monthlyActiveUsers;
  if (metrics.engagementRate !== undefined) this.usage.engagementRate = metrics.engagementRate;
  if (metrics.errorRate !== undefined) this.usage.errorRate = metrics.errorRate;
  
  return this.save();
};

featureFlagSchema.methods.addFeedback = function(type, count = 1) {
  if (type === 'positive') {
    this.usage.feedback.positive += count;
  } else if (type === 'negative') {
    this.usage.feedback.negative += count;
  } else if (type === 'neutral') {
    this.usage.feedback.neutral += count;
  }
  
  this.usage.feedback.total += count;
  
  return this.save();
};

featureFlagSchema.methods.requestApproval = function(approverId, notes = '') {
  this.admin.approvalStatus = 'pending';
  
  this.admin.approvalNotes.push({
    note: notes || 'Approval requested',
    approver: approverId,
    timestamp: new Date(),
    action: 'comment'
  });
  
  return this.save();
};

featureFlagSchema.methods.approve = function(approverId, notes = '') {
  this.admin.approvalStatus = 'approved';
  
  this.admin.approvalNotes.push({
    note: notes || 'Feature approved',
    approver: approverId,
    timestamp: new Date(),
    action: 'approve'
  });
  
  return this.save();
};

featureFlagSchema.methods.reject = function(approverId, notes = '') {
  this.admin.approvalStatus = 'rejected';
  
  this.admin.approvalNotes.push({
    note: notes || 'Feature rejected',
    approver: approverId,
    timestamp: new Date(),
    action: 'reject'
  });
  
  return this.save();
};

featureFlagSchema.methods.isUserEligible = function(user, userLocation = null) {
  // Check if feature is enabled
  if (!this.isEnabled) return false;
  
  // Check target audience
  switch (this.config.targetAudience) {
    case 'all':
      return true;
      
    case 'premium':
      // Check if user has premium status
      // This would need to be implemented based on your user system
      return true; // Placeholder
      
    case 'beta-testers':
      return this.testing.testUsers.includes(user._id);
      
    case 'specific-users':
      return this.config.targetUsers.includes(user._id);
      
    case 'location-based':
      if (!userLocation || !this.config.targetLocations) return false;
      return this.config.targetLocations.some(location => {
        // Calculate distance between user and target location
        // This would need to be implemented based on your location system
        return true; // Placeholder
      });
      
    case 'tier-based':
      return this.config.targetTiers.includes(user.proximityTier);
      
    default:
      return false;
  }
};

// Static methods
featureFlagSchema.statics.findEnabled = function() {
  return this.find({ isEnabled: true, status: { $nin: ['deprecated', 'removed'] } });
};

featureFlagSchema.statics.findByCategory = function(category) {
  return this.find({ category, isEnabled: true });
};

featureFlagSchema.statics.findByStatus = function(status) {
  return this.find({ status });
};

featureFlagSchema.statics.findPendingApproval = function() {
  return this.find({ 'admin.approvalStatus': 'pending' });
};

featureFlagSchema.statics.findByTargetAudience = function(audience) {
  return this.find({ 'config.targetAudience': audience, isEnabled: true });
};

featureFlagSchema.statics.findByTier = function(tier) {
  return this.find({ 'config.targetTiers': tier, isEnabled: true });
};

featureFlagSchema.statics.findNearbyFeatures = function(coordinates, maxDistance = 5000) {
  return this.find({
    'config.targetAudience': 'location-based',
    'config.targetLocations.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    },
    isEnabled: true
  });
};

// Export model
module.exports = mongoose.model('FeatureFlag', featureFlagSchema);