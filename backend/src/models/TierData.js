const mongoose = require('mongoose');
const features = require('../config/features');

const tierDataSchema = new mongoose.Schema({
  // Tier Information
  tier: {
    type: Number,
    required: true,
    min: 1,
    max: 6,
    validate: {
      validator: function(tier) {
        return tier >= 1 && tier <= 6;
      },
      message: 'Tier must be between 1 and 6'
    }
  },
  
  // Location Data
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function(coords) {
          return coords.length === 2 && 
                 coords[0] >= -180 && coords[0] <= 180 &&
                 coords[1] >= -90 && coords[1] <= 90;
        },
        message: 'Invalid coordinates'
      }
    },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String
    },
    placeName: String,
    radius: {
      type: Number,
      default: 1000, // meters
      min: 100,
      max: 50000
    }
  },
  
  // Tier Statistics
  stats: {
    totalUsers: {
      type: Number,
      default: 0
    },
    activeUsers: {
      type: Number,
      default: 0
    },
    onlineUsers: {
      type: Number,
      default: 0
    },
    userDensity: {
      type: Number,
      default: 0 // users per square kilometer
    },
    averageProximity: {
      type: Number,
      default: 0 // average distance between users in meters
    },
    maxProximity: {
      type: Number,
      default: 0 // maximum distance between users in meters
    },
    minProximity: {
      type: Number,
      default: 0 // minimum distance between users in meters
    }
  },
  
  // User Distribution
  userDistribution: {
    byAge: {
      '13-17': { type: Number, default: 0 },
      '18-24': { type: Number, default: 0 },
      '25-34': { type: Number, default: 0 },
      '35-44': { type: Number, default: 0 },
      '45-54': { type: Number, default: 0 },
      '55+': { type: Number, default: 0 }
    },
    byGender: {
      male: { type: Number, default: 0 },
      female: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
      'prefer-not-to-say': { type: Number, default: 0 }
    },
    byActivity: {
      veryActive: { type: Number, default: 0 }, // >5 hours/day
      active: { type: Number, default: 0 },     // 2-5 hours/day
      moderate: { type: Number, default: 0 },   // 30min-2 hours/day
      low: { type: Number, default: 0 },        // <30min/day
      inactive: { type: Number, default: 0 }    // <1 hour/week
    },
    byMembership: {
      new: { type: Number, default: 0 },        // <1 week
      regular: { type: Number, default: 0 },    // 1 week - 1 month
      established: { type: Number, default: 0 }, // 1 month - 6 months
      veteran: { type: Number, default: 0 }     // >6 months
    }
  },
  
  // Activity Metrics
  activity: {
    totalMessages: {
      type: Number,
      default: 0
    },
    totalCalls: {
      type: Number,
      default: 0
    },
    totalStories: {
      type: Number,
      default: 0
    },
    totalEvents: {
      type: Number,
      default: 0
    },
    messageFrequency: {
      type: Number,
      default: 0 // messages per user per day
    },
    callFrequency: {
      type: Number,
      default: 0 // calls per user per day
    },
    storyFrequency: {
      type: Number,
      default: 0 // stories per user per day
    },
    eventFrequency: {
      type: Number,
      default: 0 // events per user per day
    },
    peakHours: [{
      hour: Number, // 0-23
      activity: Number,
      userCount: Number
    }],
    peakDays: [{
      day: Number, // 0-6 (Sunday-Saturday)
      activity: Number,
      userCount: Number
    }]
  },
  
  // Social Metrics
  social: {
    totalFriendships: {
      type: Number,
      default: 0
    },
    averageFriendsPerUser: {
      type: Number,
      default: 0
    },
    friendshipDensity: {
      type: Number,
      default: 0 // friendships per square kilometer
    },
    groupFormation: {
      totalGroups: { type: Number, default: 0 },
      activeGroups: { type: Number, default: 0 },
      averageGroupSize: { type: Number, default: 0 },
      groupsPerUser: { type: Number, default: 0 }
    },
    communityHealth: {
      engagementRate: { type: Number, default: 0 },
      responseRate: { type: Number, default: 0 },
      moderationActions: { type: Number, default: 0 },
      reportRate: { type: Number, default: 0 }
    }
  },
  
  // Location Patterns
  locationPatterns: {
    movement: {
      averageDistance: { type: Number, default: 0 }, // average distance moved per day
      maxDistance: { type: Number, default: 0 },     // maximum distance moved per day
      stayDuration: { type: Number, default: 0 },    // average time spent in one location
      returnRate: { type: Number, default: 0 }       // percentage of users who return to same location
    },
    hotspots: [{
      coordinates: [Number],
      address: String,
      placeName: String,
      visitCount: Number,
      uniqueVisitors: Number,
      averageStayTime: Number,
      popularity: Number // 0-100 scale
    }],
    timeBasedPatterns: {
      morning: { type: Number, default: 0 },   // 6AM-12PM activity
      afternoon: { type: Number, default: 0 }, // 12PM-6PM activity
      evening: { type: Number, default: 0 },   // 6PM-12AM activity
      night: { type: Number, default: 0 }      // 12AM-6AM activity
    }
  },
  
  // Feature Usage by Tier
  featureUsage: {
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
  
  // Performance Metrics
  performance: {
    responseTime: {
      average: { type: Number, default: 0 }, // milliseconds
      p95: { type: Number, default: 0 },     // 95th percentile
      p99: { type: Number, default: 0 }      // 99th percentile
    },
    errorRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    availability: {
      type: Number,
      default: 100,
      min: 0,
      max: 100
    },
    bandwidth: {
      average: { type: Number, default: 0 }, // MB/s
      peak: { type: Number, default: 0 },    // MB/s
      total: { type: Number, default: 0 }    // MB
    }
  },
  
  // Economic Metrics
  economic: {
    premiumUsers: {
      type: Number,
      default: 0
    },
    premiumConversionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    averageRevenuePerUser: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    advertising: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      ctr: { type: Number, default: 0 }, // click-through rate
      revenue: { type: Number, default: 0 }
    }
  },
  
  // Real-time Data
  realtime: {
    lastUpdated: {
      type: Date,
      default: Date.now
    },
    updateFrequency: {
      type: Number,
      default: 300 // seconds
    },
    isLive: {
      type: Boolean,
      default: true
    },
    dataQuality: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good'
    },
    dataSources: [{
      name: String,
      reliability: Number, // 0-100 scale
      lastSync: Date,
      status: {
        type: String,
        enum: ['active', 'inactive', 'error'],
        default: 'active'
      }
    }]
  },
  
  // Historical Data
  historical: {
    daily: [{
      date: Date,
      stats: mongoose.Schema.Types.Mixed,
      activity: mongoose.Schema.Types.Mixed,
      social: mongoose.Schema.Types.Mixed
    }],
    weekly: [{
      weekStart: Date,
      stats: mongoose.Schema.Types.Mixed,
      activity: mongoose.Schema.Types.Mixed,
      social: mongoose.Schema.Types.Mixed
    }],
    monthly: [{
      monthStart: Date,
      stats: mongoose.Schema.Types.Mixed,
      activity: mongoose.Schema.Types.Mixed,
      social: mongoose.Schema.Types.Mixed
    }],
    retention: {
      day1: { type: Number, default: 0 },
      day7: { type: Number, default: 0 },
      day30: { type: Number, default: 0 },
      day90: { type: Number, default: 0 }
    }
  },
  
  // Metadata
  metadata: {
    description: String,
    tags: [String],
    notes: String,
    lastAnalyzed: Date,
    analysisVersion: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
tierDataSchema.index({ tier: 1 });
tierDataSchema.index({ 'location.coordinates': '2dsphere' });
tierDataSchema.index({ 'stats.totalUsers': -1 });
tierDataSchema.index({ 'stats.userDensity': -1 });
tierDataSchema.index({ 'realtime.lastUpdated': -1 });
tierDataSchema.index({ 'realtime.isLive': 1 });
tierDataSchema.index({ 'activity.totalMessages': -1 });
tierDataSchema.index({ 'social.totalFriendships': -1 });

// Virtuals
tierDataSchema.virtual('isActive').get(function() {
  return this.realtime.isLive && this.stats.activeUsers > 0;
});

tierDataSchema.virtual('userActivityRate').get(function() {
  if (this.stats.totalUsers === 0) return 0;
  return (this.stats.activeUsers / this.stats.totalUsers) * 100;
});

tierDataSchema.virtual('onlineRate').get(function() {
  if (this.stats.totalUsers === 0) return 0;
  return (this.stats.onlineUsers / this.stats.totalUsers) * 100;
});

tierDataSchema.virtual('engagementScore').get(function() {
  const messageScore = this.activity.messageFrequency * 0.3;
  const callScore = this.activity.callFrequency * 0.2;
  const storyScore = this.activity.storyFrequency * 0.2;
  const eventScore = this.activity.eventFrequency * 0.1;
  const socialScore = (this.social.totalFriendships / Math.max(this.stats.totalUsers, 1)) * 0.2;
  
  return Math.min(100, messageScore + callScore + storyScore + eventScore + socialScore);
});

tierDataSchema.virtual('healthScore').get(function() {
  const activityScore = this.userActivityRate * 0.3;
  const engagementScore = this.engagementScore * 0.3;
  const performanceScore = (100 - this.performance.errorRate) * 0.2;
  const communityScore = (100 - this.social.communityHealth.reportRate) * 0.2;
  
  return Math.round(activityScore + engagementScore + performanceScore + communityScore);
});

tierDataSchema.virtual('growthRate').get(function() {
  if (this.historical.monthly.length < 2) return 0;
  
  const currentMonth = this.historical.monthly[this.historical.monthly.length - 1];
  const previousMonth = this.historical.monthly[this.historical.monthly.length - 2];
  
  if (previousMonth.stats.totalUsers === 0) return 0;
  
  return ((currentMonth.stats.totalUsers - previousMonth.stats.totalUsers) / previousMonth.stats.totalUsers) * 100;
});

// Pre-save middleware
tierDataSchema.pre('save', function(next) {
  // Update real-time timestamp
  this.realtime.lastUpdated = new Date();
  
  // Calculate derived metrics
  if (this.stats.totalUsers > 0) {
    this.stats.userDensity = this.stats.totalUsers / (Math.PI * Math.pow(this.location.radius / 1000, 2));
  }
  
  // Calculate activity frequencies
  if (this.stats.activeUsers > 0) {
    this.activity.messageFrequency = this.activity.totalMessages / this.stats.activeUsers;
    this.activity.callFrequency = this.activity.totalCalls / this.stats.activeUsers;
    this.activity.storyFrequency = this.activity.totalStories / this.stats.activeUsers;
    this.activity.eventFrequency = this.activity.totalEvents / this.stats.activeUsers;
  }
  
  // Calculate social metrics
  if (this.stats.totalUsers > 0) {
    this.social.averageFriendsPerUser = this.social.totalFriendships / this.stats.totalUsers;
    this.social.friendshipDensity = this.social.totalFriendships / (Math.PI * Math.pow(this.location.radius / 1000, 2));
    this.social.groupFormation.groupsPerUser = this.social.groupFormation.totalGroups / this.stats.totalUsers;
  }
  
  if (this.social.groupFormation.totalGroups > 0) {
    this.social.groupFormation.averageGroupSize = this.stats.totalUsers / this.social.groupFormation.totalGroups;
  }
  
  next();
});

// Pre-validate middleware
tierDataSchema.pre('validate', function(next) {
  // Validate tier range
  if (this.tier < 1 || this.tier > 6) {
    this.invalidate('tier', 'Tier must be between 1 and 6');
  }
  
  // Validate coordinates
  if (!this.location.coordinates || this.location.coordinates.length !== 2) {
    this.invalidate('location.coordinates', 'Coordinates must have exactly 2 values');
  }
  
  // Validate radius
  if (this.location.radius < 100 || this.location.radius > 50000) {
    this.invalidate('location.radius', 'Radius must be between 100 and 50000 meters');
  }
  
  next();
});

// Instance methods
tierDataSchema.methods.updateUserCounts = function(userCounts) {
  if (userCounts.total !== undefined) this.stats.totalUsers = userCounts.total;
  if (userCounts.active !== undefined) this.stats.activeUsers = userCounts.active;
  if (userCounts.online !== undefined) this.stats.onlineUsers = userCounts.online;
  
  return this.save();
};

tierDataSchema.methods.updateActivityMetrics = function(activityData) {
  if (activityData.messages !== undefined) this.activity.totalMessages = activityData.messages;
  if (activityData.calls !== undefined) this.activity.totalCalls = activityData.calls;
  if (activityData.stories !== undefined) this.activity.totalStories = activityData.stories;
  if (activityData.events !== undefined) this.activity.totalEvents = activityData.events;
  
  return this.save();
};

tierDataSchema.methods.updateSocialMetrics = function(socialData) {
  if (socialData.friendships !== undefined) this.social.totalFriendships = socialData.friendships;
  if (socialData.groups !== undefined) this.social.groupFormation.totalGroups = socialData.groups;
  if (socialData.activeGroups !== undefined) this.social.groupFormation.activeGroups = socialData.activeGroups;
  
  return this.save();
};

tierDataSchema.methods.updatePerformanceMetrics = function(performanceData) {
  if (performanceData.responseTime !== undefined) {
    this.performance.responseTime.average = performanceData.responseTime.average;
    this.performance.responseTime.p95 = performanceData.responseTime.p95;
    this.performance.responseTime.p99 = performanceData.responseTime.p99;
  }
  
  if (performanceData.errorRate !== undefined) this.performance.errorRate = performanceData.errorRate;
  if (performanceData.availability !== undefined) this.performance.availability = performanceData.availability;
  if (performanceData.bandwidth !== undefined) {
    this.performance.bandwidth.average = performanceData.bandwidth.average;
    this.performance.bandwidth.peak = performanceData.bandwidth.peak;
    this.performance.bandwidth.total = performanceData.bandwidth.total;
  }
  
  return this.save();
};

tierDataSchema.methods.addHotspot = function(hotspotData) {
  this.locationPatterns.hotspots.push({
    ...hotspotData,
    popularity: 0 // Will be calculated based on visit data
  });
  
  return this.save();
};

tierDataSchema.methods.updateHotspotPopularity = function(hotspotIndex, visitData) {
  if (this.locationPatterns.hotspots[hotspotIndex]) {
    const hotspot = this.locationPatterns.hotspots[hotspotIndex];
    hotspot.visitCount = visitData.visitCount || hotspot.visitCount;
    hotspot.uniqueVisitors = visitData.uniqueVisitors || hotspot.uniqueVisitors;
    hotspot.averageStayTime = visitData.averageStayTime || hotspot.averageStayTime;
    
    // Calculate popularity score (0-100)
    const maxVisits = Math.max(...this.locationPatterns.hotspots.map(h => h.visitCount));
    hotspot.popularity = maxVisits > 0 ? Math.round((hotspot.visitCount / maxVisits) * 100) : 0;
  }
  
  return this.save();
};

tierDataSchema.methods.addHistoricalData = function(period, data) {
  const historicalEntry = {
    ...data,
    [period === 'daily' ? 'date' : period === 'weekly' ? 'weekStart' : 'monthStart']: new Date()
  };
  
  this.historical[period].push(historicalEntry);
  
  // Keep only last 365 days, 52 weeks, or 12 months
  const maxEntries = period === 'daily' ? 365 : period === 'weekly' ? 52 : 12;
  if (this.historical[period].length > maxEntries) {
    this.historical[period] = this.historical[period].slice(-maxEntries);
  }
  
  return this.save();
};

tierDataSchema.methods.calculateRetention = function() {
  // This would need to be implemented based on your user tracking system
  // Placeholder implementation
  this.historical.retention = {
    day1: 85,
    day7: 65,
    day30: 45,
    day90: 30
  };
  
  return this.save();
};

tierDataSchema.methods.updateDataQuality = function(qualityMetrics) {
  const { accuracy, completeness, timeliness, consistency } = qualityMetrics;
  
  // Calculate overall data quality score
  const qualityScore = (accuracy + completeness + timeliness + consistency) / 4;
  
  if (qualityScore >= 90) this.realtime.dataQuality = 'excellent';
  else if (qualityScore >= 80) this.realtime.dataQuality = 'good';
  else if (qualityScore >= 70) this.realtime.dataQuality = 'fair';
  else this.realtime.dataQuality = 'poor';
  
  return this.save();
};

// Static methods
tierDataSchema.statics.findByTier = function(tier) {
  return this.findOne({ tier });
};

tierDataSchema.statics.findByLocation = function(coordinates, maxDistance = 5000) {
  return this.find({
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    }
  });
};

tierDataSchema.statics.findMostActive = function(limit = 10) {
  return this.find()
    .sort({ 'stats.activeUsers': -1 })
    .limit(limit);
};

tierDataSchema.statics.findHighestDensity = function(limit = 10) {
  return this.find()
    .sort({ 'stats.userDensity': -1 })
    .limit(limit);
};

tierDataSchema.statics.findByActivity = function(minActivity, limit = 10) {
  return this.find({
    'activity.totalMessages': { $gte: minActivity }
  })
  .sort({ 'activity.totalMessages': -1 })
  .limit(limit);
};

tierDataSchema.statics.findBySocialHealth = function(minScore, limit = 10) {
  return this.find()
    .sort({ 'social.communityHealth.engagementRate': -1 })
    .limit(limit);
};

tierDataSchema.statics.getTierComparison = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$tier',
        avgUsers: { $avg: '$stats.totalUsers' },
        avgDensity: { $avg: '$stats.userDensity' },
        avgActivity: { $avg: '$activity.totalMessages' },
        avgSocial: { $avg: '$social.totalFriendships' },
        avgPerformance: { $avg: '$performance.availability' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

// Export model
module.exports = mongoose.model('TierData', tierDataSchema);