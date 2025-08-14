const mongoose = require('mongoose');
const features = require('../config/features');

const analyticsSchema = new mongoose.Schema({
  // Analytics Information
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  
  // Analytics Type
  type: {
    type: String,
    enum: ['user', 'system', 'business', 'performance', 'security', 'feature', 'location', 'social', 'custom'],
    required: true
  },
  
  // Data Source
  source: {
    type: {
      type: String,
      enum: ['database', 'api', 'logs', 'events', 'metrics', 'external'],
      required: true
    },
    sourceId: String,
    collection: String,
    endpoint: String,
    service: String
  },
  
  // Time Period
  period: {
    type: {
      type: String,
      enum: ['realtime', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'],
      required: true
    },
    startTime: {
      type: Date,
      required: true
    },
    endTime: {
      type: Date,
      required: true
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  
  // Metrics Data
  metrics: {
    // User Metrics
    users: {
      total: { type: Number, default: 0 },
      active: { type: Number, default: 0 },
      new: { type: Number, default: 0 },
      returning: { type: Number, default: 0 },
      churned: { type: Number, default: 0 },
      premium: { type: Number, default: 0 },
      verified: { type: Number, default: 0 },
      online: { type: Number, default: 0 },
      offline: { type: Number, default: 0 }
    },
    
    // Activity Metrics
    activity: {
      totalSessions: { type: Number, default: 0 },
      averageSessionDuration: { type: Number, default: 0 }, // in seconds
      totalMessages: { type: Number, default: 0 },
      totalCalls: { type: Number, default: 0 },
      totalStories: { type: Number, default: 0 },
      totalEvents: { type: Number, default: 0 },
      totalGroups: { type: Number, default: 0 },
      totalPolls: { type: Number, default: 0 },
      messageFrequency: { type: Number, default: 0 }, // per user per day
      callFrequency: { type: Number, default: 0 }, // per user per day
      storyFrequency: { type: Number, default: 0 }, // per user per day
      eventFrequency: { type: Number, default: 0 } // per user per day
    },
    
    // Engagement Metrics
    engagement: {
      dailyActiveUsers: { type: Number, default: 0 },
      weeklyActiveUsers: { type: Number, default: 0 },
      monthlyActiveUsers: { type: Number, default: 0 },
      engagementRate: { type: Number, default: 0 }, // percentage
      retentionRate: { type: Number, default: 0 }, // percentage
      churnRate: { type: Number, default: 0 }, // percentage
      stickiness: { type: Number, default: 0 }, // DAU/MAU ratio
      averageTimeSpent: { type: Number, default: 0 }, // in minutes
      pageViews: { type: Number, default: 0 },
      bounceRate: { type: Number, default: 0 }
    },
    
    // Social Metrics
    social: {
      totalFriendships: { type: Number, default: 0 },
      totalGroups: { type: Number, default: 0 },
      totalEvents: { type: Number, default: 0 },
      averageFriendsPerUser: { type: Number, default: 0 },
      averageGroupSize: { type: Number, default: 0 },
      averageEventAttendance: { type: Number, default: 0 },
      socialInteractions: { type: Number, default: 0 },
      contentShares: { type: Number, default: 0 },
      contentLikes: { type: Number, default: 0 },
      contentComments: { type: Number, default: 0 }
    },
    
    // Performance Metrics
    performance: {
      responseTime: {
        average: { type: Number, default: 0 }, // milliseconds
        p50: { type: Number, default: 0 },    // 50th percentile
        p90: { type: Number, default: 0 },    // 90th percentile
        p95: { type: Number, default: 0 },    // 95th percentile
        p99: { type: Number, default: 0 }     // 99th percentile
      },
      throughput: {
        requestsPerSecond: { type: Number, default: 0 },
        messagesPerSecond: { type: Number, default: 0 },
        callsPerSecond: { type: Number, default: 0 }
      },
      errorRate: { type: Number, default: 0 }, // percentage
      availability: { type: Number, default: 100 }, // percentage
      uptime: { type: Number, default: 100 }, // percentage
      latency: {
        database: { type: Number, default: 0 },
        cache: { type: Number, default: 0 },
        external: { type: Number, default: 0 }
      }
    },
    
    // Business Metrics
    business: {
      revenue: {
        total: { type: Number, default: 0 },
        subscription: { type: Number, default: 0 },
        advertising: { type: Number, default: 0 },
        premium: { type: Number, default: 0 },
        other: { type: Number, default: 0 }
      },
      conversions: {
        signups: { type: Number, default: 0 },
        premiumUpgrades: { type: Number, default: 0 },
        adClicks: { type: Number, default: 0 },
        purchases: { type: Number, default: 0 }
      },
      costs: {
        infrastructure: { type: Number, default: 0 },
        marketing: { type: Number, default: 0 },
        operations: { type: Number, default: 0 },
        development: { type: Number, default: 0 }
      },
      roi: { type: Number, default: 0 }, // return on investment
      ltv: { type: Number, default: 0 }, // lifetime value
      cac: { type: Number, default: 0 }  // customer acquisition cost
    },
    
    // Feature Usage Metrics
    features: {
      locationBasedChat: {
        enabled: { type: Boolean, default: features.isEnabled('LOCATION_BASED_CHAT') },
        usage: { type: Number, default: 0 },
        adoptionRate: { type: Number, default: 0 }
      },
      audioCalls: {
        enabled: { type: Boolean, default: features.isEnabled('AUDIO_CALLS') },
        usage: { type: Number, default: 0 },
        adoptionRate: { type: Number, default: 0 }
      },
      videoCalls: {
        enabled: { type: Boolean, default: features.isEnabled('VIDEO_CALLS') },
        usage: { type: Number, default: 0 },
        adoptionRate: { type: Number, default: 0 }
      },
      screenSharing: {
        enabled: { type: Boolean, default: features.isEnabled('SCREEN_SHARING') },
        usage: { type: Number, default: 0 },
        adoptionRate: { type: Number, default: 0 }
      },
      screenRecording: {
        enabled: { type: Boolean, default: features.isEnabled('SCREEN_RECORDING') },
        usage: { type: Number, default: 0 },
        adoptionRate: { type: Number, default: 0 }
      },
      voiceMessages: {
        enabled: { type: Boolean, default: features.isEnabled('VOICE_MESSAGES') },
        usage: { type: Number, default: 0 },
        adoptionRate: { type: Number, default: 0 }
      },
      stories: {
        enabled: { type: Boolean, default: features.isEnabled('STORY_SHARING') },
        usage: { type: Number, default: 0 },
        adoptionRate: { type: Number, default: 0 }
      }
    },
    
    // Location Metrics
    location: {
      totalLocations: { type: Number, default: 0 },
      activeLocations: { type: Number, default: 0 },
      averageUsersPerLocation: { type: Number, default: 0 },
      locationDensity: { type: Number, default: 0 }, // users per square kilometer
      proximityInteractions: { type: Number, default: 0 },
      locationBasedGroups: { type: Number, default: 0 },
      locationBasedEvents: { type: Number, default: 0 }
    },
    
    // Security Metrics
    security: {
      totalLogins: { type: Number, default: 0 },
      failedLogins: { type: Number, default: 0 },
      suspiciousActivities: { type: Number, default: 0 },
      blockedUsers: { type: Number, default: 0 },
      reportedContent: { type: Number, default: 0 },
      moderationActions: { type: Number, default: 0 },
      securityIncidents: { type: Number, default: 0 },
      dataBreaches: { type: Number, default: 0 }
    }
  },
  
  // Aggregated Data
  aggregations: {
    hourly: [{
      hour: Number, // 0-23
      users: Number,
      activity: Number,
      performance: Number
    }],
    daily: [{
      date: Date,
      users: Number,
      activity: Number,
      performance: Number
    }],
    weekly: [{
      weekStart: Date,
      users: Number,
      activity: Number,
      performance: Number
    }],
    monthly: [{
      monthStart: Date,
      users: Number,
      activity: Number,
      performance: Number
    }],
    byLocation: [{
      coordinates: [Number],
      users: Number,
      activity: Number,
      density: Number
    }],
    byTier: [{
      tier: Number,
      users: Number,
      activity: Number,
      engagement: Number
    }],
    byAge: [{
      range: String,
      users: Number,
      activity: Number,
      engagement: Number
    }],
    byGender: [{
      gender: String,
      users: Number,
      activity: Number,
      engagement: Number
    }]
  },
  
  // Trends and Patterns
  trends: {
    userGrowth: {
      daily: { type: Number, default: 0 },
      weekly: { type: Number, default: 0 },
      monthly: { type: Number, default: 0 },
      quarterly: { type: Number, default: 0 },
      yearly: { type: Number, default: 0 }
    },
    activityGrowth: {
      daily: { type: Number, default: 0 },
      weekly: { type: Number, default: 0 },
      monthly: { type: Number, default: 0 },
      quarterly: { type: Number, default: 0 },
      yearly: { type: Number, default: 0 }
    },
    engagementTrends: {
      increasing: { type: Boolean, default: false },
      stable: { type: Boolean, default: false },
      decreasing: { type: Boolean, default: false },
      trendStrength: { type: Number, default: 0 } // 0-100 scale
    },
    seasonalPatterns: {
      dayOfWeek: [Number], // 0-6 (Sunday-Saturday)
      hourOfDay: [Number], // 0-23
      monthOfYear: [Number], // 1-12
      peakTimes: [String],
      lowActivityTimes: [String]
    }
  },
  
  // Anomalies and Alerts
  anomalies: [{
    type: {
      type: String,
      enum: ['spike', 'drop', 'outlier', 'pattern-change', 'threshold-break'],
      required: true
    },
    metric: String,
    value: Number,
    expectedValue: Number,
    deviation: Number,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    detectedAt: {
      type: Date,
      default: Date.now
    },
    description: String,
    status: {
      type: String,
      enum: ['new', 'investigating', 'resolved', 'false-positive'],
      default: 'new'
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolution: String,
    resolvedAt: Date
  }],
  
  // Data Quality
  dataQuality: {
    completeness: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    accuracy: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    timeliness: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    consistency: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    validity: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    overall: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    issues: [{
      type: String,
      description: String,
      severity: String,
      detectedAt: Date,
      resolvedAt: Date
    }]
  },
  
  // Processing Information
  processing: {
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    startedAt: Date,
    completedAt: Date,
    duration: Number, // in seconds
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    steps: [{
      name: String,
      status: String,
      startedAt: Date,
      completedAt: Date,
      duration: Number
    }],
    error: String,
    retryCount: {
      type: Number,
      default: 0
    },
    maxRetries: {
      type: Number,
      default: 3
    }
  },
  
  // Configuration
  config: {
    aggregationRules: [{
      metric: String,
      operation: {
        type: String,
        enum: ['sum', 'average', 'count', 'min', 'max', 'percentile']
      },
      window: String, // time window for aggregation
      threshold: Number,
      alert: Boolean
    }],
    retention: {
      policy: {
        type: String,
        enum: ['keep-all', 'keep-recent', 'aggregate-old', 'delete-old'],
        default: 'keep-recent'
      },
      days: {
        type: Number,
        default: 90
      },
      months: {
        type: Number,
        default: 12
      },
      years: {
        type: Number,
        default: 5
      }
    },
    alerts: [{
      name: String,
      condition: String,
      threshold: Number,
      severity: String,
      recipients: [String],
      isActive: {
        type: Boolean,
        default: true
      }
    }]
  },
  
  // Metadata
  metadata: {
    tags: [String],
    category: String,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastAnalyzed: Date,
    analysisVersion: String,
    notes: String
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
analyticsSchema.index({ name: 1 });
analyticsSchema.index({ type: 1 });
analyticsSchema.index({ 'period.startTime': -1 });
analyticsSchema.index({ 'period.endTime': -1 });
analyticsSchema.index({ 'processing.status': 1 });
analyticsSchema.index({ 'metadata.priority': 1 });
analyticsSchema.index({ 'dataQuality.overall': -1 });
analyticsSchema.index({ 'trends.userGrowth.monthly': -1 });
analyticsSchema.index({ 'metrics.users.total': -1 });
analyticsSchema.index({ 'metrics.performance.availability': -1 });

// Virtuals
analyticsSchema.virtual('isCompleted').get(function() {
  return this.processing.status === 'completed';
});

analyticsSchema.virtual('isProcessing').get(function() {
  return this.processing.status === 'processing';
});

analyticsSchema.virtual('isFailed').get(function() {
  return this.processing.status === 'failed';
});

analyticsSchema.virtual('duration').get(function() {
  if (this.processing.completedAt && this.processing.startedAt) {
    return Math.floor((this.processing.completedAt - this.processing.startedAt) / 1000);
  }
  return 0;
});

analyticsSchema.virtual('dataAge').get(function() {
  return Math.floor((new Date() - this.period.endTime) / (1000 * 60 * 60 * 24));
});

analyticsSchema.virtual('userEngagementScore').get(function() {
  const activityScore = this.metrics.activity.messageFrequency * 0.3;
  const socialScore = this.metrics.social.averageFriendsPerUser * 0.3;
  const retentionScore = this.metrics.engagement.retentionRate * 0.2;
  const timeScore = (this.metrics.engagement.averageTimeSpent / 60) * 0.2; // Convert to hours
  
  return Math.min(100, activityScore + socialScore + retentionScore + timeScore);
});

analyticsSchema.virtual('systemHealthScore').get(function() {
  const availabilityScore = this.metrics.performance.availability * 0.3;
  const performanceScore = (100 - this.metrics.performance.errorRate) * 0.3;
  const responseScore = Math.max(0, 100 - (this.metrics.performance.responseTime.average / 100)) * 0.2;
  const uptimeScore = this.metrics.performance.uptime * 0.2;
  
  return Math.round(availabilityScore + performanceScore + responseScore + uptimeScore);
});

analyticsSchema.virtual('businessHealthScore').get(function() {
  const revenueScore = this.metrics.business.revenue.total > 0 ? 50 : 0;
  const growthScore = this.trends.userGrowth.monthly > 0 ? 25 : 0;
  const engagementScore = this.metrics.engagement.engagementRate * 0.25;
  
  return Math.min(100, revenueScore + growthScore + engagementScore);
});

// Pre-save middleware
analyticsSchema.pre('save', function(next) {
  // Update timestamp
  this.updatedAt = new Date();
  
  // Calculate data quality overall score
  if (this.dataQuality) {
    const scores = [
      this.dataQuality.completeness,
      this.dataQuality.accuracy,
      this.dataQuality.timeliness,
      this.dataQuality.consistency,
      this.dataQuality.validity
    ];
    
    this.dataQuality.overall = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }
  
  // Calculate engagement trends
  if (this.trends && this.metrics) {
    const currentEngagement = this.metrics.engagement.engagementRate;
    const previousEngagement = this.aggregations.monthly.length > 1 ? 
      this.aggregations.monthly[this.aggregations.monthly.length - 2].engagement : currentEngagement;
    
    if (currentEngagement > previousEngagement) {
      this.trends.engagementTrends.increasing = true;
      this.trends.engagementTrends.stable = false;
      this.trends.engagementTrends.decreasing = false;
      this.trends.engagementTrends.trendStrength = Math.min(100, Math.abs(currentEngagement - previousEngagement) * 10);
    } else if (currentEngagement < previousEngagement) {
      this.trends.engagementTrends.increasing = false;
      this.trends.engagementTrends.stable = false;
      this.trends.engagementTrends.decreasing = true;
      this.trends.engagementTrends.trendStrength = Math.min(100, Math.abs(currentEngagement - previousEngagement) * 10);
    } else {
      this.trends.engagementTrends.increasing = false;
      this.trends.engagementTrends.stable = true;
      this.trends.engagementTrends.decreasing = false;
      this.trends.engagementTrends.trendStrength = 0;
    }
  }
  
  next();
});

// Pre-validate middleware
analyticsSchema.pre('validate', function(next) {
  // Validate time period
  if (this.period.startTime >= this.period.endTime) {
    this.invalidate('period', 'Start time must be before end time');
  }
  
  // Validate metrics ranges
  if (this.metrics.engagement.engagementRate < 0 || this.metrics.engagement.engagementRate > 100) {
    this.invalidate('metrics.engagement.engagementRate', 'Engagement rate must be between 0 and 100');
  }
  
  if (this.metrics.performance.availability < 0 || this.metrics.performance.availability > 100) {
    this.invalidate('metrics.performance.availability', 'Availability must be between 0 and 100');
  }
  
  next();
});

// Instance methods
analyticsSchema.methods.updateProcessingStatus = function(status, progress = null) {
  this.processing.status = status;
  
  if (status === 'processing' && !this.processing.startedAt) {
    this.processing.startedAt = new Date();
  }
  
  if (status === 'completed') {
    this.processing.completedAt = new Date();
    this.processing.duration = Math.floor((this.processing.completedAt - this.processing.startedAt) / 1000);
  }
  
  if (progress !== null) {
    this.processing.progress = progress;
  }
  
  return this.save();
};

analyticsSchema.methods.addProcessingStep = function(name) {
  this.processing.steps.push({
    name,
    status: 'pending',
    startedAt: new Date()
  });
  
  return this.save();
};

analyticsSchema.methods.completeProcessingStep = function(name, duration = null) {
  const step = this.processing.steps.find(s => s.name === name);
  if (step) {
    step.status = 'completed';
    step.completedAt = new Date();
    if (duration) {
      step.duration = duration;
    } else {
      step.duration = Math.floor((step.completedAt - step.startedAt) / 1000);
    }
  }
  
  return this.save();
};

analyticsSchema.methods.addAnomaly = function(anomalyData) {
  this.anomalies.push({
    ...anomalyData,
    detectedAt: new Date(),
    status: 'new'
  });
  
  return this.save();
};

analyticsSchema.methods.updateAnomaly = function(anomalyIndex, updateData) {
  if (this.anomalies[anomalyIndex]) {
    Object.assign(this.anomalies[anomalyIndex], updateData);
    
    if (updateData.status === 'resolved') {
      this.anomalies[anomalyIndex].resolvedAt = new Date();
    }
  }
  
  return this.save();
};

analyticsSchema.methods.addAggregation = function(period, data) {
  const aggregationEntry = {
    ...data,
    [period === 'hourly' ? 'hour' : period === 'daily' ? 'date' : period === 'weekly' ? 'weekStart' : 'monthStart']: 
      period === 'hourly' ? data.hour : new Date()
  };
  
  this.aggregations[period].push(aggregationEntry);
  
  // Keep only recent data based on retention policy
  const maxEntries = this.config.retention[period === 'hourly' ? 'days' : period === 'daily' ? 'days' : period === 'weekly' ? 'months' : 'months'];
  if (this.aggregations[period].length > maxEntries) {
    this.aggregations[period] = this.aggregations[period].slice(-maxEntries);
  }
  
  return this.save();
};

analyticsSchema.methods.updateMetrics = function(metricsData) {
  // Update user metrics
  if (metricsData.users) {
    Object.assign(this.metrics.users, metricsData.users);
  }
  
  // Update activity metrics
  if (metricsData.activity) {
    Object.assign(this.metrics.activity, metricsData.activity);
  }
  
  // Update engagement metrics
  if (metricsData.engagement) {
    Object.assign(this.metrics.engagement, metricsData.engagement);
  }
  
  // Update social metrics
  if (metricsData.social) {
    Object.assign(this.metrics.social, metricsData.social);
  }
  
  // Update performance metrics
  if (metricsData.performance) {
    Object.assign(this.metrics.performance, metricsData.performance);
  }
  
  // Update business metrics
  if (metricsData.business) {
    Object.assign(this.metrics.business, metricsData.business);
  }
  
  // Update feature metrics
  if (metricsData.features) {
    Object.assign(this.metrics.features, metricsData.features);
  }
  
  // Update location metrics
  if (metricsData.location) {
    Object.assign(this.metrics.location, metricsData.location);
  }
  
  // Update security metrics
  if (metricsData.security) {
    Object.assign(this.metrics.security, metricsData.security);
  }
  
  return this.save();
};

analyticsSchema.methods.calculateTrends = function() {
  // Calculate user growth trends
  if (this.aggregations.monthly.length >= 2) {
    const current = this.aggregations.monthly[this.aggregations.monthly.length - 1];
    const previous = this.aggregations.monthly[this.aggregations.monthly.length - 2];
    
    if (previous.users > 0) {
      this.trends.userGrowth.monthly = ((current.users - previous.users) / previous.users) * 100;
    }
  }
  
  // Calculate activity growth trends
  if (this.aggregations.monthly.length >= 2) {
    const current = this.aggregations.monthly[this.aggregations.monthly.length - 1];
    const previous = this.aggregations.monthly[this.aggregations.monthly.length - 2];
    
    if (previous.activity > 0) {
      this.trends.activityGrowth.monthly = ((current.activity - previous.activity) / previous.activity) * 100;
    }
  }
  
  return this.save();
};

analyticsSchema.methods.updateDataQuality = function(qualityMetrics) {
  if (qualityMetrics.completeness !== undefined) this.dataQuality.completeness = qualityMetrics.completeness;
  if (qualityMetrics.accuracy !== undefined) this.dataQuality.accuracy = qualityMetrics.accuracy;
  if (qualityMetrics.timeliness !== undefined) this.dataQuality.timeliness = qualityMetrics.timeliness;
  if (qualityMetrics.consistency !== undefined) this.dataQuality.consistency = qualityMetrics.consistency;
  if (qualityMetrics.validity !== undefined) this.dataQuality.validity = qualityMetrics.validity;
  
  return this.save();
};

// Static methods
analyticsSchema.statics.findByType = function(type) {
  return this.find({ type });
};

analyticsSchema.statics.findByPeriod = function(startTime, endTime) {
  return this.find({
    'period.startTime': { $gte: startTime },
    'period.endTime': { $lte: endTime }
  });
};

analyticsSchema.statics.findCompleted = function() {
  return this.find({ 'processing.status': 'completed' });
};

analyticsSchema.statics.findFailed = function() {
  return this.find({ 'processing.status': 'failed' });
};

analyticsSchema.statics.findByPriority = function(priority) {
  return this.find({ 'metadata.priority': priority });
};

analyticsSchema.statics.findHighQuality = function(minScore = 80) {
  return this.find({ 'dataQuality.overall': { $gte: minScore } });
};

analyticsSchema.statics.findAnomalies = function(severity = null) {
  let query = { 'anomalies.0': { $exists: true } };
  
  if (severity) {
    query['anomalies.severity'] = severity;
  }
  
  return this.find(query);
};

analyticsSchema.statics.getSystemHealth = function() {
  return this.aggregate([
    {
      $match: {
        type: 'system',
        'processing.status': 'completed'
      }
    },
    {
      $group: {
        _id: null,
        avgAvailability: { $avg: '$metrics.performance.availability' },
        avgResponseTime: { $avg: '$metrics.performance.responseTime.average' },
        avgErrorRate: { $avg: '$metrics.performance.errorRate' },
        totalIncidents: { $sum: { $size: '$anomalies' } }
      }
    }
  ]);
};

analyticsSchema.statics.getBusinessMetrics = function() {
  return this.aggregate([
    {
      $match: {
        type: 'business',
        'processing.status': 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$metrics.business.revenue.total' },
        avgLTV: { $avg: '$metrics.business.ltv' },
        avgCAC: { $avg: '$metrics.business.cac' },
        totalUsers: { $sum: '$metrics.users.total' },
        premiumUsers: { $sum: '$metrics.users.premium' }
      }
    }
  ]);
};

// Export model
module.exports = mongoose.model('Analytics', analyticsSchema);